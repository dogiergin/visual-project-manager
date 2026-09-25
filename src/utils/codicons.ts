/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { ThemeIcon } from "vscode";

// Only the icons used by the extension (replaces the `vscode-ext-codicons` package and its ~450 icons)

export const codicons = {
    circle_slash: "$(circle-slash)",
    file_code: "$(file-code)",
    file_directory: "$(file-directory)",
    folder: "$(folder)",
    git_branch: "$(git-branch)",
    github: "$(github)",
    remote: "$(remote)",
    remote_explorer: "$(remote-explorer)",
    root_folder: "$(root-folder)",
    symbol_method: "$(symbol-method)",
    terminal: "$(terminal)",
    terminal_linux: "$(terminal-linux)",
    zap: "$(symbol-event)"
};

export const ThemeIcons = {
    file_code: new ThemeIcon("file-code"),
    folder: new ThemeIcon("folder"),
    git_merge: new ThemeIcon("git-merge"),
    github: new ThemeIcon("github"),
    link_external: new ThemeIcon("link-external"),
    remote: new ThemeIcon("remote"),
    remote_explorer: new ThemeIcon("remote-explorer"),
    root_folder: new ThemeIcon("root-folder"),
    tag: new ThemeIcon("tag"),
    terminal: new ThemeIcon("terminal"),
    terminal_linux: new ThemeIcon("terminal-linux"),
    zap: new ThemeIcon("symbol-event")
};
