/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Based on Project Manager by Alessandro Fragnani.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

// NOTE: `media/shared/projectQuery.js` contains the same rules for the webviews. Keep both in sync.

export interface ParsedQuery {
    terms: string[]; // must be found in the project name or in one of its tags
    tags: string[];  // `#tag` tokens, must prefix-match one of the project tags
}

export interface QueryableProject {
    name: string;
    tags: string[];
}

function normalize(value: string): string {
    return value.toLocaleLowerCase().trim();
}

export function parseQuery(query: string): ParsedQuery {
    const parsed: ParsedQuery = { terms: [], tags: [] };
    for (const token of (query ?? "").split(/\s+/)) {
        if (token === "" || token === "#") {
            continue;
        }
        if (token.startsWith("#")) {
            parsed.tags.push(normalize(token.substring(1)));
        } else {
            parsed.terms.push(normalize(token));
        }
    }
    return parsed;
}

export function isEmptyQuery(parsed: ParsedQuery): boolean {
    return parsed.terms.length === 0 && parsed.tags.length === 0;
}

export function matchesQuery(project: QueryableProject, parsed: ParsedQuery): boolean {
    const name = normalize(project.name);
    const tags = (project.tags ?? []).map(normalize);

    const tagsMatch = parsed.tags.every(tag => tags.some(projectTag => projectTag.startsWith(tag)));
    const termsMatch = parsed.terms.every(term => name.includes(term) || tags.some(projectTag => projectTag.includes(term)));

    return tagsMatch && termsMatch;
}

/**
 * Tag chips filter: a project matches when it has at least one of the selected tags
 * (same semantics as the existing `Filter Projects by Tag` command).
 */
export function matchesAnyTag(project: QueryableProject, selectedTags: string[], noTagsLabel?: string): boolean {
    if (!selectedTags || selectedTags.length === 0) {
        return true;
    }
    if (noTagsLabel && selectedTags.includes(noTagsLabel) && (project.tags ?? []).length === 0) {
        return true;
    }
    return (project.tags ?? []).some(tag => selectedTags.includes(tag));
}
