/*
 * Remote Deluge - Background Service Worker (Manifest V3)
 *
 * Combines: global_options, debug_log, deluge API, and background logic.
 * No DOM or jQuery — uses fetch() for network calls.
 */

// ── Global Options ──────────────────────────────────────────────────────────
let ExtensionConfig = {
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
	torrents_per_page: 0,

	// ── Prowlarr integration ───────────────────────────────────────────
	prowlarr_enabled:       false,
	prowlarr_protocol:      "http",
	prowlarr_ip:            "",
	prowlarr_port:          "9696",
	prowlarr_base:          "",
	prowlarr_api_key:       "",
	prowlarr_results_limit: 100
};

function loadConfig() {
	return chrome.storage.sync.get().then(items => {
		if (items && Object.keys(items).length > 0) {
			ExtensionConfig = { ...ExtensionConfig, ...items };
		}
	});
}

// A promise that resolves once the very first loadConfig() has finished.
// Message handlers await this so they never answer before config is ready
// (otherwise Prowlarr calls fire during cold-start and return "disabled").
let _configReady = loadConfig();
function waitForConfig() { return _configReady; }

chrome.storage.onChanged.addListener((changes, namespace) => {
	for (const key in changes) {
		ExtensionConfig[key] = changes[key].newValue;
		if (key === "context_menu") {
			updateContextMenu(changes[key].newValue);
		}
	}
	// Ensure subsequent callers see latest values
	_configReady = Promise.resolve();
});

// ── Debug Log ───────────────────────────────────────────────────────────────
function debug_log(...args) {
	if (ExtensionConfig.debug_mode) {
		console.log(...args);
	}
}

// ── Deluge API (fetch-based) ────────────────────────────────────────────────
const DelugeAPI = {
	API_ERROR: "apierror",
	API_AUTH_CODE: 1,
	API_UNKNOWN_METHOD_CODE: 2,
	API_UNKNOWN_ERROR_CODE: 3,

	endpoint() {
		const proto = ExtensionConfig.address_protocol || "https";
		const ip    = ExtensionConfig.address_ip || "";
		const port  = ExtensionConfig.address_port || "8112";
		const base  = ExtensionConfig.address_base;
		return `${proto}://${ip}:${port}/${base ? base + "/" : ""}`;
	},

	async call(method, params = [], options = {}) {
		const url = this.endpoint() + "json";
		const timeout = options.timeout || 10000;
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeout);

		try {
			const resp = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ method, params, id: "-999" }),
				credentials: "include",
				signal: controller.signal
			});
			clearTimeout(timer);

			if (!resp.ok) {
				return { error: { type: "http", status: resp.status, message: resp.statusText } };
			}

			const json = await resp.json();
			if (json.error !== null) {
				return { error: { type: "api", code: json.error.code, message: json.error.message } };
			}
			return { result: json.result };
		} catch (err) {
			clearTimeout(timer);
			return { error: { type: "network", message: err.message } };
		}
	}
};

// ── Prowlarr API (fetch-based) ──────────────────────────────────────────────
// Track the AbortController of the currently-running search so the popup
// can cancel it via the "prowlarr_cancel_search" message.
let currentProwlarrSearchController = null;

