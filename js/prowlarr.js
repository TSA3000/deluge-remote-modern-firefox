/*
 * Prowlarr API client.
 *
 * All calls are proxied through the background service worker so the API key
 * (stored encrypted via PasswordCrypto) is decrypted server-side and never
 * leaves the worker. Mirrors the Deluge module's success()/error() style.
 */
var Prowlarr = (function () {
	var Prowlarr = {};

	function endpoint() {
		return (ExtensionConfig.prowlarr_protocol || "http") + "://" +
			(ExtensionConfig.prowlarr_ip || "") + ":" +
			(ExtensionConfig.prowlarr_port || "9696") + "/" +
			(ExtensionConfig.prowlarr_base ? ExtensionConfig.prowlarr_base + "/" : "");
	}

	Prowlarr.API_ERROR    = "apierror";
	Prowlarr.API_AUTH     = "auth";
	Prowlarr.API_NETWORK  = "network";
	Prowlarr.API_TIMEOUT  = "timeout";

	Prowlarr.endpoint = function () { return endpoint(); };

	/**
	 * Make a Prowlarr API call by proxying through the service worker.
	 *
	 * @param {string} path    — path relative to base, e.g. "api/v1/search"
	 * @param {object} options — { method, query, body, timeout }
	 * @returns wrapper with .success(cb) / .error(cb) / .then / .catch
	 */
	Prowlarr.api = function (path, options) {
		options = options || {};
		var successCbs = [];
		var errorCbs   = [];

		var fetchPromise = new Promise(function (resolve, reject) {
			chrome.runtime.sendMessage({
				method:   "prowlarr_api",
				path:     path,
				query:    options.query   || null,
				body:     options.body    || null,
				httpMethod: options.method || "GET",
				timeout:  options.timeout || 15000
			}, function (resp) {
				if (chrome.runtime.lastError) {
					var err = { type: "runtime", message: chrome.runtime.lastError.message };
					for (var i = 0; i < errorCbs.length; i++) {
						try { errorCbs[i]({}, Prowlarr.API_ERROR, err); } catch (_) {}
					}
					reject(err);
					return;
				}
				if (resp && resp.error) {
					for (var j = 0; j < errorCbs.length; j++) {
						try { errorCbs[j]({}, Prowlarr.API_ERROR, resp.error); } catch (_) {}
					}
					reject(resp.error);
					return;
				}
				var result = resp ? resp.result : null;
				for (var k = 0; k < successCbs.length; k++) {
					try { successCbs[k](result, "success", {}); } catch (_) {}
				}
				resolve(result);
			});
		});

		// Silent default catch so callers using .success()/.error() don't
		// surface "Uncaught (in promise)" noise.
		fetchPromise.catch(function () {});

		var wrapper = {
			success: function (cb) { successCbs.push(cb); return wrapper; },
			error:   function (cb) { errorCbs.push(cb);   return wrapper; },
			then:    fetchPromise.then.bind(fetchPromise),
			catch:   fetchPromise.catch.bind(fetchPromise)
		};

		if (options.success) successCbs.push(options.success);
		if (options.error)   errorCbs.push(options.error);

		return wrapper;
	};

	// ── Convenience wrappers ────────────────────────────────────────────
	Prowlarr.search = function (query, opts) {
		opts = opts || {};
		var q = { query: query, type: "search" };
		if (opts.indexerIds && opts.indexerIds.length) {
			q.indexerIds = opts.indexerIds.join(",");
		}
		if (opts.categories && opts.categories.length) {
			q.categories = opts.categories.join(",");
		}
		if (opts.limit) {
			q.limit = opts.limit;
		}
		return Prowlarr.api("api/v1/search", { query: q, timeout: opts.timeout || 30000 });
	};

	Prowlarr.getIndexers = function () {
		return Prowlarr.api("api/v1/indexer");
	};

	Prowlarr.getStatus = function (timeout) {
		return Prowlarr.api("api/v1/system/status", { timeout: timeout || 5000 });
	};

	/**
	 * Grab a release — Prowlarr forwards it to its configured download client.
	 * Mirrors what the Prowlarr web UI does when you click the download arrow
	 * on a search result.
	 *
	 * @param {string|number} guid
	 * @param {number}        indexerId
	 */
	Prowlarr.grab = function (guid, indexerId) {
		return Prowlarr.api("api/v1/search", {
			method: "POST",
			body: { guid: String(guid), indexerId: Number(indexerId) },
			timeout: 30000
		});
	};

	/**
	 * Cancel any in-flight search on the background side.
	 * Resolves with { cancelled: true } if a search was aborted.
	 */
	Prowlarr.cancelSearch = function () {
		return new Promise(function (resolve) {
			chrome.runtime.sendMessage({ method: "prowlarr_cancel_search" }, function (resp) {
				resolve(resp || { cancelled: false });
			});
		});
	};

	return Prowlarr;
}());
