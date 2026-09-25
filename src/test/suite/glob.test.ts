/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import * as assert from "assert";
import fs = require("fs");
import os = require("os");
import path = require("path");
import { findFolders, hasGlob, matchesGlob } from "../../utils/glob";

suite("Glob", () => {

    test("matches folder names like minimatch", () => {
        assert.ok(matchesGlob("node_modules", "node_modules"));
        assert.ok(!matchesGlob("node_modules2", "node_modules"));
        assert.ok(matchesGlob("backup.bak", "*.bak"));
        assert.ok(!matchesGlob("backup.bak.txt", "*.bak"));
        assert.ok(matchesGlob("test1", "test?"));
        assert.ok(matchesGlob("out", "{out,dist}") && matchesGlob("dist", "{out,dist}") && !matchesGlob("build", "{out,dist}"));
        assert.ok(matchesGlob("v1", "v[0-9]") && !matchesGlob("v1", "v[!0-9]"));
        assert.ok(!matchesGlob(".git", "*"), "`*` does not match a leading dot");
        assert.ok(matchesGlob(".git", ".*"));
        assert.ok(matchesGlob("a/b/c", "a/**/c") && matchesGlob("a/c", "a/**/c"));
        assert.ok(matchesGlob("file(1).txt", "file(1).txt"), "parentheses are literal");
        assert.ok(matchesGlob("a+b", "a+b") && !matchesGlob("aab", "a+b"));
    });

    test("finds the folders of a base folder pattern", async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "vpm-glob-"));
        for (const folder of [ "work/app", "work/api", "work/.hidden", "work/lib/deep/src", "personal/site/src" ]) {
            fs.mkdirSync(path.join(root, folder), { recursive: true });
        }
        fs.writeFileSync(path.join(root, "work", "notes.txt"), "");

        const names = (folders: string[]) => folders.map(folder => path.relative(root, folder).replace(/\\/g, "/")).sort();

        assert.ok(hasGlob(`${root}/work/*`) && !hasGlob(root));
        assert.deepStrictEqual(names(await findFolders(`${root}/work/*`)), [ "work/api", "work/app", "work/lib" ]);
        assert.deepStrictEqual(names(await findFolders(`${root}/work/a*`)), [ "work/api", "work/app" ]);
        assert.deepStrictEqual(names(await findFolders(`${root}/*/**/src`)), [ "personal/site/src", "work/lib/deep/src" ]);
        assert.deepStrictEqual(names(await findFolders(`${root}\\{work,personal}\\s*`)), [ "personal/site" ]);
        assert.deepStrictEqual(await findFolders(`${root}/missing/*`), []);
    });
});
