/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Based on Project Manager by Alessandro Fragnani.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import https = require("https");
import * as vscode from "vscode";
import { l10n } from "vscode";
import { getGitHubRepository, GitHubRepository, planTopicsSync } from "./githubTopics";

const API = "https://api.github.com";

function gitHubRequest(method: "GET" | "PUT", url: string, token: string, body?: unknown): Promise<{ status: number; json: unknown }> {
    return new Promise((resolve, reject) => {
        const data = body === undefined ? undefined : Buffer.from(JSON.stringify(body), "utf8");
        const req = https.request(url, {
            method,
            headers: {
                "Accept": "application/vnd.github+json",
                "Authorization": `Bearer ${token}`,
                "User-Agent": "visual-project-manager",
                "X-GitHub-Api-Version": "2022-11-28",
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

function errorMessage(status: number, json: unknown): string {
    const message = (json as { message?: string })?.message;
    return message ? `${message} (HTTP ${status})` : `HTTP ${status}`;
}

export function findGitHubRepository(rootPath: string): GitHubRepository | undefined {
    return getGitHubRepository(rootPath);
}

/**
 * Two way sync between the project tags and the topics of its GitHub repository.
 * Nothing is removed. The user confirms before anything is written to GitHub.
 * Returns the tags to add to the project, or undefined when cancelled.
 */
export async function syncTagsWithGitHubTopics(projectName: string, rootPath: string, projectTags: string[]): Promise<string[] | undefined> {
    const repository = getGitHubRepository(rootPath);
    if (!repository) {
        vscode.window.showWarningMessage(l10n.t("\"{0}\" has no GitHub remote. Publish it to GitHub first (Source Control: Publish to GitHub).", projectName));
        return undefined;
    }
    const fullName = `${repository.owner}/${repository.name}`;

    // VS Code built-in GitHub sign in. `public_repo` is enough for public repositories, `repo` covers private ones.
    let session: vscode.AuthenticationSession;
    try {
        session = await vscode.authentication.getSession("github", [ "repo" ], { createIfNone: true });
    } catch {
        return undefined;
    }

    const topicsUrl = `${API}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/topics`;

    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: l10n.t("GitHub topics of {0}", fullName)
    }, async () => {
        const current = await gitHubRequest("GET", topicsUrl, session.accessToken);
        if (current.status !== 200) {
            vscode.window.showErrorMessage(l10n.t("Could not read the GitHub topics of {0}: {1}", fullName, errorMessage(current.status, current.json)));
            return undefined;
        }
        const gitHubTopics = ((current.json as { names?: string[] })?.names ?? []);
        const plan = planTopicsSync(projectTags, gitHubTopics);

        if (plan.addToGitHub.length === 0 && plan.addToProject.length === 0) {
            vscode.window.showInformationMessage(l10n.t("The tags of \"{0}\" and the GitHub topics of {1} are already in sync.", projectName, fullName));
            return [];
        }

        const lines = [
            plan.addToGitHub.length > 0 ? l10n.t("Add to GitHub: {0}", plan.addToGitHub.join(", ")) : undefined,
            plan.addToProject.length > 0 ? l10n.t("Add to the project tags: {0}", plan.addToProject.join(", ")) : undefined,
            plan.skipped.length > 0 ? l10n.t("Not added (GitHub allows 20 topics): {0}", plan.skipped.join(", ")) : undefined
        ].filter(Boolean).join("\n");

        const confirm = l10n.t("Sync");
        const answer = await vscode.window.showInformationMessage(
            l10n.t("Sync the tags of \"{0}\" with the GitHub topics of {1}?", projectName, fullName),
            { modal: true, detail: lines },
            confirm);
        if (answer !== confirm) {
            return undefined;
        }

        if (plan.addToGitHub.length > 0) {
            const updated = await gitHubRequest("PUT", topicsUrl, session.accessToken, { names: plan.topics });
            if (updated.status !== 200) {
                vscode.window.showErrorMessage(l10n.t("Could not update the GitHub topics of {0}: {1}", fullName, errorMessage(updated.status, updated.json)));
                return undefined;
            }
        }

        const open = l10n.t("Open on GitHub");
        vscode.window.showInformationMessage(l10n.t("Tags synced with the GitHub topics of {0}.", fullName), open).then(choice => {
            if (choice === open) {
                vscode.env.openExternal(vscode.Uri.parse(`https://github.com/${fullName}`));
            }
        });
        return plan.addToProject;
    });
}
