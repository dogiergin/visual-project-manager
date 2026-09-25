/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

// Projects Home: pinned + recent local projects as large folder tiles, search by name or #tag, tag chips.
(function () {
    "use strict";

    const vscode = acquireVsCodeApi();
    const t = JSON.parse(document.getElementById("strings").textContent);
    const { icon, folder } = window.Icons;
    const { parseQuery, isEmptyQuery, matchesQuery, matchesAnyTag } = window.ProjectQuery;

    const LIMIT_OPTIONS = [ 3, 6, 9, 0 ]; // 0 = all

    const DEFAULT_DATA = { pinned: [], recent: [], all: [], tags: [], limits: { pinned: 6, recent: 6 }, theme: "blackBlue" };

    // tolerate missing fields (e.g. an older extension host still running after an update, until the window is reloaded)
    function normalizeData(data) {
        const merged = { ...DEFAULT_DATA, ...(data || {}) };
        merged.limits = { ...DEFAULT_DATA.limits, ...(merged.limits || {}) };
        for (const key of [ "pinned", "recent", "all", "tags" ]) {
            merged[ key ] = Array.isArray(merged[ key ]) ? merged[ key ] : [];
        }
        return merged;
    }

    const saved = vscode.getState() || {};
    const state = {
        data: normalizeData(),
        loaded: false,
        query: saved.query || "",
        selectedTags: saved.selectedTags || [],
        expanded: saved.expanded || {},  // sections temporarily showing all projects
        activeKey: undefined            // the tile that owns the single tab stop of the grids (roving tabindex)
    };

    function format(text, ...args) {
        return (text || "").replace(/\{(\d+)\}/g, (match, index) => args[index] !== undefined ? String(args[index]) : match);
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
        vscode.setState({ query: state.query, selectedTags: state.selectedTags, expanded: state.expanded });
    }

    // ---------------------------------------------------------------- layout (built once)

    const app = document.getElementById("app");

    function greeting() {
        const hour = new Date().getHours();
        return hour < 5 ? t.greetingNight : hour < 12 ? t.greetingMorning : hour < 18 ? t.greetingAfternoon : t.greetingEvening;
    }

    // large, labelled buttons: what they do is written on them
    const quickActions = el("nav", { class: "quick-actions", "aria-label": t.quickActions }, [
        actionCard("openFolder", "folder", t.openFolder, t.openFolderDescription),
        actionCard("cloneRepository", "git", t.cloneRepository, t.cloneRepositoryDescription),
        actionCard("listProjects", "list", t.listProjects, t.listProjectsDescription),
        actionCard("openSettings", "gear", t.settings, t.settingsDescription)
    ]);

    const continueSlot = el("div", { class: "continue-slot" });

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

    app.append(el("main", { class: "home", "aria-busy": "true" }, [
        el("header", { class: "hero" }, [
            el("div", { class: "hero-text" }, [
                el("p", { class: "eyebrow", text: t.title }),
                el("h1", { text: greeting() }),
                el("p", { class: "subtitle", text: t.subtitle })
            ]),
            continueSlot
        ]),
        quickActions,
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

    function actionCard(command, iconName, label, description) {
        return el("button", {
            type: "button",
            class: "action-card",
            onclick: () => post({ type: "command", command })
        }, [
            el("span", { class: "action-card-icon", html: icon(iconName) }),
            el("span", { class: "action-card-text" }, [
                el("span", { class: "action-card-label", text: label }),
                el("span", { class: "action-card-description", text: description })
            ])
        ]);
    }

    // the most recent project, as a large "continue" card in the header
    function renderContinue() {
        continueSlot.replaceChildren();
        const project = !isFiltering() && state.loaded ? state.data.recent[ 0 ] : undefined;
        if (!project) {
            return;
        }
        continueSlot.append(el("section", { class: "continue", "aria-labelledby": "heading-continue" }, [
            el("h2", { id: "heading-continue", class: "continue-title" }, [ el("span", { html: icon("clock") }), el("span", { text: t.continueTitle }) ]),
            el("div", { class: "continue-body" }, [
                el("span", { class: "continue-folder", html: folder(project.kind) }),
                el("span", { class: "continue-text" }, [
                    el("span", { class: "continue-name", text: project.name }),
                    el("span", { class: "continue-path", title: project.displayPath, text: project.displayPath }),
                    allTags(project).length > 0 ? el("span", { class: "continue-tags", text: allTags(project).map(tag => `#${tag}`).join("  ") }) : undefined
                ])
            ]),
            el("div", { class: "continue-buttons" }, [
                el("button", {
                    type: "button",
                    class: "button primary",
                    "data-key": `${project.rootPath}|continue`,
                    "data-nav": "tile",
                    "aria-label": `${t.openProject}: ${project.name}`,
                    onclick: event => open(project, event.ctrlKey || event.metaKey),
                    onkeydown: event => onTileKeyDown(event, project)
                }, [ el("span", { html: icon("play") }), el("span", { text: t.openProject }) ]),
                el("button", {
                    type: "button",
                    class: "button secondary",
                    "aria-label": `${t.openInNewWindow}: ${project.name}`,
                    onclick: () => open(project, true)
                }, [ el("span", { html: icon("newWindow") }), el("span", { text: t.openInNewWindow }) ])
            ])
        ]));
    }

    // ---------------------------------------------------------------- rendering

    function applyTheme() {
        document.body.classList.toggle("theme-black-blue", state.data.theme === "blackBlue");
    }

    function isFiltering() {
        return !isEmptyQuery(parseQuery(state.query)) || state.selectedTags.length > 0;
    }

    function filtered() {
        const parsed = parseQuery(state.query);
        return state.data.all
            .filter(project => {
                const searchable = { name: project.name, tags: allTags(project) };
                return matchesQuery(searchable, parsed) && matchesAnyTag(searchable, state.selectedTags);
            })
            .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name));
    }

    function suggested(project) {
        return Array.isArray(project.suggestedTags) ? project.suggestedTags : [];
    }

    function allTags(project) {
        return [ ...project.tags, ...suggested(project) ];
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
        renderContinue();
        lists.replaceChildren();
        app.querySelector(".home").setAttribute("aria-busy", String(!state.loaded));

        if (isFiltering()) {
            lists.append(section("results", t.results, filtered(), t.noResults));
        } else {
            lists.append(section("pinned", t.pinned, state.data.pinned, t.noPinned, "pinFilled"));
            // the most recent one is already in the "continue" card
            lists.append(section("recent", t.recent, state.data.recent.slice(1), t.noRecent, "clock"));
        }

        updateRovingTabStop();
        if (focusedKey) {
            const target = app.querySelector(`[data-key="${CSS.escape(focusedKey)}"]`) || tiles()[ 0 ];
            if (target) {
                target.focus();
            } else {
                searchInput.focus();
            }
        }
    }

    function skeleton(count) {
        const grid = el("ul", { class: "grid skeleton", "aria-hidden": "true" });
        for (let index = 0; index < count; index++) {
            grid.append(el("li", { class: "tile" }, [ el("span", { class: "skeleton-folder" }), el("span", { class: "skeleton-line" }) ]));
        }
        return grid;
    }

    function section(id, title, projects, emptyText, iconName) {
        const headingId = `heading-${id}`;
        const limit = id === "results" ? 0 : state.data.limits[ id ];
        const expanded = !!state.expanded[ id ];
        const visible = limit > 0 && !expanded ? projects.slice(0, limit) : projects;

        const grid = el("ul", { class: "grid", "aria-labelledby": headingId });
        visible.forEach(project => grid.append(tile(project)));

        const header = el("div", { class: "section-header" }, [
            el("h2", { id: headingId }, [
                iconName ? el("span", { class: "section-icon", html: icon(iconName) }) : undefined,
                el("span", { text: title }),
                el("span", { class: "count", text: state.loaded ? `${projects.length}` : "" })
            ]),
            id === "results" ? undefined : limitPicker(id, title)
        ]);

        const more = limit > 0 && projects.length > limit
            ? el("button", {
                type: "button",
                class: "link more",
                "aria-expanded": String(expanded),
                onclick: () => {
                    state.expanded[ id ] = !expanded;
                    persist();
                    renderLists();
                }
            }, [ el("span", { text: expanded ? t.showLess : format(t.showMore, projects.length) }) ])
            : undefined;

        return el("section", { class: `section section-${id}`, "aria-labelledby": headingId }, [
            header,
            !state.loaded ? skeleton(id === "pinned" ? 3 : 6)
                : projects.length > 0 ? grid
                    : el("p", { class: "empty" }, [ el("span", { class: "empty-icon", html: icon(iconName || "search") }), el("span", { text: emptyText }) ]),
            more
        ]);
    }

    // segmented control: 3 / 6 / 9 / All
    function limitPicker(id, title) {
        const current = state.data.limits[ id ];
        return el("div", { class: "limit", role: "group", "aria-label": format(t.showCount, title) }, [
            el("span", { class: "limit-label", "aria-hidden": "true", text: t.show }),
            ...LIMIT_OPTIONS.map(value => el("button", {
                type: "button",
                class: "limit-option",
                "aria-pressed": String(current === value),
                onclick: () => {
                    state.expanded[ id ] = false;
                    persist();
                    post({ type: "setLimit", section: id, limit: value });
                }
            }, [ el("span", { text: value === 0 ? t.all : String(value) }) ]))
        ]);
    }

    function tile(project) {
        const key = project.rootPath;
        const description = [
            project.tags.length > 0 ? format(t.tags, project.tags.join(", ")) : undefined,
            suggested(project).length > 0 ? format(t.suggestedTags, suggested(project).join(", ")) : undefined,
            project.kind === "workspace" ? t.workspace : undefined,
            project.pinned ? t.pinnedBadge : undefined,
            project.displayPath
        ].filter(Boolean).join(", ");

        const main = el("button", {
            type: "button",
            class: "tile-main",
            "data-key": key,
            "data-nav": "tile",
            title: `${project.name}\n${project.displayPath}`,
            "aria-label": `${project.name}, ${description}`,
            "aria-keyshortcuts": "Enter Control+Enter P T A",
            onclick: event => open(project, event.ctrlKey || event.metaKey),
            onkeydown: event => onTileKeyDown(event, project),
            oncontextmenu: event => {
                event.preventDefault();
                event.currentTarget.parentElement.querySelector(".action").focus();
            }
        }, [
            el("span", { class: "folder-wrap", html: folder(project.kind) }),
            el("span", { class: "name", text: project.name }),
            allTags(project).length > 0 ? el("span", { class: "tags", "aria-hidden": "true" }, [
                ...project.tags.map(tag => el("span", { class: "tag-manual", text: `#${tag}` })),
                ...suggested(project).map(tag => el("span", { class: "tag-suggested", title: t.suggestedTags.replace("{0}", tag), text: `✨${tag}` }))
            ]) : undefined
        ]);

        const pinBadge = project.pinned ? el("span", { class: "pin-badge", "aria-hidden": "true", html: icon("pinFilled") }) : undefined;

        const actions = el("div", { class: "tile-actions" }, [
            actionButton(key, "newWindow", "newWindow", t.openInNewWindow, () => open(project, true)),
            actionButton(key, "pin", project.pinned ? "pinFilled" : "pin", project.pinned ? t.unpin : t.pin, () => togglePin(project)),
            actionButton(key, "tags", "tag", t.editTags, () => post({ type: "editTags", rootPath: project.rootPath })),
            suggested(project).length > 0
                ? actionButton(key, "accept", "sparkle", t.acceptSuggestions, () => acceptSuggestions(project))
                : undefined
        ]);

        return el("li", { class: project.pinned ? "tile pinned" : "tile" }, [ main, pinBadge, actions ]);
    }

    function actionButton(key, action, iconName, label, handler) {
        return el("button", {
            type: "button",
            class: "action",
            tabindex: "-1",
            title: label,
            "aria-label": label,
            "data-key": `${key}|${action}`,
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
        applyTheme();
        renderChips();
        renderLists();
        clearButton.hidden = state.query === "";
    }

    // ---------------------------------------------------------------- actions

    function open(project, newWindow) {
        post({ type: "open", rootPath: project.rootPath, newWindow });
    }

    function acceptSuggestions(project) {
        if (suggested(project).length === 0) {
            return;
        }
        live.textContent = format(t.suggestedTags, suggested(project).join(", "));
        post({ type: "acceptSuggestions", rootPath: project.rootPath });
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

    function tiles() {
        return [ ...app.querySelectorAll('[data-nav="tile"]') ];
    }

    function updateRovingTabStop() {
        const all = tiles();
        const active = all.find(item => item.dataset.key === state.activeKey) || all[ 0 ];
        all.forEach(item => item.tabIndex = item === active ? 0 : -1);
    }

    function focusTile(target) {
        if (!target) {
            return;
        }
        state.activeKey = target.dataset.key;
        updateRovingTabStop();
        target.focus();
    }

    // the tile right above/below, following the visual grid (across sections)
    function verticalNeighbor(current, direction) {
        const from = current.getBoundingClientRect();
        const centerX = from.left + from.width / 2;
        const candidates = tiles()
            .map(item => ({ item, rect: item.getBoundingClientRect() }))
            .filter(({ rect }) => direction > 0 ? rect.top > from.bottom - 1 : rect.bottom < from.top + 1);
        if (candidates.length === 0) {
            return undefined;
        }
        const rowTop = direction > 0
            ? Math.min(...candidates.map(({ rect }) => rect.top))
            : Math.max(...candidates.map(({ rect }) => rect.top));
        return candidates
            .filter(({ rect }) => Math.abs(rect.top - rowTop) < 2)
            .sort((a, b) => Math.abs(a.rect.left + a.rect.width / 2 - centerX) - Math.abs(b.rect.left + b.rect.width / 2 - centerX))[ 0 ].item;
    }

    function onTileKeyDown(event, project) {
        const all = tiles();
        const index = all.indexOf(event.currentTarget);

        switch (event.key) {
            case "ArrowRight":
                event.preventDefault();
                focusTile(all[ Math.min(index + 1, all.length - 1) ]);
                break;
            case "ArrowLeft":
                event.preventDefault();
                focusTile(all[ Math.max(index - 1, 0) ]);
                break;
            case "ArrowDown":
                event.preventDefault();
                focusTile(verticalNeighbor(event.currentTarget, 1));
                break;
            case "ArrowUp": {
                event.preventDefault();
                const above = verticalNeighbor(event.currentTarget, -1);
                if (above) {
                    focusTile(above);
                } else {
                    searchInput.focus();
                }
                break;
            }
            case "Home":
                event.preventDefault();
                focusTile(all[ 0 ]);
                break;
            case "End":
                event.preventDefault();
                focusTile(all[ all.length - 1 ]);
                break;
            case "Enter":
                if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    open(project, true);
                }
                break;
            case "p":
            case "P":
                event.preventDefault();
                togglePin(project);
                break;
            case "a":
            case "A":
                event.preventDefault();
                acceptSuggestions(project);
                break;
            case "t":
            case "T":
                event.preventDefault();
                post({ type: "editTags", rootPath: project.rootPath });
                break;
            case "ContextMenu":
                event.preventDefault();
                event.currentTarget.parentElement.querySelector(".action").focus();
                break;
            case "Escape":
                event.preventDefault();
                searchInput.focus();
                break;
        }
    }

    function onActionKeyDown(event) {
        const actions = [ ...event.currentTarget.parentElement.querySelectorAll(".action") ];
        const index = actions.indexOf(event.currentTarget);
        const main = event.currentTarget.closest(".tile").querySelector('[data-nav="tile"]');

        switch (event.key) {
            case "ArrowRight":
            case "ArrowDown":
                event.preventDefault();
                (actions[ index + 1 ] || actions[ index ]).focus();
                break;
            case "ArrowLeft":
            case "ArrowUp":
                event.preventDefault();
                (actions[ index - 1 ] || main).focus();
                break;
            case "Escape":
                event.preventDefault();
                focusTile(main);
                break;
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
            case "ArrowDown": event.preventDefault(); focusTile(tiles()[ 0 ]); return;
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
            focusTile(tiles()[ 0 ]);
        } else if (event.key === "Enter") {
            const first = tiles()[ 0 ];
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
            state.data = normalizeData(message.data);
            state.loaded = true;
            render();
        }
    });

    render();
    searchInput.focus();
    post({ type: "ready" });
}());
