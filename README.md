# Deluge Remote Modern (Firefox)

[![GitHub release](https://img.shields.io/github/release/TSA3000/deluge-remote-modern-firefox.svg)](https://github.com/TSA3000/deluge-remote-modern-firefox/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](MIT-LICENSE)
[![Firefox Add-ons](https://img.shields.io/badge/Firefox-Add--ons-FF7139?logo=firefox-browser&logoColor=white)](https://addons.mozilla.org/en-US/firefox/addon/deluge-remote-modern/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green.svg)](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/)

A lightweight, open-source Firefox extension to manage your [Deluge](https://deluge-torrent.org/) BitTorrent client directly from your browser. A complete modern fork of the original [Remote Deluge](https://github.com/YodaDaCoda/chrome-deluge-remote), fully rebuilt for Manifest V3 with themes, icon packs, password encryption, and vanilla JS.

> This is the Firefox port. The Chrome version is at [deluge-remote-modern](https://github.com/TSA3000/deluge-remote-modern).

---

## Features

- **Real-Time Monitoring** — View torrent status, speeds, ETA, ratio, peers and seeds at a glance
- **Full Control** — Pause, resume, recheck, re-order, label, and delete torrents without leaving your tab
- **One-Click Adding** — Send magnet links and `.torrent` URLs to Deluge via context menu or automatic link detection
- **Password Encryption** — Your Deluge password is encrypted with AES-256-GCM before being stored in sync storage
- **Multi-Theme Support** — System auto, Light, Dark (Midnight), Solarized Dark, Nord, and Dracula
- **Icon Packs** — Choose between Classic (original PNGs) or Modern (SVG glyphs that adapt to your theme)
- **Label Selector** — Change torrent labels directly from the popup (requires Deluge Label plugin)
- **Variable Refresh Rate** — Configure how often the popup polls your server (500ms – 30s)
- **Minimal Permissions** — Only `contextMenus`, `storage`, and host access. No tracking.

---

## Requirements

- Firefox 140 or newer (MV3 background scripts support)

---

## Installation

### From Firefox Add-ons *(recommended)*

Search for **Deluge Remote Modern** on [addons.mozilla.org](https://addons.mozilla.org/).

### Load Temporarily (Developer)

1. Download the latest ZIP from [Releases](https://github.com/TSA3000/deluge-remote-modern-firefox/releases)
2. Open Firefox → `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on**
4. Select the ZIP file or any file inside the unzipped folder

---

## Configuration

Click the extension icon → open **Options**:

- **Address** — Protocol, IP/hostname, port, and optional base path for reverse proxies
- **Password** — Your Deluge Web UI password (encrypted with AES-256-GCM before storage)
- **Link Handling** — Enable/disable automatic interception of `.torrent` and `magnet:` links
- **Context Menu** — Right-click any link to send it directly to Deluge
- **Theme** — System auto, Light, Dark (Midnight), Solarized Dark, Nord, Dracula
- **Icon Pack** — Classic (original PNGs) or Modern (SVG glyphs, theme-aware colors)
- **Refresh Interval** — How often the popup polls for updates (500ms – 30s)
- **Badge Timeout** — How long the Add/Fail badge shows after adding a torrent

---

## Themes

| Theme | Description |
| --- | --- |
| System (auto) | Follows your OS light/dark preference |
| Light | Original light style |
| Dark (Midnight) | Deep navy blue dark theme |
| Solarized Dark | Ethan Schoonover's classic Solarized palette |
| Nord | Arctic, north-bluish cool tones |
| Dracula | Purple and pink dark theme |

---

## Icon Packs

### Classic *(default)*
The original 16×16 PNG icons.

### Modern
SVG glyphs rendered via CSS `mask-image` with theme-aware semantic colors.

---

## Differences from Chrome Version

| Aspect | Chrome | Firefox |
| --- | --- | --- |
| `manifest.json` | `service_worker` | `background.scripts` |
| Options page | `options_page` | `options_ui` with `open_in_tab` |
| Gecko ID | not needed | `deluge-remote-modern@tsa3000` |
| Min version | Chrome 88+ | Firefox 140+ |

All JavaScript is identical — Firefox supports the `chrome.*` namespace.

---

## Version History

### v1.2.0 — Firefox 140 Minimum Version (2026-04-11)

- Raised minimum Firefox version from 128 to 140 (required for data_collection_permissions)

### v1.1.2 — innerHTML Security Fixes (2026-04-11)

- Replaced all innerHTML usage with safe DOM methods (createElement, textContent, DOMParser)
- Eliminates all AMO linting warnings for unsafe content assignment

### v1.1.0 — Test Connection Button (2026-04-11)

- Added "Test Connection" button to Options page — saves settings and verifies connectivity
- Shows clear result: connected, login failed, or server unreachable

### v1.0.0 — Firefox Port (2026-04-11)

- Initial Firefox release, ported from Chrome v2.3.1
- All features included: themes, icon packs, labels, encryption, variable refresh
- Firefox MV3 manifest with `background.scripts` and `options_ui`
- Requires Firefox 140+

---

## Credits

Fork of [chrome-deluge-remote](https://github.com/YodaDaCoda/chrome-deluge-remote) by [YodaDaCoda](https://github.com/YodaDaCoda). Licensed under [MIT](MIT-LICENSE).
