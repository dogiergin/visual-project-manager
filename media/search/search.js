/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

// Side Bar search: filters the Pinned and Favorites tree views.
(function () {
    "use strict";

    const vscode = acquireVsCodeApi();
    const t = JSON.parse(document.getElementById("strings").textContent);
    const { icon } = window.Icons;

    let selectedTags = [];
    let availableTags = [];
    let lastAnnouncedFor;

    function format(text, ...args) {
        return text.replace(/\{(\d+)\}/g, (match, index) => args[index] !== undefined ? String(args[index]) : match);
    }

    const app = document.getElementById("app");
    app.innerHTML = `
        <div class="panel">
            <div class="search" role="search">
                <label for="search" class="visually-hidden"></label>
                <span class="icon-search">${icon("search")}</span>
                <input id="search" type="search" autocomplete="off" spellcheck="false" aria-describedby="search-hint">
                <button class="clear" type="button" hidden>${icon("close")}</button>
            </div>
            <p id="search-hint" class="visually-hidden"></p>
            <div class="chips" role="group"></div>
            <div class="status-line">
                <span class="summary" aria-hidden="true"></span>
                <button class="clear-filters link" type="button" hidden></button>
            </div>
            <div class="visually-hidden" role="status" aria-live="polite" aria-atomic="true"></div>
        </div>`;

    const input = app.querySelector("#search");
    const clearButton = app.querySelector(".clear");
    const chips = app.querySelector(".chips");
    const summary = app.querySelector(".summary");
    const clearFilters = app.querySelector(".clear-filters");
    const live = app.querySelector('[role="status"]');

    app.querySelector("label").textContent = t.searchLabel;
    app.querySelector("#search-hint").textContent = t.searchHint;
    input.placeholder = t.searchPlaceholder;
    clearButton.title = t.clearSearch;
    clearButton.setAttribute("aria-label", t.clearSearch);
    chips.setAttribute("aria-label", t.tagsLabel);
    clearFilters.textContent = t.clearFilters;

    let queryTimer;
    function sendQuery() {
        clearTimeout(queryTimer);
        clearButton.hidden = input.value === "";
        queryTimer = setTimeout(() => vscode.postMessage({ type: "query", value: input.value }), 150);
    }

    input.addEventListener("input", sendQuery);
    input.addEventListener("keydown", event => {
        if (event.key === "Escape" && input.value !== "") {
            event.preventDefault();
            input.value = "";
            sendQuery();
        } else if (event.key === "ArrowDown" || event.key === "Enter") {
            event.preventDefault();
            vscode.postMessage({ type: "focusResults" });
        }
    });
    clearButton.addEventListener("click", () => {
        input.value = "";
        sendQuery();
        input.focus();
    });
    clearFilters.addEventListener("click", () => {
        input.value = "";
        clearButton.hidden = true;
        vscode.postMessage({ type: "clear" });
        input.focus();
    });

    function renderChips() {
        const focusedTag = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.tag : undefined;
        chips.replaceChildren();
        chips.hidden = availableTags.length === 0;

        availableTags.forEach((tag, index) => {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "chip";
            chip.dataset.tag = tag;
            chip.tabIndex = (focusedTag ? tag === focusedTag : index === 0) ? 0 : -1;
            chip.setAttribute("aria-pressed", String(selectedTags.includes(tag)));
            chip.innerHTML = `<span class="check" aria-hidden="true">✓</span>${icon("tag")}<span class="label"></span>`;
            chip.querySelector(".label").textContent = tag;
            chip.addEventListener("click", () => {
                const tags = selectedTags.includes(tag) ? selectedTags.filter(item => item !== tag) : [ ...selectedTags, tag ];
                vscode.postMessage({ type: "tags", tags });
            });
            chip.addEventListener("keydown", onChipKeyDown);
            chips.append(chip);
        });

        if (focusedTag) {
            const chip = chips.querySelector(`[data-tag="${CSS.escape(focusedTag)}"]`);
            if (chip) {
                chip.focus();
            }
        }
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
            case "ArrowUp": event.preventDefault(); input.focus(); return;
            case "ArrowDown": event.preventDefault(); vscode.postMessage({ type: "focusResults" }); return;
            default: return;
        }
        event.preventDefault();
        all.forEach(chip => chip.tabIndex = chip === target ? 0 : -1);
        target.focus();
    }

    window.addEventListener("message", event => {
        const message = event.data;
        if (message.type === "focus") {
            input.focus();
            input.select();
            return;
        }
        if (message.type !== "state") {
            return;
        }

        // do not fight with the user while typing
        if (document.activeElement !== input) {
            input.value = message.query;
        }
        clearButton.hidden = input.value === "";

        selectedTags = message.selectedTags;
        availableTags = message.availableTags;
        renderChips();

        clearFilters.hidden = !message.active;
        const text = !message.active ? "" : message.matches === 0 ? t.noResults
            : message.matches === 1 ? t.resultsCountOne : format(t.resultsCount, message.matches);
        summary.textContent = text;

        const announceKey = `${message.query}|${message.selectedTags.join(",")}|${message.matches}`;
        if (message.active && announceKey !== lastAnnouncedFor) {
            lastAnnouncedFor = announceKey;
            live.textContent = text;
        }
    });

    vscode.postMessage({ type: "ready" });
}());
