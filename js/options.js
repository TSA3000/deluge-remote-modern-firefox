// Track the loaded password so we only re-encrypt when it actually changes
var _originalPassword = "";
var _storedEncryptedPassword = "";

// Same pattern for the Prowlarr API key
var _originalProwlarrApiKey = "";
var _storedEncryptedProwlarrApiKey = "";

function saveOptions(callback) {
	var plainPassword = document.getElementById("password").value;
	var plainProwlarrKey = document.getElementById("prowlarr_api_key").value;

	// Per-device flag:
	//   true  (checked, default) → password encrypted, kept on this device only
	//   false (unchecked)        → password stored as plaintext in sync, shared across all devices
	var localOnly = document.getElementById("store_credentials_locally").checked;

	// Non-credential settings always sync regardless of mode.
	var syncSettings = {
		"address_protocol": document.getElementById("address_protocol").value,
		"address_ip": document.getElementById("address_ip").value,
		"address_port": document.getElementById("address_port").value,
		"address_base": document.getElementById("address_base").value,
		"handle_torrents": document.getElementById("handle_torrents").checked,
		"handle_magnets": document.getElementById("handle_magnets").checked,
		"context_menu": document.getElementById("context_menu").checked,
		"badge_timeout": parseInt(document.getElementById("badge_timeout").value),
		"refresh_interval": parseInt(document.getElementById("refresh_interval").value),
		"debug_mode": document.getElementById("debug_mode").checked,
		"dark_mode": document.getElementById("dark_mode").value,
		"icon_pack": document.getElementById("icon_pack").value,
		"torrents_per_page": parseInt(document.getElementById("torrents_per_page").value),
		"show_per_page_in_popup": document.getElementById("show_per_page_in_popup").checked,
		"always_show_pagination": document.getElementById("always_show_pagination").checked,

		// ── Prowlarr ─────────────────────────────────────────────
		"prowlarr_enabled":       document.getElementById("prowlarr_enabled").checked,
		"prowlarr_protocol":      document.getElementById("prowlarr_protocol").value,
		"prowlarr_ip":            document.getElementById("prowlarr_ip").value,
		"prowlarr_port":          document.getElementById("prowlarr_port").value,
		"prowlarr_base":          document.getElementById("prowlarr_base").value,
		"prowlarr_results_limit": parseInt(document.getElementById("prowlarr_results_limit").value),

		"version": chrome.runtime.getManifest().version
	};

	var localSettings = {
		"store_credentials_locally": localOnly
	};

	// Cleanup lists — credentials always live in exactly one namespace at a
	// time. Whichever one we aren't writing to gets wiped to prevent stale
	// data from a previous mode.
	var syncRemove = [];
	var localRemove = [];

	function finishSave(encryptedPassword, encryptedProwlarrKey) {
		if (localOnly) {
			// ─── Encrypted local mode (more secure) ─────────────────
			// Encrypted blobs go into storage.local.password / .prowlarr_api_key.
			// Wipe any plaintext from sync, plus legacy v1.5.6 encrypted blobs.
			if (encryptedPassword !== null) {
				localSettings.password = encryptedPassword;
				_originalPassword = plainPassword;
				_storedEncryptedPassword = encryptedPassword;
			}
			if (encryptedProwlarrKey !== null) {
				localSettings.prowlarr_api_key = encryptedProwlarrKey;
				_originalProwlarrApiKey = plainProwlarrKey;
				_storedEncryptedProwlarrApiKey = encryptedProwlarrKey;
			}
			syncRemove.push("password", "password_plain", "prowlarr_api_key", "prowlarr_api_key_plain");
		} else {
			// ─── Plaintext sync mode (less secure, multi-device) ────
			// Plaintext goes to storage.sync.password_plain / .prowlarr_api_key_plain.
			// We always rewrite plaintext on Apply so toggling FROM encrypted
			// mode propagates correctly even if the password didn't change.
			syncSettings.password_plain = plainPassword;
			syncSettings.prowlarr_api_key_plain = plainProwlarrKey;
			_originalPassword = plainPassword;
			_originalProwlarrApiKey = plainProwlarrKey;
			// Wipe encrypted blobs from local + legacy encrypted from sync.
			localRemove.push("password", "prowlarr_api_key");
			syncRemove.push("password", "prowlarr_api_key");
		}

		Promise.all([
			new Promise(function (r) { chrome.storage.sync.set(syncSettings, r); }),
			new Promise(function (r) { chrome.storage.local.set(localSettings, r); }),
			syncRemove.length ? new Promise(function (r) { chrome.storage.sync.remove(syncRemove, r); }) : Promise.resolve(),
			localRemove.length ? new Promise(function (r) { chrome.storage.local.remove(localRemove, r); }) : Promise.resolve()
		]).then(function () {
			debug_log("Settings saved (mode: " + (localOnly ? "encrypted local" : "plaintext sync") + ")");
			if (callback) callback();
		});
	}

	// In encrypted-local mode we encrypt before writing; in plaintext-sync
	// mode we don't bother (faster + plaintext is what we're writing anyway).
	if (localOnly) {
		var passwordChanged = (plainPassword !== _originalPassword);
		var prowlarrKeyChanged = (plainProwlarrKey !== _originalProwlarrApiKey);

		var pwPromise = passwordChanged
			? PasswordCrypto.encrypt(plainPassword).catch(function (err) {
				console.error("Failed to encrypt password:", err);
				return null;
			})
			: Promise.resolve(null);
		var keyPromise = prowlarrKeyChanged
			? PasswordCrypto.encrypt(plainProwlarrKey).catch(function (err) {
				console.error("Failed to encrypt prowlarr api key:", err);
				return null;
			})
			: Promise.resolve(null);

		Promise.all([pwPromise, keyPromise]).then(function (results) {
			finishSave(results[0], results[1]);
		});
	} else {
		// Plaintext mode — no encryption work to do.
		finishSave(null, null);
	}
}

