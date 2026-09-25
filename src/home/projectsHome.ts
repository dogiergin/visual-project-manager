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
import { AutoTagger } from "../autotags/autoTagger";
import { findGitHubRepository } from "../github/githubTopicsSync";

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
    suggestedTags: string[]; // automatic tags (rules / GitHub topics) not accepted yet
    github?: string;         // "owner/repo" when the project has a GitHub remote
    pinned: boolean;
    saved: boolean;
    kind: "folder" | "workspace" | "remote";
}

interface HomeData {
    pinned: HomeProject[];
    recent: HomeProject[];
    all: HomeProject[];
    tags: string[];
    limits: Record<HomeSection, number>; // 0 = show all
    theme: string;
}

type HomeSection = "pinned" | "recent";

const LIMIT_SETTINGS: Record<HomeSection, string> = {
    pinned: "home.pinnedProjectsLimit",
    recent: "home.recentProjectsLimit"
};
const DEFAULT_LIMIT = 6;
// how many recent projects are loaded, so the search can find them even when only a few are displayed
const RECENT_PROJECTS_TO_LOAD = 50;

type HomeMessage =
    | { type: "ready" }
    | { type: "open"; rootPath: string; newWindow: boolean }
    | { type: "setPinned"; rootPath: string; pinned: boolean }
    | { type: "editTags"; rootPath: string }
    | { type: "acceptSuggestions"; rootPath: string }
    | { type: "syncGitHub"; rootPath: string }
    | { type: "setLimit"; section: HomeSection; limit: number }
    | { type: "command"; command: "openFolder" | "cloneRepository" | "listProjects" | "saveProject" | "openSettings" };

const VIEW_TYPE = "projectManager.home";
const REPLACED_WELCOME_PAGE_KEY = "home.replacedWelcomePage";
// the last data sent to the page, so the next startup can display it immediately
const LAST_DATA_KEY = "home.lastData";

function gitHubName(rootPath: string): string | undefined {
    const repository = isRemotePath(rootPath) ? undefined : findGitHubRepository(rootPath);
    return repository ? `${repository.owner}/${repository.name}` : undefined;
}

export class ProjectsHome {

    private panel: vscode.WebviewPanel | undefined;

    constructor(
        private projectStorage: ProjectStorage,
        private providers: Providers,
        private actions: ProjectActions,
        private autoTagger: AutoTagger
    ) {
        Container.context.subscriptions.push(
            vscode.commands.registerCommand("projectManager.openHome", () => this.show()),
            // VS Code restores the Projects tab at startup (activation event `onWebviewPanel:projectManager.home`),
            // before the `onStartupFinished` extensions, so it appears right away
            vscode.window.registerWebviewPanelSerializer(VIEW_TYPE, {
                deserializeWebviewPanel: async (panel: vscode.WebviewPanel) => {
                    if (this.panel) {
                        panel.dispose();
                        return;
                    }
                    this.attach(panel);
                }
            }),
            providers.onDidChangeStorage(() => this.refresh()),
            autoTagger.onDidChange(() => this.refresh()),
            vscode.workspace.onDidChangeConfiguration(cfg => {
                if (cfg.affectsConfiguration("projectManager.home")) {
                    this.refresh();
                }
            })
        );
    }

    public async showOnStartupIfNeeded(): Promise<void> {
        await this.replaceWelcomePage();

        const mode = vscode.workspace.getConfiguration("projectManager").get<string>("home.showOnStartup", ShowHomeOnStartup.always);
        const isEmptyWindow = !vscode.workspace.workspaceFolders && !vscode.workspace.workspaceFile;
        if (mode === ShowHomeOnStartup.never || (mode === ShowHomeOnStartup.emptyWindow && !isEmptyWindow)) {
            return;
        }
        // already restored by VS Code (or being restored): do not open a second one
        if (this.panel || this.hasProjectsTab()) {
            return;
        }
        // a new tab, next to the editors restored with the last project
        this.show();
    }

    private hasProjectsTab(): boolean {
        return vscode.window.tabGroups.all.some(group => group.tabs.some(tab =>
            tab.input instanceof vscode.TabInputWebview && tab.input.viewType.endsWith(VIEW_TYPE)));
    }

    public show(preserveFocus = false) {
        if (this.panel) {
            this.panel.reveal(undefined, preserveFocus);
            return;
        }
        this.attach(vscode.window.createWebviewPanel(VIEW_TYPE, l10n.t("Projects"), { viewColumn: vscode.ViewColumn.One, preserveFocus }, this.webviewOptions()));
    }

    private webviewOptions(): vscode.WebviewOptions & vscode.WebviewPanelOptions {
        return {
            enableScripts: true,
            localResourceRoots: [ vscode.Uri.joinPath(Container.context.extensionUri, "media") ]
        };
    }

    private attach(panel: vscode.WebviewPanel) {
        this.panel = panel;
        panel.webview.options = this.webviewOptions();
        panel.iconPath = vscode.Uri.joinPath(Container.context.extensionUri, "docs", "images", "project-manager-side-bar.svg");
        panel.webview.html = buildWebviewHtml(panel.webview, {
            title: l10n.t("Projects"),
            script: "home/home.js",
            style: "home/home.css",
            strings: this.getStrings(),
            initialData: Container.context.globalState.get<HomeData>(LAST_DATA_KEY)
        });

        panel.webview.onDidReceiveMessage((message: HomeMessage) => this.handleMessage(message));
        panel.onDidChangeViewState(event => {
            if (event.webviewPanel.visible) {
                this.refresh();
            }
        });
        panel.onDidDispose(() => {
            if (this.panel === panel) {
                this.panel = undefined;
            }
        });
    }

