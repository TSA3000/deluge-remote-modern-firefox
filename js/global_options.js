var ExtensionConfig = {
	address_protocol: "https",
	address_ip:       "",
	address_port:     "",
	address_base:     "",
	password:         "",
	handle_magnets:   true,
	handle_torrents:  true,
	context_menu:     false,
	badge_timeout:    250,
	refresh_interval: 3000,
	debug_mode:       false,
	dark_mode:        "system",
	icon_pack:        "classic"
};

chrome.storage.onChanged.addListener(function (changes, namespace) {
	for (var key in changes) {
		ExtensionConfig[key] = changes[key].newValue;
		if (key === "context_menu") {
			chrome.runtime.sendMessage({ method: "context_menu", enabled: changes[key].newValue }).catch(function(){});
		}
		if (key === "dark_mode") {
			applyDarkMode(changes[key].newValue);
		}
		if (key === "icon_pack") {
			applyIconPack(changes[key].newValue);
		}
	}
});

chrome.storage.sync.get(function (items) {
	if (items && Object.keys(items).length > 0) {
		for (var key in items) {
			ExtensionConfig[key] = items[key];
		}
	}
	if (typeof applyDarkMode === "function") {
		applyDarkMode(ExtensionConfig.dark_mode);
	}
	if (typeof applyIconPack === "function") {
		applyIconPack(ExtensionConfig.icon_pack);
	}
	document.dispatchEvent(new Event("ExtensionConfigReady"));
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