document.addEventListener("DOMContentLoaded", function () {
	document.querySelector(".buttons .save").addEventListener("click", function () {
		saveOptions();
	});
	document.querySelector(".buttons .apply").addEventListener("click", function () {
		saveOptions(function () { window.close(); });
	});
	document.querySelector(".buttons .cancel").addEventListener("click", function () {
		window.close();
	});
	document.getElementById("version").textContent = chrome.runtime.getManifest().version;

	// Live preview: theme change
	document.getElementById("dark_mode").addEventListener("change", function () {
		applyDarkMode(this.value);
	});

	// Live preview: icon pack change
	document.getElementById("icon_pack").addEventListener("change", function () {
		applyIconPack(this.value);
	});

	// Test connection button
	document.getElementById("test_connection").addEventListener("click", function () {
		var btn = this;
		var result = document.getElementById("test_result");
		btn.disabled = true;
		result.textContent = "Testing...";
		result.className = "test-result testing";

		saveOptions(function () {
			chrome.runtime.sendMessage({ method: "check_status" }, function (response) {
				btn.disabled = false;
				if (chrome.runtime.lastError) {
					result.textContent = "✗ Service worker not responding";
					result.className = "test-result error";
					return;
				}
				if (response && response.connected) {
					result.textContent = "✓ Connected successfully!";
					result.className = "test-result success";
				} else if (response && response.reason === "auth_failed") {
					result.textContent = "✗ Login failed — check your password";
					result.className = "test-result error";
				} else if (response && response.reason === "network_error") {
					result.textContent = "✗ Cannot reach server — check the address";
					result.className = "test-result error";
				} else {
					result.textContent = "✗ Connection failed";
					result.className = "test-result error";
				}
			});
		});
	});

	// ── URL Preview — live endpoint display ────────────────────────────
	function updateUrlPreview() {
		var proto = document.getElementById("address_protocol").value || "https";
		var ip    = document.getElementById("address_ip").value || "<ip-or-host>";
		var port  = document.getElementById("address_port").value || "8112";
		var base  = document.getElementById("address_base").value.trim();
		var url = proto + "://" + ip + ":" + port + "/" + (base ? base + "/" : "") + "json";
		document.getElementById("url_preview_value").textContent = url;

		// Show HTTP warning only when protocol is http
		var httpWarn = document.getElementById("http_warning_row");
		if (httpWarn) {
			httpWarn.style.display = (proto === "http") ? "" : "none";
		}
	}
	["address_protocol", "address_ip", "address_port", "address_base"].forEach(function (id) {
		var el = document.getElementById(id);
		if (!el) return;
		el.addEventListener("input", updateUrlPreview);
		el.addEventListener("change", updateUrlPreview);
	});
	updateUrlPreview();

	// ── Password show/hide toggle ──────────────────────────────────────
	var pwToggle = document.getElementById("password_toggle");
	if (pwToggle) {
		pwToggle.addEventListener("click", function () {
			var pw = document.getElementById("password");
			if (pw.type === "password") {
				pw.type = "text";
				this.textContent = "🙈";
				this.setAttribute("aria-label", "Hide password");
				this.title = "Hide password";
			} else {
				pw.type = "password";
				this.textContent = "👁";
				this.setAttribute("aria-label", "Show password");
				this.title = "Show password";
			}
		});
	}

	// ── Prowlarr: fieldset toggle, URL preview, API key toggle, test ───
	var prowlarrEnableEl = document.getElementById("prowlarr_enabled");
	var prowlarrFieldset = document.getElementById("prowlarr_fieldset");

	function syncProwlarrFieldset() {
		if (prowlarrEnableEl && prowlarrFieldset) {
			prowlarrFieldset.style.display = prowlarrEnableEl.checked ? "" : "none";
		}
	}
	if (prowlarrEnableEl) {
		prowlarrEnableEl.addEventListener("change", syncProwlarrFieldset);
	}

	// Live preview of the Prowlarr endpoint URL
	function updateProwlarrUrlPreview() {
		var proto = document.getElementById("prowlarr_protocol").value || "http";
		var ip    = document.getElementById("prowlarr_ip").value || "<ip-or-host>";
		var port  = document.getElementById("prowlarr_port").value || "9696";
		var base  = document.getElementById("prowlarr_base").value.trim();
		var url = proto + "://" + ip + ":" + port + "/" + (base ? base + "/" : "") + "api/v1/";
		var el = document.getElementById("prowlarr_url_preview_value");
		if (el) el.textContent = url;
	}
	["prowlarr_protocol", "prowlarr_ip", "prowlarr_port", "prowlarr_base"].forEach(function (id) {
		var el = document.getElementById(id);
		if (!el) return;
		el.addEventListener("input", updateProwlarrUrlPreview);
		el.addEventListener("change", updateProwlarrUrlPreview);
	});
	updateProwlarrUrlPreview();

	// Show/hide Prowlarr API key
	var keyToggle = document.getElementById("prowlarr_api_key_toggle");
	if (keyToggle) {
		keyToggle.addEventListener("click", function () {
			var input = document.getElementById("prowlarr_api_key");
			if (input.type === "password") {
				input.type = "text";
				this.textContent = "🙈";
				this.setAttribute("aria-label", "Hide API key");
				this.title = "Hide API key";
			} else {
				input.type = "password";
				this.textContent = "👁";
				this.setAttribute("aria-label", "Show API key");
				this.title = "Show API key";
			}
		});
	}

	// Test Prowlarr connection
	var prowlarrTestBtn = document.getElementById("test_prowlarr_connection");
	if (prowlarrTestBtn) {
		prowlarrTestBtn.addEventListener("click", function () {
			var btn = this;
			var result = document.getElementById("test_prowlarr_result");
			btn.disabled = true;
			result.textContent = "Testing…";
			result.className = "test-result testing";

			saveOptions(function () {
				chrome.runtime.sendMessage({ method: "check_prowlarr_status", timeout: 5000 }, function (response) {
					btn.disabled = false;
					if (chrome.runtime.lastError) {
						result.textContent = "✗ Service worker not responding";
						result.className = "test-result error";
						return;
					}
					if (response && response.connected) {
						var label = "✓ Connected";
						if (response.version) label += " — v" + response.version;
						result.textContent = label;
						result.className = "test-result success";
					} else if (response && response.reason === "auth") {
						result.textContent = "✗ API key rejected";
						result.className = "test-result error";
					} else if (response && response.reason === "network") {
						result.textContent = "✗ Cannot reach Prowlarr — check the address";
						result.className = "test-result error";
					} else if (response && response.reason === "timeout") {
						result.textContent = "✗ Timed out";
						result.className = "test-result error";
					} else if (response && response.reason === "http") {
						result.textContent = "✗ HTTP " + (response.status || "?") + " from Prowlarr";
						result.className = "test-result error";
					} else if (response && response.reason === "config") {
						result.textContent = "✗ Address not configured";
						result.className = "test-result error";
					} else {
						result.textContent = "✗ Connection failed";
						result.className = "test-result error";
					}
				});
			});
		});
	}
});