    public async refresh() {
        if (!this.panel || !this.panel.visible) {
            return;
        }
        const data = await this.getData();
        this.panel?.webview.postMessage({ type: "data", data });
        Container.context.globalState.update(LAST_DATA_KEY, data);
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

            case "syncGitHub":
                await this.actions.syncGitHubTopics(message.rootPath);
                break;

            case "acceptSuggestions":
                this.actions.acceptSuggestions(message.rootPath);
                break;

            case "setLimit":
                if (LIMIT_SETTINGS[message.section] && [ 0, 3, 6, 9, 12 ].includes(message.limit)) {
                    await vscode.workspace.getConfiguration("projectManager")
                        .update(LIMIT_SETTINGS[message.section], message.limit, vscode.ConfigurationTarget.Global);
                }
                break;

            case "command":
                switch (message.command) {
                    case "openFolder":
                        vscode.commands.executeCommand("_projectManager.openFolderWelcome");
                        break;
                    case "cloneRepository":
                        vscode.commands.executeCommand("git.clone");
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
        const config = vscode.workspace.getConfiguration("projectManager");
        const saved = this.projectStorage.getProjects().filter(project => project.enabled);

        const toHomeProject = (rootPath: string, name?: string, tags: string[] = [], pinned = false, isSaved = false): HomeProject => {
            const expanded = PathUtils.expandHomePath(rootPath);
            return {
                rootPath: expanded,
                name: name ?? path.basename(expanded, ".code-workspace"),
                displayPath: expanded,
                tags,
                suggestedTags: this.autoTagger.getSuggestions(expanded, tags),
                github: gitHubName(expanded),
                pinned,
                saved: isSaved,
                kind: isRemotePath(expanded) ? "remote" : path.extname(expanded) === ".code-workspace" ? "workspace" : "folder"
            };
        };

        const all = saved.map(project => toHomeProject(project.rootPath, project.name, project.tags, !!project.pinned, true));
        const pinned = all.filter(project => project.pinned);

        const samePath = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
        const recent: HomeProject[] = [];
        for (const item of await getRecentLocalProjects(this.projectStorage, RECENT_PROJECTS_TO_LOAD)) {
            const savedProject = all.find(project => samePath(project.rootPath, item.rootPath));
            const homeProject = savedProject ?? toHomeProject(item.rootPath);
            if (!homeProject.pinned) {
                recent.push(homeProject);
            }
            if (!savedProject) {
                all.push(homeProject);
            }
        }

        const tags = [ ...new Set([ ...this.projectStorage.getAvailableTags(), ...all.flatMap(project => project.suggestedTags) ]) ]
            .sort((a, b) => a.localeCompare(b));
        const limits = {
            pinned: config.get<number>(LIMIT_SETTINGS.pinned, DEFAULT_LIMIT),
            recent: config.get<number>(LIMIT_SETTINGS.recent, DEFAULT_LIMIT)
        };
        const theme = config.get<string>("home.theme", "blackBlue");
        return { pinned, recent, all, tags, limits, theme };
    }

    /**
     * VS Code opens its own Welcome page unless `workbench.startupEditor` is `none`. The extension default
     * (`configurationDefaults`) covers most users; a value set by the user is replaced once, with an Undo.
     */
    private async replaceWelcomePage() {
        if (Container.context.globalState.get<boolean>(REPLACED_WELCOME_PAGE_KEY, false)) {
            return;
        }
        await Container.context.globalState.update(REPLACED_WELCOME_PAGE_KEY, true);

        const workbench = vscode.workspace.getConfiguration("workbench");
        if (workbench.get<string>("startupEditor") === "none") {
            return;
        }
        const previous = workbench.inspect<string>("startupEditor")?.globalValue;
        await workbench.update("startupEditor", "none", vscode.ConfigurationTarget.Global);

        const undo = l10n.t("Undo");
        vscode.window.showInformationMessage(l10n.t("The Projects page now opens instead of the VS Code Welcome page."), undo).then(async answer => {
            if (answer === undo) {
                await vscode.workspace.getConfiguration("workbench").update("startupEditor", previous, vscode.ConfigurationTarget.Global);
                await vscode.workspace.getConfiguration("projectManager").update("home.showOnStartup", ShowHomeOnStartup.never, vscode.ConfigurationTarget.Global);
            }
        });
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
            keyboardHelp: l10n.t("Keyboard: / search · arrows move · Enter open · Ctrl+Enter new window · P pin · T tags · A accept suggested tags · G GitHub topics · Esc clear"),
            show: l10n.t("Show"),
            showCount: l10n.t("Number of projects to show in {0}"),
            all: l10n.t("All"),
            showMore: l10n.t("Show all ({0})"),
            showLess: l10n.t("Show less"),
            pinnedBadge: l10n.t("Pinned"),
            greetingMorning: l10n.t("Good morning"),
            greetingAfternoon: l10n.t("Good afternoon"),
            greetingEvening: l10n.t("Good evening"),
            greetingNight: l10n.t("Working late"),
            subtitle: l10n.t("Pick up where you left off, or start something new."),
            quickActions: l10n.t("Quick actions"),
            openFolderDescription: l10n.t("Open a folder from your computer"),
            cloneRepository: l10n.t("Clone Repository..."),
            cloneRepositoryDescription: l10n.t("Get a project from Git"),
            listProjectsDescription: l10n.t("Search every saved and detected project"),
            settingsDescription: l10n.t("Startup, theme and automatic tags"),
            continueTitle: l10n.t("Continue where you left off"),
            openProject: l10n.t("Open"),
            suggestedTags: l10n.t("Suggested tags: {0}"),
            acceptSuggestions: l10n.t("Accept suggested tags"),
            syncGitHub: l10n.t("Sync tags with GitHub topics ({0})"),
            credits: l10n.t("Based on Project Manager by Alessandro Fragnani")
        };
    }
}
