# Deluge Remote Modern (Firefox)

A Firefox add-on for managing a remote Deluge torrent server from your browser toolbar. Ported from the [Chrome version](https://github.com/TSA3000/deluge-remote-modern), which itself is a modernized fork of [YodaDaCoda/chrome-deluge-remote](https://github.com/YodaDaCoda/chrome-deluge-remote).

**AMO listing:** <https://addons.mozilla.org/firefox/addon/deluge-remote-modern/>
**Repo:** <https://github.com/TSA3000/deluge-remote-modern-firefox>

## Features

- **Full Deluge control** — Pause/resume, queue up/down, recheck, delete (with or without data), toggle auto-managed, set labels
- **Add torrents** — From the popup (URL/magnet), right-click links, or `.torrent` file downloads
- **Prowlarr integration** — Search private and public indexers directly from the popup, grab releases to your download client, search history
- **Search by name** — Real-time filter box (150ms debounce, Esc to clear)
- **Filters** — State, Tracker, Label
- **Pagination** — Configurable torrents per page (10, 20, 50, 100, or all)
- **Dark Mode & Themes** — Light, Dark (Midnight), Solarized Dark, Nord, Dracula, or System (auto)
- **Icon Packs** — Classic (PNG) or Modern (SVG glyphs)
- **Test Connection** — Verify setup before saving
- **Auto-reconnect** — Automatically reconnects to daemon after restarts
- **Variable Refresh Rate** — Configure how often the popup polls (500ms – 30s)
- **Password encryption at rest** — Uses Web Crypto API (AES-GCM)
- **Firefox Android support** — `strict_min_version: 142.0` on Android

## Performance

- **Diff-based polling** — 80-95% less data for large libraries
- **Event-driven updates** — Near-instant add/remove via Deluge's event system
- **Optimistic delete** — Torrents disappear instantly on delete, reconciled on next full update
- **Trimmed payload** — Only requests fields the UI uses

## AMO Compliance

All DOM manipulation uses safe methods (`createElement`, `textContent`, `appendChild`) instead of `innerHTML`, satisfying Mozilla's stricter add-on review requirements. Dynamic content like search result rows and history entries are built as real DOM nodes and appended via `DocumentFragment` — no HTML string parsing, no validator warnings.

## Version History

### 2026-04-18 v1.5.1 — Prowlarr Search Table Fix
- Fixed Prowlarr search result rows collapsing into the Title cell
- `buildRow()` now returns a real `<tr>` built with `createElement`
- No more DOMParser-based row construction (was hoisting table rows out of their wrapper)

### 2026-04-18 v1.5.0 — Prowlarr Integration & Optimistic Delete
- Full Prowlarr search from the popup — tabbed UI (Torrents / Search Indexers / History)
- Indexer multi-select, sortable results, one-click grab
- Search history (last 50 queries persisted)
- Encrypted Prowlarr API key (same AES-GCM as Deluge password)
- Optimistic torrent deletion — instant row removal with server reconciliation
- Auto-reconnect to daemon after WebUI disconnects
- All Prowlarr UI uses AMO-safe DOM methods (no innerHTML)

### 2026-04-16 v1.4.2 — AMO Validator Fix
- Replaced `innerHTML` in `options.js` status message handler

### 2026-04-16 v1.4.1 — Pagination Dark Mode Fix
- Fixed pagination bar appearing light in dark themes (including System/OS dark mode)

### 2026-04-16 v1.4.0 — Performance, Search, Setup Polish
- Search by name, diff polling, events, trimmed fields
- Live URL preview, password toggle, HTTP warning, better Test Connection feedback
- AbortError bugfix, timeouts raised to 5s

### 2026-04-15 v1.3.0 — Pagination
- Paginated torrent list with configurable items per page

### 2026-04-11 v1.2.0 — Firefox 140 Minimum Version
- Raised `strict_min_version` to 140
- Added `gecko_android.strict_min_version: 142.0` for Android support

### 2026-04-11 v1.1.x — innerHTML Security Fixes & Test Connection
- Replaced all `innerHTML` with safe DOM methods
- Added Test Connection button

### 2026-04-11 v1.0.0 — Firefox Port
- Initial Firefox release, ported from Chrome v2.3.1

For full history, see `RELEASE_NOTES.md`.

## Installation

### From AMO (recommended)

Install from the [Mozilla Add-ons listing](https://addons.mozilla.org/firefox/addon/deluge-remote-modern/).

### From source

1. Clone this repo
2. Firefox → `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → select `manifest.json`

Firefox requires `strict_min_version: 140.0` on Desktop and `gecko_android.strict_min_version: 142.0` on Android (both needed for `data_collection_permissions`).

## Setup

### Deluge

1. Click the extension icon → gear icon, or `about:addons` → Deluge Remote Modern → Preferences
2. Fill in your Deluge protocol (http/https), IP/hostname, port (default 8112), and password
3. Leave the "Base path" field empty unless you use a reverse proxy
4. Click **Test Connection** to verify
5. Save

### Prowlarr (optional)

1. In Options, check **Enable Prowlarr** under Extras
2. Fill in your Prowlarr protocol, IP/hostname, port (default 9696), and API key
3. The API key can be found in Prowlarr → Settings → General → Security
4. Save — the popup will now show Torrents / Search Indexers / History tabs

### HTTPS-Only Mode

If you use HTTP to connect to Deluge or Prowlarr, Firefox's HTTPS-Only Mode will block the request. Add an exception in `about:preferences#privacy` → HTTPS-Only Mode → Manage Exceptions → add your host.

## Privacy

See [`PRIVACY.md`](PRIVACY.md). Short version: nothing leaves your browser except API calls to your Deluge server and (if enabled) your Prowlarr server. No telemetry, no ads, no external services.

## License

MIT — see [`MIT-LICENSE`](MIT-LICENSE).

## Credits

- Original extension: [YodaDaCoda](https://github.com/YodaDaCoda/chrome-deluge-remote)
- Modernization, theming, pagination, search, performance, Prowlarr integration: Project fork maintainers
- Community feedback from the Deluge forums (ambipro and others)
- Prowlarr API patterns inspired by [cross-seed](https://github.com/cross-seed/cross-seed)