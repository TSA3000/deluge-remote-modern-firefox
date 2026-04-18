/*
 * Module responsible for fetching, storing and sorting torrent objects.
 *
 * Performance strategy:
 *  - First call: web.update_ui (full state + filters + labels)
 *  - Subsequent: core.get_torrents_status with diff=true (only changed fields)
 *  - Every Nth poll: full update to reconcile filter tree
 *  - Events (web.get_events): catch add/remove between polls
 */
var Torrents = (function () {
	var pub = {};
	var torrents = [];
	var torrentMap = {};
	var globalInformation = {};
	var availableLabels = [];

	var eventsRegistered = false;
	var pollCount = 0;
	var FULL_UPDATE_EVERY = 10; // full refresh every 10 polls

	// Only the fields the popup actually displays or filters on
	var KEYS = [
		"queue", "name", "total_size", "state", "progress",
		"download_payload_rate", "upload_payload_rate", "eta",
		"ratio", "is_auto_managed", "num_seeds", "total_seeds",
		"num_peers", "total_peers", "is_finished",
		"tracker_host", "tracker_status", "label"
	];

	var SUBSCRIBE_EVENTS = [
		"TorrentAddedEvent",
		"TorrentRemovedEvent",
		"TorrentStateChangedEvent",
		"TorrentFinishedEvent",
		"SessionPausedEvent",
		"SessionResumedEvent"
	];

	pub.getAll = function () { return torrents; };

	pub.sort = function (by, invert) {
		torrents.sortByParameter(by, invert);
		return this;
	};

	pub.getById = function (val) { return torrentMap[val] || false; };
	pub.getGlobalInformation = function () { return globalInformation; };
	pub.getLabels = function () { return availableLabels; };

	/**
	 * Remove a torrent from the local state and update global counters.
	 * Used both for optimistic UI removal when the user clicks delete, and
	 * by the TorrentRemovedEvent handler. Idempotent — double-removal is a
	 * no-op.
	 */
	pub.removeById = function (id) {
		var existing = torrentMap[id];
		if (!existing) return false;
		delete torrentMap[id];
		for (var i = torrents.length - 1; i >= 0; i--) {
			if (torrents[i].id === id) { torrents.splice(i, 1); break; }
		}
		if (globalInformation.all) globalInformation.all--;
		var state = (existing.state || "").toLowerCase();
		if (state && globalInformation[state]) globalInformation[state]--;
		return true;
	};

	/**
	 * Force the next pub.update() call to do a full refresh rather than a
	 * diff. Used after destructive actions (delete) so the client state
	 * fully reconciles with the server's.
	 */
	pub.forceFullUpdateNext = function () { pollCount = 0; };

	pub.cleanup = function () {
		torrents = [];
		torrentMap = {};
	};

	pub.reset = function () {
		pub.cleanup();
		pollCount = 0;
		eventsRegistered = false;
	};

	// Entry point called by popup.js — decides full vs diff
	pub.update = function () {
		var doFull = (pollCount === 0) || (pollCount % FULL_UPDATE_EVERY === 0);
		pollCount++;
		return doFull ? fullUpdate() : diffUpdate();
	};

	function fullUpdate() {
		return Deluge.api("web.update_ui", [KEYS, {}], { timeout: 5000 })
			.success(function (response) {
				if (!response || !response.torrents) return;

				// Rebuild torrent list
				torrents = [];
				torrentMap = {};
				for (var id in response.torrents) {
					if (response.torrents.hasOwnProperty(id)) {
						var t = new Torrent(id, response.torrents[id]);
						torrents.push(t);
						torrentMap[id] = t;
					}
				}

				processFilters(response.filters);
				registerEventsOnce();
				response = null;
				debug_log("Full update:", torrents.length, "torrents");
			});
	}

	function diffUpdate() {
		// core.get_torrents_status(filter_dict, keys, diff=True)
		return Deluge.api("core.get_torrents_status", [{}, KEYS, true], { timeout: 5000 })
			.success(function (response) {
				if (!response) return;

				for (var id in response) {
					if (!response.hasOwnProperty(id)) continue;
					var existing = torrentMap[id];
					if (existing) {
						applyDiff(existing, response[id]);
					} else {
						// New torrent appeared in diff (event didn't fire yet)
						var t = new Torrent(id, response[id]);
						torrents.push(t);
						torrentMap[id] = t;
					}
				}

				debug_log("Diff update:", Object.keys(response).length, "changed");
				response = null;
			});
	}

	// Map API field names to Torrent object properties
	function applyDiff(torrent, diff) {
		if ("name" in diff) torrent.name = diff.name;
		if ("progress" in diff) torrent.progress = diff.progress;
		if ("state" in diff) torrent.state = diff.state;
		if ("total_size" in diff) torrent.size = diff.total_size;
		if ("queue" in diff) torrent.position = diff.queue;
		if ("download_payload_rate" in diff) torrent.speedDownload = diff.download_payload_rate;
		if ("upload_payload_rate" in diff) torrent.speedUpload = diff.upload_payload_rate;
		if ("eta" in diff) torrent.eta = diff.eta;
		if ("is_auto_managed" in diff) torrent.autoManaged = diff.is_auto_managed;
		if ("ratio" in diff) torrent.ratio = diff.ratio;
		if ("num_seeds" in diff) torrent.num_seeds = diff.num_seeds;
		if ("total_seeds" in diff) torrent.total_seeds = diff.total_seeds;
		if ("num_peers" in diff) torrent.num_peers = diff.num_peers;
		if ("total_peers" in diff) torrent.total_peers = diff.total_peers;
		if ("is_finished" in diff) torrent.is_finished = diff.is_finished;
		if ("tracker_host" in diff) torrent.tracker_host = diff.tracker_host;
		if ("tracker_status" in diff) torrent.tracker_status = diff.tracker_status;
		if ("label" in diff) torrent.label = diff.label;
	}

	function processFilters(filters) {
		if (!filters) return;

		globalInformation = {};
		if (filters.state) {
			for (var id in filters.state) {
				if (filters.state.hasOwnProperty(id)) {
					var tmp = filters.state[id];
					globalInformation[tmp[0].toLowerCase()] = tmp[1];
				}
			}
		}

		availableLabels = [];
		if (filters.label) {
			for (var i = 0; i < filters.label.length; i++) {
				var name = filters.label[i][0];
				if (name !== "All" && name !== "") availableLabels.push(name);
			}
		}

		for (var key in filters) {
			if (!filters.hasOwnProperty(key)) continue;
			var el = document.getElementById("filter_" + key);
			if (!el) continue;

			var options = filters[key];
			el.textContent = "";
			for (var j = 0; j < options.length; j++) {
				var text = options[j][0] === "" ? "<blank>" : options[j][0];
				text += " (" + options[j][1] + ")";
				var opt = document.createElement("option");
				opt.value = options[j][0];
				opt.textContent = text;
				el.appendChild(opt);
			}
			el.value = localStorage["filter_" + key] || "All";
		}
	}

	function registerEventsOnce() {
		if (eventsRegistered) return;
		eventsRegistered = true;
		for (var i = 0; i < SUBSCRIBE_EVENTS.length; i++) {
			Deluge.api("web.register_event_listener", [SUBSCRIBE_EVENTS[i]]);
		}
		debug_log("Event listeners registered");
	}

	// Poll events and handle them (called by popup.js between updates)
	pub.pollEvents = function () {
		if (!eventsRegistered) return null;
		return Deluge.api("web.get_events", [], { timeout: 5000 })
			.success(function (events) {
				if (!events) return;
				for (var evtName in events) {
					if (!events.hasOwnProperty(evtName)) continue;
					var calls = events[evtName];
					for (var i = 0; i < calls.length; i++) {
						handleEvent(evtName, calls[i]);
					}
				}
			});
	};

	function handleEvent(evtName, args) {
		debug_log("Event:", evtName, args);
		switch (evtName) {
			case "TorrentRemovedEvent":
				pub.removeById(args[0]);
				break;
			case "TorrentAddedEvent":
				// Force a full refresh on next update to pick up the new torrent
				pollCount = 0;
				if (globalInformation.all !== undefined) globalInformation.all++;
				break;
			case "TorrentStateChangedEvent":
				if (torrentMap[args[0]]) torrentMap[args[0]].state = args[1];
				break;
			case "TorrentFinishedEvent":
				if (torrentMap[args[0]]) torrentMap[args[0]].is_finished = true;
				break;
		}
	}

	return pub;
}());

Array.prototype.sortByParameter = function (sortParameter, invert) {
	invert = (typeof invert === "undefined" || typeof invert !== "boolean") ? false : invert;
	function compare(a, b) {
		var left, right;
		switch (sortParameter) {
			case "position":
				left = (a.position === -1) ? 999 : a.position;
				right = (b.position === -1) ? 999 : b.position;
				break;
			default:
				left = a[sortParameter];
				right = b[sortParameter];
				break;
		}
		if (left < right) return -1;
		if (left > right) return 1;
		return 0;
	}
	this.sort(compare);
	if (invert) this.reverse();
	return this;
};
