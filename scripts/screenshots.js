/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

// Renders the Projects page with sample data and saves the README screenshots in `images/screenshots`.
// Usage: npm run screenshots   (requires Google Chrome or Microsoft Edge)
//
// After any visual change in `media/`, run it again and commit the updated images.

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { pathToFileURL } = require("url");

const root = path.resolve(__dirname, "..");
const media = path.join(root, "media");
const output = path.join(root, "images", "screenshots");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "vpm-screenshots-"));

const browsers = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium"
].filter(Boolean);
const browser = browsers.find(candidate => fs.existsSync(candidate));
if (!browser) {
    console.error("Chrome/Edge not found. Set the CHROME_PATH environment variable.");
    process.exit(1);
}

// ---------------------------------------------------------------- sample data

const project = (name, rootPath, tags, pinned, kind = "folder") =>
    ({ rootPath, name, displayPath: rootPath, tags, pinned, saved: true, kind });

const pinned = [
    project("AI Engineer Program", "D:\\Visual-Studio-Code\\AI Engineer Program", [ "AI" ], true),
    project("Visual-Project-Manager", "D:\\Visual-Studio-Code\\Visual-Project-Manager", [ "VS Code" ], true),
    project("PYTHON", "D:\\Visual-Studio-Code\\PYTHON", [ "Python" ], true)
];
const recent = [
    project("ai-vs-human-dashboard", "D:\\Visual-Studio-Code\\ai-vs-human-dashboard", [ "AI", "Data" ], false),
    project("Data-Analysis", "D:\\Visual-Studio-Code\\Data-Analysis", [ "Data", "Python" ], false),
    project("Kaggle-proje", "D:\\Visual-Studio-Code\\Kaggle-proje", [ "Data" ], false),
    project("shop", "D:\\work\\shop.code-workspace", [ "Web" ], false, "workspace"),
    project("notes", "C:\\Users\\me\\notes", [], false),
    project("portfolio", "C:\\Users\\me\\portfolio", [ "Web" ], false),
    project("scratch", "C:\\Users\\me\\scratch", [], false)
];
const data = {
    pinned, recent, all: [ ...pinned, ...recent ], tags: [ "AI", "Data", "Python", "VS Code", "Web" ],
    limits: { pinned: 6, recent: 6 }, theme: "blackBlue"
};

// English strings, same keys as `getStrings()` in `src/home/projectsHome.ts`
const strings = {
    title: "Projects", searchLabel: "Search projects", searchPlaceholder: "Search by name, or type #tag",
    searchHint: "", clearSearch: "Clear search", tagsLabel: "Filter by tag", pinned: "Pinned", recent: "Recent",
    results: "Results", noPinned: "No pinned projects yet.", noRecent: "No recently opened local projects.",
    noResults: "No projects match your search.", resultsCount: "{0} projects found", resultsCountOne: "1 project found",
    open: "Open {0}", openInNewWindow: "Open in New Window", pin: "Pin", unpin: "Unpin", editTags: "Edit Tags",
    tags: "Tags: {0}", workspace: "Workspace", openFolder: "Open Folder...", listProjects: "All Projects...",
    settings: "Settings", pinnedAnnouncement: "{0} pinned", unpinnedAnnouncement: "{0} unpinned",
    keyboardHelp: "Keyboard: / search · arrows move · Enter open · Ctrl+Enter new window · P pin · T tags · Esc clear",
    show: "Show", showCount: "Number of projects to show in {0}", all: "All", showMore: "Show all ({0})",
    showLess: "Show less", pinnedBadge: "Pinned",
    credits: "Based on Project Manager by Alessandro Fragnani"
};

// ---------------------------------------------------------------- themes (VS Code default colors)

