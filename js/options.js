// Track the loaded password so we only re-encrypt when it actually changes
var _originalPassword = "";
var _storedEncryptedPassword = "";

function saveOptions(callback) {
	var plainPassword = document.getElementById("password").value;
	var passwordChanged = (plainPassword !== _originalPassword);

	function doSave(passwordValue) {
		var settings = {
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
			"version": chrome.runtime.getManifest().version
		};

		// Only include password if it changed
		if (passwordChanged) {
			settings.password = passwordValue;
			_originalPassword = plainPassword;
			_storedEncryptedPassword = passwordValue;
		}

		chrome.storage.sync.set(settings, function () {
			debug_log("Settings saved" + (passwordChanged ? " (password encrypted)" : ""));
			if (callback) callback();
		});
	}

	if (passwordChanged) {
		PasswordCrypto.encrypt(plainPassword).then(function (encryptedPassword) {
			doSave(encryptedPassword);
		}).catch(function (err) {
			console.error("Failed to encrypt password:", err);
			doSave(plainPassword);
		});
	} else {
		doSave(null);
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
		result.style.color = "#888";

		saveOptions(function () {
			chrome.runtime.sendMessage({ method: "check_status" }, function (response) {
				btn.disabled = false;
				if (chrome.runtime.lastError) {
					result.textContent = "✗ Service worker not responding";
					result.style.color = "#e74c3c";
					return;
				}
				if (response && response.connected) {
					result.textContent = "✓ Connected!";
					result.style.color = "#27ae60";
				} else if (response && response.reason === "auth_failed") {
					result.textContent = "✗ Login failed — check password";
					result.style.color = "#e74c3c";
				} else if (response && response.reason === "network_error") {
					result.textContent = "✗ Cannot reach server — check address";
					result.style.color = "#e74c3c";
				} else {
					result.textContent = "✗ Connection failed";
					result.style.color = "#e74c3c";
				}
			});
		});
	});
});

chrome.storage.onChanged.addListener(function (changes, namespace) {
	var messages = [];
	for (var key in changes) {
		var storageChange = changes[key];
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
		}
	}

	if (messages.length > 0) {
		var statusEl = document.getElementById("status-message");
		statusEl.innerHTML = messages.join("<br>") + "<br><br>";
		statusEl.style.display = "";
		statusEl.style.opacity = "1";

		// Auto-fade after 5 seconds
		clearTimeout(statusEl._fadeTimer);
		statusEl._fadeTimer = setTimeout(function () {
			DomHelper.fadeOut(statusEl, 500);
		}, 5000);
	}
});

chrome.storage.sync.get(function (items) {
	for (var key in items) {
		debug_log(key + "\t" + items[key] + "\t" + (typeof items[key]));

		var el = document.getElementById(key);
		if (!el) continue;

		if (key === "password") {
			_storedEncryptedPassword = items[key];
			PasswordCrypto.decrypt(items[key]).then(function (plainPassword) {
				document.getElementById("password").value = plainPassword;
				_originalPassword = plainPassword;
			}).catch(function () {
				document.getElementById("password").value = "";
				_originalPassword = "";
			});
		} else if (typeof items[key] === "boolean") {
			el.checked = items[key];
		} else {
			el.value = items[key];
		}
	}

	if (window.location.search === "?newver=true" && Object.keys(items).length > 0) {
		debug_log("New version. Saving settings.");
		saveOptions();
	}
});