chrome.storage.onChanged.addListener(function (changes, namespace) {
	var messages = [];
	// Prowlarr sub-setting updates (address, api key, results limit) are
	// suppressed when the integration is disabled, otherwise disabling
	// Prowlarr and pressing Apply confusingly reports "Prowlarr address
	// updated." alongside "Prowlarr integration disabled!".
	var prowlarrEnabledEl = document.getElementById("prowlarr_enabled");
	var prowlarrOn = !!(prowlarrEnabledEl && prowlarrEnabledEl.checked);
	for (var key in changes) {
		var storageChange = changes[key];
		// saveOptions() writes the full settings object on every Apply.
		// Firefox's storage.sync fires onChanged for every key included in
		// the set() call even when the value is unchanged (oldValue ===
		// newValue), which would otherwise flood the status block with
		// "Address protocol updated.", "Torrents per page set to 20.", etc.
		// after editing a single field. Only report messages for keys
		// whose value actually changed.
		if (storageChange.oldValue === storageChange.newValue) continue;
		debug_log('Storage key "' + key + '" changed. Old: "' + storageChange.oldValue + '", New: "' + storageChange.newValue + '"');

		switch (key) {
			case "address_protocol":
				messages.push("Address protocol updated.");
				break;
			case "address_ip":
				messages.push("Address IP updated.");
				break;
			case "address_port":
				messages.push("Address port updated.");
				break;
			case "address_base":
				messages.push("Address base updated.");
				break;
			case "password":
				messages.push("Password updated (encrypted).");
				break;
			case "handle_torrents":
				messages.push("Torrent link handling " + (document.getElementById("handle_torrents").checked ? "en" : "dis") + "abled!");
				break;
			case "handle_magnets":
				messages.push("Magnet link handling " + (document.getElementById("handle_magnets").checked ? "en" : "dis") + "abled!");
				break;
			case "context_menu":
				messages.push("Context Menu " + (document.getElementById("context_menu").checked ? "en" : "dis") + "abled!");
				break;
			case "badge_timeout":
				var sel = document.getElementById("badge_timeout");
				messages.push("Badge timeout set to " + sel.options[sel.selectedIndex].text);
				break;
			case "refresh_interval":
				var ri = document.getElementById("refresh_interval");
				messages.push("Refresh interval set to " + ri.options[ri.selectedIndex].text + ". Reopen popup to apply.");
				break;
			case "debug_mode":
				messages.push("Debug mode " + (document.getElementById("debug_mode").checked ? "en" : "dis") + "abled!");
				break;
			case "dark_mode":
				var dm = document.getElementById("dark_mode");
				messages.push("Theme set to " + dm.options[dm.selectedIndex].text + ".");
				break;
			case "icon_pack":
				var ip = document.getElementById("icon_pack");
				messages.push("Icon pack set to " + ip.options[ip.selectedIndex].text + ".");
				break;
			case "torrents_per_page":
				var tpp = document.getElementById("torrents_per_page");
				messages.push("Torrents per page set to " + tpp.options[tpp.selectedIndex].text + ".");
				break;
			case "show_per_page_in_popup":
				messages.push("Per-page selector in popup " + (document.getElementById("show_per_page_in_popup").checked ? "en" : "dis") + "abled!");
				break;
			case "always_show_pagination":
				messages.push("Always-show pagination bar " + (document.getElementById("always_show_pagination").checked ? "en" : "dis") + "abled!");
				break;
			case "prowlarr_enabled":
				messages.push("Prowlarr integration " + (document.getElementById("prowlarr_enabled").checked ? "en" : "dis") + "abled!");
				break;
			case "prowlarr_protocol":
			case "prowlarr_ip":
			case "prowlarr_port":
			case "prowlarr_base":
				if (prowlarrOn) messages.push("Prowlarr address updated.");
				break;
			case "prowlarr_api_key":
				if (prowlarrOn) messages.push("Prowlarr API key updated (encrypted).");
				break;
			case "prowlarr_results_limit":
				if (prowlarrOn) {
					var prl = document.getElementById("prowlarr_results_limit");
					messages.push("Prowlarr result limit set to " + prl.options[prl.selectedIndex].text + ".");
				}
				break;
			case "store_credentials_locally":
				messages.push(
					storageChange.newValue
						? "Credentials encrypted on this device only. (More secure)"
						: "Credentials syncing in plain text across devices. (Less secure)"
				);
				break;
		}
	}

	if (messages.length > 0) {
		// Deduplicate so things like repeated "Prowlarr address updated." don't stack up
		var seen = {};
		messages = messages.filter(function (m) {
			if (seen[m]) return false;
			seen[m] = true;
			return true;
		});
		var statusEl = document.getElementById("status-message");
		statusEl.textContent = "";
		for (var m = 0; m < messages.length; m++) {
			if (m > 0) statusEl.appendChild(document.createElement("br"));
			statusEl.appendChild(document.createTextNode(messages[m]));
		}
		statusEl.appendChild(document.createElement("br"));
		statusEl.appendChild(document.createElement("br"));
		statusEl.style.display = "";
		statusEl.style.opacity = "1";

		// Auto-fade after 5 seconds
		clearTimeout(statusEl._fadeTimer);
		statusEl._fadeTimer = setTimeout(function () {
			DomHelper.fadeOut(statusEl, 500);
		}, 5000);
	}
});

