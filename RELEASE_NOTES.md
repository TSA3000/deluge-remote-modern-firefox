# Deluge Remote Modern (Firefox) — Release Notes

---

## v1.5.3 — Pagination UX & Remember Indexer Selection
*2026-04-21*

Adds two quality-of-life features built directly on top of v1.5.2's stable base. No permissions changes, no storage migrations — upgrades from v1.5.2 are transparent.

### New Features

#### Per-Page Selector in the Popup
A dropdown to change "torrents per page" without opening Options.

- New dropdown in the popup pagination bar (Prev / Page / Next / **5 / 10 / 20 / 50 / 100 / All**).
- Default: the dropdown is hidden, preserving the classic popup layout. Enable it in Options with the new **"Show per-page selector in popup"** checkbox.
- Added "5" as a new per-page option alongside the existing 10/20/50/100/All — useful when the popup is on a small screen or you only want the top few items visible.
- Selection persists via `storage.sync` and stays in sync across open popups, Options pages, and devices (if Firefox Sync is enabled).

#### Always Show Pagination Bar
New Options checkbox **"Always show pagination bar"** (default off). When enabled, the pagination bar stays visible even when all torrents fit on a single page. Useful for users who enabled the per-page dropdown and want consistent access to it.

#### Remember Selected Indexers (Prowlarr)
The indexer multi-select on the Search Indexers tab now persists your selection across popup close/reopen.

- Previously the indexer dropdown reset to "All indexers" each time the popup opened — annoying if you always searched specific indexers (e.g. only private trackers).
- Selected indexer IDs are saved to `storage.sync` (new key: `prowlarr_selected_indexers`, defaults to `[]` meaning "all").
- When `loadIndexers()` refreshes the list from Prowlarr, the restored selection is validated against the fresh indexer list. IDs that no longer exist (indexer removed in Prowlarr) are silently pruned; if all saved IDs are invalid, falls back to "All indexers".
- Cross-popup sync — if you change the selection in one open popup, any other popup updates in real time via `storage.onChanged`.

### Internal Improvements

- **`background.js` section banners** — Added a table of contents and seven `╔══╗`-style region banners to the 600+ line background script. Purely cosmetic; enables editor code-folding and makes navigation faster. No functional change.

### Files Changed

| File | Change |
|---|---|
| `manifest.json` | Version bumped to `1.5.3` |
| `popup.html` | Added `#per_page_popup` `<select>` inside the pagination bar (hidden by default) |
| `options.html` | Added `"5"` to the `torrents_per_page` `<select>`; new `show_per_page_in_popup` + `always_show_pagination` checkboxes |
| `js/popup.js` | New `syncPerPagePopupUI()`; reworked `updatePaginationControls()` to honor the two new settings and keep the bar visible when the dropdown or always-show option is enabled; pagination IIFE now wires the dropdown's `change` event and responds to `storage.onChanged` for live updates |
| `js/options.js` | Saves the two new checkbox values; added status-message cases for `torrents_per_page`, `show_per_page_in_popup`, `always_show_pagination` |
| `js/background.js` | Added defaults `show_per_page_in_popup: false`, `always_show_pagination: false`, `prowlarr_selected_indexers: []`; added table of contents + section banners |
| `js/global_options.js` | Matching defaults added (keeps popup context and background script in sync) |
| `js/prowlarr_search.js` | New `saveSelectedIndexers()` / `reconcileSelectedIndexersWithList()` helpers; `pub.init` restores `selectedIndexers` from `ExtensionConfig`; `loadIndexers()` success reconciles the restored list against the fresh indexer list; indexer checkbox `change` + "All" toggle handlers now call `saveSelectedIndexers()`; `storage.onChanged` listener syncs selection across popups/devices |
| `css/popup.css` | Styling for `#per_page_popup` matching the pagination buttons |

### AMO Compliance

All changes preserve v1.5.1/v1.5.2's zero-`innerHTML` DOM construction. No new dynamic HTML strings were introduced. All new elements use `createElement` / `textContent` / `appendChild` where they're generated at runtime.

---

## v1.5.2 — Bug Fixes
*2026-04-21*

Patch release addressing two issues surfaced during testing. Strictly bug fixes — no new features.

### Bug Fixes

- **Torrent size display showing "0.0 KiB of 0.0 KiB"** — Some torrents (particularly magnet links with resolved metadata, or torrents with some files deselected) displayed zero sizes in the row even though progress, ETA, speeds, and peer counts were all correct. Root cause was that the extension was calculating downloaded bytes as `total_size × progress / 100`, which fails when Deluge reports `total_size` as 0 in those edge cases. Fixed by fetching Deluge's authoritative `total_done` and `total_wanted` fields and preferring them over the derived calculation. This matches what Deluge's native Web UI shows for the same torrents.

- **HTTP 400 when searching multiple Prowlarr indexers** — Selecting two or more indexers in the Prowlarr search dropdown caused every search to fail with `HTTP 400 from Prowlarr`. Single-indexer searches worked fine. Root cause was that the extension was sending `?indexerIds=1,2,3` (one comma-joined parameter), but Prowlarr's `/api/v1/search` endpoint requires `?indexerIds=1&indexerIds=2&indexerIds=3` (repeated parameters). Same bug affected the category filter. Fixed in two places: `prowlarr.js` now passes arrays through to the background worker, and `background.js buildUrl()` now expands array values into repeated query parameters.

---

## v1.5.1 — Prowlarr Search Table Fix
*2026-04-18*

### Bug Fixes

- **Prowlarr search results collapsed into the Title cell** — In v1.5.0, all row data (Indexer, Size, Age, S/L) rendered inside the first `.p_col_title` cell instead of separate columns. Root cause was the DOMParser-based row builder: when parsing an HTML string containing `<tr>` elements inside a `<div>` wrapper, the browser's HTML parser hoists the `<tr>` out (it's not a valid child of `<div>`), collapsing the whole row. Fixed by rewriting `buildRow()` to return a real `HTMLTableRowElement` built with `createElement`/`appendChild` — no HTML string parsing at all. This is also AMO's recommended pattern for dynamic DOM construction.

---

## v1.5.0 — Prowlarr Integration & Optimistic Delete
*2026-04-18*

### New Features

#### Prowlarr Search Integration
Full Prowlarr indexer search from the popup — no need to leave the extension.

- **Tabbed popup** — New tab navigation: Torrents | Search Indexers | History. Tabs only appear when Prowlarr is enabled in Options.
- **Search indexers** — Enter a query, select category and indexers, get results with name, size, seeders, leechers, and age. Click to grab a release — Prowlarr forwards it to your configured download client.
- **Indexer multi-select** — Choose which indexers to search or leave blank for all.
- **Sortable results** — Click column headers to sort by name, size, seeders, leechers, or age.
- **Search history** — Last 50 searches persisted in `storage.local` with a dedicated History tab.
- **Encrypted API key** — Prowlarr API key stored with the same AES-GCM encryption as the Deluge password.

#### Optimistic Torrent Deletion
- When you delete a torrent, the row fades out and disappears immediately instead of waiting for the next poll to confirm the removal. If the server rejects the delete, the next forced full update restores the row.

#### Auto-Reconnect to Daemon
- When Deluge's daemon is offline (e.g. after a server restart), the extension now automatically attempts to reconnect through the Web UI's host list. Previously required a manual Deluge Web UI intervention.

---

*For earlier releases (v1.0.0 – v1.4.2), see git history or earlier revisions of this file.*
