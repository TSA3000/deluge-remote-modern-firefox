# Deluge Remote Modern (Firefox) — Release Notes

---

## v1.1.0 — Test Connection Button
*2026-04-11*

### New Features

- **Test Connection button** — Added a "Test Connection" button to the Options page under Basic Setup. Saves current settings, then checks connectivity to the Deluge Web UI and displays the result: connected, login failed, or unreachable. No more guessing whether the address/password is correct.

### Files Changed

| File | Change |
|---|---|
| `options.html` | Added Test Connection button and result span after password row |
| `js/options.js` | Test handler: saves settings, sends `check_status`, shows result |
| `css/options.css` | Styling for test button and result text |
| `manifest.json` | Version bumped to `1.1.0` |
| `RELEASE_NOTES.md` | This entry |
| `README.md` | Version history updated |

---

## v1.0.0 — Firefox Port
*2026-04-11*

Initial Firefox release, ported from the Chrome version (v2.3.1).

### Features

- Real-time torrent monitoring — status, speeds, ETA, ratio, peers, seeds
- Full torrent control — pause, resume, recheck, re-order, label, delete
- One-click adding — magnet links and `.torrent` URLs via context menu or auto-detection
- AES-256-GCM password encryption
- 6 themes — System auto, Light, Dark (Midnight), Solarized Dark, Nord, Dracula
- 2 icon packs — Classic (PNG) and Modern (SVG with theme-aware colors)
- Inline label selector
- Variable refresh rate (500ms – 30s)
- Vanilla JS, no frameworks

### Firefox-Specific Changes (vs Chrome)

| Aspect | Chrome | Firefox |
|---|---|---|
| Background | `service_worker` + `type: module` | `background.scripts` |
| Options | `options_page` | `options_ui` with `open_in_tab: true` |
| Gecko settings | N/A | `gecko.id: deluge-remote-modern@tsa3000` |
| Min version | Chrome 88+ | Firefox 128+ |