// Load settings from BOTH namespaces.
//   storage.local: store_credentials_locally flag + (when checked) encrypted credentials
//   storage.sync:  non-credential settings + (when unchecked) plaintext credentials
// The toggle determines where to read credentials from. Plaintext fields use
// `_plain` suffix so format is unambiguous from the key name alone.
chrome.storage.local.get(null, function (localItems) {
	localItems = localItems || {};
	chrome.storage.sync.get(null, function (syncItems) {
		syncItems = syncItems || {};

		var localOnly = (localItems.store_credentials_locally !== false);
		// Surface the toggle in the UI.
		var toggleEl = document.getElementById("store_credentials_locally");
		if (toggleEl) toggleEl.checked = localOnly;

		// Load non-credential settings from sync. Skip credential keys —
		// those are handled below with their own format-aware decode.
		var CREDENTIAL_FIELDS = ["password", "password_plain", "prowlarr_api_key", "prowlarr_api_key_plain"];
		for (var key in syncItems) {
			if (CREDENTIAL_FIELDS.indexOf(key) !== -1) continue;
			debug_log(key + "\t" + syncItems[key] + "\t" + (typeof syncItems[key]));
			var el = document.getElementById(key);
			if (!el) continue;
			if (typeof syncItems[key] === "boolean") {
				el.checked = syncItems[key];
			} else {
				el.value = syncItems[key];
			}
		}

		// Credentials. Two modes:
		//   localOnly=true:  encrypted blob in storage.local — decrypt for display
		//   localOnly=false: plaintext in storage.sync       — display directly
		// On migration from <=1.5.6: storage.sync had encrypted blobs under
		// `password` / `prowlarr_api_key` (no _plain suffix). Treat that as
		// encrypted-mode source data on first load — only the device whose
		// local key created the blob can decrypt it. global_options.js's
		// migration block writes the result into storage.local.password.
		if (localOnly) {
			var encrypted = localItems.password !== undefined ? localItems.password : syncItems.password;
			if (encrypted) {
				_storedEncryptedPassword = encrypted;
				PasswordCrypto.decrypt(encrypted).then(function (plainPassword) {
					document.getElementById("password").value = plainPassword;
					_originalPassword = plainPassword;
				}).catch(function () {
					document.getElementById("password").value = "";
					_originalPassword = "";
				});
			}
			var encryptedKey = localItems.prowlarr_api_key !== undefined ? localItems.prowlarr_api_key : syncItems.prowlarr_api_key;
			if (encryptedKey) {
				_storedEncryptedProwlarrApiKey = encryptedKey;
				PasswordCrypto.decrypt(encryptedKey).then(function (plainKey) {
					document.getElementById("prowlarr_api_key").value = plainKey;
					_originalProwlarrApiKey = plainKey;
				}).catch(function () {
					document.getElementById("prowlarr_api_key").value = "";
					_originalProwlarrApiKey = "";
				});
			}
		} else {
			// Plaintext sync mode — direct read.
			var plainPwd = syncItems.password_plain;
			if (plainPwd !== undefined) {
				document.getElementById("password").value = plainPwd;
				_originalPassword = plainPwd;
			}
			var plainKey = syncItems.prowlarr_api_key_plain;
			if (plainKey !== undefined) {
				document.getElementById("prowlarr_api_key").value = plainKey;
				_originalProwlarrApiKey = plainKey;
			}
		}

		if (window.location.search === "?newver=true" && Object.keys(syncItems).length > 0) {
			debug_log("Version upgrade. Re-saving settings.");
			saveOptions();
		}

		// Refresh URL preview after settings loaded
		var updateBtn = document.getElementById("url_preview_value");
		if (updateBtn) {
			document.getElementById("address_protocol").dispatchEvent(new Event("change"));
		}

		// Sync the Prowlarr fieldset visibility and its URL preview once values
		// are loaded from storage.
		var prowlarrEnableEl = document.getElementById("prowlarr_enabled");
		var prowlarrFieldset = document.getElementById("prowlarr_fieldset");
		if (prowlarrEnableEl && prowlarrFieldset) {
			prowlarrFieldset.style.display = prowlarrEnableEl.checked ? "" : "none";
		}
		var prowlarrProto = document.getElementById("prowlarr_protocol");
		if (prowlarrProto) prowlarrProto.dispatchEvent(new Event("change"));
	});
});
