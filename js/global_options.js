var ExtensionConfig = {
	address_protocol: "https",
	address_ip: "",
	address_port: "",
	address_base: "",
	password: "",
	handle_magnets: true,
	handle_torrents: true,
	context_menu: false,
	badge_timeout: 250,
	refresh_interval: 3000,
	debug_mode: false,
	dark_mode: "system",
	icon_pack: "classic",
	torrents_per_page: 0,
	show_per_page_in_popup: false,
	always_show_pagination: false,

	// Per-device flag: when true, credentials live in storage.local only and
	// don't sync. Default true (recommended) — see the multi-device note in
	// options.html. Stored in storage.local, never in storage.sync.
	store_credentials_locally: true,

	// ── Prowlarr integration ──────────────────────────────────────────
	prowlarr_enabled:       false,
	prowlarr_protocol:      "http",
	prowlarr_ip:            "",
	prowlarr_port:          "9696",
	prowlarr_base:          "",
	prowlarr_api_key:       "",
	prowlarr_results_limit: 100,
	prowlarr_selected_indexers: []
};

// Storage namespace overview (see options.html "Keep credentials on this
// device only" toggle and crypto.js header for the full picture):
//
//   storage.sync (account-wide — syncs to all devices)
//     • all non-credential settings
//     • store_credentials_locally  : the toggle itself (1.5.9+: account-wide)
//     • password_plain             : PLAINTEXT password (when toggle OFF)
//     • prowlarr_api_key_plain     : PLAINTEXT API key (when toggle OFF)
//
//   storage.local (per-device, never syncs)
//     • password                   : encrypted blob (when toggle ON)
//     • prowlarr_api_key           : encrypted blob (when toggle ON)
//     • encryption_key_jwk         : per-device AES-GCM key (managed by crypto.js)
//
// Field name encodes format: `_plain` suffix = plaintext, no suffix on
// credentials = encrypted. This makes accidental decrypt-of-plaintext
// (or display-of-ciphertext) impossible from the key name alone.
//
// Routing rules:
//   • Encrypted credentials are valid only on the device whose local key
//     produced them. They never sync.
//   • Plaintext credentials are valid on every device. When they arrive via
//     storage.sync, they are authoritative — the toggle has been turned off
//     somewhere on this account.

chrome.storage.onChanged.addListener(function (changes, namespace) {
	for (var key in changes) {
		// Map plaintext sync field names to the unified runtime field names.
		// runtime ExtensionConfig.password is plaintext when toggle is off,
		// ciphertext when toggle is on; PasswordCrypto.decrypt() in
		// background.js handles both formats transparently (see crypto.js
		// header for the full picture).
		var runtimeKey = key;
		if (key === "password_plain") runtimeKey = "password";
		if (key === "prowlarr_api_key_plain") runtimeKey = "prowlarr_api_key";

		// Encrypted blobs in storage.sync (legacy from <1.5.8) are never read
		// by the runtime — they're cleaned up by the migration block in the
		// load callback. Drop them silently if they appear via onChanged.
		if (namespace === "sync" && (key === "password" || key === "prowlarr_api_key")) {
			continue;
		}

		ExtensionConfig[runtimeKey] = changes[key].newValue;

		if (key === "context_menu") {
			chrome.runtime.sendMessage({ method: "context_menu", enabled: changes[key].newValue }).catch(function () { });
		}
		if (key === "dark_mode") {
			applyDarkMode(changes[key].newValue);
		}
		if (key === "icon_pack") {
			applyIconPack(changes[key].newValue);
		}

		// When the toggle flips OFF (synced from another device), the
		// encrypted blob in storage.local becomes stale — clear it so the
		// runtime doesn't accidentally try to decrypt it as a fallback.
		// When the toggle flips ON, the plaintext in storage.sync becomes
		// stale on this device's view, but we leave sync cleanup to whoever
		// flipped the toggle (i.e. options.js doSave handles it).
		if (key === "store_credentials_locally" && changes[key].newValue === false) {
			chrome.storage.local.remove(["password", "prowlarr_api_key"]);
		}
	}
});

