/*
 * Module responsible for fetching, storing and sorting torrent objects.
 */
var Torrents = (function () {
	var pub = {};
	var torrents = [];
	var torrentMap = {};
	var globalInformation = {};
	var availableLabels = [];

	pub.getAll = function () {
		return torrents;
	};

	pub.sort = function (by, invert) {
		torrents.sortByParameter(by, invert);
		return this;
	};

	pub.getById = function (val) {
		return torrentMap[val] || false;
	};

	pub.getGlobalInformation = function () {
		return globalInformation;
	};

	pub.getLabels = function () {
		return availableLabels;
	};

	pub.cleanup = function () {
		torrents = [];
		torrentMap = {};
	};

	pub.update = function () {
		var that = this;
		var api = Deluge.api("web.update_ui", [[
				"queue", "name", "total_size", "state", "progress",
				"download_payload_rate", "upload_payload_rate", "eta",
				"ratio", "is_auto_managed", "num_seeds", "total_seeds",
				"num_peers", "total_peers", "seeds_peers_ratio",
				"is_finished", "is_seed", "active_time", "seeding_time",
				"time_added", "tracker_host", "tracker_status", "label"
			], {}],
			{ timeout: 2000 }
		)
		.success(function (response) {
			var id, tmp, torrent;

			that.cleanup();

			for (id in response.torrents) {
				if (response.torrents.hasOwnProperty(id)) {
					torrent = new Torrent(id, response.torrents[id]);
					torrents.push(torrent);
					torrentMap[id] = torrent;
				}
			}

			for (id in response.filters.state) {
				if (response.filters.state.hasOwnProperty(id)) {
					tmp = response.filters.state[id];
					globalInformation[tmp[0].toLowerCase()] = tmp[1];
				}
			}

			availableLabels = [];
			if (response.filters.label) {
				for (var i = 0, len = response.filters.label.length; i < len; i++) {
					var labelName = response.filters.label[i][0];
					if (labelName !== "All" && labelName !== "") {
						availableLabels.push(labelName);
					}
				}
			}

			for (id in response.filters) {
				if (response.filters.hasOwnProperty(id)) {
					var filterEl = document.getElementById("filter_" + id);
					if (!filterEl) continue;

					var options = response.filters[id];
					var html = "";

					for (var j = 0, jlen = options.length; j < jlen; j++) {
						var text = options[j][0];
						text = (text === "" ? "<blank>" : text);
						text += " (" + options[j][1] + ")";
						html += '<option value="' + options[j][0] + '">' + text + '</option>';
					}

					filterEl.innerHTML = html;
					filterEl.value = localStorage["filter_" + id] || "All";
				}
			}

			response = null;
			debug_log(torrents);
		});

		return api;
	};

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
