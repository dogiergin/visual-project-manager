/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Based on Project Manager by Alessandro Fragnani.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import http = require("http");
import https = require("https");
import { ProjectSummary } from "./projectScanner";

// Client for the local Ollaya decision runtime (https://ollaya.dev), `POST /api/decide`.
// Ollaya has no multi-select question, so every category is a yes/no (`noul`) question.

export interface OllayaOptions {
    url: string;        // e.g. http://localhost:11435
    model: string;      // e.g. laya
    threshold: number;  // minimum `noul` probability
}

interface DecideAnswer {
    type: string;
    noul?: number;
}

interface DecideResponse {
    answers?: Record<string, DecideAnswer>;
    error?: string;
}

function request(method: "GET" | "POST", url: string, body: unknown, timeoutMs: number): Promise<{ status: number; text: string }> {
    return new Promise((resolve, reject) => {
        let target: URL;
        try {
            target = new URL(url);
        } catch (error) {
            reject(error);
            return;
        }
        const data = body === undefined ? undefined : Buffer.from(JSON.stringify(body), "utf8");
        const client = target.protocol === "https:" ? https : http;
        const req = client.request(target, {
            method,
            headers: data ? { "Content-Type": "application/json", "Content-Length": data.length } : undefined,
            timeout: timeoutMs
        }, res => {
            const chunks: Buffer[] = [];
            res.on("data", chunk => chunks.push(chunk));
            res.on("end", () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
        });
        req.on("timeout", () => req.destroy(new Error("Ollaya request timed out")));
        req.on("error", reject);
        if (data) {
            req.write(data);
        }
        req.end();
    });
}

/** `GET /` is the liveness check of the Ollaya server */
export async function isOllayaAvailable(url: string): Promise<boolean> {
    try {
        const { status } = await request("GET", url, undefined, 1000);
        return status >= 200 && status < 300;
    } catch {
        return false;
    }
}

/** The text Ollaya reads: only the summary, never the source code */
export function describeProject(summary: ProjectSummary): string {
    const extensions = Object.entries(summary.extensions)
        .sort((a, b) => b[ 1 ] - a[ 1 ])
        .slice(0, 15)
        .map(([ extension, count ]) => `${extension} (${count})`)
        .join(", ");
    const topLevel = summary.paths.filter(item => !item.replace(/\/$/, "").includes("/")).slice(0, 40).join(", ");

    return [
        `Project folder name: ${summary.name}`,
        `File types: ${extensions || "none"}`,
        `Top level files and folders: ${topLevel || "none"}`,
        `Dependencies and imports: ${summary.dependencies.slice(0, 60).join(", ") || "none"}`,
        summary.readme ? `README:\n${summary.readme}` : "README: none"
    ].join("\n");
}

/** Returns the categories whose probability is at least the threshold, most likely first */
export async function decideCategories(summary: ProjectSummary, categories: Record<string, string>, options: OllayaOptions): Promise<string[]> {
    const names = Object.keys(categories);
    if (names.length === 0) {
        return [];
    }

    // question keys must be simple identifiers, so use `c0`, `c1`... and map them back
    const questions: Record<string, { type: "noul"; instructions: string }> = {};
    names.forEach((name, index) => questions[ `c${index}` ] = { type: "noul", instructions: categories[ name ] });

    const { status, text } = await request("POST", `${options.url.replace(/\/+$/, "")}/api/decide`, {
        model: options.model,
        state: describeProject(summary),
        questions,
        keep_alive: "10m"
    }, 60000);

    let response: DecideResponse;
    try {
        response = JSON.parse(text);
    } catch {
        throw new Error(`Ollaya returned an invalid response (HTTP ${status})`);
    }
    if (status < 200 || status >= 300 || !response.answers) {
        throw new Error(response.error ?? `Ollaya returned HTTP ${status}`);
    }

    return names
        .map((name, index) => ({ name, probability: response.answers?.[ `c${index}` ]?.noul ?? 0 }))
        .filter(item => item.probability >= options.threshold)
        .sort((a, b) => b.probability - a.probability)
        .map(item => item.name);
}
