# Deluge Remote Modern (Firefox) — Release Notes

---

## v1.5.1 — Prowlarr Search Table Fix
*2026-04-18*

### Bug Fixes

- **Prowlarr search results collapsed into the Title cell** — In v1.5.0, all row data (Indexer, Size, Age, S/L) rendered inside the first `.p_col_title` cell instead of separate columns. Root cause was the DOMParser-based row builder: when parsing an HTML string containing `<tr>` elements inside a `<div>` wrapper, the browser's HTML parser hoists the `<tr>` out (it's not a valid child of `<div>`), collapsing the whole row. Fixed by rewriting `buildRow()` to return a real `HTMLTableRowElement` built with `createElement`/`appendChild` — no HTML string parsing at all. This is also AMO's recommended pattern for dynamic DOM construction.

### Files Changed

| File | Change |
|---|---|
| `js/prowlarr_search.js` | `buildRow()` returns a real `<tr>` built with `createElement`; `renderResults()` uses `DocumentFragment` + `appendChild`; history list and indexer multi-select also converted; removed unused `replaceChildrenHTML()` / `htmlToNodes()` helpers |
| `manifest.json` | Version bumped to `1.5.1` |

---

## v1.5.0 — Prowlarr Integration & Optimistic Delete
*2026-04-18*

Mirrors the Chrome v2.8.0 release. Rolls up auto-reconnect, Prowlarr indexer search, and optimistic torrent deletion.

### New Features

#### Prowlarr Search Integration
Full Prowlarr indexer search from the popup — no need to leave the extension.

- **Tabbed popup** — New tab navigation: Torrents | Search Indexers | History. Tabs only appear when Prowlarr is enabled in Options.
- **Search indexers** — Enter a query, select category and indexers, get results with name, size, seeders, leechers, and age. Click to grab a release — Prowlarr forwards it to your configured download client.
- **Indexer multi-select** — Choose which indexers to search or leave blank for all. Indexer list fetched from Prowlarr API with retry on tab activation.
- **Sortable results** — Click column headers to sort by name, size, seeders, leechers, or age.
- **Search history** — Last 50 searches persisted in `chrome.storage.local` with a dedicated History tab.
- **Encrypted API key** — Prowlarr API key stored with the same AES-GCM encryption as the Deluge password.
- **Prowlarr options** — Full setup in Options page: protocol, host, port, base path, API key (with show/hide toggle), results limit, live URL preview.

#### Optimistic Torrent Deletion
- When you delete a torrent, the row fades out and disappears immediately instead of waiting for the next poll to confirm the removal. If the server rejects the delete, the next forced full update restores the row.
- New `Torrents.removeById()` method drops a torrent from local state
- New `Torrents.forceFullUpdateNext()` forces next poll to be a full refresh

#### Auto-Reconnect to Daemon
- When the WebUI loses its connection to the Deluge daemon (restart, network interruption), the extension now fetches the host list and reconnects automatically

### AMO Compliance

All `innerHTML` usage replaced with safe DOM methods (`createElement`, `textContent`, `appendChild`). Firefox AMO validator enforces this strictly — Chrome's `innerHTML` approach won't pass Mozilla review.

### Technical Details

- `ProwlarrAPI` in background.js — mirrors `DelugeAPI` pattern with endpoint builder, fetch wrapper, AbortController support, and `waitForConfig()` cold-start guard
- `Prowlarr` module (`js/prowlarr.js`) — popup-side API client, proxies all calls through the background service
- `ProwlarrSearch` module (`js/prowlarr_search.js`) — handles search tab UI, indexer loading, result rendering, history management
- `currentProwlarrSearchController` — allows cancelling in-flight searches from the popup
- `_configReady` promise in `background.js` — prevents Prowlarr calls firing before `loadConfig()` completes during cold start

### Files Changed

| File | Change |
|---|---|
| `js/prowlarr.js` | New — Prowlarr API client module |
| `js/prowlarr_search.js` | New — Search/History tab controller (DOM-safe for AMO) |
| `css/prowlarr.css` | New — Tab navigation + search UI styling |
| `js/background.js` | Added `ProwlarrAPI`, `_configReady` promise, Prowlarr message handlers, `connectToDaemon()` |
| `js/popup.js` | Tab switching, Prowlarr visibility, optimistic delete with `removeById()`, innerHTML replaced with DOM-safe methods |
| `js/torrents.js` | Added `removeById()`, `forceFullUpdateNext()` |
| `js/options.js` | Prowlarr setup section, API key encryption, URL preview, innerHTML replaced with `createElement`/`appendChild` |
| `js/global_options.js` | Prowlarr defaults (protocol, ip, port, base, api_key, results_limit) |
| `popup.html` | Tab nav, search/history tab panels, Prowlarr script includes |
| `options.html` | Prowlarr fieldset with all config fields |
| `manifest.json` | Version bumped to `1.5.0` |

---

## v1.4.2 — AMO Validator Fix
*2026-04-16*

- Replaced `innerHTML` in `options.js` status message handler with safe DOM construction

---

## v1.4.1 — Pagination Dark Mode Fix
*2026-04-16*

- Fixed pagination bar appearing light in dark themes (including System/OS dark mode)

---

## v1.4.0 — Performance, Search, Setup Polish & Plugin Detection
*2026-04-16*

- Search by name, diff polling, events, trimmed fields
- Live URL preview, password toggle, HTTP warning, better Test Connection feedback
- AbortError bugfix, timeouts raised to 5s

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

- Replaced all `innerHTML` with safe DOM methods
- Added Test Connection button

---

## v1.0.0 — Firefox Port
*2026-04-11*

- Initial Firefox release, ported from Chrome v2.3.1