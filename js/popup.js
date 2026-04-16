document.addEventListener("DOMContentLoaded", function () {
	var extensionActivated = false;
	var overlay = document.getElementById("overlay");
	overlay.style.height = document.documentElement.scrollHeight + "px";

	var torrentContainer = document.getElementById("torrent_container");
	var globalAll = document.querySelector("#global-information .all");
	var globalDownloading = document.querySelector("#global-information .downloading");
	var globalPaused = document.querySelector("#global-information .paused");
	var globalSeeding = document.querySelector("#global-information .seeding");
	var globalQueued = document.querySelector("#global-information .queued");

	var REFRESH_INTERVAL = ExtensionConfig.refresh_interval || 1000;
	var refreshTimer = Timer(REFRESH_INTERVAL);

	var currentPage = 1;
	var totalPages = 1;
	var pageSize = (typeof ExtensionConfig.torrents_per_page === "number")
		? ExtensionConfig.torrents_per_page : 20;

	var pagePrev = document.getElementById("page_prev");
	var pageNext = document.getElementById("page_next");
	var pageInfo = document.getElementById("page_info");
	var paginationBar = document.getElementById("pagination");

	var cachedLabelOptionsHtml = '<option value="">(No Label)</option>';
	var lastLabelHash = "";

	function rebuildLabelOptions() {
		var labels = Torrents.getLabels();
		var hash = labels.join("|");
		if (hash === lastLabelHash) return;
		lastLabelHash = hash;

		var parts = ['<option value="">(No Label)</option>'];
		for (var i = 0; i < labels.length; i++) {
			parts.push('<option value="' + labels[i] + '">' + labels[i] + '</option>');
		}
		cachedLabelOptionsHtml = parts.join("");
	}

	function buildRowHtml(torrent) {
		var state = torrent.state === "Paused" ? "resume" : "pause";
		var managed = torrent.autoManaged ? "managed" : "unmanaged";
		var finishedClass = torrent.is_finished ? " finished" : "";
		var sizeText = (torrent.progress != 100 ? torrent.getHumanDownloadedSize() + " of " : "") + torrent.getHumanSize();
		var labelCellHtml = Torrents.hasPlugin("Label")
			? '<td class="table_cell_label"><select class="label_select" data-torrent-id="' + torrent.id + '">' + cachedLabelOptionsHtml + '</select></td>'
			: "";

		return '<div class="torrent_row" data-id="' + torrent.id + '">' +
			'<table><tr>' +
				'<td class="table_cell_position">' + torrent.getPosition() + '</td>' +
				'<td class="table_cell_name">' + torrent.name + '</td>' +
			'</tr></table>' +
			'<table><tr>' +
				'<td class="table_cell_size">' + sizeText + '</td>' +
				'<td class="table_cell_eta">ETA: ' + torrent.getEta() + '</td>' +
				'<td class="table_cell_ratio">Ratio: ' + torrent.getRatio() + '</td>' +
				'<td class="table_cell_peers">Peers: ' + torrent.num_peers + '/' + torrent.total_peers + '</td>' +
				'<td class="table_cell_seeds">Seeds: ' + torrent.num_seeds + '/' + torrent.total_seeds + '</td>' +
				labelCellHtml +
				'<td class="table_cell_speed">' + torrent.getSpeeds() + '</td>' +
			'</tr></table>' +
			'<table><tr><td class="table_cell_progress">' +
				'<div class="progress_bar">' +
					'<div class="inner ' + torrent.state + finishedClass + '" style="width:' + torrent.getPercent() + '"></div>' +
					'<span>' + torrent.getPercent() + ' - ' + torrent.state + '</span>' +
				'</div>' +
			'</td></tr></table>' +
			'<table><tr><td class="table_cell_actions">' +
				'<div class="main_actions">' +
					'<a class="state ' + state + '" title="Pause/Resume Torrent"></a>' +
					'<a class="move_up" title="Move Torrent Up"></a>' +
					'<a class="move_down" title="Move Torrent Down"></a>' +
					'<a class="toggle_managed ' + managed + '" title="Toggle Auto-managed State"></a>' +
					'<a class="force_recheck" title="Force re-check data"></a>' +
					'<a class="delete" title="Delete Options"></a>' +
				'</div>' +
			'</td></tr></table>' +
		'</div>';
	}

	function updateTableDelay(ms) {
		setTimeout(updateTable, ms);
	}

	function updateTable() {
		refreshTimer.unsubscribe(updateTable);
		Torrents.update()
			.success(function () {
				renderTable();
				renderGlobalInformation();
				refreshTimer.subscribe(updateTable);
			})
			.error(function () {
				checkStatus();
			});
	}

	function pauseTableRefresh() {
		refreshTimer.unsubscribe(updateTable);
	}

	function resumeTableRefresh() {
		refreshTimer.unsubscribe(updateTable);
		refreshTimer.subscribe(updateTable);
	}

	function renderGlobalInformation() {
		var info = Torrents.getGlobalInformation();
		globalAll.textContent = info.all;
		globalDownloading.textContent = info.downloading;
		globalPaused.textContent = info.paused;
		globalSeeding.textContent = info.seeding;
		globalQueued.textContent = info.queued;
	}

	function renderTable() {
		var link = document.getElementById("deluge_webui_link");
		if (link) link.href = Deluge.endpoint();

		rebuildLabelOptions();

		// Re-read pageSize in case it changed via ExtensionConfig listener
		pageSize = (typeof ExtensionConfig.torrents_per_page === "number")
			? ExtensionConfig.torrents_per_page : 20;

		var filterState = document.getElementById("filter_state");
		var filterTracker = document.getElementById("filter_tracker_host");
		var filterLabel = document.getElementById("filter_label");
		var searchEl = document.getElementById("search_name");
		var fState = filterState ? filterState.value : "All";
		var fTracker = filterTracker ? filterTracker.value : "All";
		var fLabel = filterLabel ? filterLabel.value : "All";
		var fSearch = searchEl ? searchEl.value.trim().toLowerCase() : "";

		var torrents = Torrents.sort(localStorage.sortColumn || "position").getAll();
		if (localStorage.sortMethod === "desc") {
			torrents.reverse();
		}

		// Apply filters first to get the full filtered list
		var filtered = [];
		for (var i = 0, len = torrents.length; i < len; i++) {
			var torrent = torrents[i];

			if (fState !== "All" && fState !== torrent.state) {
				if (!(fState === "Active" && (torrent.speedDownload > 0 || torrent.speedUpload > 0))) {
					continue;
				}
			}
			if (fTracker !== "All" && fTracker !== torrent.tracker_host) {
				if (!(fTracker === "Error" && torrent.tracker_status.indexOf("Error") > -1)) {
					continue;
				}
			}
			if (fLabel !== "All" && fLabel !== torrent.label) {
				continue;
			}
			if (fSearch && torrent.name.toLowerCase().indexOf(fSearch) === -1) {
				continue;
			}

			filtered.push(torrent);
		}

		// Pagination calculation
		var filteredCount = filtered.length;
		if (pageSize > 0 && filteredCount > pageSize) {
			totalPages = Math.ceil(filteredCount / pageSize);
			if (currentPage > totalPages) currentPage = totalPages;
			if (currentPage < 1) currentPage = 1;

			var startIdx = (currentPage - 1) * pageSize;
			var endIdx = startIdx + pageSize;
			filtered = filtered.slice(startIdx, endIdx);

			// Show pagination bar
			paginationBar.style.display = "flex";
			pageInfo.textContent = "Page " + currentPage + " of " + totalPages + " (" + filteredCount + " torrents)";
			pagePrev.disabled = (currentPage <= 1);
			pageNext.disabled = (currentPage >= totalPages);
		} else {
			totalPages = 1;
			currentPage = 1;
			// Hide pagination bar when all fit on one page
			paginationBar.style.display = "none";
		}

		// Build HTML for current page
		var htmlParts = [];
		var labelValues = [];
		var labelEnabled = Torrents.hasPlugin("Label");

		for (var j = 0, jlen = filtered.length; j < jlen; j++) {
			htmlParts.push(buildRowHtml(filtered[j]));
			if (labelEnabled) {
				labelValues.push({ id: filtered[j].id, label: filtered[j].label || "" });
			}
		}

		// Use DOMParser to safely convert string to nodes
		var parser = new DOMParser();
		var doc = parser.parseFromString(htmlParts.join(""), 'text/html');
		torrentContainer.textContent = "";
		while (doc.body.firstChild) {
			torrentContainer.appendChild(doc.body.firstChild);
		}

		if (labelEnabled) {
			for (var k = 0, klen = labelValues.length; k < klen; k++) {
				var sel = torrentContainer.querySelector('.label_select[data-torrent-id="' + labelValues[k].id + '"]');
				if (sel) sel.value = labelValues[k].label;
			}
		}
	}

	// ── Event Handlers (delegated) ──────────────────────────────────────
	function getRowData(element) {
		var row = element.closest(".torrent_row");
		if (!row) return null;
		var torrentId = row.getAttribute("data-id");
		return { torrentId: torrentId, torrent: Torrents.getById(torrentId) };
	}

	function DelugeMethod(method, torrent, rmdata) {
		pauseTableRefresh();
		var actions;
		if (method === "core.set_torrent_auto_managed") {
			actions = [torrent.id, !torrent.autoManaged];
		} else if (method === "core.remove_torrent") {
			actions = [torrent.id, rmdata];
		} else {
			actions = [[torrent.id]];
		}

		Deluge.api(method, actions)
			.success(function () {
				debug_log("Success: " + method);
				updateTableDelay(250);
			})
			.error(function () {
				debug_log("Failed: " + method);
			});
	}

	// Label click — pause refresh so dropdown stays open
	DomHelper.on(torrentContainer, "mousedown", ".label_select", function () {
		pauseTableRefresh();
	});

	// Label closed without change — resume after short delay
	DomHelper.on(torrentContainer, "focusout", ".label_select", function () {
		setTimeout(resumeTableRefresh, 300);
	});

	// Label change — set label via API
	DomHelper.on(torrentContainer, "change", ".label_select", function () {
		var torrentId = this.getAttribute("data-torrent-id");
		var newLabel = this.value;

		Deluge.api("label.set_torrent", [torrentId, newLabel])
			.success(function () {
				debug_log("Label set successfully");
				updateTableDelay(500);
			})
			.error(function () {
				debug_log("Failed to set label");
				updateTableDelay(250);
			});
	});

	// Action buttons
	DomHelper.on(torrentContainer, "click", ".main_actions a", function () {
		if (this.classList.contains("delete")) return;

		var rowData = getRowData(this);
		if (!rowData || !rowData.torrent) return;

		var method, rmdata = false;

		if (this.classList.contains("state")) {
			method = rowData.torrent.state === "Paused" ? "core.resume_torrent" : "core.pause_torrent";
		} else if (this.classList.contains("move_up")) {
			method = "core.queue_up";
		} else if (this.classList.contains("move_down")) {
			method = "core.queue_down";
		} else if (this.classList.contains("toggle_managed")) {
			method = "core.set_torrent_auto_managed";
		} else if (this.classList.contains("force_recheck")) {
			method = "core.force_recheck";
		} else if (this.classList.contains("rm_torrent_data")) {
			method = "core.remove_torrent";
			rmdata = true;
		} else if (this.classList.contains("rm_torrent")) {
			method = "core.remove_torrent";
		} else {
			return;
		}
		DelugeMethod(method, rowData.torrent, rmdata);
	});

// Delete button — show options
	DomHelper.on(torrentContainer, "click", ".main_actions .delete", function () {
		// 1. Get the torrent data for this specific row
		var rowData = getRowData(this);
		if (!rowData || !rowData.torrent) return;

		// 2. GUARD: Prevent opening the delete menu if moving or allocating
		var blockedStates = ["Moving", "Allocating"];
		if (blockedStates.includes(rowData.torrent.state)) {
			alert("Cannot delete a torrent while it is moving data on the disk. Please wait.");
			return; // Stop the function here so the menu doesn't open
		}

		// 3. If it is safe, proceed with opening the delete menu
		pauseTableRefresh();
		var td = this.closest("td");
		var actions = td.querySelector(".main_actions");

		DomHelper.fadeOut(actions, 200, function () {
			var div = document.createElement("div");
			div.className = "delete-options";

			var aCancel = document.createElement("a");
			aCancel.className = "rm_cancel";
			aCancel.title = "Cancel";

			var aData = document.createElement("a");
			aData.className = "rm_torrent_data";
			aData.title = "Delete with data";

			var aTorrent = document.createElement("a");
			aTorrent.className = "rm_torrent";
			aTorrent.title = "Remove torrent only";

			div.appendChild(aCancel);
			div.appendChild(aData);
			div.appendChild(aTorrent);
			td.appendChild(div);
			DomHelper.hide(td);
			DomHelper.fadeIn(td, 200);
		});
	});

// Delete option clicks
	DomHelper.on(torrentContainer, "click", ".delete-options a", function (e) {
		e.preventDefault();

		var td = this.closest("td");
		var deleteOpts = td.querySelector(".delete-options");
		
		// Prevent double-clicks that cause the Deluge server to crash
		if (!deleteOpts || deleteOpts.dataset.clicked) return;
		deleteOpts.dataset.clicked = "true";

		var rowData = getRowData(this);
		if (!rowData) return;

		var isCancel = this.classList.contains("rm_cancel");

		if (this.classList.contains("rm_torrent")) {
			DelugeMethod("core.remove_torrent", rowData.torrent, false);
		} else if (this.classList.contains("rm_torrent_data")) {
			DelugeMethod("core.remove_torrent", rowData.torrent, true);
		}

		// Remove delete options and show actions again
		DomHelper.fadeOut(deleteOpts, 200, function () {
			deleteOpts.remove();
			var actions = td.querySelector(".main_actions");
			if (actions) {
				DomHelper.fadeIn(actions, 200, function () {
					// Only force an immediate refresh if the user clicked Cancel.
					// If they deleted a torrent, DelugeMethod handles the refresh safely.
					if (isCancel) {
						resumeTableRefresh();
						updateTable();
					}
				});
			}
		});
	});

	// ── Add Torrent Dialog ──────────────────────────────────────────────
	(function () {
		var dialog = document.getElementById("add-torrent-dialog");
		var inputBox = document.getElementById("manual_add_input");
		var addButton = document.getElementById("manual_add_button");
		var addTorrentLink = document.getElementById("add-torrent");

		addTorrentLink.addEventListener("click", function (e) {
			e.preventDefault();
			DomHelper.show(dialog);
		});

		dialog.addEventListener("click", function () {
			DomHelper.hide(dialog);
		});

		dialog.querySelector(".inner").addEventListener("click", function (e) {
			e.stopPropagation();
		});

		var closeBtn = dialog.querySelector(".close");
		if (closeBtn) {
			closeBtn.addEventListener("click", function (e) {
				e.preventDefault();
				DomHelper.hide(dialog);
			});
		}

		setTimeout(function () { addTorrentLink.blur(); }, 50);

		inputBox.addEventListener("keydown", function (e) {
			if (e.keyCode === 13) {
				e.preventDefault();
				addButton.click();
			}
		});

		addButton.addEventListener("click", function (e) {
			e.preventDefault();
			var url = inputBox.value;

			if (/\/(download|get)\//.test(url) || /\.torrent$/.test(url)) {
				chrome.runtime.sendMessage({ method: "add_torrent_from_url", url: url });
			} else if (/magnet:/.test(url)) {
				chrome.runtime.sendMessage({ method: "add_torrent_from_magnet", url: url });
			}

			inputBox.value = "";
			DomHelper.hide(dialog);
		});
	}());

	// ── Sort & Filters ──────────────────────────────────────────────────
	(function () {
		var sortEl = document.getElementById("sort");
		var sortInvert = document.getElementById("sort_invert");
		var filterState = document.getElementById("filter_state");
		var filterTracker = document.getElementById("filter_tracker_host");
		var filterLabel = document.getElementById("filter_label");

		sortEl.value = localStorage.sortColumn || "position";
		sortInvert.checked = (localStorage.sortMethod === "desc");

		if (filterState) filterState.value = localStorage["filter_state"] || "All";
		if (filterTracker) filterTracker.value = localStorage["filter_tracker_host"] || "All";
		if (filterLabel) filterLabel.value = localStorage["filter_label"] || "All";

		sortEl.addEventListener("change", function () {
			localStorage.sortColumn = this.value;
			currentPage = 1;
			renderTable();
		});

		sortInvert.addEventListener("change", function () {
			localStorage.sortMethod = this.checked ? "desc" : "asc";
			currentPage = 1;
			renderTable();
		});

		[filterState, filterTracker, filterLabel].forEach(function (el) {
			if (el) {
				el.addEventListener("change", function () {
					localStorage[this.id] = this.value;
					currentPage = 1;
					renderTable();
				});
			}
		});
	}());

	// ── Search Box ─────────────────────────────────────────────────────
	(function () {
		var searchEl = document.getElementById("search_name");
		if (!searchEl) return;

		var debounceTimer = null;
		searchEl.addEventListener("input", function () {
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(function () {
				currentPage = 1;
				renderTable();
			}, 150);
		});

		// Clear search on Escape
		searchEl.addEventListener("keydown", function (e) {
			if (e.keyCode === 27 && this.value) {
				this.value = "";
				currentPage = 1;
				renderTable();
				e.preventDefault();
			}
		});
	}());

	// ── Plugin-aware UI ────────────────────────────────────────────────
	// Hide UI elements that depend on a plugin we couldn't detect on the server.
	function applyPluginVisibility() {
		var labelGroup = document.querySelector(".label-filter-group");
		if (labelGroup) {
			labelGroup.style.display = Torrents.hasPlugin("Label") ? "" : "none";
		}
	}
	document.addEventListener("Torrents:pluginsChanged", function () {
		applyPluginVisibility();
		renderTable(); // rebuild rows so the per-row label cell appears/disappears
	});
	// Initial state: hide until we know the answer (avoid flash of useless UI)
	(function () {
		var labelGroup = document.querySelector(".label-filter-group");
		if (labelGroup) labelGroup.style.display = "none";
	}());

	// ── Pagination Controls ─────────────────────────────────────────────
	pagePrev.addEventListener("click", function () {
		if (currentPage > 1) {
			currentPage--;
			renderTable();
			torrentContainer.scrollIntoView({ behavior: "smooth", block: "start" });
		}
	});

	pageNext.addEventListener("click", function () {
		if (currentPage < totalPages) {
			currentPage++;
			renderTable();
			torrentContainer.scrollIntoView({ behavior: "smooth", block: "start" });
		}
	});

	// ── Event Polling ──────────────────────────────────────────────────
	// Poll Deluge events between full/diff updates to catch add/remove quickly
	var eventPollInterval = null;
	function startEventPolling() {
		if (eventPollInterval) return;
		eventPollInterval = setInterval(function () {
			if (!extensionActivated) return;
			var req = Torrents.pollEvents();
			if (req && req.success) {
				req.success(function () {
					if (Torrents.getAll().length > 0) {
						renderTable();
						renderGlobalInformation();
					}
				});
			}
		}, 1000);
	}
	function stopEventPolling() {
		if (eventPollInterval) {
			clearInterval(eventPollInterval);
			eventPollInterval = null;
		}
	}

	// ── Status Checking ─────────────────────────────────────────────────
	function checkStatus() {
		chrome.runtime.sendMessage({ method: "check_status" }, function (response) {
			if (chrome.runtime.lastError) {
				setTimeout(checkStatus, 2000);
				return;
			}
			if (response && response.connected) {
				activated();
			} else if (response) {
				var message = (response.reason === "auth_failed")
					? chrome.i18n.getMessage("error_unauthenticated")
					: chrome.i18n.getMessage("error_generic");
				var span = overlay.querySelector(".overlay_inner span");
				if (span) {
					span.className = "error";
					span.textContent = message;
				}
				DomHelper.show(overlay);
			}
		});
	}

	function activated() {
		if (!extensionActivated) {
			extensionActivated = true;
			DomHelper.hide(overlay);
			updateTable();
			startEventPolling();
		}
	}

	function deactivated() {
		extensionActivated = false;
		stopEventPolling();
	}

	function autoLoginFailed() {
		var span = overlay.querySelector(".overlay_inner span");
		if (span) {
			span.classList.add("error");
			span.textContent = chrome.i18n.getMessage("error_unauthenticated");
		}
		DomHelper.show(overlay);
	}

	chrome.runtime.onMessage.addListener(function (request) {
		if (request.msg === "extension_activated") activated();
		else if (request.msg === "extension_deactivated") deactivated();
		else if (request.msg === "auto_login_failed") autoLoginFailed();
	});

	checkStatus();
});