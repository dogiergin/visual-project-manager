/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Based on Project Manager by Alessandro Fragnani.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import https = require("https");
import { GitHubRepository } from "./githubTopics";

export const GITHUB_API = "https://api.github.com";

export interface GitHubResponse {
    status: number;
    json: unknown;
}

/** Minimal GitHub REST client. Without a token, only public data can be read (60 requests per hour). */
export function gitHubRequest(method: "GET" | "PUT", url: string, token?: string, body?: unknown): Promise<GitHubResponse> {
    return new Promise((resolve, reject) => {
        const data = body === undefined ? undefined : Buffer.from(JSON.stringify(body), "utf8");
        const req = https.request(url, {
            method,
            headers: {
                "Accept": "application/vnd.github+json",
                "User-Agent": "visual-project-manager",
                "X-GitHub-Api-Version": "2022-11-28",
                ...(token ? { "Authorization": `Bearer ${token}` } : {}),
                ...(data ? { "Content-Type": "application/json", "Content-Length": data.length } : {})
            },
            timeout: 15000
        }, res => {
            const chunks: Buffer[] = [];
            res.on("data", chunk => chunks.push(chunk));
            res.on("end", () => {
                const text = Buffer.concat(chunks).toString("utf8");
                let json: unknown;
                try {
                    json = text ? JSON.parse(text) : undefined;
                } catch {
                    json = undefined;
                }
                resolve({ status: res.statusCode ?? 0, json });
            });
        });
        req.on("timeout", () => req.destroy(new Error("GitHub request timed out")));
        req.on("error", reject);
        if (data) {
            req.write(data);
        }
        req.end();
    });
}

export function topicsUrl(repository: GitHubRepository): string {
    return `${GITHUB_API}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/topics`;
}

export function readTopics(response: GitHubResponse): string[] {
    const names = (response.json as { names?: unknown })?.names;
    return Array.isArray(names) ? names.filter((name): name is string => typeof name === "string") : [];
}

/** Topics of a public repository, without signing in. `undefined` when not available (private, offline, rate limit). */
export async function fetchPublicTopics(repository: GitHubRepository): Promise<string[] | undefined> {
    try {
        const response = await gitHubRequest("GET", topicsUrl(repository));
        return response.status === 200 ? readTopics(response) : undefined;
    } catch {
        return undefined;
    }
}
