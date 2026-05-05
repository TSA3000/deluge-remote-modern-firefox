# Deluge Remote Modern (Firefox) — Release Notes

---

## v1.5.10 — Hotfix: PasswordCrypto.resolveCredential is not a function
*2026-05-05*

Hotfix for a runtime crash in v1.5.9 that broke login and Prowlarr API calls.

### Bug Fixed

- **`PasswordCrypto.resolveCredential is not a function` thrown from `js/background.js:253`** — and a second time from the login function. v1.5.9 introduced a `resolveCredential` helper in `js/crypto.js` (used by the options/popup pages) but the service worker's `js/background.js` embeds its own separate `PasswordCrypto` object that never received the new method. Two call sites in the service worker referenced it, immediately crashing on every login attempt and every Prowlarr search.

### Fix

Both call sites reverted to `PasswordCrypto.decrypt()`, which the service worker's embedded `PasswordCrypto` already implements with format auto-detection: encrypted blobs are decrypted, plaintext passes through unchanged. Same end result, no method ambiguity.

### Files Changed

| File | Change |
|---|---|
| `manifest.json` | Version bumped to `1.5.10` |
| `js/background.js` | Two `PasswordCrypto.resolveCredential(...)` calls reverted to `PasswordCrypto.decrypt(...)` (Prowlarr `call()` and `login()`); comments referencing the removed helper updated |

### Compatibility

- No storage schema changes.
- No permissions changes.
- No AMO-safety regression (`innerHTML`-free code preserved).
- Upgrades from v1.5.9 are transparent and immediate (login/Prowlarr start working again on next service worker startup).

---

## v1.5.9 — Multi-Device Credentials: Plaintext Sync with Account-Wide Toggle
*2026-05-05*

Patch release reworking how the **"Keep credentials on this device only"** checkbox (added in v1.5.7) actually behaves, so that the multi-device convenience mode genuinely works across devices without the password-prompt loop or per-device manual setup.

### What Was Wrong in 1.5.7

v1.5.7 introduced the toggle but treated both modes as encrypted: the only difference was whether the encrypted blob was *also* mirrored into `storage.sync`. Two problems:

1. **The toggle was a no-op for its stated purpose.** Mirroring the encrypted blob to sync didn't help multi-device users because the AES-GCM encryption key is per-install (lives in `storage.local`, never syncs). PC2 received PC1's ciphertext but couldn't decrypt it — same as before the toggle existed.
2. **Even if 1.5.7's "unchecked" mode had stored plaintext** (it didn't), the toggle itself was per-device — PC1 unchecking wouldn't have flipped PC2's mode, so PC2 would have ignored any plaintext arriving via sync.

### What's Fixed in 1.5.9

The two modes are now genuinely different, and the toggle is now account-wide:

- **Checked (default, more secure)** — Your Deluge password and Prowlarr API key are AES-GCM encrypted with a key unique to each device, and the encrypted blobs are kept in `storage.local` only. Credentials never leave this device.

- **Unchecked (less secure, multi-device convenience)** — Your password and API key are stored as **plain text** in `storage.sync` and shared across every device signed into the same browser account. Anyone with access to your browser account can read them.

- **The toggle itself syncs.** Storing it in `storage.sync.store_credentials_locally` means unchecking on PC1 propagates the mode change to every device on the same account. PC2 receives the toggle flip and the new plaintext credentials together, switches to plaintext mode automatically, and clears its now-stale encrypted blob from `storage.local`. No per-device manual setup needed.

> **Heads up — re-checking the toggle:** When you switch *back* from plaintext-sync to encrypted-local on any one device, that device re-encrypts the plaintext with its own per-device key, and the plaintext is wiped from sync. Other devices see the toggle flip too and switch back to encrypted mode, but they don't have an encrypted blob of their own yet — you'll need to re-enter the password once on each device after re-enabling encrypted mode. This is unavoidable: per-device keys can't decrypt each other's blobs, and re-encrypting on a device's behalf without explicit user action would defeat the security point.

The helper text under the checkbox now states the trade-off plainly and notes that the setting is account-wide.

### Storage Layout

- `storage.sync.store_credentials_locally` — toggle (account-wide as of 1.5.9)
- `storage.sync.password_plain` — plaintext password (when toggle off)
- `storage.sync.prowlarr_api_key_plain` — plaintext API key (when toggle off)
- `storage.local.password` — encrypted blob (when toggle on)
- `storage.local.prowlarr_api_key` — encrypted blob (when toggle on)
- `storage.local.encryption_key_jwk` — per-device AES-GCM key (never syncs)