const common = "--vscode-font-family: 'Segoe UI', system-ui, sans-serif; --vscode-font-size: 13px;";
const themes = {
    dark: { bodyClass: "vscode-dark", css: `${common}
        --vscode-foreground:#cccccc; --vscode-descriptionForeground:#9d9d9d; --vscode-editor-background:#1f1f1f;
        --vscode-list-hoverBackground:#2a2d2e; --vscode-focusBorder:#0078d4; --vscode-widget-border:#313131;
        --vscode-input-background:#313131; --vscode-input-foreground:#cccccc; --vscode-input-border:#3c3c3c;
        --vscode-button-secondaryBackground:#313131; --vscode-button-secondaryForeground:#cccccc;
        --vscode-button-background:#0078d4; --vscode-button-foreground:#ffffff; --vscode-badge-background:#616161;
        --vscode-badge-foreground:#f8f8f8; --vscode-textLink-foreground:#4daafc;` },
    light: { bodyClass: "vscode-light", css: `${common}
        --vscode-foreground:#3b3b3b; --vscode-descriptionForeground:#6f6f6f; --vscode-editor-background:#ffffff;
        --vscode-list-hoverBackground:#f2f2f2; --vscode-focusBorder:#005fb8; --vscode-widget-border:#e5e5e5;
        --vscode-input-background:#ffffff; --vscode-input-foreground:#3b3b3b; --vscode-input-border:#cecece;
        --vscode-button-secondaryBackground:#e5e5e5; --vscode-button-secondaryForeground:#3b3b3b;
        --vscode-button-background:#005fb8; --vscode-button-foreground:#ffffff; --vscode-badge-background:#cccccc;
        --vscode-badge-foreground:#3b3b3b; --vscode-textLink-foreground:#005fb8;` },
    highContrast: { bodyClass: "vscode-high-contrast", css: `${common}
        --vscode-foreground:#ffffff; --vscode-descriptionForeground:#ffffff; --vscode-editor-background:#000000;
        --vscode-focusBorder:#f38518; --vscode-contrastBorder:#6fc3df; --vscode-contrastActiveBorder:#f38518;
        --vscode-input-background:#000000; --vscode-input-foreground:#ffffff; --vscode-button-background:#000000;
        --vscode-button-foreground:#ffffff; --vscode-badge-background:#000000; --vscode-badge-foreground:#ffffff;
        --vscode-textLink-foreground:#21a6ff;` }
};

// ---------------------------------------------------------------- shots

const shots = [
    { file: "projects-page-dark.png", theme: "dark", state: {} },
    { file: "projects-page-light.png", theme: "light", pageTheme: "vscode", state: {} },
    { file: "projects-page-search.png", theme: "dark", state: { query: "#da" } },
    { file: "projects-page-high-contrast.png", theme: "highContrast", state: { selectedTags: [ "Python" ] } }
];

const url = file => pathToFileURL(path.join(media, file)).href;

for (const shot of shots) {
    const theme = themes[shot.theme];
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${url("shared/base.css")}"><link rel="stylesheet" href="${url("home/home.css")}">
<style>:root { ${theme.css} }</style></head>
<body class="${theme.bodyClass}"><div id="app"></div>
<script id="strings" type="application/json">${JSON.stringify(strings)}</script>
<script>
    window.acquireVsCodeApi = () => ({
        getState: () => (${JSON.stringify(shot.state)}),
        setState() { },
        postMessage(message) {
            if (message.type === "ready") {
                setTimeout(() => window.postMessage({ type: "data", data: ${JSON.stringify({ ...data, theme: shot.pageTheme || data.theme })} }, "*"));
            }
        }
    });
</script>
<script src="${url("shared/projectQuery.js")}"></script><script src="${url("shared/icons.js")}"></script>
<script src="${url("home/home.js")}"></script></body></html>`;

    const page = path.join(temp, shot.file.replace(".png", ".html"));
    fs.writeFileSync(page, html);
    execFileSync(browser, [
        "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
        "--window-size=1000,760", `--screenshot=${path.join(output, shot.file)}`, pathToFileURL(page).href
    ], { stdio: "ignore" });
    console.log(`images/screenshots/${shot.file}`);
}

fs.rmSync(temp, { recursive: true, force: true });
