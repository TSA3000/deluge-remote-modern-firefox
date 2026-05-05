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

chrome.storage.onChanged.addListener(function (changes, namespace) {
	for (var key in changes) {
		// In local-only mode, sync writes for credential keys are stale (other
		// devices, or our own pre-1.5.7 leftovers) and must not overwrite the
		// authoritative local copy. Drop them.
		if (
			namespace === "sync" &&
			CREDENTIAL_KEYS.indexOf(key) !== -1 &&
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

// Load order (matters):
//   1. storage.local — authoritative for store_credentials_locally and (in
//      local-only mode) for credential keys
//   2. storage.sync  — authoritative for everything else
//   3. Merge: non-credential keys come from sync; credential keys come from
//      local if local mode, sync otherwise
//   4. Run a one-time migration for users upgrading from <1.5.7
chrome.storage.local.get(null, function (localItems) {
	localItems = localItems || {};
	chrome.storage.sync.get(null, function (syncItems) {
		syncItems = syncItems || {};

		// Start with sync — gives us all non-credential settings plus, if the
		// user is in synced mode, the credentials too.
		for (var k in syncItems) {
			ExtensionConfig[k] = syncItems[k];
		}

		// Resolve the per-device flag. Default true on first run (i.e. anyone
		// upgrading from <=1.5.6 where the key didn't exist).
		var localMode = (localItems.store_credentials_locally !== false);
		ExtensionConfig.store_credentials_locally = localMode;

		// In local-only mode, override credential fields with the local copy.
		if (localMode) {
			for (var i = 0; i < CREDENTIAL_KEYS.length; i++) {
				var ck = CREDENTIAL_KEYS[i];
				if (localItems[ck] !== undefined) {
					ExtensionConfig[ck] = localItems[ck];
				} else if (syncItems[ck] !== undefined) {
					// Fallback to sync copy until migration writes local.
					ExtensionConfig[ck] = syncItems[ck];
				}
			}
		}

		// One-time migration for upgrades from <1.5.7. If the flag has never
		// been set, the user is on a fresh install OR coming from <=1.5.6.
		// Either way: opt them into the safe default (local-only) AND copy any
		// existing sync-stored credentials into local so this device keeps
		// working without a re-prompt. Other devices that share the sync
		// account will hit the same migration on their next launch.
		if (localItems.store_credentials_locally === undefined) {
			var migrate = { store_credentials_locally: true };
			for (var j = 0; j < CREDENTIAL_KEYS.length; j++) {
				var mk = CREDENTIAL_KEYS[j];
				if (localItems[mk] === undefined && syncItems[mk]) {
					migrate[mk] = syncItems[mk];
				}
			}
			chrome.storage.local.set(migrate);
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
