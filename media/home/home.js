/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

// Projects Home: pinned + recent local projects, search by name or #tag, tag chips.
(function () {
    "use strict";

    const vscode = acquireVsCodeApi();
    const t = JSON.parse(document.getElementById("strings").textContent);
    const { icon } = window.Icons;
    const { parseQuery, isEmptyQuery, matchesQuery, matchesAnyTag } = window.ProjectQuery;

    const saved = vscode.getState() || {};
    const state = {
        data: { pinned: [], recent: [], all: [], tags: [] },
        loaded: false,
        query: saved.query || "",
        selectedTags: saved.selectedTags || [],
        activeKey: undefined // the row that owns the single tab stop of the lists (roving tabindex)
    };

    function format(text, ...args) {
        return text.replace(/\{(\d+)\}/g, (match, index) => args[index] !== undefined ? String(args[index]) : match);
    }

    function el(tag, attributes, children) {
        const element = document.createElement(tag);
        for (const [ name, value ] of Object.entries(attributes || {})) {
            if (value === undefined || value === false) {
                continue;
            }
            if (name === "text") {
                element.textContent = value;
            } else if (name === "html") {
                element.innerHTML = value; // only used with static icon markup
            } else if (name.startsWith("on")) {
                element.addEventListener(name.substring(2), value);
            } else {
                element.setAttribute(name, value === true ? "" : value);
            }
        }
        for (const child of [].concat(children || [])) {
            if (child) {
                element.append(child);
            }
        }
        return element;
    }

    function post(message) {
        vscode.postMessage(message);
    }

    function persist() {
        vscode.setState({ query: state.query, selectedTags: state.selectedTags });
    }

    // ---------------------------------------------------------------- layout (built once)

    const app = document.getElementById("app");

    const toolbar = el("div", { class: "toolbar", role: "toolbar", "aria-label": t.title }, [
        toolbarButton("openFolder", "folder", t.openFolder),
        toolbarButton("listProjects", "list", t.listProjects),
        toolbarButton("openSettings", "gear", t.settings, true)
    ]);

    const searchInput = el("input", {
        id: "search",
        type: "search",
        placeholder: t.searchPlaceholder,
        autocomplete: "off",
        spellcheck: "false",
        "aria-describedby": "search-hint",
        "aria-controls": "lists",
        value: state.query
    });
    const clearButton = el("button", { class: "clear", type: "button", title: t.clearSearch, "aria-label": t.clearSearch, html: icon("close") });
    const search = el("div", { class: "search", role: "search" }, [
        el("label", { for: "search", class: "visually-hidden", text: t.searchLabel }),
        el("span", { class: "icon-search", html: icon("search") }),
        searchInput,
        clearButton
    ]);
    const hint = el("p", { id: "search-hint", class: "visually-hidden", text: t.searchHint });

    const chips = el("div", { class: "chips", role: "group", "aria-label": t.tagsLabel });
    const lists = el("div", { id: "lists", class: "lists" });
    const live = el("div", { class: "visually-hidden", role: "status", "aria-live": "polite", "aria-atomic": "true" });

    app.append(el("main", { class: "home" }, [
        el("header", { class: "header" }, [ el("h1", { text: t.title }), toolbar ]),
        search,
        hint,
        chips,
        live,
        lists,
        el("footer", { class: "footer" }, [
            el("p", { class: "keyboard-help", text: t.keyboardHelp }),
            el("p", { class: "credits", text: t.credits })
        ])
    ]));

    function toolbarButton(command, iconName, label, iconOnly) {
        return el("button", {
            type: "button",
            class: iconOnly ? "tool icon-only" : "tool",
            title: label,
            "aria-label": label,
            onclick: () => post({ type: "command", command })
        }, [ el("span", { html: icon(iconName) }), iconOnly ? undefined : el("span", { text: label }) ]);
    }

    // ---------------------------------------------------------------- rendering

    function isFiltering() {
        return !isEmptyQuery(parseQuery(state.query)) || state.selectedTags.length > 0;
    }

    function filtered() {
        const parsed = parseQuery(state.query);
        return state.data.all
            .filter(project => matchesQuery(project, parsed) && matchesAnyTag(project, state.selectedTags))
            .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name));
    }

    function renderChips() {
        // keep only tags that still exist (once the projects are loaded)
        if (state.loaded) {
            state.selectedTags = state.selectedTags.filter(tag => state.data.tags.includes(tag));
        }
        chips.replaceChildren();
        chips.hidden = state.data.tags.length === 0;

        state.data.tags.forEach((tag, index) => {
            const pressed = state.selectedTags.includes(tag);
            chips.append(el("button", {
                type: "button",
                class: "chip",
                "aria-pressed": String(pressed),
                tabindex: index === 0 ? "0" : "-1",
                "data-tag": tag,
                onclick: () => toggleTag(tag),
                onkeydown: onChipKeyDown
            }, [ el("span", { class: "check", "aria-hidden": "true", text: "✓" }), el("span", { html: icon("tag") }), el("span", { text: tag }) ]));
        });
    }

    function renderLists() {
        const focusedKey = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.key : undefined;
        lists.replaceChildren();

        if (isFiltering()) {
            const results = filtered();
            lists.append(section("results", t.results, results, t.noResults));
        } else {
            lists.append(section("pinned", t.pinned, state.data.pinned, t.noPinned));
            lists.append(section("recent", t.recent, state.data.recent, t.noRecent));
        }

        updateRovingTabStop();
        if (focusedKey) {
            const target = lists.querySelector(`[data-key="${CSS.escape(focusedKey)}"]`) || rowMains()[ 0 ];
            if (target) {
                target.focus();
            } else {
                searchInput.focus();
            }
        }
    }

    function section(id, title, projects, emptyText) {
        const headingId = `heading-${id}`;
        const list = el("ul", { class: "rows", "aria-labelledby": headingId });
        projects.forEach(project => list.append(row(project)));

        return el("section", { class: "section", "aria-labelledby": headingId }, [
            el("h2", { id: headingId }, [ el("span", { text: title }), el("span", { class: "count", text: state.loaded ? `(${projects.length})` : "" }) ]),
            projects.length > 0 ? list : el("p", { class: "empty", text: state.loaded ? emptyText : "" })
        ]);
    }

    function row(project) {
        const key = project.rootPath;
        const kindIcon = project.kind === "workspace" ? "workspace" : project.kind === "remote" ? "remote" : "folder";

        const tags = project.tags.length > 0
            ? el("span", { class: "tags" }, project.tags.map(tag => el("span", { class: "tag", text: tag })))
            : undefined;

        const main = el("button", {
            type: "button",
            class: "row-main",
            "data-key": key,
            "data-nav": "main",
            title: format(t.open, project.name),
            onclick: event => open(project, event.ctrlKey || event.metaKey),
            onkeydown: event => onRowKeyDown(event, project)
        }, [
            el("span", { class: "kind", html: icon(kindIcon) }),
            el("span", { class: "text" }, [
                el("span", { class: "name-line" }, [
                    el("span", { class: "name", text: project.name }),
                    tags ? el("span", { class: "visually-hidden", text: ", " + format(t.tags, project.tags.join(", ")) }) : undefined,
                    tags ? el("span", { "aria-hidden": "true" }, [ tags ]) : undefined,
                    project.kind === "workspace" ? el("span", { class: "meta", text: t.workspace }) : undefined
                ]),
                el("span", { class: "path" }, [ el("span", { class: "visually-hidden", text: ", " }), project.displayPath ])
            ])
        ]);

        const actions = el("div", { class: "row-actions" }, [
            actionButton(key, "newWindow", "newWindow", t.openInNewWindow, () => open(project, true)),
            actionButton(key, "pin", project.pinned ? "pinFilled" : "pin", project.pinned ? t.unpin : t.pin, () => togglePin(project)),
            actionButton(key, "tags", "tag", t.editTags, () => post({ type: "editTags", rootPath: project.rootPath }))
        ]);

        return el("li", { class: project.pinned ? "row pinned" : "row" }, [ main, actions ]);
    }

    function actionButton(key, action, iconName, label, handler) {
        return el("button", {
            type: "button",
            class: "action",
            tabindex: "-1",
            title: label,
            "aria-label": label,
            "data-key": `${key}|${action}`,
            "data-nav": "action",
            onclick: handler,
            onkeydown: onActionKeyDown
        }, [ el("span", { html: icon(iconName) }) ]);
    }

    let announceTimer;
    function announceResults() {
        clearTimeout(announceTimer);
        if (!isFiltering()) {
            return;
        }
        announceTimer = setTimeout(() => {
            const count = filtered().length;
            live.textContent = count === 1 ? t.resultsCountOne : format(t.resultsCount, count);
        }, 400);
    }

    function render() {
        renderChips();
        renderLists();
        clearButton.hidden = state.query === "";
    }

    // ---------------------------------------------------------------- actions

    function open(project, newWindow) {
        post({ type: "open", rootPath: project.rootPath, newWindow });
    }

    function togglePin(project) {
        const pinned = !project.pinned;
        live.textContent = format(pinned ? t.pinnedAnnouncement : t.unpinnedAnnouncement, project.name);
        post({ type: "setPinned", rootPath: project.rootPath, pinned });
    }

    function toggleTag(tag) {
        state.selectedTags = state.selectedTags.includes(tag)
            ? state.selectedTags.filter(item => item !== tag)
            : [ ...state.selectedTags, tag ];
        persist();
        const focused = document.activeElement;
        render();
        const chip = chips.querySelector(`[data-tag="${CSS.escape(tag)}"]`);
        if (chip && focused && focused.classList.contains("chip")) {
            moveChipTabStop(chip);
            chip.focus();
        }
        announceResults();
    }

    function setQuery(value) {
        state.query = value;
        persist();
        renderLists();
        clearButton.hidden = value === "";
        announceResults();
    }

    // ---------------------------------------------------------------- keyboard

    function rowMains() {
        return [ ...lists.querySelectorAll('[data-nav="main"]') ];
    }

    function updateRovingTabStop() {
        const mains = rowMains();
        const active = mains.find(main => main.dataset.key === state.activeKey) || mains[ 0 ];
        mains.forEach(main => main.tabIndex = main === active ? 0 : -1);
    }

    function focusRow(main) {
        if (!main) {
            return;
        }
        state.activeKey = main.dataset.key;
        updateRovingTabStop();
        main.focus();
    }

    function onRowKeyDown(event, project) {
        const mains = rowMains();
        const index = mains.indexOf(event.currentTarget);

        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                focusRow(mains[ Math.min(index + 1, mains.length - 1) ]);
                break;
            case "ArrowUp":
                event.preventDefault();
                if (index === 0) {
                    searchInput.focus();
                } else {
                    focusRow(mains[ index - 1 ]);
                }
                break;
            case "Home":
                event.preventDefault();
                focusRow(mains[ 0 ]);
                break;
            case "End":
                event.preventDefault();
                focusRow(mains[ mains.length - 1 ]);
                break;
            case "ArrowRight":
                event.preventDefault();
                event.currentTarget.parentElement.querySelector('[data-nav="action"]').focus();
                break;
            case "Enter":
                if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    open(project, true);
                }
                break;
            case "Escape":
                event.preventDefault();
                searchInput.focus();
                break;
        }
    }

    function onActionKeyDown(event) {
        const actions = [ ...event.currentTarget.parentElement.querySelectorAll('[data-nav="action"]') ];
        const index = actions.indexOf(event.currentTarget);
        const main = event.currentTarget.closest(".row").querySelector('[data-nav="main"]');

        switch (event.key) {
            case "ArrowRight":
                event.preventDefault();
                (actions[ index + 1 ] || actions[ index ]).focus();
                break;
            case "ArrowLeft":
                event.preventDefault();
                (actions[ index - 1 ] || main).focus();
                break;
            case "ArrowDown":
            case "ArrowUp":
            case "Escape": {
                event.preventDefault();
                const mains = rowMains();
                const mainIndex = mains.indexOf(main);
                const target = event.key === "ArrowDown" ? mains[ mainIndex + 1 ] : event.key === "ArrowUp" ? mains[ mainIndex - 1 ] : main;
                focusRow(target || main);
                break;
            }
        }
    }

    function moveChipTabStop(chip) {
        chips.querySelectorAll(".chip").forEach(item => item.tabIndex = item === chip ? 0 : -1);
    }

    function onChipKeyDown(event) {
        const all = [ ...chips.querySelectorAll(".chip") ];
        const index = all.indexOf(event.currentTarget);
        let target;
        switch (event.key) {
            case "ArrowRight": target = all[ (index + 1) % all.length ]; break;
            case "ArrowLeft": target = all[ (index - 1 + all.length) % all.length ]; break;
            case "Home": target = all[ 0 ]; break;
            case "End": target = all[ all.length - 1 ]; break;
            case "ArrowDown": event.preventDefault(); focusRow(rowMains()[ 0 ]); return;
            case "ArrowUp": event.preventDefault(); searchInput.focus(); return;
            default: return;
        }
        event.preventDefault();
        moveChipTabStop(target);
        target.focus();
    }

    searchInput.addEventListener("input", () => setQuery(searchInput.value));
    searchInput.addEventListener("keydown", event => {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            focusRow(rowMains()[ 0 ]);
        } else if (event.key === "Enter") {
            const first = rowMains()[ 0 ];
            if (first && isFiltering()) {
                event.preventDefault();
                first.click();
            }
        } else if (event.key === "Escape" && searchInput.value !== "") {
            event.preventDefault();
            searchInput.value = "";
            setQuery("");
        }
    });
    clearButton.addEventListener("click", () => {
        searchInput.value = "";
        setQuery("");
        searchInput.focus();
    });

    document.addEventListener("keydown", event => {
        const typing = event.target instanceof HTMLInputElement;
        if (event.key === "/" && !typing) {
            event.preventDefault();
            searchInput.focus();
            searchInput.select();
        }
    });

    // ---------------------------------------------------------------- messages

    window.addEventListener("message", event => {
        const message = event.data;
        if (message.type === "data") {
            state.data = message.data;
            state.loaded = true;
            render();
        }
    });

    render();
    searchInput.focus();
    post({ type: "ready" });
}());
