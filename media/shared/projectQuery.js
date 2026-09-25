/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

// Same rules as `src/utils/projectQuery.ts`. Keep both in sync.
(function () {
    "use strict";

    function normalize(value) {
        return (value || "").toLocaleLowerCase().trim();
    }

    function parseQuery(query) {
        const parsed = { terms: [], tags: [] };
        for (const token of (query || "").split(/\s+/)) {
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

    function isEmptyQuery(parsed) {
        return parsed.terms.length === 0 && parsed.tags.length === 0;
    }

    function matchesQuery(project, parsed) {
        const name = normalize(project.name);
        const tags = (project.tags || []).map(normalize);
        const tagsMatch = parsed.tags.every(tag => tags.some(projectTag => projectTag.startsWith(tag)));
        const termsMatch = parsed.terms.every(term => name.includes(term) || tags.some(projectTag => projectTag.includes(term)));
        return tagsMatch && termsMatch;
    }

    function matchesAnyTag(project, selectedTags) {
        if (!selectedTags || selectedTags.length === 0) {
            return true;
        }
        return (project.tags || []).some(tag => selectedTags.includes(tag));
    }

    window.ProjectQuery = { parseQuery, isEmptyQuery, matchesQuery, matchesAnyTag };
}());
