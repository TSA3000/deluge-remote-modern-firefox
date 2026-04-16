# Deluge Remote Modern (Firefox)

A Firefox add-on for managing a remote Deluge torrent server from your browser toolbar. Ported from the [Chrome version](https://github.com/TSA3000/deluge-remote-modern), which itself is a modernized fork of [YodaDaCoda/chrome-deluge-remote](https://github.com/YodaDaCoda/chrome-deluge-remote).

**AMO listing:** <https://addons.mozilla.org/firefox/addon/deluge-remote-modern/>
**Repo:** <https://github.com/TSA3000/deluge-remote-modern-firefox>

## Features

- **Full Deluge control** — Pause/resume, queue up/down, recheck, delete (with or without data), toggle auto-managed, set labels
- **Add torrents** — From the popup (URL/magnet), right-click links, or `.torrent` file downloads
- **Search by name** — Real-time filter box (150ms debounce, Esc to clear)
- **Filters** — State, Tracker, Label (hidden when Label plugin disabled)
- **Pagination** — Configurable torrents per page (10, 20, 50, 100, or all)
- **Dark Mode & Themes** — Light, Dark (Midnight), Solarized Dark, Nord, Dracula, or System (auto)
- **Icon Packs** — Classic (PNG) or Modern (SVG glyphs)
- **Test Connection** — Verify setup before saving
- **Variable Refresh Rate** — Configure how often the popup polls (500ms – 30s)
- **Password encryption at rest** — Uses Web Crypto API (AES-GCM)
- **Firefox Android support** — `strict_min_version: 142.0` on Android

## Performance

- **Diff-based polling** — 80-95% less data for large libraries
- **Event-driven updates** — Near-instant add/remove via Deluge's event system
- **Trimmed payload** — Only requests fields the UI uses
- **Plugin detection** — Hides UI for plugins not enabled on the server

## Version History

### 2026-04-16 v1.4.0 — Performance, Search, Setup Polish & Plugin Detection
- Search by name, diff polling, events, trimmed fields
- Live URL preview, password toggle, HTTP warning, better Test Connection
- Label plugin detection
- AbortError bugfix, timeouts raised to 5s

### 2026-04-15 v1.3.0 — Pagination

### 2026-04-11 v1.2.0 — Firefox 140 Minimum Version

### 2026-04-11 v1.1.x — innerHTML Security Fixes & Test Connection

### 2026-04-11 v1.0.0 — Firefox Port

For full history, see `RELEASE_NOTES.md`.

## Installation

### From AMO (recommended)

Install from the [Mozilla Add-ons listing](https://addons.mozilla.org/firefox/addon/deluge-remote-modern/).

### From source

1. Clone this repo
2. Firefox → `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → select `manifest.json`

Note: Firefox requires `strict_min_version: 140.0` on Desktop and `gecko_android.strict_min_version: 142.0` on Android (both needed for `data_collection_permissions`).

## Setup

1. Click the extension icon → gear icon, or `about:addons` → Deluge Remote Modern → Preferences
2. Fill in your Deluge protocol (http/https), IP/hostname, port (default 8112), and password
3. Leave the "Base path" field empty unless you use a reverse proxy
4. Click **Test Connection** to verify
5. Save

### HTTPS-Only Mode

If you use HTTP to connect to Deluge, Firefox's HTTPS-Only Mode will block the request. Add an exception in `about:preferences#privacy` → HTTPS-Only Mode → Manage Exceptions → add your Deluge host.

## Privacy

See [`PRIVACY.md`](PRIVACY.md). Short version: nothing leaves your browser except API calls to your Deluge server.

## License

MIT — see [`MIT-LICENSE`](MIT-LICENSE).
