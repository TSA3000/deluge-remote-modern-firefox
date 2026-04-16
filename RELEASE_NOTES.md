# Deluge Remote Modern (Firefox) — Release Notes

---

## v1.4.0 — Performance, Search, Setup Polish & Plugin Detection
*2026-04-16*

Big release mirroring the Chrome v2.6.0 update. Rolls up 4 major areas of work: API performance overhaul, search, setup page polish, and server plugin detection.

### New Features

#### Search by Name
New search input at the top of the popup filters the torrent list in real time (150ms debounce). Press `Escape` to clear. Combines with existing State, Tracker, and Label filters.

#### Setup Page Polish
- **Live URL preview** — As you type, a preview box shows the exact endpoint URL being built (e.g. `http://192.168.1.14:8112/json`). Helps catch typos before saving.
- **Password show/hide toggle** — Eye icon next to the password field.
- **Clearer base path help** — Inline hint explains the base path field is only needed for reverse proxies, with examples.
- **HTTP warning panel** — When HTTP protocol is selected, an inline warning appears with instructions for adding a Firefox HTTPS-Only Mode exception.
- **Enhanced Test Connection feedback** — Color-coded result (green ✓ / red ✗) with specific error messages.

#### Label Plugin Detection
The extension now queries `core.get_enabled_plugins` on the first successful connection. If the Label plugin is not enabled on the Deluge server, the entire Label UI is hidden (per-row dropdowns + toolbar filter).

### Performance

#### Diff-Based Polling
Subsequent polls use `core.get_torrents_status` with `diff=true`, returning only fields that changed. For large libraries (1000+ torrents) this reduces payload by 80-95%.

#### Event-Driven Updates
Subscribes to Deluge's event system — `TorrentAddedEvent`, `TorrentRemovedEvent`, `TorrentStateChangedEvent`, `TorrentFinishedEvent`, `SessionPausedEvent`, `SessionResumedEvent` — and polls `web.get_events` every second.

#### Trimmed Request Payload
Removed 5 unused fields — about 22% less data per torrent.

### Bug Fixes

- Fixed `AbortError: signal is aborted without reason` uncaught rejection from API timeouts
- Raised API timeouts from 1500-2000ms to 5000ms

### Files Changed

| File | Change |
|---

## v1.4.1 — Pagination Dark Mode Fix
*2026-04-16*

### Bug Fixes

- **Pagination bar appeared light in dark themes** — The pagination bar and its Prev/Next buttons rendered with a light gradient background in all dark themes, including System (OS-level dark mode). The existing dark theme rules in `theme-base.css` didn't override the `background-image: linear-gradient(...)` on the pagination container, and they didn't target System theme at all (which uses `@media prefers-color-scheme` rather than a `data-theme` attribute).

### Fix

- Added explicit overrides for `[data-theme="dark"]`, `[data-theme="solarized"]`, `[data-theme="nord"]`, and `[data-theme="dracula"]` that set `background-image: none` plus the proper dark background color
- Added `@media (prefers-color-scheme: dark)` block covering `html:not([data-theme])` and `html[data-theme="system"]` so OS-level dark mode applies the same dark styling

### Files Changed

| File | Change |
|---|---|
| `css/theme-base.css` | Added pagination dark-mode rules for all themes + System |
| `manifest.json` | Version bumped to `1.4.1` |
| `RELEASE_NOTES.md` | This entry |

---

|---|
| `js/torrents.js` | Diff polling, events, trimmed KEYS, plugin detection |
| `js/popup.js` | Search filter, event polling, conditional label rendering |
| `js/deluge.js` | Silent default catch, AbortError normalization |
| `js/options.js` | URL preview, password toggle, enhanced test feedback |
| `popup.html` | Search input, `.label-filter-group` wrapper |
| `options.html` | Polished Basic Setup fieldset |
| `css/popup.css` | Search box styling |
| `css/options.css` | Field hints, URL preview, inline warning styles |
| `css/theme-base.css` | Dark theme counterparts |
| `manifest.json` | Version bumped to `1.4.0` |

---

## v1.3.0 — Pagination
*2026-04-15*

- Paginated torrent list with configurable items per page

---

## v1.2.0 — Firefox 140 Minimum Version
*2026-04-11*

- Raised `strict_min_version` to 140 (for `data_collection_permissions`)
- Added `gecko_android.strict_min_version: 142.0` for Android support

---

## v1.1.x — innerHTML Security Fixes & Test Connection
*2026-04-11*

- Replaced all `innerHTML` with safe DOM methods (createElement, textContent, DOMParser)
- Added Test Connection button

---

## v1.0.0 — Firefox Port
*2026-04-11*

- Initial Firefox release, ported from Chrome v2.3.1
