/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import * as assert from "assert";
import fs = require("fs");
import http = require("http");
import os = require("os");
import path = require("path");
import { AddressInfo } from "net";
import { DEFAULT_TAG_DECISIONS, evaluateRules, mergeDecisions } from "../../autotags/decisions";
import { decideCategories, describeProject, isOllayaAvailable } from "../../autotags/ollayaClient";
import { parsePythonImports, parsePythonRequirements, scanProject } from "../../autotags/projectScanner";

suite("Automatic Tags", () => {

    function createProject(files: Record<string, string>): string {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "vpm-autotags-"));
        for (const [ relative, content ] of Object.entries(files)) {
            const file = path.join(root, relative);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, content);
        }
        return root;
    }

    test("parses Python requirements and imports", () => {
        assert.deepStrictEqual(parsePythonRequirements("pandas==2.2\n# comment\nscikit-learn>=1\nnumpy\n-r base.txt\n"), [ "pandas", "scikit-learn", "numpy" ]);
        assert.deepStrictEqual(parsePythonRequirements("[project]\nname = \"demo\"\ndependencies = [\n  \"torch>=2\",\n]\n"), [ "torch" ]);
        assert.deepStrictEqual(parsePythonImports("import pandas as pd\nfrom sklearn.model_selection import x\n  import os"), [ "pandas", "sklearn", "os" ]);
    });

    test("data analysis notebook project", async () => {
        const root = createProject({
            "analysis.ipynb": JSON.stringify({ cells: [ { source: [ "import pandas as pd\n", "import matplotlib.pyplot as plt\n" ] } ] }),
            "data/sales.csv": "a,b\n1,2",
            "report.xlsx": "",
            "node_modules/ignored/index.js": ""
        });
        const summary = await scanProject(root);
        assert.ok(summary);
        assert.ok(!summary.paths.some(item => item.startsWith("node_modules")), "ignored folders are not scanned");

        const tags = evaluateRules(summary, DEFAULT_TAG_DECISIONS.rules);
        for (const expected of [ "Python", "Jupyter", "CSV", "Excel", "Pandas", "Matplotlib" ]) {
            assert.ok(tags.includes(expected), `${expected} in ${tags}`);
        }
        assert.ok(!tags.includes("JavaScript"));
        assert.deepStrictEqual(evaluateRules(summary, DEFAULT_TAG_DECISIONS.ollaya.fallbackRules), [ "Data Analysis" ]);
    });

    test("mobile and web projects", async () => {
        const flutter = await scanProject(createProject({ "pubspec.yaml": "name: app", "lib/main.dart": "" }));
        assert.deepStrictEqual(evaluateRules(flutter, DEFAULT_TAG_DECISIONS.rules), [ "Flutter", "Dart" ]);
        assert.deepStrictEqual(evaluateRules(flutter, DEFAULT_TAG_DECISIONS.ollaya.fallbackRules), [ "Mobile Development" ]);

        const web = await scanProject(createProject({
            "package.json": JSON.stringify({ dependencies: { react: "18" }, devDependencies: { typescript: "5" } }),
            "src/App.tsx": ""
        }));
        const tags = evaluateRules(web, DEFAULT_TAG_DECISIONS.rules);
        assert.ok(tags.includes("React") && tags.includes("TypeScript"), String(tags));
        assert.ok(evaluateRules(web, DEFAULT_TAG_DECISIONS.ollaya.fallbackRules).includes("Web Development"));
    });

    test("user decisions override the defaults", () => {
        const decisions = mergeDecisions({ rules: [ { tag: "Mobil", whenFiles: [ "pubspec.yaml" ] } ], ollaya: { threshold: 2 } as never });
        assert.deepStrictEqual(decisions.rules.map(rule => rule.tag), [ "Mobil" ]);
        assert.strictEqual(decisions.ollaya.threshold, 1, "threshold is clamped to [0, 1]");
        assert.ok(Object.keys(decisions.ollaya.categories).length > 0, "missing parts keep the defaults");
        assert.deepStrictEqual(mergeDecisions(undefined).rules.length, DEFAULT_TAG_DECISIONS.rules.length);
    });

    test("Ollaya client asks yes/no questions and applies the threshold", async () => {
        let received: { model: string; state: string; questions: Record<string, { type: string; instructions: string }> } | undefined;
        // fake server with the response format documented at https://ollaya.dev/docs/api
        const server = http.createServer((req, res) => {
            if (req.method === "GET" && req.url === "/") {
                res.end("Ollaya is running");
                return;
            }
            let body = "";
            req.on("data", chunk => body += chunk);
            req.on("end", () => {
                received = JSON.parse(body);
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({
                    model: "laya:en",
                    answers: {
                        c0: { type: "noul", noul: 0.91 },
                        c1: { type: "noul", noul: 0.35 },
                        c2: { type: "noul", noul: 0.72 }
                    },
                    done_reason: "decide"
                }));
            });
        });
        await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
        const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

        try {
            assert.strictEqual(await isOllayaAvailable(url), true);

            const summary = { name: "Kaggle-proje", extensions: { ipynb: 2, csv: 4 }, paths: [ "train.ipynb" ], dependencies: [ "pandas", "sklearn" ], readme: "" };
            const categories = await decideCategories(summary, {
                "Data Analysis": "analyzes data",
                "Mobile Development": "mobile app",
                "Machine Learning": "trains models"
            }, { url, model: "laya", threshold: 0.6 });

            assert.deepStrictEqual(categories, [ "Data Analysis", "Machine Learning" ], "sorted by probability, below threshold removed");
            assert.ok(received);
            assert.strictEqual(received.model, "laya");
            assert.strictEqual(received.questions.c0.type, "noul");
            assert.strictEqual(received.questions.c1.instructions, "mobile app");
            assert.strictEqual(received.state, describeProject(summary));
            assert.ok(received.state.includes("pandas, sklearn"));
        } finally {
            server.close();
        }

        assert.strictEqual(await isOllayaAvailable(url), false, "not available once the server stops");
    });
});
