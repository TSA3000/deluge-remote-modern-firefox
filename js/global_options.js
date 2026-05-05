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

// Keys that contain encrypted credentials and obey the
// store_credentials_locally toggle. Read/write routing for these keys is
// determined per-device by that flag.
var CREDENTIAL_KEYS = ["password", "prowlarr_api_key"];

// Storage namespace overview (see options.html "Keep credentials on this
// device only" toggle and crypto.js header for the full picture):
//
//   storage.local
//     • store_credentials_locally  : the per-device toggle itself
//     • password                   : encrypted blob (when toggle ON)
//     • prowlarr_api_key           : encrypted blob (when toggle ON)
//     • encryption_key_jwk         : per-device AES-GCM key (managed by crypto.js)
//
//   storage.sync
//     • all non-credential settings
//     • password_plain             : PLAINTEXT (when toggle OFF, syncs to all devices)
//     • prowlarr_api_key_plain     : PLAINTEXT (when toggle OFF, syncs to all devices)
//
// Field name encodes format: `_plain` suffix = plaintext, no suffix on
// credentials = encrypted. This makes accidental decrypt-of-plaintext
// (or display-of-ciphertext) impossible from the key name alone.

chrome.storage.onChanged.addListener(function (changes, namespace) {
	for (var key in changes) {
		// In encrypted-local mode, ignore sync namespace writes for credential
		// fields — the authoritative source is storage.local. This protects
		// against stale plaintext from other devices that happen to be in
		// sync mode while this device is in local mode.
		var isCredentialField = (
			key === "password" || key === "prowlarr_api_key" ||
			key === "password_plain" || key === "prowlarr_api_key_plain"
		);
		if (
			namespace === "sync" &&
			isCredentialField &&
			ExtensionConfig.store_credentials_locally !== false
		) {
			continue;
		}
		ExtensionConfig[key] = changes[key].newValue;
		if (key === "context_menu") {
			chrome.runtime.sendMessage({ method: "context_menu", enabled: changes[key].newValue }).catch(function () { });
		}
		if (key === "dark_mode") {
			applyDarkMode(changes[key].newValue);
		}
		if (key === "icon_pack") {
			applyIconPack(changes[key].newValue);
		}
	}
});

chrome.storage.local.get(null, function (localItems) {
	localItems = localItems || {};
	chrome.storage.sync.get(null, function (syncItems) {
		syncItems = syncItems || {};

		// Apply non-credential settings from sync (skip credential keys).
		for (var k in syncItems) {
			if (k === "password" || k === "prowlarr_api_key" ||
				k === "password_plain" || k === "prowlarr_api_key_plain") continue;
			ExtensionConfig[k] = syncItems[k];
		}

		var localMode = (localItems.store_credentials_locally !== false);
		ExtensionConfig.store_credentials_locally = localMode;

		// Apply credentials from the active mode's namespace.
		if (localMode) {
			// Encrypted: read from storage.local, fall back to legacy sync
			// (pre-1.5.7) which had encrypted blobs at `password` /
			// `prowlarr_api_key`. The migration block below moves those.
			ExtensionConfig.password = localItems.password !== undefined
				? localItems.password : syncItems.password;
			ExtensionConfig.prowlarr_api_key = localItems.prowlarr_api_key !== undefined
				? localItems.prowlarr_api_key : syncItems.prowlarr_api_key;
		} else {
			// Plaintext: read directly from storage.sync.*_plain.
			// We expose plaintext via the encrypted-blob field name so the
			// rest of the extension's runtime can read ExtensionConfig.password
			// uniformly. The active-namespace check above prevents the
			// plaintext from being treated as ciphertext.
			ExtensionConfig.password = syncItems.password_plain;
			ExtensionConfig.prowlarr_api_key = syncItems.prowlarr_api_key_plain;
		}

		// Migration on upgrade. Two cohorts:
		//   • <=1.5.6 (no toggle): default into encrypted-local mode and
		//     copy any sync-stored encrypted blobs to local so this device
		//     keeps working without a re-prompt.
		//   • 1.5.7 (encrypted-everywhere routing, toggle present): may
		//     still have legacy encrypted blobs in storage.sync.password /
		//     .prowlarr_api_key from when sync mode was active. Clean those
		//     up — the new design never reads them.
		// In both cases, the active device transitions seamlessly. Other
		// devices on the same sync account that were storing encrypted blobs
		// keyed to a different install will need a one-time password re-entry,
		// which is correct given the per-device key model.
		var needsLegacyCleanup = false;
		if (localItems.store_credentials_locally === undefined) {
			// <=1.5.6 path: opt user into encrypted-local mode and copy
			// legacy encrypted blob from sync.
			var migrate = { store_credentials_locally: true };
			if (localItems.password === undefined && syncItems.password) {
				migrate.password = syncItems.password;
			}
			if (localItems.prowlarr_api_key === undefined && syncItems.prowlarr_api_key) {
				migrate.prowlarr_api_key = syncItems.prowlarr_api_key;
			}
			chrome.storage.local.set(migrate);
			needsLegacyCleanup = true;
		} else if (syncItems.password !== undefined || syncItems.prowlarr_api_key !== undefined) {
			// 1.5.7 path: legacy encrypted blob still sitting in sync.
			needsLegacyCleanup = true;
		}
		if (needsLegacyCleanup) {
			// Clean up legacy encrypted blobs from sync (no-suffix names).
			// The new format is {password,prowlarr_api_key}_plain in sync
			// (only when toggle is off), which we leave alone.
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