The `_plain` suffix on the plaintext fields makes the storage format unambiguous from the key name alone — code can never accidentally treat plaintext as ciphertext or vice versa.

### Migration on Upgrade

- **From v1.5.7** — your existing toggle setting is preserved and moved from `storage.local` to `storage.sync`. Encrypted blobs already in `storage.local` keep working in encrypted mode. Legacy encrypted blobs in `storage.sync` get cleaned up. If your toggle was off in 1.5.7, you'll need to re-enter the password once after upgrading (the previously-synced encrypted blob is unreadable on other devices anyway).
- **From v1.5.6 or earlier** — the toggle defaults to checked (secure mode) and goes straight into `storage.sync`. Legacy encrypted blobs in `storage.sync` get copied into `storage.local` on first launch and removed from sync. The active device works seamlessly without a re-prompt; secondary devices prompt once for the password.

### Files Changed

| File | Change |
|---|---|
| `manifest.json` | Version bumped to `1.5.9` |
| `options.html` | New helper text under the toggle spells out the security trade-off and the account-wide scope |
| `js/global_options.js` | Toggle resolution prefers `storage.sync` with `storage.local` legacy fallback; onChanged maps `password_plain`/`prowlarr_api_key_plain` to runtime fields and clears stale encrypted blobs from local when toggle flips off; migration moves the toggle from local to sync |
| `js/options.js` | Save logic encrypts to `storage.local` or writes plaintext to `storage.sync` depending on toggle; toggle write goes to `syncSettings`; aggressively cleans up the unused namespace on every Apply; legacy `store_credentials_locally` in `storage.local` removed each Apply |
| `js/background.js` | `loadConfig()` resolves credentials from the active mode's namespace; `onChanged` listener applies the same routing |
| `js/crypto.js` | Header documents the account-wide-toggle, dual-format model; new `PasswordCrypto.resolveCredential(value, localOnly)` helper that returns plaintext regardless of mode so runtime code stays mode-agnostic |
| `RELEASE_NOTES.md` | This entry |
| `README.md` | Version history note |

### Compatibility

- Storage schema is forward-compatible. The `_plain` field names and the sync-located toggle are both new in 1.5.9.
- No permissions changes.
- No AMO-safety regression (`innerHTML`-free code preserved).

---

## v1.5.7 — Per-Device Credential Storage (Multi-Device Sync Fix)
*2026-04-23*

Patch release fixing a credential-sync deadlock that broke the extension on multi-device setups.

### Bug Fixes

- **Repeated password prompts when using the extension on multiple PCs sharing a Firefox account** — On a second device, the saved password field would be blank and re-entering it would cause the first device to lose its password too, in an endless loop. Root cause: the encryption key is generated per-install and stored in `storage.local` (never syncs), but the encrypted password was stored in `storage.sync` (syncs across devices). PC2 received PC1's ciphertext, couldn't decrypt it with its own key, prompted for the password, re-encrypted and synced back, which then broke PC1 — and so on. Same bug applied to the Prowlarr API key.

### New Behavior

- New per-device option in Basic Setup: **"Keep credentials on this device only"** (default: enabled). When enabled, your Deluge password and Prowlarr API key are stored encrypted in `storage.local` only. Note: in 1.5.7 the unchecked state still encrypted credentials before sending them to sync — see v1.5.8 for the redesigned plaintext-sync behavior.
- One-time migration on upgrade copies any existing `storage.sync` credentials into `storage.local`.

---

## v1.5.6 — Options Status Messages: Only Show What Actually Changed
*2026-04-21*

Patch release fixing a message-spam bug in the Options page status block.

### Bug Fixes

- **Pressing Apply after editing a single option announced every setting as "updated"** — The Options status block showed "Address protocol updated.", "Address IP updated.", "Torrents per page set to 20.", "Prowlarr integration disabled!", etc. on every Apply, even when only one field had been edited. Root cause: `saveOptions()` writes the full settings object on every Apply (necessary so defaults get persisted on first save), and Firefox's `storage.sync` fires `onChanged` for every key included in the `set()` call — including keys whose value didn't actually change (`oldValue === newValue`). Fixed by skipping same-value entries at the top of the `storage.onChanged` listener, so only keys whose value genuinely changed emit a message. First-save-after-install still shows every message (old values were undefined, which correctly differs from the new values); subsequent Applies only show messages for the fields you actually touched, and an Apply with no changes is silent.

