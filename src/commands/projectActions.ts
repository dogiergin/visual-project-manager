/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Based on Project Manager by Alessandro Fragnani.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import path = require("path");
import { commands, l10n, window } from "vscode";
import { CommandLocation } from "../core/constants";
import { Container } from "../core/container";
import { Project } from "../core/project";
import { pickTags } from "../quickpick/tagsPicker";
import { shouldOpenInNewWindow } from "../quickpick/projectsPicker";
import { Providers } from "../sidebar/providers";
import { ProjectStorage } from "../storage/storage";
import { PathUtils } from "../utils/path";
import { buildProjectUri } from "../utils/uri";
import { AutoTagger } from "../autotags/autoTagger";
import { syncTagsWithGitHubTopics } from "../github/githubTopicsSync";

/**
 * Actions shared by the Projects Home and the Side Bar
 */
export class ProjectActions {

    constructor(private projectStorage: ProjectStorage, private providers: Providers, private autoTagger: AutoTagger) { }

    public findSavedProject(rootPath: string): Project | undefined {
        return this.projectStorage.existsWithRootPath(rootPath);
    }

    /** Returns the saved project for `rootPath`, saving it (using the folder name) when needed */
    public ensureSavedProject(rootPath: string): Project {
        const existing = this.findSavedProject(rootPath);
        if (existing) {
            return existing;
        }

        const baseName = path.basename(rootPath, ".code-workspace");
        let name = baseName;
        for (let suffix = 2; this.projectStorage.exists(name); suffix++) {
            name = `${baseName} (${suffix})`;
        }

        this.projectStorage.push(name, rootPath);
        this.projectStorage.save();
        return this.findSavedProject(rootPath);
    }

    public setPinned(rootPath: string, pinned: boolean): Project | undefined {
        const project = pinned ? this.ensureSavedProject(rootPath) : this.findSavedProject(rootPath);
        if (!project) {
            return undefined;
        }

        this.projectStorage.setPinned(project.name, pinned);
        this.projectStorage.save();
        this.providers.refreshStorageTreeView();
        return project;
    }

    public async editTags(rootPath: string): Promise<void> {
        const project = this.ensureSavedProject(rootPath);
        // suggested tags come preselected, so accepting them is a single Enter
        const suggestions = this.autoTagger.getSuggestions(PathUtils.expandHomePath(project.rootPath), project.tags);

        const picked = await pickTags(this.projectStorage, [ ...project.tags, ...suggestions ], {
            useDefaultTags: true,
            useNoTagsDefined: false,
            allowAddingNewTags: true
        });

        if (!picked) {
            return;
        }

        await this.autoTagger.reject(PathUtils.expandHomePath(project.rootPath), suggestions.filter(tag => !picked.includes(tag)));
        this.projectStorage.editTags(project.name, picked);
        this.projectStorage.save();
        this.providers.refreshStorageTreeView();
    }

    /** Adds the suggested (automatic) tags to the project tags */
    public acceptSuggestions(rootPath: string): void {
        const project = this.ensureSavedProject(rootPath);
        const suggestions = this.autoTagger.getSuggestions(PathUtils.expandHomePath(project.rootPath), project.tags);
        if (suggestions.length === 0) {
            return;
        }
        this.projectStorage.editTags(project.name, [ ...project.tags, ...suggestions ]);
        this.projectStorage.save();
        this.providers.refreshStorageTreeView();
    }

    /** Publishes the project tags as GitHub topics, and imports the topics as tags (after a confirmation) */
    public async syncGitHubTopics(rootPath: string): Promise<void> {
        const project = this.ensureSavedProject(rootPath);
        const added = await syncTagsWithGitHubTopics(project.name, PathUtils.expandHomePath(project.rootPath), project.tags);
        if (!added || added.length === 0) {
            return;
        }
        this.projectStorage.editTags(project.name, [ ...project.tags, ...added ]);
        this.projectStorage.save();
        this.providers.refreshStorageTreeView();
    }

    public async open(rootPath: string, newWindow: boolean): Promise<void> {
        const project = this.findSavedProject(rootPath);
        if (project) {
            Container.stack.push(project.name);
            await Container.context.globalState.update("recent", Container.stack.toString());
        }

        const projectPath = PathUtils.expandHomePath(rootPath);
        if (!newWindow) {
            // reuses the Side Bar command, so the `confirmSwitchOnActiveWindow` setting is respected
            await commands.executeCommand("_projectManager.open", projectPath, project?.name ?? path.basename(projectPath), project?.profile ?? "");
            return;
        }

        try {
            await commands.executeCommand("vscode.openFolder", buildProjectUri(projectPath), {
                forceProfile: project?.profile || undefined,
                forceNewWindow: shouldOpenInNewWindow(true, CommandLocation.SideBar)
            });
        } catch {
            window.showInformationMessage(l10n.t("Could not open the project!"));
        }
    }
}
