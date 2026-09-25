/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Based on Project Manager by Alessandro Fragnani.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import path = require("path");
import * as vscode from "vscode";
import { ProjectStorage } from "../storage/storage";
import { PathUtils } from "../utils/path";
import { isRemotePath } from "../utils/remote";
import { sortProjects } from "../utils/sorter";
import { getGitBranch } from "../utils/git";
import { PINNED_PROJECT_NODE_KIND } from "./constants";
import { ProjectNode } from "./nodes";
import { SidebarFilter } from "./sidebarFilter";

/**
 * The `Pinned` view, displayed at the top of the Side Bar.
 */
export class PinnedProvider implements vscode.TreeDataProvider<ProjectNode> {

    private internalOnDidChangeTreeData = new vscode.EventEmitter<ProjectNode | void>();
    public readonly onDidChangeTreeData = this.internalOnDidChangeTreeData.event;

    constructor(private projectSource: ProjectStorage) { }

    public refresh(): void {
        this.internalOnDidChangeTreeData.fire();
    }

    public getTreeItem(element: ProjectNode): vscode.TreeItem {
        return element;
    }

    /** The pinned projects that pass the Side Bar filter */
    public getVisibleProjects() {
        return this.projectSource.getPinnedProjects().filter(project => SidebarFilter.matches(project));
    }

    public async getChildren(element?: ProjectNode): Promise<ProjectNode[]> {
        if (element) {
            return [];
        }

        const showGitBranch = vscode.workspace.getConfiguration("projectManager").get<string>("git.showBranchName", "never");

        const visible = this.getVisibleProjects();
        const projects = sortProjects(visible.map(project => ({
            label: project.name,
            description: project.rootPath,
            profile: project.profile
        })));

        return projects.map(prj => {
            let icon = "favorites";
            if (path.extname(prj.description) === ".code-workspace") {
                icon = "favorites-workspace";
            } else if (isRemotePath(prj.description)) {
                icon = "favorites-remote";
            }

            const projectPath = PathUtils.expandHomePath(prj.description);
            const gitBranch = (showGitBranch === "always" || showGitBranch === "onlyInSideBar") ? getGitBranch(projectPath) : undefined;

            const node = new ProjectNode(prj.label, vscode.TreeItemCollapsibleState.None, icon, {
                name: prj.label,
                path: projectPath,
                detail: gitBranch,
                tags: visible.find(project => project.name === prj.label)?.tags ?? [],
                suggestedTags: SidebarFilter.getSuggestions(visible.find(project => project.name === prj.label))
            }, {
                command: "_projectManager.open",
                title: "",
                arguments: [ projectPath, prj.label, prj.profile ],
            });
            node.contextValue = PINNED_PROJECT_NODE_KIND;
            return node;
        });
    }
}