### Files Changed

| File | Change |
|---|---|
| `manifest.json` | Version bumped to `1.5.6` |
| `js/options.js` | `storage.onChanged` listener skips entries where `storageChange.oldValue === storageChange.newValue` before running through the message switch |

### Compatibility

- No storage schema changes.
- No permissions changes.
- No AMO-safety impact (`innerHTML`-free code preserved).
- All persisted settings are primitives (string / number / boolean), so strict equality is type-safe.
- Upgrades from v1.5.5 are transparent.

---

## v1.5.5 — Pagination Visibility & Prowlarr Options Polish
*2026-04-21*

Patch release fixing two follow-up bugs from v1.5.4.

### Bug Fixes

- **Pagination bar never appeared in the popup, regardless of settings** — Even with both "Show per-page selector in popup" and "Always show pagination bar" enabled, the bar stayed hidden. Turned out to be a latent CSS/JS mismatch that v1.5.4's `renderTable()` fix couldn't help with: `#pagination` in `css/popup.css` had `display: none` as its base rule, but `updatePaginationControls()` reveals the bar by setting `paginationDiv.style.display = ""` (clearing the inline style so the CSS default takes over). The CSS default was `none`, so "reveal" effectively meant "hide". Fixed by changing the `#pagination` base rule to `display: flex`, which matches the `align-items` / `justify-content` / `gap` the rule already carries.
- **Options page announced "Prowlarr address updated." and "Prowlarr result limit set to N." while the integration was disabled** — Every Apply writes the full Prowlarr sub-setting block even when the top-level toggle is off, so disabling Prowlarr produced a confusing chain of status messages ("Prowlarr integration disabled!" immediately followed by "Prowlarr address updated.", "Prowlarr result limit set to 100."). Fixed by gating the sub-setting status messages (`prowlarr_protocol` / `prowlarr_ip` / `prowlarr_port` / `prowlarr_base` / `prowlarr_api_key` / `prowlarr_results_limit`) on the `prowlarr_enabled` checkbox being checked. The top-level toggle message still fires in both directions.

### Files Changed

| File | Change |
|---|---|
| `manifest.json` | Version bumped to `1.5.5` |
| `css/popup.css` | `#pagination` base rule changed from `display: none` to `display: flex` so the JS `style.display = ""` reveal works as intended |
| `js/options.js` | `storage.onChanged` listener reads `prowlarr_enabled.checked` once per batch into a `prowlarrOn` flag and gates the Prowlarr sub-setting status messages on it |

### Compatibility

- No storage schema changes.
- No permissions changes.
- No AMO-safety impact (`innerHTML`-free code preserved).
- Upgrades from v1.5.4 are transparent.

---

## v1.5.4 — Pagination Settings Init Fix
*2026-04-21*

Patch release fixing a cold-start bug in the v1.5.3 pagination UX features.

### Bug Fixes

- **"Show per-page selector in popup" and "Always show pagination bar" didn't take effect when the popup first opened** — The settings saved correctly and toggled immediately when changed from Options, but on a fresh popup open the pagination bar would hide (or fail to show the dropdown) even with both checkboxes enabled. Root cause was that the popup's initial render happened before `ExtensionConfig` had finished loading from `storage.sync`. On the async `ExtensionConfigReady` event, the old code re-synced the dropdown's visibility but never called `renderTable()` again — so `updatePaginationControls()` never re-ran with the real settings. Fixed by also calling `renderTable()` when `ExtensionConfigReady` fires, which causes the pagination bar to re-evaluate itself with the correct settings.

### Files Changed

| File | Change |
|---|---|
| `manifest.json` | Version bumped to `1.5.4` |
| `js/popup.js` | The pagination IIFE's `ExtensionConfigReady` listener now calls both `syncPerPagePopupUI()` and `renderTable()` so `updatePaginationControls()` sees the real `show_per_page_in_popup` / `always_show_pagination` values once storage has loaded |

### Compatibility

- No storage schema changes.
- No permissions changes.
- No AMO-safety impact (`innerHTML`-free code preserved).
- Upgrades from v1.5.3 are transparent.

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
