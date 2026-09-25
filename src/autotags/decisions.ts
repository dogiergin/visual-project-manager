/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Based on Project Manager by Alessandro Fragnani.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { ProjectSummary } from "./projectScanner";

/**
 * A deterministic decision: the tag is suggested when ANY of the conditions matches.
 *  - `whenFiles`: `*.ext` (any file with this extension), `folder/` (a relative path prefix) or a file name
 *  - `whenDependencies`: package/module names (package.json, requirements.txt, pyproject.toml, Python imports)
 */
export interface TagRule {
    tag: string;
    whenFiles?: string[];
    whenDependencies?: string[];
}

export interface TagDecisions {
    /** exact facts, always evaluated (no Ollaya needed) */
    rules: TagRule[];
    ollaya: {
        /** minimum probability for a category to be suggested */
        threshold: number;
        /** category tag -> statement Ollaya answers with a yes/no probability */
        categories: Record<string, string>;
        /** used for the categories when Ollaya is not available */
        fallbackRules: TagRule[];
    };
}

export const DEFAULT_TAG_DECISIONS: TagDecisions = {
    rules: [
        { tag: "Python", whenFiles: [ "*.py", "requirements.txt", "pyproject.toml", "pipfile", "setup.py" ], whenDependencies: [ "pandas", "numpy", "ipython", "matplotlib", "sklearn" ] },
        { tag: "Jupyter", whenFiles: [ "*.ipynb" ] },
        { tag: "TypeScript", whenFiles: [ "tsconfig.json", "*.tsx" ], whenDependencies: [ "typescript" ] },
        { tag: "JavaScript", whenFiles: [ "*.js", "*.jsx", "*.mjs" ] },
        { tag: "React", whenDependencies: [ "react" ] },
        { tag: "React Native", whenDependencies: [ "react-native", "expo" ] },
        { tag: "Vue", whenDependencies: [ "vue" ] },
        { tag: "Angular", whenDependencies: [ "@angular/core" ] },
        { tag: "Next.js", whenDependencies: [ "next" ] },
        { tag: "Svelte", whenDependencies: [ "svelte" ] },
        { tag: "Flutter", whenFiles: [ "pubspec.yaml" ] },
        { tag: "Dart", whenFiles: [ "*.dart" ] },
        { tag: "Android", whenFiles: [ "androidmanifest.xml", "app/src/main/" ] },
        { tag: "iOS", whenFiles: [ "podfile", "*.xcodeproj", "*.swift" ] },
        { tag: "Kotlin", whenFiles: [ "*.kt", "*.kts" ] },
        { tag: "Java", whenFiles: [ "*.java", "pom.xml" ] },
        { tag: "C#", whenFiles: [ "*.cs", "*.csproj", "*.sln" ] },
        { tag: "Go", whenFiles: [ "go.mod", "*.go" ] },
        { tag: "Rust", whenFiles: [ "cargo.toml", "*.rs" ] },
        { tag: "PHP", whenFiles: [ "composer.json", "*.php" ] },
        { tag: "Ruby", whenFiles: [ "gemfile", "*.rb" ] },
        { tag: "C/C++", whenFiles: [ "*.c", "*.cpp", "*.hpp", "cmakelists.txt" ] },
        // `*.html` alone is often an exported report, so it is not enough
        { tag: "HTML/CSS", whenFiles: [ "*.css", "*.scss", "*.sass", "*.less" ] },
        { tag: "SQL", whenFiles: [ "*.sql", "*.sqlite", "*.db" ] },
        { tag: "Excel", whenFiles: [ "*.xlsx", "*.xls" ] },
        { tag: "CSV", whenFiles: [ "*.csv" ] },
        { tag: "Pandas", whenDependencies: [ "pandas" ] },
        { tag: "NumPy", whenDependencies: [ "numpy" ] },
        { tag: "Matplotlib", whenDependencies: [ "matplotlib", "seaborn" ] },
        { tag: "Scikit-learn", whenDependencies: [ "sklearn", "scikit-learn" ] },
        { tag: "PyTorch", whenDependencies: [ "torch", "pytorch" ] },
        { tag: "TensorFlow", whenDependencies: [ "tensorflow", "keras" ] },
        { tag: "Streamlit", whenDependencies: [ "streamlit" ] },
        { tag: "Django", whenDependencies: [ "django" ] },
        { tag: "Flask", whenDependencies: [ "flask" ] },
        { tag: "FastAPI", whenDependencies: [ "fastapi" ] },
        { tag: "Express", whenDependencies: [ "express" ] },
        { tag: "Docker", whenFiles: [ "dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yaml" ] },
        { tag: "GitHub Actions", whenFiles: [ ".github/workflows/" ] },
        { tag: "VS Code Extension", whenDependencies: [ "vscode-engine", "@types/vscode" ] },
        { tag: "Unity", whenFiles: [ "projectsettings/projectversion.txt", "*.unity" ] },
        { tag: "Godot", whenFiles: [ "project.godot" ] }
    ],
    ollaya: {
        threshold: 0.6,
        categories: {
            "Data Analysis": "This project analyzes, cleans or visualizes data, for example with notebooks, CSV or Excel files, pandas or charts.",
            "Machine Learning": "This project trains, evaluates or uses machine learning or AI models.",
            "Mobile Development": "This project is a mobile application for Android or iOS, for example with Flutter, React Native, Kotlin or Swift.",
            "Web Development": "This project is a website or a web application with a frontend.",
            "Software Development": "This project is a software application, library, command line tool, backend service or editor extension.",
            "DevOps": "This project is mainly about infrastructure, deployment, containers or CI/CD pipelines.",
            "Game Development": "This project is a video game or uses a game engine."
        },
        fallbackRules: [
            { tag: "Data Analysis", whenFiles: [ "*.ipynb", "*.csv", "*.xlsx" ], whenDependencies: [ "pandas", "matplotlib", "seaborn", "plotly" ] },
            { tag: "Machine Learning", whenDependencies: [ "sklearn", "scikit-learn", "torch", "tensorflow", "keras", "transformers", "xgboost", "lightgbm" ] },
            { tag: "Mobile Development", whenFiles: [ "pubspec.yaml", "androidmanifest.xml", "podfile" ], whenDependencies: [ "react-native", "expo" ] },
            { tag: "Web Development", whenDependencies: [ "react", "vue", "@angular/core", "next", "svelte", "django", "flask", "express" ] },
            { tag: "Software Development", whenFiles: [ "tsconfig.json", "*.csproj", "go.mod", "cargo.toml", "pom.xml" ], whenDependencies: [ "vscode-engine" ] },
            { tag: "DevOps", whenFiles: [ "dockerfile", "docker-compose.yml", "*.tf", "ansible.cfg", "helm/" ] },
            { tag: "Game Development", whenFiles: [ "project.godot", "*.unity" ] }
        ]
    }
};

