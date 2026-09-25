/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Based on Project Manager by Alessandro Fragnani.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { l10n } from "vscode";
import { gitHubRequest, GitHubResponse, readTopics, topicsUrl } from "./githubApi";
import { getGitHubRepository, GitHubRepository, planTopicsSync } from "./githubTopics";

function errorMessage(response: GitHubResponse): string {
    const message = (response.json as { message?: string })?.message;
    return message ? `${message} (HTTP ${response.status})` : `HTTP ${response.status}`;
}

export function findGitHubRepository(rootPath: string): GitHubRepository | undefined {
    return getGitHubRepository(rootPath);
}

/**
 * Signs in with the smallest permission first (`public_repo`). Only when the repository is private (GitHub answers 404),
 * the user is asked for the `repo` permission, which also gives access to private repositories.
 */
async function readTopicsSignedIn(repository: GitHubRepository): Promise<{ token: string; response: GitHubResponse } | undefined> {
    const fullName = `${repository.owner}/${repository.name}`;
    let session = await vscode.authentication.getSession("github", [ "public_repo" ], { createIfNone: true });
    let response = await gitHubRequest("GET", topicsUrl(repository), session.accessToken);

    if (response.status === 404) {
        const allow = l10n.t("Allow Private Repositories");
        const answer = await vscode.window.showWarningMessage(
            l10n.t("{0} was not found. If it is a private repository, GitHub needs a wider permission (access to private repositories).", fullName),
            { modal: true }, allow);
        if (answer !== allow) {
            return undefined;
        }
        session = await vscode.authentication.getSession("github", [ "repo" ], { createIfNone: true });
        response = await gitHubRequest("GET", topicsUrl(repository), session.accessToken);
    }
    return { token: session.accessToken, response };
}

/**
 * Two way sync between the project tags and the topics of its GitHub repository.
 * Only `shareableTags` (technologies and categories) are published: topics are public.
 * Nothing is removed. The user confirms before anything is written to GitHub.
 * Returns the tags to add to the project, or undefined when cancelled.
 */
export async function syncTagsWithGitHubTopics(projectName: string, rootPath: string, shareableTags: string[], personalTags: string[]): Promise<string[] | undefined> {
    const repository = getGitHubRepository(rootPath);
    if (!repository) {
        vscode.window.showWarningMessage(l10n.t("\"{0}\" has no GitHub remote. Publish it to GitHub first (Source Control: Publish to GitHub).", projectName));
        return undefined;
    }
    const fullName = `${repository.owner}/${repository.name}`;

    let signedIn: { token: string; response: GitHubResponse } | undefined;
    try {
        signedIn = await readTopicsSignedIn(repository);
    } catch {
        return undefined; // sign in cancelled
    }
    if (!signedIn) {
        return undefined;
    }
    if (signedIn.response.status !== 200) {
        vscode.window.showErrorMessage(l10n.t("Could not read the GitHub topics of {0}: {1}", fullName, errorMessage(signedIn.response)));
        return undefined;
    }

    const plan = planTopicsSync(shareableTags, readTopics(signedIn.response));
    if (plan.addToGitHub.length === 0 && plan.addToProject.length === 0) {
        vscode.window.showInformationMessage(l10n.t("The tags of \"{0}\" and the GitHub topics of {1} are already in sync.", projectName, fullName));
        return [];
    }

    const lines = [
        plan.addToGitHub.length > 0 ? l10n.t("Add to GitHub: {0}", plan.addToGitHub.join(", ")) : undefined,
        plan.addToProject.length > 0 ? l10n.t("Add to the project tags: {0}", plan.addToProject.join(", ")) : undefined,
        plan.skipped.length > 0 ? l10n.t("Not added (GitHub allows 20 topics): {0}", plan.skipped.join(", ")) : undefined,
        personalTags.length > 0 ? l10n.t("Kept private (personal tags): {0}", personalTags.join(", ")) : undefined
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
        const updated = await gitHubRequest("PUT", topicsUrl(repository), signedIn.token, { names: plan.topics });
        if (updated.status !== 200) {
            vscode.window.showErrorMessage(l10n.t("Could not update the GitHub topics of {0}: {1}", fullName, errorMessage(updated)));
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
}
