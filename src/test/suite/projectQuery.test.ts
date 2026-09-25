/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import * as assert from "assert";
import { isEmptyQuery, matchesAnyTag, matchesQuery, parseQuery } from "../../utils/projectQuery";

suite("Project Query", () => {

    const api = { name: "api-server", tags: [ "Work", "Go" ] };
    const blog = { name: "Blog", tags: [ "Personal" ] };
    const untagged = { name: "scratch", tags: [] as string[] };

    test("parseQuery splits terms and #tags", () => {
        assert.deepStrictEqual(parseQuery("  api  #Work #  "), { terms: [ "api" ], tags: [ "work" ] });
        assert.ok(isEmptyQuery(parseQuery("   ")));
        assert.ok(isEmptyQuery(parseQuery("#")));
    });

    test("terms match the name or a tag, case insensitive", () => {
        assert.ok(matchesQuery(api, parseQuery("SERVER")));
        assert.ok(matchesQuery(api, parseQuery("go")));
        assert.ok(!matchesQuery(blog, parseQuery("server")));
        assert.ok(matchesQuery(api, parseQuery("api server")), "every term must match");
        assert.ok(!matchesQuery(api, parseQuery("api blog")));
    });

    test("#tag prefix-matches the project tags", () => {
        assert.ok(matchesQuery(api, parseQuery("#wo")));
        assert.ok(!matchesQuery(api, parseQuery("#ork")));
        assert.ok(!matchesQuery(untagged, parseQuery("#work")));
        assert.ok(matchesQuery(api, parseQuery("#work api")));
    });

    test("tag chips match any of the selected tags", () => {
        assert.ok(matchesAnyTag(api, []));
        assert.ok(matchesAnyTag(api, [ "Personal", "Go" ]));
        assert.ok(!matchesAnyTag(blog, [ "Go" ]));
        assert.ok(matchesAnyTag(untagged, [ "** no tags **" ], "** no tags **"));
    });
});