chrome.storage.local.get(null, function (localItems) {
	localItems = localItems || {};
	chrome.storage.sync.get(null, function (syncItems) {
		syncItems = syncItems || {};

		// Apply non-credential settings from sync (skip credential fields —
		// those have their own format-aware decode below).
		for (var k in syncItems) {
			if (k === "password" || k === "prowlarr_api_key" ||
				k === "password_plain" || k === "prowlarr_api_key_plain") continue;
			ExtensionConfig[k] = syncItems[k];
		}

		// Resolve the toggle. As of 1.5.9 it lives in storage.sync. For users
		// upgrading from 1.5.7/1.5.8 it may still be in storage.local — fall
		// back to that, then the migration block below moves it to sync.
		var localMode;
		if (syncItems.store_credentials_locally !== undefined) {
			localMode = (syncItems.store_credentials_locally !== false);
		} else if (localItems.store_credentials_locally !== undefined) {
			localMode = (localItems.store_credentials_locally !== false);
		} else {
			localMode = true; // fresh install, default to secure mode
		}
		ExtensionConfig.store_credentials_locally = localMode;

		// Apply credentials from the active mode's namespace.
		if (localMode) {
			// Encrypted: read from storage.local, fall back to legacy sync
			// (<1.5.8) which had encrypted blobs at `password` / `prowlarr_api_key`.
			// The migration block below moves those.
			ExtensionConfig.password = localItems.password !== undefined
				? localItems.password : syncItems.password;
			ExtensionConfig.prowlarr_api_key = localItems.prowlarr_api_key !== undefined
				? localItems.prowlarr_api_key : syncItems.prowlarr_api_key;
		} else {
			// Plaintext: read directly from storage.sync.*_plain.
			// We expose plaintext via the encrypted-blob field name so the
			// rest of the extension's runtime can read ExtensionConfig.password
			// uniformly. PasswordCrypto.decrypt() in background.js handles
			// both formats transparently.
			ExtensionConfig.password = syncItems.password_plain;
			ExtensionConfig.prowlarr_api_key = syncItems.prowlarr_api_key_plain;
		}

		// ── Migration on upgrade ────────────────────────────────────────
		// Three cohorts:
		//   • <=1.5.6 (no toggle anywhere): default into encrypted-local mode
		//     and copy any sync-stored encrypted blobs to local.
		//   • 1.5.7 (encrypted-everywhere, toggle in local): keep their toggle
		//     value but move it to storage.sync. Encrypted blobs in sync get
		//     cleaned up.
		//   • 1.5.8 (toggle in local, _plain fields in sync, no toggle in sync):
		//     same migration — move the toggle to sync. _plain fields stay
		//     where they are.
		var migrateLocal = {};
		var migrateSync = {};
		var legacyLocalKeys = [];
		var legacyEncryptedInSync = false;

		if (syncItems.store_credentials_locally === undefined) {
			// Toggle isn't in sync yet. Either it's somewhere in local
			// (1.5.7/1.5.8 user) or nowhere (1.5.6 user) — either way, write
			// the resolved value into sync so future reads are consistent.
			migrateSync.store_credentials_locally = localMode;
		}

		if (localItems.store_credentials_locally !== undefined) {
			// Toggle has been migrated to sync (or will be by this run); the
			// per-device copy in storage.local is no longer used.
			legacyLocalKeys.push("store_credentials_locally");
		}

		if (syncItems.password !== undefined || syncItems.prowlarr_api_key !== undefined) {
			// <1.5.8 had encrypted blobs in storage.sync. They're never read
			// by the new runtime; clean them up so the sync namespace stays
			// tidy.
			legacyEncryptedInSync = true;

			// On a 1.5.6 fresh-install path: also copy them into storage.local
			// so the active device keeps working without a re-prompt.
			if (localItems.store_credentials_locally === undefined &&
				syncItems.store_credentials_locally === undefined) {
				if (localItems.password === undefined && syncItems.password) {
					migrateLocal.password = syncItems.password;
				}
				if (localItems.prowlarr_api_key === undefined && syncItems.prowlarr_api_key) {
					migrateLocal.prowlarr_api_key = syncItems.prowlarr_api_key;
				}
			}
		}

		if (Object.keys(migrateSync).length > 0) {
			chrome.storage.sync.set(migrateSync);
		}
		if (Object.keys(migrateLocal).length > 0) {
			chrome.storage.local.set(migrateLocal);
		}
		if (legacyLocalKeys.length > 0) {
			chrome.storage.local.remove(legacyLocalKeys);
		}
		if (legacyEncryptedInSync) {
			chrome.storage.sync.remove(["password", "prowlarr_api_key"]);
		}

		if (typeof applyDarkMode === "function") {
			applyDarkMode(ExtensionConfig.dark_mode);
		}
		if (typeof applyIconPack === "function") {
			applyIconPack(ExtensionConfig.icon_pack);
		}
		document.dispatchEvent(new Event("ExtensionConfigReady"));
	});
});

function applyDarkMode(mode) {
	if (typeof document === "undefined") return;
	var html = document.documentElement;
	if (mode === "system") {
		// Let CSS @media prefers-color-scheme handle it
		html.removeAttribute("data-theme");
	} else {
		// Set any theme name: "light", "dark", "solarized", "nord", "dracula", etc.
		html.setAttribute("data-theme", mode);
	}
}

function applyIconPack(pack) {
	if (typeof document === "undefined") return;
	var html = document.documentElement;
	if (pack === "modern") {
		html.setAttribute("data-icons", "modern");
	} else {
		html.removeAttribute("data-icons");
	}
}
