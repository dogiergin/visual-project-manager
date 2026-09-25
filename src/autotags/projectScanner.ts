/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Based on Project Manager by Alessandro Fragnani.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import fs = require("fs");
import path = require("path");

/** A small, privacy friendly summary of a project folder. File contents are never included, except the README start. */
export interface ProjectSummary {
    name: string;
    extensions: Record<string, number>; // "py" -> 4
    paths: string[];                    // relative paths, lower case, "/" separated (files and folders)
    dependencies: string[];             // lower case package/module names
    readme: string;                     // first characters of the README, if any
}

const IGNORED_FOLDERS = new Set([
    "node_modules", ".git", ".hg", ".svn", ".venv", "venv", "env", "__pycache__", ".ipynb_checkpoints",
    "dist", "out", "build", ".next", ".nuxt", ".vscode-test", "target", "bin", "obj", ".idea", ".gradle",
    ".dart_tool", "pods", "vendor", ".cache", "coverage", "site-packages"
]);

const MAX_DEPTH = 3;
const MAX_ENTRIES = 3000;
const MAX_SOURCE_FILES_FOR_IMPORTS = 25;
const MAX_SOURCE_FILE_SIZE = 256 * 1024;
const README_LENGTH = 1500;

/** The folder that should be scanned for a project root path (a `.code-workspace` file uses its folder) */
export function getScanFolder(rootPath: string): string {
    return path.extname(rootPath).toLowerCase() === ".code-workspace" ? path.dirname(rootPath) : rootPath;
}

/** Cheap signature, used to know if a cached result is still valid */
export async function getFolderSignature(rootPath: string): Promise<string | undefined> {
    try {
        const stat = await fs.promises.stat(getScanFolder(rootPath));
        return stat.isDirectory() ? `${stat.mtimeMs}` : undefined;
    } catch {
        return undefined;
    }
}

