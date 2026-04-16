var Deluge = (function () {
	var Deluge = {};

	function endpoint() {
		return ExtensionConfig.address_protocol + "://" +
			ExtensionConfig.address_ip + ":" +
			(ExtensionConfig.address_port || "8112") + "/" +
			(ExtensionConfig.address_base ? ExtensionConfig.address_base + "/" : "");
	}

	Deluge.API_ERROR          = "apierror";
	Deluge.API_AUTH_CODE      = 1;
	Deluge.API_UNKNOWN_METHOD = 2;
	Deluge.API_UNKNOWN_ERROR  = 3;

	Deluge.endpoint = function () { return endpoint(); };

	Deluge.api = function (method, params, options) {
		options = options || {};
		var timeout = options.timeout || 10000;
		var successCbs = [];
		var errorCbs   = [];

		var controller = new AbortController();
		var aborted = false;
		var timer = setTimeout(function () {
			aborted = true;
			controller.abort();
		}, timeout);

		var fetchPromise = fetch(endpoint() + "json", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ method: method, params: params || [], id: "-999" }),
			credentials: "include",
			signal: controller.signal
		})
		.then(function (resp) {
			clearTimeout(timer);
			if (!resp.ok) throw { type: "http", status: resp.status };
			return resp.json();
		})
		.then(function (json) {
			if (json.error !== null) {
				var err = json.error;
				for (var i = 0; i < errorCbs.length; i++) {
					errorCbs[i]({}, Deluge.API_ERROR, err);
				}
				throw { type: "api", code: err.code, message: err.message, _handled: true };
			}
			for (var i = 0; i < successCbs.length; i++) {
				successCbs[i](json.result, "success", {});
			}
			return json.result;
		})
		.catch(function (err) {
			clearTimeout(timer);

			// Normalize AbortError into a typed error
			if (err && err.name === "AbortError") {
				err = { type: "timeout", message: "Request aborted (timeout after " + timeout + "ms)", _aborted: aborted };
			}

			if (!err._handled) {
				for (var i = 0; i < errorCbs.length; i++) {
					try { errorCbs[i]({}, "error", err); } catch (_) {}
				}
			}
			// Swallow by default so callers using .success()/.error() don't see
			// "Uncaught (in promise)" noise. Callers using .then/.catch still get it.
			return Promise.reject(err);
		});

		// Silent default catch so AbortError / network errors don't surface as
		// uncaught rejections when the caller only uses .success()/.error()
		fetchPromise.catch(function () {});

		var wrapper = {
			success: function (cb) {
				successCbs.push(cb);
				return wrapper;
			},
			error: function (cb) {
				errorCbs.push(cb);
				return wrapper;
			},
			then: fetchPromise.then.bind(fetchPromise),
			catch: fetchPromise.catch.bind(fetchPromise)
		};

		if (options.success) successCbs.push(options.success);
		if (options.error)   errorCbs.push(options.error);

		return wrapper;
	};

	return Deluge;
}());
