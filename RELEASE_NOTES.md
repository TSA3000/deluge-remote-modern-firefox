# Deluge Remote Modern (Firefox) — Release Notes

---

## v1.0.0 — Firefox Port
*2026-04-11*

Initial Firefox release, ported from the Chrome version (v2.3.1).

### Features

- **Real-time torrent monitoring** — status, speeds, ETA, ratio, peers, seeds
- **Full torrent control** — pause, resume, recheck, re-order, label, delete
- **One-click adding** — magnet links and `.torrent` URLs via context menu or auto-detection
- **AES-256-GCM password encryption** — password encrypted before storage
- **6 themes** — System auto, Light, Dark (Midnight), Solarized Dark, Nord, Dracula
- **2 icon packs** — Classic (PNG) and Modern (SVG with theme-aware colors)
- **Inline label selector** — change torrent labels from the popup
- **Variable refresh rate** — 500ms to 30s polling interval
- **Vanilla JS** — no jQuery, no frameworks

### Firefox-Specific Changes (vs Chrome)

| Aspect | Chrome | Firefox |
|---|---|---|
| Background | `service_worker` + `type: module` | `background.scripts` |
| Options | `options_page` | `options_ui` with `open_in_tab: true` |
| Gecko settings | N/A | `gecko.id: deluge-remote-modern@tsa3000` |
| Min version | Chrome 88+ | Firefox 128+ |
| Description | "from Chrome" | "from Firefox" |

All JavaScript unchanged — Firefox supports the `chrome.*` namespace natively.
