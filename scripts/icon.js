/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

// Renders images/icon.svg to images/icon.png (256x256, transparent), the Marketplace icon.
// Usage: npm run icon   (requires Google Chrome or Microsoft Edge)

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const root = path.join(__dirname, "..");
const browser = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome"
].find(file => fs.existsSync(file));
if (!browser) {
    throw new Error("Google Chrome or Microsoft Edge was not found");
}

const output = path.join(root, "images", "icon.png");
execFileSync(browser, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--default-background-color=00000000",
    "--window-size=256,256", `--screenshot=${output}`, pathToFileURL(path.join(root, "images", "icon.svg")).href
], { stdio: "ignore" });
console.log("images/icon.png");
