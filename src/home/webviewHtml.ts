/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Based on Project Manager by Alessandro Fragnani.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { randomBytes } from "crypto";
import { env, Uri, Webview } from "vscode";
import { Container } from "../core/container";

export interface WebviewPage {
    title: string;
    script: string;   // relative to `media`
    style: string;    // relative to `media`
    strings: Record<string, string>;
    initialData?: unknown; // displayed immediately, before the extension sends fresh data
}

function escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildWebviewHtml(webview: Webview, page: WebviewPage): string {
    const nonce = randomBytes(16).toString("base64");
    const media = (file: string) => webview.asWebviewUri(Uri.joinPath(Container.context.extensionUri, "media", file));
    // JSON inside a <script> block: escape `<` so the content can never close the tag
    const strings = JSON.stringify(page.strings).replace(/</g, "\\u003c");
    const initialData = page.initialData === undefined ? "" : JSON.stringify(page.initialData).replace(/</g, "\\u003c");

    return `<!DOCTYPE html>
<html lang="${escapeHtml(env.language)}">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(page.title)}</title>
    <link rel="stylesheet" href="${media("shared/base.css")}">
    <link rel="stylesheet" href="${media(page.style)}">
</head>
<body>
    <div id="app"></div>
    <script nonce="${nonce}" id="strings" type="application/json">${strings}</script>
    <script nonce="${nonce}" id="initial-data" type="application/json">${initialData}</script>
    <script nonce="${nonce}" src="${media("shared/projectQuery.js")}"></script>
    <script nonce="${nonce}" src="${media("shared/icons.js")}"></script>
    <script nonce="${nonce}" src="${media(page.script)}"></script>
</body>
</html>`;
}
