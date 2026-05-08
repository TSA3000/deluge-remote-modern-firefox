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

// Storage layout:
//   storage.sync   non-credential settings, store_credentials_locally,
//                  and (when toggle OFF) password_plain / prowlarr_api_key_plain.
//   storage.local  encryption_key_jwk, plus (when toggle ON) password /
//                  prowlarr_api_key as encrypted blobs.
// The _plain suffix is defense-in-depth — wrong-format reads can't happen.

chrome.storage.onChanged.addListener(function (changes, namespace) {
	for (var key in changes) {
		// Plaintext sync fields are stored under password_plain /
		// prowlarr_api_key_plain but the runtime reads them via the
		// unsuffixed names; remap.
		var runtimeKey = key;
		if (key === "password_plain") runtimeKey = "password";
		if (key === "prowlarr_api_key_plain") runtimeKey = "prowlarr_api_key";

		// Legacy encrypted blobs in storage.sync (from <1.5.8) are never read.
		// The migration block in the load callback wipes them on first launch;
		// drop any onChanged events for them in the meantime.
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

		// Toggle just flipped to OFF (most likely via sync from another device).
		// The encrypted blob in this device's storage.local is now stale, wipe it.
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
			// Plaintext from sync. Stored under unsuffixed runtime key so
			// PasswordCrypto.decrypt() (auto-detects format) reads it uniformly.
			ExtensionConfig.password = syncItems.password_plain;
			ExtensionConfig.prowlarr_api_key = syncItems.prowlarr_api_key_plain;
		}

		// Migration on upgrade. The toggle moved from storage.local (1.5.7/1.5.8)
		// to storage.sync (1.5.9+); legacy encrypted blobs in storage.sync (<1.5.8)
		// are dead weight. Pre-1.5.7 had no toggle at all, default to ON.
		var migrateLocal = {};
		var migrateSync = {};
		var legacyLocalKeys = [];
		var legacyEncryptedInSync = false;

		if (syncItems.store_credentials_locally === undefined) {
			migrateSync.store_credentials_locally = localMode;
		}
		if (localItems.store_credentials_locally !== undefined) {
			legacyLocalKeys.push("store_credentials_locally");
		}
		if (syncItems.password !== undefined || syncItems.prowlarr_api_key !== undefined) {
			legacyEncryptedInSync = true;
			// <=1.5.6 path: copy legacy sync blob to local so active device
			// keeps working without re-prompt.
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
