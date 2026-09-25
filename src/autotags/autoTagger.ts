/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Based on Project Manager by Alessandro Fragnani.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { createHash } from "crypto";
import fs = require("fs");
import path = require("path");
import * as vscode from "vscode";
import { l10n } from "vscode";
import { Container } from "../core/container";
import { isRemotePath } from "../utils/remote";
import { decideTags, DEFAULT_TAG_DECISIONS, knownTags, mergeDecisions, TagDecisions } from "./decisions";
import { getFolderSignature, scanProject } from "./projectScanner";
import { fetchPublicTopics } from "../github/githubApi";
import { dedupeTags, getGitHubRepository, tagKey } from "../github/githubTopics";

interface CacheEntry {
    signature: string;      // folder mtime + decisions hash
    tags: string[];
}

const CACHE_KEY = "autoTags.cache";
const REJECTED_KEY = "autoTags.rejected";
const DECISIONS_FILE = "tag-decisions.json";
// the extension starts with VS Code: leave the first seconds to the editor
const STARTUP_DELAY = 2000;
const TOPICS_KEY = "autoTags.gitHubTopics";
// public GitHub API: 60 requests per hour without signing in, so topics are refreshed once a day
const TOPICS_TTL = 24 * 60 * 60 * 1000;

interface TopicsEntry {
    topics: string[];
    fetchedAt: number;
}

export class AutoTagger {

    private cache: Record<string, CacheEntry>;
    private topicsCache: Record<string, TopicsEntry>;
    private queue: string[] = [];
    private running = false;
    private decisions: TagDecisions = DEFAULT_TAG_DECISIONS;
    private decisionsHash = "";
    private readonly createdAt = Date.now();

    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
    public readonly onDidChange = this.onDidChangeEmitter.event;

    constructor() {
        this.cache = Container.context.globalState.get<Record<string, CacheEntry>>(CACHE_KEY, {});
        this.topicsCache = Container.context.globalState.get<Record<string, TopicsEntry>>(TOPICS_KEY, {});
        this.loadDecisions();

        Container.context.subscriptions.push(
            vscode.commands.registerCommand("projectManager.editTagDecisions", () => this.editDecisions()),
            vscode.commands.registerCommand("projectManager.refreshAutoTags", () => this.refreshAll()),
            vscode.workspace.onDidChangeConfiguration(cfg => {
                if (cfg.affectsConfiguration("projectManager.autoTags")) {
                    this.onDidChangeEmitter.fire();
                }
            }),
            vscode.workspace.onDidSaveTextDocument(document => {
                if (path.resolve(document.uri.fsPath).toLowerCase() === this.decisionsFile.toLowerCase()) {
                    this.loadDecisions();
                    this.onDidChangeEmitter.fire();
                }
            })
        );
    }

    private get config() {
        return vscode.workspace.getConfiguration("projectManager.autoTags");
    }

    public get enabled(): boolean {
        return this.config.get<boolean>("enabled", true);
    }

    private get decisionsFile(): string {
        return path.join(Container.context.globalStorageUri.fsPath, DECISIONS_FILE);
    }

    private static key(rootPath: string): string {
        return rootPath.toLocaleLowerCase();
    }

    // ---------------------------------------------------------------- suggestions

    /**
     * The cached suggestions for a project (without the tags it already has, or the rejected ones).
     * When missing or stale, the project is queued and `onDidChange` fires once it is evaluated.
     */
    public getSuggestions(rootPath: string, existingTags: string[] = []): string[] {
        if (!this.enabled || isRemotePath(rootPath)) {
            return [];
        }
        const key = AutoTagger.key(rootPath);
        const entry = this.cache[ key ];
        this.enqueue(rootPath);

        if (!entry) {
            return [];
        }
        const rejected = this.getRejected(rootPath).map(tagKey);
        const existing = existingTags.map(tagKey);
        return entry.tags.filter(tag => !existing.includes(tagKey(tag)) && !rejected.includes(tagKey(tag)));
    }

    /**
     * Technology and category tags (the ones the decisions can produce) can be published as GitHub topics.
     * Any other tag is personal (like `Work` or a customer name) and stays private.
     */
    public isShareableTag(tag: string): boolean {
        const key = tagKey(tag);
        return knownTags(this.decisions).some(item => tagKey(item) === key);
    }

    private get gitHubTopicsEnabled(): boolean {
        return this.config.get<boolean>("gitHubTopics", true);
    }

