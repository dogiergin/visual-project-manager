/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Based on Project Manager by Alessandro Fragnani.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import fs = require("fs");
import path = require("path");
import { commands, Uri } from "vscode";
import { Container } from "../core/container";
import { ProjectStorage } from "../storage/storage";
import { PathUtils } from "../utils/path";

export interface RecentProject {
    rootPath: string;        // local file system path (folder or .code-workspace file)
    isWorkspace: boolean;
}

interface RecentlyOpenedEntry {
    folderUri?: Uri | UriComponents;
    workspace?: { configPath: Uri | UriComponents };
    remoteAuthority?: string;
}

interface UriComponents {
    scheme: string;
    authority?: string;
    path: string;
    query?: string;
    fragment?: string;
}

function toUri(value: Uri | UriComponents): Uri {
    return value instanceof Uri ? value : Uri.from(value);
}

/**
 * Returns the projects recently opened in this machine (local folders and workspaces only),
 * most recent first, based on the VS Code "Open Recent" history.
 */
export async function getRecentLocalProjects(projectStorage: ProjectStorage, limit: number): Promise<RecentProject[]> {
    try {
        // Internal command, but it is the only way to reuse the "Open Recent" history of VS Code
        const recent = await commands.executeCommand<{ workspaces: RecentlyOpenedEntry[] }>("_workbench.getRecentlyOpened");
        const projects: RecentProject[] = [];

        for (const entry of recent?.workspaces ?? []) {
            if (entry.remoteAuthority) {
                continue;
            }
            const uri = entry.folderUri ? toUri(entry.folderUri) : entry.workspace ? toUri(entry.workspace.configPath) : undefined;
            if (!uri || uri.scheme !== "file" || !fs.existsSync(uri.fsPath)) {
                continue;
            }
            projects.push({ rootPath: uri.fsPath, isWorkspace: !entry.folderUri });
            if (projects.length >= limit) {
                break;
            }
        }
        return projects;
    } catch {
        return getRecentFromProjectManagerHistory(projectStorage, limit);
    }
}

/** Fallback: the projects opened through Project Manager itself */
function getRecentFromProjectManagerHistory(projectStorage: ProjectStorage, limit: number): RecentProject[] {
    const stack = Container.stack;
    const projects: RecentProject[] = [];
    for (let index = stack.length() - 1; index >= 0 && projects.length < limit; index--) {
        const project = projectStorage.getProjects().find(item => item.name === stack.getItem(index));
        if (!project) {
            continue;
        }
        const rootPath = PathUtils.expandHomePath(project.rootPath);
        if (fs.existsSync(rootPath)) {
            projects.push({ rootPath, isWorkspace: path.extname(rootPath) === ".code-workspace" });
        }
    }
    return projects;
}
