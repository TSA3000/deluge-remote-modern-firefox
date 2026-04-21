# Deluge Remote Modern (Firefox) — Release Notes

---

## v1.5.2 — Bug Fixes
*2026-04-21*

Patch release addressing two issues surfaced during testing. Strictly bug fixes — no new features.

### Bug Fixes

- **Torrent size display showing "0.0 KiB of 0.0 KiB"** — Some torrents (particularly magnet links with resolved metadata, or torrents with some files deselected) displayed zero sizes in the row even though progress, ETA, speeds, and peer counts were all correct. Root cause was that the extension was calculating downloaded bytes as `total_size × progress / 100`, which fails when Deluge reports `total_size` as 0 in those edge cases. Fixed by fetching Deluge's authoritative `total_done` and `total_wanted` fields and preferring them over the derived calculation. This matches what Deluge's native Web UI shows for the same torrents.

- **HTTP 400 when searching multiple Prowlarr indexers** — Selecting two or more indexers in the Prowlarr search dropdown caused every search to fail with `HTTP 400 from Prowlarr`. Single-indexer searches worked fine. Root cause was that the extension was sending `?indexerIds=1,2,3` (one comma-joined parameter), but Prowlarr's `/api/v1/search` endpoint requires `?indexerIds=1&indexerIds=2&indexerIds=3` (repeated parameters). Same bug affected the category filter. Fixed in two places: `prowlarr.js` now passes arrays through to the background worker, and `background.js buildUrl()` now expands array values into repeated query parameters.

### Files Changed

| File | Change |
|---|---|
| `manifest.json` | Version bumped to `1.5.2` |
| `js/torrent.js` | `Torrent` constructor captures `total_done` and `total_wanted`; `getHumanSize()` prefers `total_wanted` over `total_size`; `getHumanDownloadedSize()` prefers authoritative `total_done` over derived calculation |
| `js/torrents.js` | `KEYS` list includes `total_done` and `total_wanted`; `applyDiff()` merges them |
| `js/prowlarr.js` | `Prowlarr.search()` passes `indexerIds` and `categories` as arrays instead of joining with commas |
| `js/background.js` | `buildUrl()` expands array values into repeated query parameters (`key=a&key=b`) |

### Compatibility

- All DOM construction remains AMO-safe (no `innerHTML` anywhere in the code).
- No change to minimum Firefox version (`140.0` desktop, `142.0` Android).
- No new permissions requested.
- No storage schema changes — upgrades from v1.5.1 are transparent.

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

### New Features

#### Prowlarr Search Integration
Full Prowlarr indexer search from the popup — no need to leave the extension.

- **Tabbed popup** — New tab navigation: Torrents | Search Indexers | History. Tabs only appear when Prowlarr is enabled in Options.
- **Search indexers** — Enter a query, select category and indexers, get results with name, size, seeders, leechers, and age. Click to grab a release — Prowlarr forwards it to your configured download client.
- **Indexer multi-select** — Choose which indexers to search or leave blank for all. Indexer list fetched from Prowlarr API with retry on tab activation.
- **Sortable results** — Click column headers to sort by name, size, seeders, leechers, or age.
- **Search history** — Last 50 searches persisted in `storage.local` with a dedicated History tab.
- **Encrypted API key** — Prowlarr API key stored with the same AES-GCM encryption as the Deluge password.
- **Prowlarr options** — Full setup in Options page: protocol, host, port, base path, API key (with show/hide toggle), results limit, live URL preview.

#### Optimistic Torrent Deletion
- When you delete a torrent, the row fades out and disappears immediately instead of waiting for the next poll to confirm the removal. If the server rejects the delete, the next forced full update restores the row.

#### Auto-Reconnect to Daemon
- When Deluge's daemon is offline (e.g. after a server restart), the extension now automatically attempts to reconnect through the Web UI's host list. Previously required a manual Deluge Web UI intervention.

---

*For earlier releases (v1.0.0 – v1.4.2), see git history or earlier revisions of this file.*
