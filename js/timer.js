var Timer = function (interval) {
	var handlers = [];
	var timeOut = null;
	var pub = {};

	function updateHandlers() {
		for (var i = 0; i < handlers.length; i += 1) {
			handlers[i]();
		}
		timeOut = setTimeout(updateHandlers, interval);
	}

	pub.subscribe = function (handler) {
		if (handlers.indexOf(handler) === -1) {
			handlers.push(handler);
		}
	};

	pub.unsubscribe = function (handler) {
		var idx = handlers.indexOf(handler);
		if (idx > -1) {
			handlers.splice(idx, 1);
		}
	};

	// Takes effect from the next tick.
	pub.setInterval = function (ms) {
		interval = ms;
	};

	pub.destroy = function () {
		if (timeOut) {
			clearTimeout(timeOut);
			timeOut = null;
		}
		handlers = [];
	};

	updateHandlers();
	return pub;
};
