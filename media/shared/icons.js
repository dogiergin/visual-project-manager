/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

// Small 16x16 stroke icons. They use `currentColor`, so they follow the active color theme.
(function () {
    "use strict";

    const paths = {
        search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/>',
        close: '<path d="M4 4l8 8M12 4l-8 8"/>',
        pin: '<path d="M6 2h4l-.5 4 2.5 2.5v1H4v-1L6.5 6z"/><path d="M8 9.5V14"/>',
        pinFilled: '<path d="M6 2h4l-.5 4 2.5 2.5v1H4v-1L6.5 6z" fill="currentColor"/><path d="M8 9.5V14"/>',
        newWindow: '<rect x="2" y="4" width="9" height="9" rx="1"/><path d="M6 2h8v8M9 7l5-5"/>',
        tag: '<path d="M2 2h5.5L14 8.5 8.5 14 2 7.5z"/><circle cx="5" cy="5" r="1" fill="currentColor"/>',
        folder: '<path d="M1.5 4a1 1 0 0 1 1-1h3.5l1.5 1.5h6a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"/>',
        workspace: '<rect x="1.5" y="3" width="13" height="10" rx="1"/><path d="M1.5 6h13M6 6v7"/>',
        remote: '<path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"/><circle cx="8" cy="8" r="6"/>',
        list: '<path d="M5 4h9M5 8h9M5 12h9M2 4h.01M2 8h.01M2 12h.01"/>',
        save: '<path d="M2.5 2.5h9l2 2v9h-11z"/><path d="M5 2.5v3h5v-3M5 13.5v-4h6v4"/>',
        sparkle: '<path d="M8 1.5l1.4 4.1L13.5 7l-4.1 1.4L8 12.5 6.6 8.4 2.5 7l4.1-1.4z"/><path d="M13 11.5l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5z"/>',
        clock: '<circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/>',
        play: '<path d="M5 3.5v9l7-4.5z" fill="currentColor"/>',
        git: '<circle cx="4.5" cy="3.5" r="1.5"/><circle cx="4.5" cy="12.5" r="1.5"/><circle cx="11.5" cy="6" r="1.5"/><path d="M4.5 5v6M11.5 7.5c0 2.5-2.5 2.5-5.5 3.5"/>',
        cloudSync: '<path d="M4.5 12.5h7a3 3 0 0 0 .4-6 4 4 0 0 0-7.7 1A2.5 2.5 0 0 0 4.5 12.5z"/><path d="M8 7v4M6.5 8.5 8 7l1.5 1.5"/>',
        gear: '<circle cx="8" cy="8" r="2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>'
    };

    function icon(name) {
        return '<svg class="icon" aria-hidden="true" focusable="false" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
            'stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">' + paths[name] + '</svg>';
    }

    // Large folder in the style of the Windows 11 File Explorer (drawn from scratch, not the Windows asset)
    let folderId = 0;
    function folder(kind) {
        const id = `folder${folderId++}`;
        const badge = kind === "workspace"
            ? '<g transform="translate(66 50)"><rect width="24" height="20" rx="4" fill="#1f6feb"/><path d="M5 6h14M5 10h14M5 14h9" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></g>'
            : kind === "remote"
                ? '<g transform="translate(66 48)"><circle cx="12" cy="12" r="11" fill="#1f6feb"/><path d="M1 12h22M12 1c4 4 4 18 0 22M12 1c-4 4-4 18 0 22" stroke="#fff" stroke-width="1.5" fill="none"/></g>'
                : "";
        return `<svg class="folder" aria-hidden="true" focusable="false" viewBox="0 0 96 80">
            <defs>
                <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3b52c"/><stop offset="1" stop-color="#d98f06"/></linearGradient>
                <linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe189"/><stop offset="1" stop-color="#ffc53d"/></linearGradient>
            </defs>
            <path d="M6 14a6 6 0 0 1 6-6h22.5a4 4 0 0 1 2.8 1.2L44 16h40a6 6 0 0 1 6 6v46a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6z" fill="url(#${id}b)"/>
            <rect x="13" y="19" width="70" height="40" rx="2.5" fill="#fafafa"/>
            <path d="M20 27h40M20 33h52M20 39h30" stroke="#d8d8d8" stroke-width="2" stroke-linecap="round"/>
            <path d="M4 32a6 6 0 0 1 6-6h76a6 6 0 0 1 6 6v36a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6z" fill="url(#${id}f)"/>
            <path d="M4 32a6 6 0 0 1 6-6h76a6 6 0 0 1 6 6" fill="none" stroke="#fff3c4" stroke-opacity=".7" stroke-width="1.2"/>
            ${badge}
        </svg>`;
    }

    window.Icons = { icon, folder };
}());
