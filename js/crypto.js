/*
 * Password encryption using AES-GCM with Web Crypto API.
 *
 * - Encryption key is generated per-installation and stored in
 *   chrome.storage.local. Key never syncs.
 * - Encrypted credentials are stored in either chrome.storage.local
 *   (default, recommended) or chrome.storage.sync, controlled by the
 *   per-device flag `store_credentials_locally`. See options.html for the
 *   user-facing toggle and global_options.js for the routing logic.
 * - Multi-device note: each install has its own encryption key, so the
 *   default local-only mode is the only configuration where multiple
 *   devices can use the extension without repeated password prompts.
 *   Sync mode is provided as an opt-in for single-device users who want
 *   their credentials backed up to their browser account.
 * - IV is stored alongside ciphertext.
 */

var PasswordCrypto = (function () {
	var pub = {};
	var KEY_STORAGE = "encryption_key_jwk";
	var cachedKey = null;

	/**
	 * Get or create the encryption key.
	 * Key is stored in chrome.storage.local (never syncs).
	 */
	pub.getKey = function () {
		return new Promise(function (resolve, reject) {
			if (cachedKey) {
				resolve(cachedKey);
				return;
			}

			chrome.storage.local.get(KEY_STORAGE, function (result) {
				if (result && result[KEY_STORAGE]) {
					// Import existing key
					crypto.subtle.importKey(
						"jwk",
						result[KEY_STORAGE],
						{ name: "AES-GCM" },
						false,
						["encrypt", "decrypt"]
					).then(function (key) {
						cachedKey = key;
						resolve(key);
					}).catch(reject);
				} else {
					// Generate new key on first install
					crypto.subtle.generateKey(
						{ name: "AES-GCM", length: 256 },
						true,
						["encrypt", "decrypt"]
					).then(function (key) {
						// Export and store
						return crypto.subtle.exportKey("jwk", key).then(function (jwk) {
							var store = {};
							store[KEY_STORAGE] = jwk;
							chrome.storage.local.set(store, function () {
								cachedKey = key;
								resolve(key);
							});
						});
					}).catch(reject);
				}
			});
		});
	};

	/**
	 * Encrypt a plaintext password.
	 * Returns a JSON string containing iv + ciphertext (both base64).
	 */
	pub.encrypt = function (plaintext) {
		if (!plaintext || plaintext === "") {
			return Promise.resolve("");
		}

		return pub.getKey().then(function (key) {
			var iv = crypto.getRandomValues(new Uint8Array(12));
			var encoded = new TextEncoder().encode(plaintext);

			return crypto.subtle.encrypt(
				{ name: "AES-GCM", iv: iv },
				key,
				encoded
			).then(function (ciphertext) {
				// Store as JSON with base64-encoded iv and ciphertext
				var result = {
					_encrypted: true,
					iv: arrayBufferToBase64(iv),
					data: arrayBufferToBase64(ciphertext)
				};
				return JSON.stringify(result);
			});
		});
	};

	/**
	 * Decrypt an encrypted password string.
	 * Accepts either an encrypted JSON string or a plain string (for migration).
	 */
	pub.decrypt = function (stored) {
		if (!stored || stored === "") {
			return Promise.resolve("");
		}

		// Check if it's an encrypted value
		try {
			var parsed = JSON.parse(stored);
			if (!parsed._encrypted) {
				// Not encrypted, return as-is (migration case)
				return Promise.resolve(stored);
			}

			return pub.getKey().then(function (key) {
				var iv = base64ToArrayBuffer(parsed.iv);
				var data = base64ToArrayBuffer(parsed.data);

				return crypto.subtle.decrypt(
					{ name: "AES-GCM", iv: iv },
					key,
					data
				).then(function (decrypted) {
					return new TextDecoder().decode(decrypted);
				});
			});
		} catch (e) {
			// Not JSON — plain text password (migration from old version)
			return Promise.resolve(stored);
		}
	};

	/**
	 * Check if a stored value is already encrypted.
	 */
	pub.isEncrypted = function (stored) {
		try {
			var parsed = JSON.parse(stored);
			return parsed._encrypted === true;
		} catch (e) {
			return false;
		}
	};

	// ── Helpers ──────────────────────────────────────────────────────────
	function arrayBufferToBase64(buffer) {
		var bytes = new Uint8Array(buffer);
		var binary = "";
		for (var i = 0; i < bytes.byteLength; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return btoa(binary);
	}

	function base64ToArrayBuffer(base64) {
		var binary = atob(base64);
		var bytes = new Uint8Array(binary.length);
		for (var i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes.buffer;
	}

	return pub;
}());