const ProwlarrAPI = {
	endpoint() {
		const proto = ExtensionConfig.prowlarr_protocol || "http";
		const ip    = ExtensionConfig.prowlarr_ip || "";
		const port  = ExtensionConfig.prowlarr_port || "9696";
		const base  = ExtensionConfig.prowlarr_base;
		return `${proto}://${ip}:${port}/${base ? base + "/" : ""}`;
	},

	buildUrl(path, query) {
		let url = this.endpoint() + String(path || "").replace(/^\/+/, "");
		if (query && typeof query === "object") {
			const parts = [];
			for (const key in query) {
				if (query[key] === null || query[key] === undefined || query[key] === "") continue;
				parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(query[key]));
			}
			if (parts.length) {
				url += (url.indexOf("?") === -1 ? "?" : "&") + parts.join("&");
			}
		}
		return url;
	},

	async call(path, { httpMethod = "GET", query = null, body = null, timeout = 15000, signal = null } = {}) {
		await waitForConfig();
		if (!ExtensionConfig.prowlarr_enabled) {
			return { error: { type: "disabled", message: "Prowlarr is not enabled" } };
		}
		if (!ExtensionConfig.prowlarr_ip) {
			return { error: { type: "config", message: "Prowlarr address not configured" } };
		}

		const apiKey = await PasswordCrypto.decrypt(ExtensionConfig.prowlarr_api_key);
		if (!apiKey) {
			return { error: { type: "auth", message: "Prowlarr API key not configured" } };
		}

		const url = this.buildUrl(path, query);

		// If the caller supplied a signal (for cancellation), honor it by
		// creating a combined controller that aborts on either timeout or
		// external cancel. We track which path aborted so we can return a
		// distinct error type.
		const controller = new AbortController();
		let timedOut = false;
		const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);

		let externalAbortHandler = null;
		if (signal) {
			if (signal.aborted) controller.abort();
			else {
				externalAbortHandler = () => controller.abort();
				signal.addEventListener("abort", externalAbortHandler);
			}
		}

		try {
			const fetchOpts = {
				method: httpMethod,
				headers: {
					"X-Api-Key":    apiKey,
					"Accept":       "application/json"
				},
				signal: controller.signal
			};
			if (body !== null && httpMethod !== "GET" && httpMethod !== "HEAD") {
				fetchOpts.headers["Content-Type"] = "application/json";
				fetchOpts.body = typeof body === "string" ? body : JSON.stringify(body);
			}

			const resp = await fetch(url, fetchOpts);
			clearTimeout(timer);

			if (resp.status === 401 || resp.status === 403) {
				return { error: { type: "auth", status: resp.status, message: "Prowlarr rejected API key" } };
			}
			if (!resp.ok) {
				let text = "";
				try { text = await resp.text(); } catch (_) {}
				return { error: { type: "http", status: resp.status, message: resp.statusText || text } };
			}

			const ct = resp.headers.get("content-type") || "";
			if (ct.indexOf("application/json") === -1) {
				return { result: null };
			}
			const json = await resp.json();
			return { result: json };
		} catch (err) {
			clearTimeout(timer);
			if (err && err.name === "AbortError") {
				// Distinguish cancellation from timeout
				if (timedOut) {
					return { error: { type: "timeout", message: `Request timed out after ${timeout}ms` } };
				}
				return { error: { type: "cancelled", message: "Request cancelled" } };
			}
			return { error: { type: "network", message: err.message || String(err) } };
		} finally {
			if (externalAbortHandler && signal) {
				signal.removeEventListener("abort", externalAbortHandler);
			}
		}
	},

	async checkStatus(timeout = 5000) {
		if (!ExtensionConfig.prowlarr_enabled) {
			return { connected: false, reason: "disabled" };
		}
		const resp = await this.call("api/v1/system/status", { timeout });
		if (resp.result) {
			return { connected: true, version: resp.result.version, appName: resp.result.appName };
		}
		if (resp.error) {
			return { connected: false, reason: resp.error.type, status: resp.error.status, message: resp.error.message };
		}
		return { connected: false, reason: "unknown" };
	}
};

// ── Background Logic ────────────────────────────────────────────────────────
let statusTimer = null;

const STATUS_CHECK_ERROR_INTERVAL = 120000;
const STATUS_CHECK_INTERVAL       = 60000;

function badgeText(text, colour) {
	debug_log("badgeText:", text, colour);
	chrome.action.setBadgeText({ text });
	chrome.action.setBadgeBackgroundColor({ color: colour });
	setTimeout(() => {
		chrome.action.setBadgeText({ text: "" });
	}, ExtensionConfig.badge_timeout || 250);
}

// ── Daemon / Connection ─────────────────────────────────────────────────────
async function startDaemon(hostId) {
	const status = await DelugeAPI.call("web.get_host_status", [hostId]);
	if (status.result && status.result[3] === "Offline") {
		await DelugeAPI.call("web.start_daemon", [status.result[2]]);
		await new Promise(r => setTimeout(r, 2000));
	}
}

