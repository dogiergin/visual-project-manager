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
import { DEFAULT_TAG_DECISIONS, evaluateRules, mergeDecisions, TagDecisions } from "./decisions";
import { decideCategories, isOllayaAvailable } from "./ollayaClient";
import { getFolderSignature, scanProject } from "./projectScanner";

export enum AutoTagsEngine {
    auto = "auto",     // rules + Ollaya when its server is running
    rules = "rules",   // rules only, Ollaya is never called
    ollaya = "ollaya"  // rules + Ollaya, warns when the server is not running
}

interface CacheEntry {
    signature: string;      // folder mtime + decisions hash + engine used
    tags: string[];
    categoriesBy: "ollaya" | "rules";
}

const CACHE_KEY = "autoTags.cache";
const REJECTED_KEY = "autoTags.rejected";
const DECISIONS_FILE = "tag-decisions.json";
const AVAILABILITY_TTL = 60 * 1000;

export class AutoTagger {

    private cache: Record<string, CacheEntry>;
    private queue: string[] = [];
    private running = false;
    private decisions: TagDecisions = DEFAULT_TAG_DECISIONS;
    private decisionsHash = "";
    private ollayaCheckedAt = 0;
    private ollayaAvailable = false;
    private warnedOllayaMissing = false;

    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
    public readonly onDidChange = this.onDidChangeEmitter.event;

    constructor() {
        this.cache = Container.context.globalState.get<Record<string, CacheEntry>>(CACHE_KEY, {});
        this.loadDecisions();

        Container.context.subscriptions.push(
            vscode.commands.registerCommand("projectManager.editTagDecisions", () => this.editDecisions()),
            vscode.commands.registerCommand("projectManager.refreshAutoTags", () => this.refreshAll()),
            vscode.workspace.onDidChangeConfiguration(cfg => {
                if (cfg.affectsConfiguration("projectManager.autoTags")) {
                    this.ollayaCheckedAt = 0;
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

    private get engine(): AutoTagsEngine {
        return this.config.get<AutoTagsEngine>("engine", AutoTagsEngine.auto);
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
        const rejected = this.getRejected(rootPath);
        const existing = existingTags.map(tag => tag.toLocaleLowerCase());
        return entry.tags.filter(tag => !existing.includes(tag.toLocaleLowerCase()) && !rejected.includes(tag));
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
            setTimeout(() => this.processQueue(), 0);
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

        const useOllaya = await this.shouldUseOllaya();
        const categoriesBy = useOllaya ? "ollaya" : "rules";
        const signature = `${folderSignature}|${this.decisionsHash}|${categoriesBy}`;
        const key = AutoTagger.key(rootPath);
        if (this.cache[ key ]?.signature === signature) {
            return false;
        }

        const summary = await scanProject(rootPath);
        if (!summary) {
            return false;
        }

        let categories: string[];
        let by: "ollaya" | "rules" = categoriesBy;
        if (useOllaya) {
            try {
                categories = await decideCategories(summary, this.decisions.ollaya.categories, {
                    url: this.config.get<string>("ollaya.url", "http://localhost:11435"),
                    model: this.config.get<string>("ollaya.model", "laya"),
                    threshold: this.decisions.ollaya.threshold
                });
            } catch (error) {
                console.log("[Visual Project Manager] Ollaya failed, using the fallback rules", error);
                this.ollayaCheckedAt = 0;
                categories = evaluateRules(summary, this.decisions.ollaya.fallbackRules);
                by = "rules";
            }
        } else {
            categories = evaluateRules(summary, this.decisions.ollaya.fallbackRules);
        }

        const tags = [ ...categories, ...evaluateRules(summary, this.decisions.rules).filter(tag => !categories.includes(tag)) ];
        const previous = this.cache[ key ];
        this.cache[ key ] = { signature: `${folderSignature}|${this.decisionsHash}|${by}`, tags, categoriesBy: by };
        return !previous || previous.tags.join("|") !== tags.join("|");
    }

    private async shouldUseOllaya(): Promise<boolean> {
        const engine = this.engine;
        if (engine === AutoTagsEngine.rules) {
            return false;
        }
        if (Date.now() - this.ollayaCheckedAt > AVAILABILITY_TTL) {
            this.ollayaAvailable = await isOllayaAvailable(this.config.get<string>("ollaya.url", "http://localhost:11435"));
            this.ollayaCheckedAt = Date.now();
        }
        if (!this.ollayaAvailable && engine === AutoTagsEngine.ollaya && !this.warnedOllayaMissing) {
            this.warnedOllayaMissing = true;
            const learnMore = l10n.t("Learn More");
            vscode.window.showWarningMessage(
                l10n.t("Ollaya is not running, so project categories are suggested with the fallback rules. Start the Ollaya app, or run `ollaya run laya` in a terminal."),
                learnMore).then(answer => {
                if (answer === learnMore) {
                    vscode.env.openExternal(vscode.Uri.parse("https://ollaya.dev/docs/quickstart"));
                }
            });
        }
        return this.ollayaAvailable;
    }

    public async refreshAll() {
        this.cache = {};
        this.ollayaCheckedAt = 0;
        await Container.context.globalState.update(CACHE_KEY, this.cache);
        this.onDidChangeEmitter.fire();
    }

    // ---------------------------------------------------------------- decisions file

    private loadDecisions() {
        let user: Partial<TagDecisions> | undefined;
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