function matchesFile(summary: ProjectSummary, pattern: string): boolean {
    const lower = pattern.toLowerCase();
    if (lower.startsWith("*.")) {
        const extension = lower.substring(2);
        return (summary.extensions[ extension ] ?? 0) > 0
            || summary.paths.some(item => item.endsWith(`.${extension}/`)); // folders like `App.xcodeproj`
    }
    if (lower.endsWith("/")) {
        return summary.paths.some(item => item.startsWith(lower));
    }
    if (lower.includes("/")) {
        return summary.paths.includes(lower);
    }
    return summary.paths.some(item => item === lower || item.endsWith(`/${lower}`));
}

export function evaluateRules(summary: ProjectSummary, rules: TagRule[]): string[] {
    const dependencies = new Set(summary.dependencies);
    const tags: string[] = [];
    for (const rule of rules ?? []) {
        const byFile = (rule.whenFiles ?? []).some(pattern => matchesFile(summary, pattern));
        const byDependency = (rule.whenDependencies ?? []).some(name => dependencies.has(name.toLowerCase()));
        if ((byFile || byDependency) && !tags.includes(rule.tag)) {
            tags.push(rule.tag);
        }
    }
    return tags;
}

/** Merges a user decisions file over the defaults, ignoring invalid parts */
export function mergeDecisions(user: Partial<TagDecisions> | undefined): TagDecisions {
    const merged: TagDecisions = JSON.parse(JSON.stringify(DEFAULT_TAG_DECISIONS));
    if (!user || typeof user !== "object") {
        return merged;
    }
    if (Array.isArray(user.rules)) {
        merged.rules = user.rules.filter(rule => rule && typeof rule.tag === "string");
    }
    if (user.ollaya && typeof user.ollaya === "object") {
        if (typeof user.ollaya.threshold === "number") {
            merged.ollaya.threshold = Math.min(Math.max(user.ollaya.threshold, 0), 1);
        }
        if (user.ollaya.categories && typeof user.ollaya.categories === "object") {
            merged.ollaya.categories = user.ollaya.categories;
        }
        if (Array.isArray(user.ollaya.fallbackRules)) {
            merged.ollaya.fallbackRules = user.ollaya.fallbackRules.filter(rule => rule && typeof rule.tag === "string");
        }
    }
    return merged;
}