async function connectToDaemon() {
    const hosts = await DelugeAPI.call("web.get_hosts");
    if (hosts.error || !hosts.result || hosts.result.length === 0) {
        throw new Error("No hosts available");
    }
    // Prefer already-connected host, otherwise use first
    const connected = hosts.result.find(h => h[3] === "Connected");
    const host = connected || hosts.result[0];
    const hostId = host[0];
    await startDaemon(hostId);
    const conn = await DelugeAPI.call("web.connect", [hostId]);
    if (conn.error) throw new Error("Failed to connect to daemon");
}

// ── Password Crypto (AES-GCM) ───────────────────────────────────────────────
const PasswordCrypto = {
	_cachedKey: null,
	KEY_STORAGE: "encryption_key_jwk",

	async getKey() {
		if (this._cachedKey) return this._cachedKey;

		const result = await chrome.storage.local.get(this.KEY_STORAGE);
		if (result && result[this.KEY_STORAGE]) {
			this._cachedKey = await crypto.subtle.importKey(
				"jwk", result[this.KEY_STORAGE],
				{ name: "AES-GCM" }, false, ["encrypt", "decrypt"]
			);
		} else {
			const key = await crypto.subtle.generateKey(
				{ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
			);
			const jwk = await crypto.subtle.exportKey("jwk", key);
			await chrome.storage.local.set({ [this.KEY_STORAGE]: jwk });
			this._cachedKey = key;
		}
		return this._cachedKey;
	},

	async decrypt(stored) {
		if (!stored || stored === "") return "";
		try {
			const parsed = JSON.parse(stored);
			if (!parsed._encrypted) return stored;
			const key = await this.getKey();
			const iv = Uint8Array.from(atob(parsed.iv), c => c.charCodeAt(0));
			const data = Uint8Array.from(atob(parsed.data), c => c.charCodeAt(0));
			const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
			return new TextDecoder().decode(decrypted);
		} catch (e) {
			// Not encrypted (plain text from old version) — return as-is
			return stored;
		}
	}
};

// ── Login (with password decryption) ────────────────────────────────────────
async function login() {
	const plainPassword = await PasswordCrypto.decrypt(ExtensionConfig.password);
	return DelugeAPI.call("auth.login", [plainPassword]);
}

// ── Status Check ────────────────────────────────────────────────────────────
async function checkStatus(options) {
	debug_log("Deluge: Checking status");
	clearTimeout(statusTimer);

	const resp = await DelugeAPI.call("web.connected", [], options);

	if (resp.result === true) {
		activate();
		statusTimer = setTimeout(checkStatus, STATUS_CHECK_INTERVAL);
		return { connected: true };
	}

	if (resp.error && resp.error.type === "api") {
		if (resp.error.code === DelugeAPI.API_AUTH_CODE) {
			const loginResp = await login();
			if (loginResp.result === true) {
				return checkStatus(options);
			} else {
				debug_log("Deluge: Incorrect login details.");
				statusTimer = setTimeout(checkStatus, STATUS_CHECK_ERROR_INTERVAL);
				deactivate();
				chrome.runtime.sendMessage({ msg: "auto_login_failed" }).catch(() => {});
				return { connected: false, reason: "auth_failed" };
			}
		}
		debug_log("Deluge: API error occurred");
		deactivate();
		statusTimer = setTimeout(checkStatus, STATUS_CHECK_INTERVAL);
		return { connected: false, reason: "api_error" };
	}

	if (resp.error && resp.error.type === "network") {
		debug_log("Error: Network issue -", resp.error.message);
		statusTimer = setTimeout(checkStatus, STATUS_CHECK_ERROR_INTERVAL);
		deactivate();
		return { connected: false, reason: "network_error" };
	}

	// result is false — authenticated but not connected to daemon
	try {
		await connectToDaemon();
		activate();
		statusTimer = setTimeout(checkStatus, STATUS_CHECK_INTERVAL);
		return { connected: true };
	} catch (e) {
		debug_log("Deluge: Failed to connect to daemon", e);
		deactivate();
		statusTimer = setTimeout(checkStatus, STATUS_CHECK_INTERVAL);
		return { connected: false, reason: "daemon_error" };
	}
}

// ── Activate / Deactivate ───────────────────────────────────────────────────
function activate() {
	debug_log("Deluge: Extension activated");
	chrome.action.setIcon({
		path: {
			"16": "/images/icons/deluge_active.png",
			"32": "/images/icons/deluge_active.png"
		}
	}).catch((err) => {
		console.error("setIcon active failed:", err);
		chrome.action.setIcon({
			path: {
				"16": "/images/icons/deluge.png",
				"32": "/images/icons/deluge.png"
			}
		}).catch(() => {});
	});
	chrome.action.setTitle({ title: chrome.i18n.getMessage("browser_title") });
	chrome.runtime.sendMessage({ msg: "extension_activated" }).catch(() => {});
}

function deactivate() {
	debug_log("Extension deactivated");
	chrome.action.setIcon({
		path: {
			"16": "/images/icons/deluge.png",
			"32": "/images/icons/deluge.png"
		}
	}).catch((err) => {
		console.error("setIcon deactivate failed:", err);
	});
	chrome.action.setTitle({ title: chrome.i18n.getMessage("browser_title_disabled") });
	chrome.runtime.sendMessage({ msg: "extension_deactivated" }).catch(() => {});
}

// ── Add Torrent from URL ────────────────────────────────────────────────────
async function addTorrentFromUrl(url, tabId) {
	debug_log("Sending URL to deluge");

	const dl = await DelugeAPI.call("web.download_torrent_from_url", [url, ""]);
	if (dl.error || !dl.result) {
		debug_log("Deluge: failed to download torrent from URL");
		badgeText("Fail", "#FF0000");
		if (tabId) chrome.tabs.sendMessage(tabId, { msg: "Deluge: failed to download torrent from URL." }).catch(() => {});
		return;
	}

	const tmpTorrent = dl.result;
	debug_log("Deluge: downloaded torrent.");

	const opts = await DelugeAPI.call("core.get_config_values", [[
		"add_paused", "compact_allocation", "download_location",
		"max_connections_per_torrent", "max_download_speed_per_torrent",
		"max_upload_speed_per_torrent", "max_upload_slots_per_torrent",
		"prioritize_first_last_pieces"
	]]);

	if (opts.error || !opts.result) {
		debug_log("Deluge: unable to fetch options.");
		if (tabId) chrome.tabs.sendMessage(tabId, { msg: "Deluge: Unable to fetch options." }).catch(() => {});
		return;
	}

	const add = await DelugeAPI.call("web.add_torrents", [[{ path: tmpTorrent, options: opts.result }]]);
	if (add.result) {
		debug_log("Deluge: added torrent.");
		badgeText("Add", "#00FF00");
		if (tabId) chrome.tabs.sendMessage(tabId, { msg: "Deluge: Success adding torrent!" }).catch(() => {});
	} else {
		debug_log("Deluge: unable to add torrent.");
		badgeText("Fail", "#FF0000");
		if (tabId) chrome.tabs.sendMessage(tabId, { msg: "Deluge: Unable to add torrent." }).catch(() => {});
	}
}

// ── Add Torrent from Magnet ─────────────────────────────────────────────────
async function addTorrentFromMagnet(url, tabId) {
	const resp = await DelugeAPI.call("core.add_torrent_magnet", [url, {}]);

	if (resp.result) {
		debug_log("Deluge: added magnet.");
		badgeText("Add", "#00FF00");
		if (tabId) chrome.tabs.sendMessage(tabId, { msg: "Deluge: Success adding torrent from magnet" }).catch(() => {});
	} else {
		debug_log("Deluge: failed to add magnet.");
		badgeText("Fail", "#FF0000");
		if (tabId) chrome.tabs.sendMessage(tabId, { msg: "Deluge: Failed to add torrent from magnet." }).catch(() => {});
	}
}

// ── Context Menu ────────────────────────────────────────────────────────────
function updateContextMenu(enabled) {
	chrome.contextMenus.removeAll(() => {
		if (enabled) {
			chrome.contextMenus.create({
				id: "context_links",
				title: "Send to Deluge",
				contexts: ["link"]
			});
		}
	});
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
	debug_log("Context menu sending link to Deluge:", info.linkUrl);
	const url = info.linkUrl;
	if (/^magnet:/.test(url)) {
		addTorrentFromMagnet(url, tab?.id);
	} else {
		addTorrentFromUrl(url, tab?.id);
	}
});

