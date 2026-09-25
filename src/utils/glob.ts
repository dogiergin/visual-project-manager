/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import fs = require("fs");
import path = require("path");

/**
 * A small glob implementation, enough for folder names and base folders:
 * `*`, `?`, `**`, `[abc]`, `[!abc]` and `{a,b}`. Like minimatch, `*` and `?` never match a leading dot.
 */

const GLOB_CHARS = /[*?[\]{}]/;

export function hasGlob(value: string): boolean {
    return GLOB_CHARS.test(value);
}

function segmentSource(pattern: string): string {
    let source = "";
    let braces = 0;
    for (let index = 0; index < pattern.length; index++) {
        const char = pattern[ index ];
        const atStart = index === 0 || pattern[ index - 1 ] === "/";
        switch (char) {
            case "*":
                if (pattern[ index + 1 ] === "*") {
                    // `**` matches any number of segments, not starting with a dot
                    while (pattern[ index + 1 ] === "*") { index++; }
                    if (pattern[ index + 1 ] === "/") {
                        index++;
                        source += "(?:(?!\\.)[^/]*/)*";
                    } else {
                        source += "(?:(?!\\.)[^/]*(?:/(?!\\.)[^/]*)*)?";
                    }
                } else {
                    source += (atStart ? "(?!\\.)" : "") + "[^/]*";
                }
                break;
            case "?":
                source += (atStart ? "(?!\\.)" : "") + "[^/]";
                break;
            case "[": {
                const end = pattern.indexOf("]", index + 2);
                if (end < 0) {
                    source += "\\[";
                    break;
                }
                let body = pattern.slice(index + 1, end);
                const negated = body.startsWith("!") || body.startsWith("^");
                if (negated) {
                    body = body.slice(1);
                }
                source += `[${negated ? "^/" : ""}${body.replace(/[\\\]^]/g, "\\$&")}]`;
                index = end;
                break;
            }
            case "{":
                braces++;
                source += "(?:";
                break;
            case "}":
                if (braces > 0) {
                    braces--;
                    source += ")";
                } else {
                    source += "\\}";
                }
                break;
            case ",":
                source += braces > 0 ? "|" : ",";
                break;
            default:
                source += char.replace(/[.+^$()|\\]/g, "\\$&");
        }
    }
    return source + ")".repeat(braces);
}

/** Converts a glob pattern (with `/` separators) to a regular expression matching the whole value. */
export function globToRegExp(pattern: string, ignoreCase = false): RegExp {
    return new RegExp(`^${segmentSource(pattern)}$`, ignoreCase ? "i" : "");
}

/** Replaces `minimatch(value, pattern)` for folder names and relative paths. */
export function matchesGlob(value: string, pattern: string): boolean {
    try {
        return globToRegExp(pattern).test(value.replace(/\\/g, "/"));
    } catch {
        return value === pattern;
    }
}

const IGNORE_CASE = process.platform === "win32" || process.platform === "darwin";

async function subfolders(folder: string): Promise<string[]> {
    try {
        const entries = await fs.promises.readdir(folder, { withFileTypes: true });
        return entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
    } catch {
        return [];
    }
}

/**
 * Returns the folders matching an absolute glob pattern, like `~/code/*` or `D:/work/**\/src`.
 * Folders starting with a dot are only matched when the pattern says so.
 */
export async function findFolders(pattern: string): Promise<string[]> {
    const segments = pattern.replace(/\\/g, "/").split("/");
    const firstGlob = segments.findIndex(hasGlob);
    if (firstGlob < 0) {
        return fs.existsSync(pattern) ? [ pattern ] : [];
    }

    const base = segments.slice(0, firstGlob).join("/") || "/";
    const rest = segments.slice(firstGlob);
    const results: string[] = [];

    const visit = async (folder: string, index: number): Promise<void> => {
        if (index === rest.length) {
            results.push(folder);
            return;
        }
        const segment = rest[ index ];
        if (segment === "**") {
            // zero segments, then one more level with the same `**`
            await visit(folder, index + 1);
            for (const name of await subfolders(folder)) {
                if (!name.startsWith(".")) {
                    await visit(path.join(folder, name), index);
                }
            }
            return;
        }
        if (!hasGlob(segment)) {
            const next = path.join(folder, segment);
            if (fs.existsSync(next)) {
                await visit(next, index + 1);
            }
            return;
        }
        const matcher = globToRegExp(segment, IGNORE_CASE);
        for (const name of await subfolders(folder)) {
            if (matcher.test(name)) {
                await visit(path.join(folder, name), index + 1);
            }
        }
    };

    await visit(path.normalize(base.endsWith(":") ? base + "/" : base), 0);
    return [ ...new Set(results) ];
}
