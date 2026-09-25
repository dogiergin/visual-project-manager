/*---------------------------------------------------------------------------------------------
*  Copyright (c) Alessandro Fragnani. All rights reserved.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { commands } from "vscode";
import { Container } from "../core/container";
import { WhatsNewManager } from "../../vscode-whats-new/src/Manager";
import { ProjectManagerContentProvider, ProjectManagerSocialMediaProvider } from "./contentProvider";

export function registerWhatsNew() {
    const provider = new ProjectManagerContentProvider();
    const { publisher, name } = Container.context.extension.packageJSON;
    const viewer = new WhatsNewManager(Container.context)
        .registerContentProvider(publisher, name, provider)
        .registerSocialMediaProvider(new ProjectManagerSocialMediaProvider())
        // the Projects Home is displayed on startup, so updates are announced with a notification instead of a page
        .setUpdateDisplayKind("notification");
    viewer.showPageInActivation();
    Container.context.subscriptions.push(commands.registerCommand("projectManager.whatsNew", () => viewer.showPage()));
    Container.context.subscriptions.push(commands.registerCommand("_projectManager.whatsNewContextMenu", () => viewer.showPage()));
}
