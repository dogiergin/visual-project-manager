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
        gear: '<circle cx="8" cy="8" r="2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>'
    };

    function icon(name) {
        return '<svg class="icon" aria-hidden="true" focusable="false" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
            'stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">' + paths[name] + '</svg>';
    }

    window.Icons = { icon };
}());
