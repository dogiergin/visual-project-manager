/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Based on Project Manager by Alessandro Fragnani.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { commands, EventEmitter } from "vscode";
import { Container } from "../core/container";
import { Project } from "../core/project";
import { isEmptyQuery, matchesAnyTag, matchesQuery, parseQuery, ParsedQuery } from "../utils/projectQuery";
import { NO_TAGS_DEFINED } from "./constants";

/**
 * Holds the Side Bar filter: the free text typed in the Search view (in memory only)
 * and the selected tags (persisted in `globalState.filterByTags`, shared with the
 * `Filter Projects by Tag` command).
 */
export class SidebarFilter {

    private static query = "";
    private static parsed: ParsedQuery = parseQuery("");
    private static readonly onDidChangeEmitter = new EventEmitter<void>();
    private static suggestionProvider: (project: Project) => string[] = () => [];
    public static readonly onDidChange = SidebarFilter.onDidChangeEmitter.event;

    public static getQuery(): string {
        return SidebarFilter.query;
    }

    public static setQuery(query: string) {
        if (query === SidebarFilter.query) {
            return;
        }
        SidebarFilter.query = query;
        SidebarFilter.parsed = parseQuery(query);
        SidebarFilter.changed();
    }

    public static getTags(): string[] {
        return Container.context.globalState.get<string[]>("filterByTags", []);
    }

    public static async setTags(tags: string[]) {
        await Container.context.globalState.update("filterByTags", tags);
        SidebarFilter.changed();
    }

    public static async clear() {
        SidebarFilter.query = "";
        SidebarFilter.parsed = parseQuery("");
        await SidebarFilter.setTags([]);
    }

    public static hasQuery(): boolean {
        return !isEmptyQuery(SidebarFilter.parsed);
    }

    public static isActive(): boolean {
        return SidebarFilter.hasQuery() || SidebarFilter.getTags().length > 0;
    }

    /** Automatic (suggested) tags are also searchable, even before they are accepted */
    public static setSuggestionProvider(provider: (project: Project) => string[]) {
        SidebarFilter.suggestionProvider = provider;
    }

    public static getSuggestions(project: Project): string[] {
        return SidebarFilter.suggestionProvider(project);
    }

    /** Only the free text part. Tags are already handled by the existing storage queries. */
    public static matchesText(project: Project): boolean {
        if (!SidebarFilter.hasQuery()) {
            return true;
        }
        const tags = [ ...project.tags, ...SidebarFilter.suggestionProvider(project) ];
        return matchesQuery({ name: project.name, tags }, SidebarFilter.parsed);
    }

    public static matches(project: Project): boolean {
        return SidebarFilter.matchesText(project) && matchesAnyTag(project, SidebarFilter.getTags(), NO_TAGS_DEFINED);
    }

    /** Must be called when `filterByTags` is changed outside of this class. */
    public static changed() {
        commands.executeCommand("setContext", "projectManager.sideBarFilterActive", SidebarFilter.isActive());
        SidebarFilter.onDidChangeEmitter.fire();
    }
}