// ── Get Deluge Version ──────────────────────────────────────────────────────
async function getVersion() {
	const resp = await DelugeAPI.call("daemon.info");
	if (resp.result) {
		const parts = resp.result.split("-")[0].split(".");
		return { major: Number(parts[0]), minor: Number(parts[1]), build: Number(parts[2]) };
	}
	return null;
}

// ── Message Handling ────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	debug_log("Received message:", request.method || request.msg, request);

	switch (request.method) {
		case "add_torrent_from_url":
			addTorrentFromUrl(request.url, sender.tab?.id);
			return false;

		case "add_torrent_from_magnet":
			addTorrentFromMagnet(request.url, sender.tab?.id);
			return false;

		case "context_menu":
			updateContextMenu(request.enabled);
			return false;

		case "ExtensionConfig":
			sendResponse({ value: ExtensionConfig[request.key] });
			return false;

		case "check_status":
			checkStatus({ timeout: 1000 }).then(result => sendResponse(result));
			return true;

		case "deluge_api":
			DelugeAPI.call(request.apiMethod, request.params, request.options || {})
				.then(resp => sendResponse(resp));
			return true;

		case "prowlarr_api": {
			// If this is a search, track its controller so it can be cancelled
			const isSearch = request.path === "api/v1/search" && (request.httpMethod || "GET") === "GET";
			const ctrl = new AbortController();
			if (isSearch) {
				// Any previous in-flight search is superseded
				if (currentProwlarrSearchController) {
					try { currentProwlarrSearchController.abort(); } catch (_) {}
				}
				currentProwlarrSearchController = ctrl;
			}
			ProwlarrAPI.call(request.path, {
				httpMethod: request.httpMethod || "GET",
				query:      request.query      || null,
				body:       request.body       || null,
				timeout:    request.timeout    || 15000,
				signal:     ctrl.signal
			}).then(resp => {
				if (isSearch && currentProwlarrSearchController === ctrl) {
					currentProwlarrSearchController = null;
				}
				sendResponse(resp);
			});
			return true;
		}

		case "prowlarr_cancel_search":
			if (currentProwlarrSearchController) {
				try { currentProwlarrSearchController.abort(); } catch (_) {}
				currentProwlarrSearchController = null;
				sendResponse({ cancelled: true });
			} else {
				sendResponse({ cancelled: false });
			}
			return false;

		case "check_prowlarr_status":
			ProwlarrAPI.checkStatus(request.timeout || 5000)
				.then(resp => sendResponse(resp));
			return true;

		case "get_prowlarr_endpoint":
			sendResponse({ endpoint: ProwlarrAPI.endpoint() });
			return false;

		case "get_endpoint":
			sendResponse({ endpoint: DelugeAPI.endpoint() });
			return false;

		case "get_version":
			getVersion().then(ver => sendResponse(ver));
			return true;

		default:
			break;
	}
});

// ── Startup ─────────────────────────────────────────────────────────────────
async function start(allowOpenOptions) {
	await loadConfig();

	const manifest = chrome.runtime.getManifest();
	if (
		allowOpenOptions && (
			typeof ExtensionConfig.version === "undefined" ||
			manifest.version.split(".")[0] !== (ExtensionConfig.version || "").split(".")[0]
		)
	) {
		chrome.tabs.create({ url: "options.html?newver=true" });
	}

	updateContextMenu(ExtensionConfig.context_menu);
	checkStatus();
}

chrome.runtime.onInstalled.addListener(() => {
	start(true);
});

start(false);
