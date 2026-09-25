/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Based on Project Manager by Alessandro Fragnani.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import fs = require("fs");
import path = require("path");

// GitHub "topics" are the GitHub equivalent of the project tags: https://docs.github.com/rest/repos/repos#replace-all-repository-topics
// Rules: lower case letters, numbers and hyphens, starts with a letter or number, 50 characters at most, 20 topics per repository.

export const MAX_TOPICS = 20;
const MAX_TOPIC_LENGTH = 50;

export interface GitHubRepository {
    owner: string;
    name: string;
}

/** Well known tags whose symbols would be lost when converted (C# -> c) */
const SPECIAL_TOPICS: Record<string, string> = {
    "c#": "csharp",
    "c/c++": "cpp",
    "c++": "cpp",
    "f#": "fsharp",
    "next.js": "nextjs",
    "node.js": "nodejs",
    "vue.js": "vuejs",
    ".net": "dotnet",
    "html/css": "html-css",
    "vs code extension": "vscode-extension"
};

export function toTopic(tag: string): string | undefined {
    const lower = tag.trim().toLowerCase();
    const topic = (SPECIAL_TOPICS[ lower ] ?? lower)
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .substring(0, MAX_TOPIC_LENGTH)
        .replace(/-+$/g, "");
    return topic ? topic : undefined;
}

/** `https://github.com/owner/repo.git`, `git@github.com:owner/repo.git`, `ssh://git@github.com/owner/repo` */
export function parseGitHubRemote(url: string): GitHubRepository | undefined {
    const match = /github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(url.trim());
    return match ? { owner: match[ 1 ], name: match[ 2 ] } : undefined;
}

/** Reads the `origin` remote (or the first GitHub remote) of a local git repository */
export function getGitHubRepository(rootPath: string): GitHubRepository | undefined {
    try {
        const folder = path.extname(rootPath).toLowerCase() === ".code-workspace" ? path.dirname(rootPath) : rootPath;
        let gitDir = path.join(folder, ".git");
        if (!fs.existsSync(gitDir)) {
            return undefined;
        }
        if (fs.statSync(gitDir).isFile()) {
            // worktrees and submodules: `gitdir: <path>`
            const pointer = /gitdir:\s*(.+)/.exec(fs.readFileSync(gitDir, "utf8"));
            if (!pointer) {
                return undefined;
            }
            gitDir = path.resolve(folder, pointer[ 1 ].trim());
            const common = path.join(gitDir, "commondir");
            if (fs.existsSync(common)) {
                gitDir = path.resolve(gitDir, fs.readFileSync(common, "utf8").trim());
            }
        }
        return parseGitConfig(fs.readFileSync(path.join(gitDir, "config"), "utf8"));
    } catch {
        return undefined;
    }
}

export function parseGitConfig(config: string): GitHubRepository | undefined {
    const remotes: Record<string, string> = {};
    let current: string | undefined;
    for (const line of config.split(/\r?\n/)) {
        const section = /^\s*\[remote\s+"([^"]+)"\]/.exec(line);
        if (section) {
            current = section[ 1 ];
            continue;
        }
        if (/^\s*\[/.test(line)) {
            current = undefined;
            continue;
        }
        const url = /^\s*url\s*=\s*(.+)$/.exec(line);
        if (current && url) {
            remotes[ current ] = url[ 1 ];
        }
    }
    const ordered = [ remotes.origin, ...Object.values(remotes) ].filter(Boolean);
    for (const url of ordered) {
        const repository = parseGitHubRemote(url);
        if (repository) {
            return repository;
        }
    }
    return undefined;
}

export interface TopicsSyncPlan {
    addToGitHub: string[];     // topics created from the project tags
    addToProject: string[];    // GitHub topics that become project tags
    topics: string[];          // the complete list of topics after the sync
    skipped: string[];         // tags that could not be added (limit of 20 topics)
}

/** Two way merge. Nothing is ever removed, neither from GitHub nor from the project. */
export function planTopicsSync(projectTags: string[], gitHubTopics: string[]): TopicsSyncPlan {
    const topics = [ ...gitHubTopics ];
    const projectTopics = new Set<string>();
    const addToGitHub: string[] = [];
    const skipped: string[] = [];

    for (const tag of projectTags) {
        const topic = toTopic(tag);
        if (!topic) {
            continue;
        }
        projectTopics.add(topic);
        if (topics.includes(topic)) {
            continue;
        }
        if (topics.length >= MAX_TOPICS) {
            skipped.push(tag);
            continue;
        }
        topics.push(topic);
        addToGitHub.push(topic);
    }

    const addToProject = gitHubTopics.filter(topic => !projectTopics.has(topic));
    return { addToGitHub, addToProject, topics, skipped };
}

/** Compares tags and topics: `Data Analysis`, `data analysis` and `data-analysis` are the same */
export function tagKey(tag: string): string {
    return toTopic(tag) ?? tag.trim().toLowerCase();
}

export function dedupeTags(tags: string[]): string[] {
    const seen = new Set<string>();
    return tags.filter(tag => {
        const key = tagKey(tag);
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