export async function scanProject(rootPath: string): Promise<ProjectSummary | undefined> {
    const folder = getScanFolder(rootPath);
    try {
        if (!(await fs.promises.stat(folder)).isDirectory()) {
            return undefined;
        }
    } catch {
        return undefined;
    }

    const summary: ProjectSummary = {
        name: path.basename(rootPath, ".code-workspace"),
        extensions: {},
        paths: [],
        dependencies: [],
        readme: ""
    };
    const sourceFiles: string[] = [];
    const dependencies = new Set<string>();

    const walk = async (current: string, relative: string, depth: number) => {
        let entries: fs.Dirent[];
        try {
            entries = await fs.promises.readdir(current, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            if (summary.paths.length >= MAX_ENTRIES) {
                return;
            }
            const name = entry.name;
            const relativePath = relative ? `${relative}/${name}` : name;
            const fullPath = path.join(current, name);

            if (entry.isDirectory()) {
                if (IGNORED_FOLDERS.has(name.toLowerCase())) {
                    continue;
                }
                summary.paths.push(`${relativePath.toLowerCase()}/`);
                if (depth < MAX_DEPTH) {
                    await walk(fullPath, relativePath, depth + 1);
                }
                continue;
            }

            if (!entry.isFile()) {
                continue;
            }
            summary.paths.push(relativePath.toLowerCase());

            const extension = path.extname(name).substring(1).toLowerCase();
            if (extension) {
                summary.extensions[ extension ] = (summary.extensions[ extension ] ?? 0) + 1;
            }

            const lowerName = name.toLowerCase();
            if (depth === 0 && !summary.readme && /^readme(\.(md|txt|rst))?$/.test(lowerName)) {
                summary.readme = await readStart(fullPath, README_LENGTH);
            }
            if (lowerName === "package.json") {
                readPackageJson(fullPath).forEach(dependency => dependencies.add(dependency));
            } else if (lowerName === "requirements.txt" || lowerName === "pyproject.toml" || lowerName === "pipfile") {
                (await readPythonRequirements(fullPath)).forEach(dependency => dependencies.add(dependency));
            } else if ((extension === "py" || extension === "ipynb") && sourceFiles.length < MAX_SOURCE_FILES_FOR_IMPORTS) {
                sourceFiles.push(fullPath);
            }
        }
    };

    await walk(folder, "", 0);

    // notebooks and scripts without a requirements file: use their imports
    for (const file of sourceFiles) {
        (await readPythonImports(file)).forEach(dependency => dependencies.add(dependency));
    }

    summary.dependencies = [ ...dependencies ].sort();
    return summary;
}

async function readStart(file: string, length: number): Promise<string> {
    try {
        const handle = await fs.promises.open(file, "r");
        try {
            const buffer = Buffer.alloc(length);
            const { bytesRead } = await handle.read(buffer, 0, length, 0);
            return buffer.toString("utf8", 0, bytesRead);
        } finally {
            await handle.close();
        }
    } catch {
        return "";
    }
}

function readPackageJson(file: string): string[] {
    try {
        const content = JSON.parse(fs.readFileSync(file, "utf8"));
        const names = [
            ...Object.keys(content.dependencies ?? {}),
            ...Object.keys(content.devDependencies ?? {}),
            ...Object.keys(content.peerDependencies ?? {})
        ];
        if (content.engines?.vscode) {
            names.push("vscode-engine");
        }
        return names.map(name => name.toLowerCase());
    } catch {
        return [];
    }
}

// metadata keys of pyproject.toml / Pipfile that look like `key = value` but are not packages
const PYTHON_METADATA_KEYS = new Set([
    "name", "version", "description", "readme", "authors", "maintainers", "license", "requires-python", "python",
    "python_version", "url", "verify_ssl", "homepage", "repository", "documentation", "keywords", "classifiers",
    "packages", "include", "exclude", "build-backend", "requires", "dependencies", "optional-dependencies", "scripts"
]);

export function parsePythonRequirements(content: string): string[] {
    const names: string[] = [];
    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed.startsWith("#") || trimmed.startsWith("[") || trimmed.startsWith("-")) {
            continue;
        }
        // requirements.txt: `pandas==2.2`, pyproject: `"pandas>=2",`, Pipfile: `pandas = "*"`
        const match = /^["']?([A-Za-z][A-Za-z0-9._-]*)\s*(\[[^\]]*\])?\s*(==|>=|<=|~=|!=|>|<|=|["',;]|$)/.exec(trimmed);
        if (match && !PYTHON_METADATA_KEYS.has(match[ 1 ].toLowerCase())) {
            names.push(match[ 1 ].toLowerCase());
        }
    }
    return names;
}

async function readPythonRequirements(file: string): Promise<string[]> {
    return parsePythonRequirements(await readStart(file, 64 * 1024));
}

export function parsePythonImports(content: string): string[] {
    const names = new Set<string>();
    const regex = /^\s*(?:import|from)\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
        names.add(match[ 1 ].toLowerCase());
    }
    return [ ...names ];
}

/** The code of a Jupyter notebook. Big notebooks are truncated, so fall back to unescaping the JSON strings. */
function notebookSource(content: string): string {
    try {
        const notebook = JSON.parse(content);
        return (notebook.cells ?? [])
            .filter((cell: { cell_type?: string }) => !cell.cell_type || cell.cell_type === "code")
            .map((cell: { source?: string | string[] }) => Array.isArray(cell.source) ? cell.source.join("") : (cell.source ?? ""))
            .join("\n");
    } catch {
        return content.replace(/\\n/g, "\n").replace(/^\s*\[?\s*"/gm, "").replace(/"\s*,?\s*$/gm, "");
    }
}

async function readPythonImports(file: string): Promise<string[]> {
    try {
        const stat = await fs.promises.stat(file);
        let content = await readStart(file, Math.min(stat.size, MAX_SOURCE_FILE_SIZE));
        if (file.toLowerCase().endsWith(".ipynb")) {
            content = notebookSource(content);
        }
        return parsePythonImports(content);
    } catch {
        return [];
    }
}