    public getRejected(rootPath: string): string[] {
        return Container.context.globalState.get<Record<string, string[]>>(REJECTED_KEY, {})[ AutoTagger.key(rootPath) ] ?? [];
    }

    public async reject(rootPath: string, tags: string[]) {
        if (tags.length === 0) {
            return;
        }
        const all = Container.context.globalState.get<Record<string, string[]>>(REJECTED_KEY, {});
        const key = AutoTagger.key(rootPath);
        all[ key ] = [ ...new Set([ ...(all[ key ] ?? []), ...tags ]) ];
        await Container.context.globalState.update(REJECTED_KEY, all);
        this.onDidChangeEmitter.fire();
    }

    private enqueue(rootPath: string) {
        if (!this.queue.includes(rootPath)) {
            this.queue.push(rootPath);
        }
        if (!this.running) {
            this.running = true;
            setTimeout(() => this.processQueue(), Math.max(0, STARTUP_DELAY - (Date.now() - this.createdAt)));
        }
    }

    private async processQueue() {
        let changed = false;
        try {
            while (this.queue.length > 0) {
                const rootPath = this.queue.shift();
                try {
                    changed = (await this.evaluate(rootPath)) || changed;
                } catch (error) {
                    console.log(`[Visual Project Manager] auto tags failed for ${rootPath}`, error);
                }
            }
        } finally {
            this.running = false;
        }
        if (changed) {
            await Container.context.globalState.update(CACHE_KEY, this.cache);
            this.onDidChangeEmitter.fire();
        }
    }

    /** returns true when the cached tags changed */
    private async evaluate(rootPath: string): Promise<boolean> {
        const folderSignature = await getFolderSignature(rootPath);
        if (!folderSignature) {
            return false;
        }

        const signature = `${folderSignature}|${this.decisionsHash}`;
        const key = AutoTagger.key(rootPath);

        // topics of the GitHub repository, read without signing in (public repositories only)
        const repository = this.gitHubTopicsEnabled ? getGitHubRepository(rootPath) : undefined;
        const repositoryKey = repository ? `${repository.owner}/${repository.name}`.toLowerCase() : "";
        const topicsEntry = repository ? this.topicsCache[ repositoryKey ] : undefined;
        const topicsFresh = !repository || (!!topicsEntry && Date.now() - topicsEntry.fetchedAt < TOPICS_TTL);

        if (this.cache[ key ]?.signature === signature && topicsFresh) {
            return false;
        }

        let topics = topicsEntry?.topics ?? [];
        if (repository && !topicsFresh) {
            topics = (await fetchPublicTopics(repository)) ?? topics;
            // also remembered on failure (private repository, offline), to stay under the rate limit
            this.topicsCache[ repositoryKey ] = { topics, fetchedAt: Date.now() };
            await Container.context.globalState.update(TOPICS_KEY, this.topicsCache);
        }

        const summary = await scanProject(rootPath);
        if (!summary) {
            return false;
        }

        const decided = decideTags(summary, this.decisions);
        const tags = dedupeTags([ ...decided.categories, ...decided.technologies, ...topics ]);
        const previous = this.cache[ key ];
        this.cache[ key ] = { signature, tags };
        return !previous || previous.tags.join("|") !== tags.join("|");
    }

    public async refreshAll() {
        this.cache = {};
        this.topicsCache = {};
        await Container.context.globalState.update(TOPICS_KEY, this.topicsCache);
        await Container.context.globalState.update(CACHE_KEY, this.cache);
        this.onDidChangeEmitter.fire();
    }

    // ---------------------------------------------------------------- decisions file

    private loadDecisions() {
        let user: unknown;
        try {
            if (fs.existsSync(this.decisionsFile)) {
                user = JSON.parse(fs.readFileSync(this.decisionsFile, "utf8"));
            }
        } catch (error) {
            vscode.window.showErrorMessage(l10n.t("Invalid tag decisions file: {0}", String(error)));
        }
        this.decisions = mergeDecisions(user);
        this.decisionsHash = createHash("sha1").update(JSON.stringify(this.decisions)).digest("hex").substring(0, 12);
    }

    private async editDecisions() {
        if (!fs.existsSync(this.decisionsFile)) {
            fs.mkdirSync(path.dirname(this.decisionsFile), { recursive: true });
            fs.writeFileSync(this.decisionsFile, JSON.stringify(DEFAULT_TAG_DECISIONS, null, "\t"));
        }
        const document = await vscode.workspace.openTextDocument(this.decisionsFile);
        await vscode.window.showTextDocument(document);
    }
}
