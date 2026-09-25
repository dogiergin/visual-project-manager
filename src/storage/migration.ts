/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Based on Project Manager by Alessandro Fragnani.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import fs = require("fs");
import path = require("path");
import { ExtensionContext } from "vscode";
import { PROJECTS_FILE } from "../core/constants";

const ORIGINAL_EXTENSION_ID = "alefragnani.project-manager";
const MIGRATED_KEY = "migratedFromProjectManager";

/**
 * Each extension has its own storage folder, so users coming from the original
 * Project Manager would see an empty Favorites list. Copy their `projects.json` once.
 */
export function migrateProjectsFileFromProjectManager(context: ExtensionContext, projectsFile: string) {
    if (context.globalState.get<boolean>(MIGRATED_KEY, false)) {
        return;
    }

    try {
        const ownStorage = context.globalStorageUri.fsPath;
        const originalFile = path.join(ownStorage, "..", ORIGINAL_EXTENSION_ID, PROJECTS_FILE);

        // only when using the default location (a custom `projectsLocation` is already shared)
        const usesDefaultLocation = path.dirname(projectsFile).toLowerCase() === ownStorage.toLowerCase();
        if (usesDefaultLocation && context.extension.id !== ORIGINAL_EXTENSION_ID
            && !fs.existsSync(projectsFile) && fs.existsSync(originalFile)) {
            fs.mkdirSync(ownStorage, { recursive: true });
            fs.copyFileSync(originalFile, projectsFile);
        }
    } catch (error) {
        console.log(error);
    }

    context.globalState.update(MIGRATED_KEY, true);
}
