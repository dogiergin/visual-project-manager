/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Based on Project Manager by Alessandro Fragnani.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import path = require("path");
import * as vscode from "vscode";
import { l10n } from "vscode";
import { ProjectActions } from "../commands/projectActions";
import { Container } from "../core/container";
import { Providers } from "../sidebar/providers";
import { ProjectStorage } from "../storage/storage";
import { PathUtils } from "../utils/path";
import { isRemotePath } from "../utils/remote";
import { getRecentLocalProjects } from "./recentProjects";
import { buildWebviewHtml } from "./webviewHtml";

export enum ShowHomeOnStartup {
    emptyWindow = "emptyWindow",
    always = "always",
    never = "never"
}

export interface HomeProject {
    rootPath: string;
    name: string;
    displayPath: string;
    tags: string[];
    pinned: boolean;
    saved: boolean;
    kind: "folder" | "workspace" | "remote";
}

interface HomeData {
    pinned: HomeProject[];
    recent: HomeProject[];
    all: HomeProject[];
    tags: string[];
}

type HomeMessage =
    | { type: "ready" }
    | { type: "open"; rootPath: string; newWindow: boolean }
    | { type: "setPinned"; rootPath: string; pinned: boolean }
    | { type: "editTags"; rootPath: string }
    | { type: "command"; command: "openFolder" | "listProjects" | "saveProject" | "openSettings" };

const VIEW_TYPE = "projectManager.home";
const ASKED_ABOUT_STARTUP_EDITOR_KEY = "home.askedAboutStartupEditor";

export class ProjectsHome {

    private panel: vscode.WebviewPanel | undefined;

    constructor(
        private projectStorage: ProjectStorage,
        private providers: Providers,
        private actions: ProjectActions
    ) {
        Container.context.subscriptions.push(
            vscode.commands.registerCommand("projectManager.openHome", () => this.show()),
            providers.onDidChangeStorage(() => this.refresh()),
            vscode.workspace.onDidChangeConfiguration(cfg => {
                if (cfg.affectsConfiguration("projectManager.home")) {
                    this.refresh();
                }
            })
        );
    }

    public async showOnStartupIfNeeded(): Promise<void> {
        const mode = vscode.workspace.getConfiguration("projectManager").get<string>("home.showOnStartup", ShowHomeOnStartup.emptyWindow);
        const isEmptyWindow = !vscode.workspace.workspaceFolders && !vscode.workspace.workspaceFile;

        if (mode === ShowHomeOnStartup.always || (mode === ShowHomeOnStartup.emptyWindow && isEmptyWindow)) {
            this.show(mode === ShowHomeOnStartup.always && !isEmptyWindow);
            await this.suggestDisablingWelcomePage();
        }
    }

