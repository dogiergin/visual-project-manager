/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import * as assert from "assert";
import fs = require("fs");
import os = require("os");
import path = require("path");
import { getGitHubRepository, MAX_TOPICS, parseGitConfig, parseGitHubRemote, planTopicsSync, toTopic } from "../../github/githubTopics";

suite("GitHub Topics", () => {

    test("tags become valid GitHub topics", () => {
        assert.strictEqual(toTopic("Data Analysis"), "data-analysis");
        assert.strictEqual(toTopic("Python"), "python");
        assert.strictEqual(toTopic("C#"), "csharp");
        assert.strictEqual(toTopic("C/C++"), "cpp");
        assert.strictEqual(toTopic("Next.js"), "nextjs");
        assert.strictEqual(toTopic("VS Code Extension"), "vscode-extension");
        assert.strictEqual(toTopic("  --Machine   Learning!! "), "machine-learning");
        assert.strictEqual(toTopic("✨"), undefined);
        assert.ok(toTopic("x".repeat(80)).length <= 50);
    });

    test("parses GitHub remotes", () => {
        const expected = { owner: "dogiergin", name: "visual-project-manager" };
        assert.deepStrictEqual(parseGitHubRemote("https://github.com/dogiergin/visual-project-manager.git"), expected);
        assert.deepStrictEqual(parseGitHubRemote("git@github.com:dogiergin/visual-project-manager.git"), expected);
        assert.deepStrictEqual(parseGitHubRemote("ssh://git@github.com/dogiergin/visual-project-manager"), expected);
        assert.strictEqual(parseGitHubRemote("https://gitlab.com/someone/project.git"), undefined);
    });

    test("prefers origin, and finds the repository of a local folder", () => {
        const config = [
            "[core]", "\tbare = false",
            "[remote \"upstream\"]", "\turl = https://github.com/alefragnani/vscode-project-manager.git",
            "[remote \"origin\"]", "\turl = https://github.com/dogiergin/visual-project-manager.git",
            "[branch \"master\"]", "\tremote = origin"
        ].join("\n");
        assert.deepStrictEqual(parseGitConfig(config), { owner: "dogiergin", name: "visual-project-manager" });

        const root = fs.mkdtempSync(path.join(os.tmpdir(), "vpm-github-"));
        assert.strictEqual(getGitHubRepository(root), undefined, "not a git repository");
        fs.mkdirSync(path.join(root, ".git"));
        fs.writeFileSync(path.join(root, ".git", "config"), config);
        assert.deepStrictEqual(getGitHubRepository(root), { owner: "dogiergin", name: "visual-project-manager" });
    });

    test("two way sync plan never removes anything", () => {
        const plan = planTopicsSync([ "Data Analysis", "Python", "Jupyter" ], [ "python", "kaggle" ]);
        assert.deepStrictEqual(plan.addToGitHub, [ "data-analysis", "jupyter" ]);
        assert.deepStrictEqual(plan.addToProject, [ "kaggle" ]);
        assert.deepStrictEqual(plan.topics, [ "python", "kaggle", "data-analysis", "jupyter" ]);
        assert.deepStrictEqual(plan.skipped, []);

        const inSync = planTopicsSync([ "Python" ], [ "python" ]);
        assert.deepStrictEqual([ inSync.addToGitHub, inSync.addToProject ], [ [], [] ]);
    });

    test("respects the limit of 20 topics", () => {
        const existing = Array.from({ length: MAX_TOPICS - 1 }, (_, index) => `topic-${index}`);
        const plan = planTopicsSync([ "One", "Two" ], existing);
        assert.deepStrictEqual(plan.addToGitHub, [ "one" ]);
        assert.deepStrictEqual(plan.skipped, [ "Two" ]);
        assert.strictEqual(plan.topics.length, MAX_TOPICS);
    });
});
