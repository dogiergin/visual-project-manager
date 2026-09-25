/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import * as assert from "assert";
import fs = require("fs");
import os = require("os");
import path = require("path");
import { decideTags, DEFAULT_TAG_DECISIONS, evaluateRules, knownTags, mergeDecisions, normalizeWords } from "../../autotags/decisions";
import { parsePythonImports, parsePythonRequirements, ProjectSummary, scanProject } from "../../autotags/projectScanner";

suite("Automatic Tags", () => {

    function createProject(files: Record<string, string>, name = "project"): string {
        const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vpm-autotags-")), name);
        for (const [ relative, content ] of Object.entries(files)) {
            const file = path.join(root, relative);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, content);
        }
        fs.mkdirSync(root, { recursive: true });
        return root;
    }

    function summary(partial: Partial<ProjectSummary>): ProjectSummary {
        return { name: "project", extensions: {}, paths: [], dependencies: [], readme: "", ...partial };
    }

    function tags(project: Partial<ProjectSummary>) {
        return decideTags(summary(project), DEFAULT_TAG_DECISIONS);
    }

    test("the default decisions are large and have no duplicate technologies", () => {
        const categories = new Set(DEFAULT_TAG_DECISIONS.categories.map(rule => rule.tag));
        const technologies = DEFAULT_TAG_DECISIONS.technologies.map(rule => rule.tag);
        assert.ok(categories.size >= 40, `${categories.size} categories`);
        assert.ok(technologies.length >= 80, `${technologies.length} technologies`);
        assert.strictEqual(new Set(technologies).size, technologies.length);
        assert.ok(knownTags(DEFAULT_TAG_DECISIONS).includes("Data Analysis"));
    });

    test("parses Python requirements and imports", () => {
        assert.deepStrictEqual(parsePythonRequirements("pandas==2.2\n# comment\nscikit-learn>=1\nnumpy\n-r base.txt\n"), [ "pandas", "scikit-learn", "numpy" ]);
        assert.deepStrictEqual(parsePythonRequirements("[project]\nname = \"demo\"\ndependencies = [\n  \"torch>=2\",\n]\n"), [ "torch" ]);
        assert.deepStrictEqual(parsePythonImports("import pandas as pd\nfrom sklearn.model_selection import x\n  import os"), [ "pandas", "sklearn", "os" ]);
    });

    test("scans a notebook project (imports of notebooks, ignored folders)", async () => {
        const root = createProject({
            "analysis.ipynb": JSON.stringify({ cells: [ { cell_type: "code", source: [ "import pandas as pd\n", "import matplotlib.pyplot as plt\n" ] } ] }),
            "data/sales.csv": "a,b\n1,2",
            "report.xlsx": "",
            "node_modules/ignored/index.js": ""
        }, "Sales-Report");
        const scanned = await scanProject(root);
        assert.ok(scanned);
        assert.ok(!scanned.paths.some(item => item.startsWith("node_modules")), "ignored folders are not scanned");

        const decided = decideTags(scanned, DEFAULT_TAG_DECISIONS);
        assert.deepStrictEqual(decided.categories, [ "Data Visualization", "Data Analysis" ]);
        for (const expected of [ "Python", "Jupyter", "CSV", "Excel", "Pandas", "Matplotlib" ]) {
            assert.ok(decided.technologies.includes(expected), `${expected} in ${decided.technologies}`);
        }
        assert.ok(!decided.technologies.includes("JavaScript"));
    });

    test("keywords of the folder name, with accents and whole words only", () => {
        assert.strictEqual(normalizeWords("Kongre-Kayıt_Sistemi"), "kongre kayit sistemi");
        assert.strictEqual(normalizeWords("myPortfolioSite"), "my portfolio site");

        assert.ok(tags({ name: "AI Engineer Program" }).categories.includes("Artificial Intelligence"));
        assert.ok(!tags({ name: "mail-sender" }).categories.includes("Artificial Intelligence"), "`ai` is not found inside `mail`");
        assert.deepStrictEqual(tags({ name: "Kongre-Kayıt" }).categories, [ "Event Management" ]);
        assert.ok(tags({ name: "demo", readme: "# Discord Bot for my server\n..." }).categories.includes("Bot"), "README title");
        assert.ok(!tags({ name: "demo", readme: "# Tool\n\nThis is not a discord bot" }).categories.includes("Bot"), "only the README title");
    });

    test("mobile, web, full stack and exclusions", () => {
        const flutter = tags({ paths: [ "pubspec.yaml", "lib/", "lib/main.dart" ], extensions: { dart: 1, yaml: 1 } });
        assert.deepStrictEqual(flutter.categories, [ "Mobile Development", "Cross-Platform Mobile" ]);
        assert.deepStrictEqual(flutter.technologies, [ "Flutter" ], "Dart is implied by Flutter");

        const reactNative = tags({ dependencies: [ "react", "react-native" ] });
        assert.ok(reactNative.categories.includes("Mobile Development"));
        assert.ok(!reactNative.categories.includes("Frontend") && !reactNative.categories.includes("Web Development"));
        assert.ok(reactNative.technologies.includes("React Native") && !reactNative.technologies.includes("React"));

        const fullStack = tags({ dependencies: [ "react", "express", "typescript" ], paths: [ "tsconfig.json" ] });
        assert.deepStrictEqual(fullStack.categories.slice(0, 3), [ "Full Stack", "Frontend", "Backend" ]);
        assert.ok(fullStack.technologies.includes("TypeScript") && !fullStack.technologies.includes("JavaScript"));
    });

    test("tags depending on other tags, in any order", () => {
        const decided = tags({ extensions: { ipynb: 2, csv: 3 }, paths: [ "a.ipynb", "b.csv" ], dependencies: [ "pandas", "sklearn" ] });
        assert.ok(decided.categories.includes("Data Science"), String(decided.categories));
        assert.ok(decided.categories.includes("Machine Learning"));
        assert.ok(decided.categories.includes("Artificial Intelligence") || decided.categories.length === DEFAULT_TAG_DECISIONS.limits.categories);
    });

    test("dependency prefixes and limits", () => {
        assert.ok(tags({ dependencies: [ "@aws-sdk/client-s3" ] }).categories.includes("Cloud"));
        const many = tags({
            name: "kaggle bot game shop",
            dependencies: [ "pandas", "numpy", "matplotlib", "plotly", "sklearn", "torch", "transformers", "openai", "streamlit", "cv2" ]
        });
        assert.strictEqual(many.categories.length, DEFAULT_TAG_DECISIONS.limits.categories);
        assert.strictEqual(many.technologies.length, DEFAULT_TAG_DECISIONS.limits.technologies);
        assert.deepStrictEqual(many.categories.slice(0, 2), [ "E-commerce", "Competition / Kaggle" ], "domains first");
    });

    test("user decisions override the defaults, and the 1.0 format is still read", () => {
        const custom = mergeDecisions({ categories: [ { tag: "Mobil", whenFiles: [ "pubspec.yaml" ] } ], limits: { categories: 1 } });
        assert.deepStrictEqual(custom.categories.map(rule => rule.tag), [ "Mobil" ]);
        assert.strictEqual(custom.limits.categories, 1);
        assert.ok(custom.technologies.length > 0, "missing parts keep the defaults");

        const old = mergeDecisions({ rules: [ { tag: "Py", whenFiles: [ "*.py" ] } ], ollaya: { fallbackRules: [ { tag: "Data", whenFiles: [ "*.csv" ] } ] } });
        assert.deepStrictEqual(old.technologies.map(rule => rule.tag), [ "Py" ]);
        assert.deepStrictEqual(old.categories.map(rule => rule.tag), [ "Data" ]);
        assert.deepStrictEqual(evaluateRules(summary({ extensions: { csv: 1 } }), old.categories), [ "Data" ]);

        assert.strictEqual(mergeDecisions(undefined).categories.length, DEFAULT_TAG_DECISIONS.categories.length);
        assert.strictEqual(mergeDecisions("invalid").technologies.length, DEFAULT_TAG_DECISIONS.technologies.length);
    });
});