    public show(preserveFocus = false) {
        if (this.panel) {
            this.panel.reveal(undefined, preserveFocus);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(VIEW_TYPE, l10n.t("Projects"), { viewColumn: vscode.ViewColumn.One, preserveFocus }, {
            enableScripts: true,
            localResourceRoots: [ vscode.Uri.joinPath(Container.context.extensionUri, "media") ]
        });
        this.panel.iconPath = vscode.Uri.joinPath(Container.context.extensionUri, "docs", "images", "project-manager-side-bar.svg");
        this.panel.webview.html = buildWebviewHtml(this.panel.webview, {
            title: l10n.t("Projects"),
            script: "home/home.js",
            style: "home/home.css",
            strings: this.getStrings()
        });

        this.panel.webview.onDidReceiveMessage((message: HomeMessage) => this.handleMessage(message));
        this.panel.onDidChangeViewState(event => {
            if (event.webviewPanel.visible) {
                this.refresh();
            }
        });
        this.panel.onDidDispose(() => this.panel = undefined);
    }

    public async refresh() {
        if (!this.panel || !this.panel.visible) {
            return;
        }
        this.panel.webview.postMessage({ type: "data", data: await this.getData() });
    }

    private async handleMessage(message: HomeMessage) {
        switch (message.type) {
            case "ready":
                this.refresh();
                break;

            case "open":
                await this.actions.open(message.rootPath, message.newWindow);
                break;

            case "setPinned":
                this.actions.setPinned(message.rootPath, message.pinned);
                break;

            case "editTags":
                await this.actions.editTags(message.rootPath);
                break;

            case "command":
                switch (message.command) {
                    case "openFolder":
                        vscode.commands.executeCommand("_projectManager.openFolderWelcome");
                        break;
                    case "listProjects":
                        vscode.commands.executeCommand("projectManager.listProjects");
                        break;
                    case "saveProject":
                        vscode.commands.executeCommand("projectManager.saveProject");
                        break;
                    case "openSettings":
                        vscode.commands.executeCommand("workbench.action.openSettings", "projectManager.home");
                        break;
                }
                break;
        }
    }

    private async getData(): Promise<HomeData> {
        const limit = vscode.workspace.getConfiguration("projectManager").get<number>("home.recentProjectsLimit", 10);
        const saved = this.projectStorage.getProjects().filter(project => project.enabled);

        const toHomeProject = (rootPath: string, name?: string, tags: string[] = [], pinned = false, isSaved = false): HomeProject => {
            const expanded = PathUtils.expandHomePath(rootPath);
            return {
                rootPath: expanded,
                name: name ?? path.basename(expanded, ".code-workspace"),
                displayPath: expanded,
                tags,
                pinned,
                saved: isSaved,
                kind: isRemotePath(expanded) ? "remote" : path.extname(expanded) === ".code-workspace" ? "workspace" : "folder"
            };
        };

        const all = saved.map(project => toHomeProject(project.rootPath, project.name, project.tags, !!project.pinned, true));
        const pinned = all.filter(project => project.pinned);

        const samePath = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
        const recent: HomeProject[] = [];
        for (const item of await getRecentLocalProjects(this.projectStorage, limit)) {
            const savedProject = all.find(project => samePath(project.rootPath, item.rootPath));
            const homeProject = savedProject ?? toHomeProject(item.rootPath);
            if (!homeProject.pinned) {
                recent.push(homeProject);
            }
            if (!savedProject) {
                all.push(homeProject);
            }
        }

        const tags = this.projectStorage.getAvailableTags().sort((a, b) => a.localeCompare(b));
        return { pinned, recent, all, tags };
    }

    /** VS Code opens its own Welcome page unless `workbench.startupEditor` is `none`. Ask only once. */
    private async suggestDisablingWelcomePage() {
        const workbench = vscode.workspace.getConfiguration("workbench");
        if (workbench.get<string>("startupEditor") === "none" || Container.context.globalState.get<boolean>(ASKED_ABOUT_STARTUP_EDITOR_KEY, false)) {
            return;
        }
        await Container.context.globalState.update(ASKED_ABOUT_STARTUP_EDITOR_KEY, true);

        const optionYes = l10n.t("Yes, hide the Welcome page");
        const answer = await vscode.window.showInformationMessage(
            l10n.t("Do you want the Projects page to replace the VS Code Welcome page on startup?"), optionYes, l10n.t("No"));
        if (answer === optionYes) {
            await workbench.update("startupEditor", "none", vscode.ConfigurationTarget.Global);
        }
    }

    private getStrings(): Record<string, string> {
        return {
            title: l10n.t("Projects"),
            searchLabel: l10n.t("Search projects"),
            searchPlaceholder: l10n.t("Search by name, or type #tag"),
            searchHint: l10n.t("Type a project name, or use #tag to filter by tag. Press Down Arrow to move to the results."),
            clearSearch: l10n.t("Clear search"),
            tagsLabel: l10n.t("Filter by tag"),
            pinned: l10n.t("Pinned"),
            recent: l10n.t("Recent"),
            results: l10n.t("Results"),
            noPinned: l10n.t("No pinned projects yet. Use the pin button next to a project to keep it here."),
            noRecent: l10n.t("No recently opened local projects."),
            noResults: l10n.t("No projects match your search."),
            resultsCount: l10n.t("{0} projects found"),
            resultsCountOne: l10n.t("1 project found"),
            open: l10n.t("Open {0}"),
            openInNewWindow: l10n.t("Open in New Window"),
            pin: l10n.t("Pin"),
            unpin: l10n.t("Unpin"),
            editTags: l10n.t("Edit Tags"),
            tags: l10n.t("Tags: {0}"),
            workspace: l10n.t("Workspace"),
            openFolder: l10n.t("Open Folder..."),
            listProjects: l10n.t("All Projects..."),
            settings: l10n.t("Settings"),
            pinnedAnnouncement: l10n.t("{0} pinned"),
            unpinnedAnnouncement: l10n.t("{0} unpinned"),
            keyboardHelp: l10n.t("Keyboard: / search · ↑ ↓ move · ← → actions · Enter open · Ctrl+Enter new window · Esc clear"),
            credits: l10n.t("Based on Project Manager by Alessandro Fragnani")
        };
    }
}
