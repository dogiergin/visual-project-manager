/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Based on Project Manager by Alessandro Fragnani.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { l10n } from "vscode";
import { Container } from "../core/container";
import { buildWebviewHtml } from "../home/webviewHtml";
import { ProjectStorage } from "../storage/storage";
import { Providers } from "./providers";
import { SidebarFilter } from "./sidebarFilter";

type SearchMessage =
    | { type: "ready" }
    | { type: "query"; value: string }
    | { type: "tags"; tags: string[] }
    | { type: "clear" }
    | { type: "focusResults" };

/**
 * The `Search` view, at the top of the Side Bar. It filters the `Pinned` and `Favorites` views
 * by project name or `#tag`, and by the selected tag chips.
 */
export class SearchViewProvider implements vscode.WebviewViewProvider {

    private view: vscode.WebviewView | undefined;

    constructor(private projectStorage: ProjectStorage, providers: Providers) {
        Container.context.subscriptions.push(
            vscode.window.registerWebviewViewProvider("projectsExplorerSearch", this),
            providers.onDidChangeStorage(() => this.update()),
            SidebarFilter.onDidChange(() => this.update()),
            vscode.commands.registerCommand("projectManager.clearSideBarFilter", () => SidebarFilter.clear()),
            vscode.commands.registerCommand("projectManager.searchSideBar", async () => {
                await vscode.commands.executeCommand("projectsExplorerSearch.focus");
                this.view?.webview.postMessage({ type: "focus" });
            })
        );
    }

    public resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [ vscode.Uri.joinPath(Container.context.extensionUri, "media") ]
        };
        webviewView.webview.html = buildWebviewHtml(webviewView.webview, {
            title: l10n.t("Search"),
            script: "search/search.js",
            style: "search/search.css",
            strings: {
                searchLabel: l10n.t("Search projects"),
                searchPlaceholder: l10n.t("Search by name, or type #tag"),
                searchHint: l10n.t("Filters the Pinned and Favorites views. Type a project name, or use #tag. Press Down Arrow to move to the results."),
                clearSearch: l10n.t("Clear search"),
                clearFilters: l10n.t("Clear filters"),
                tagsLabel: l10n.t("Filter by tag"),
                resultsCount: l10n.t("{0} projects found"),
                resultsCountOne: l10n.t("1 project found"),
                noResults: l10n.t("No projects match the current filter.")
            }
        });

        webviewView.webview.onDidReceiveMessage((message: SearchMessage) => this.handleMessage(message));
        webviewView.onDidDispose(() => this.view = undefined);
    }

    private async handleMessage(message: SearchMessage) {
        switch (message.type) {
            case "ready":
                this.update();
                break;
            case "query":
                SidebarFilter.setQuery(message.value);
                break;
            case "tags":
                await SidebarFilter.setTags(message.tags);
                break;
            case "clear":
                await SidebarFilter.clear();
                break;
            case "focusResults":
                vscode.commands.executeCommand(this.projectStorage.hasPinnedProjects() ? "projectsExplorerPinned.focus" : "projectsExplorerFavorites.focus");
                break;
        }
    }

    private update() {
        if (!this.view) {
            return;
        }
        const projects = this.projectStorage.getProjects().filter(project => project.enabled);
        this.view.webview.postMessage({
            type: "state",
            query: SidebarFilter.getQuery(),
            selectedTags: SidebarFilter.getTags(),
            availableTags: this.projectStorage.getAvailableTags().sort((a, b) => a.localeCompare(b)),
            active: SidebarFilter.isActive(),
            matches: projects.filter(project => SidebarFilter.matches(project)).length
        });
    }
}
