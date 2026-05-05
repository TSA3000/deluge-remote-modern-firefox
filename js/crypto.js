/*
 * Credential storage and AES-GCM encryption (Web Crypto API).
 *
 * Two modes, controlled by the per-device flag `store_credentials_locally`
 * (see options.html toggle and global_options.js routing):
 *
 *   ENCRYPTED LOCAL (toggle on, default — more secure):
 *     • AES-GCM 256-bit key generated per-install, stored in
 *       storage.local.encryption_key_jwk (never syncs).
 *     • Encrypted blob (IV + ciphertext, base64) stored in
 *       storage.local.password / .prowlarr_api_key.
 *     • Credentials never leave this device in any form.
 *
 *   PLAINTEXT SYNC (toggle off — less secure, multi-device convenience):
 *     • Credentials stored as plaintext strings in
 *       storage.sync.password_plain / .prowlarr_api_key_plain.
 *     • Plaintext is shared across all devices signed into the same
 *       browser account. Anyone with that account can read them.
 *     • The encryption key still exists in storage.local but is unused.
 *
 * Field name encodes format: keys ending in `_plain` are always plaintext;
 * `password` / `prowlarr_api_key` (no suffix) are always encrypted blobs.
 *
 * Runtime code reads the resolved plaintext via PasswordCrypto.resolveCredential
 * (or just decrypt() in legacy paths that already know they have ciphertext).
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

	/**
	 * Resolve a credential field in ExtensionConfig to its plaintext value,
	 * regardless of which storage mode the user has selected.
	 *
	 * Runtime code (background.js login, prowlarr API calls, etc.) shouldn't
	 * have to care whether a credential was stored encrypted-local or
	 * plaintext-sync. global_options.js loads either format into
	 * ExtensionConfig under the unsuffixed name (e.g. ExtensionConfig.password),
	 * and this helper returns plaintext in both cases.
	 *
	 * @param {string} value - ExtensionConfig.password or .prowlarr_api_key
	 * @param {boolean} localOnly - ExtensionConfig.store_credentials_locally
	 * @returns {Promise<string>} plaintext, or "" if absent
	 */
	pub.resolveCredential = function (value, localOnly) {
		if (!value) return Promise.resolve("");
		if (localOnly === false) {
			// Plaintext-sync mode: value is already plaintext.
			return Promise.resolve(value);
		}
		// Encrypted-local mode: value is an encrypted blob.
		return pub.decrypt(value);
	};

	return pub;
}());
