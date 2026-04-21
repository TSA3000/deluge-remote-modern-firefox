/*
 * Prowlarr Search — popup tab controller.
 *
 * Handles the "Search Indexers" and "History" tabs in the popup.
 * - Loads indexers into a checkbox multi-select (eagerly, with retry on
 *   tab activation if the first attempt failed).
 * - Sends search queries and renders results in a sortable table.
 * - Grabs releases by POSTing to Prowlarr's /api/v1/search — Prowlarr
 *   then forwards to whatever download client it has configured.
 * - Persists the last 50 searches in chrome.storage.local and surfaces
 *   them on a dedicated History tab.
 */
var ProwlarrSearch = (function () {
	var pub = {};

	var initialized          = false;
	var indexersLoaded       = false;  // true once indexers fetched successfully
	var loadIndexersInFlight = false;
	var indexerList          = [];     // [{id, name, protocol, enable}]
	var indexerMap           = {};     // id -> name
	var selectedIndexers     = [];     // array of indexer ids; [] = all
	var currentResults       = [];
	var sortColumn           = "seeders";
	var sortDesc             = true;

	var HISTORY_KEY   = "prowlarr_history";
	var HISTORY_MAX   = 50;

	var SELECTED_INDEXERS_KEY = "prowlarr_selected_indexers";

	// Persist the current selectedIndexers to storage.sync so it survives
	// popup close/reopen and syncs across devices. We always write even when
	// empty (which means "all") to make intent explicit.
	function saveSelectedIndexers() {
		try {
			var obj = {};
			obj[SELECTED_INDEXERS_KEY] = selectedIndexers.slice();
			chrome.storage.sync.set(obj);
		} catch (e) {
			debug_log("Prowlarr: failed to save selected indexers", e);
		}
	}

	// Prune any IDs that no longer exist in the freshly-loaded indexer list.
	// Prowlarr may have removed an indexer since we last saved. If everything
	// is invalid, fall back to "All indexers" ([]).
	function reconcileSelectedIndexersWithList() {
		if (!selectedIndexers.length) return;
		var validIds = {};
		for (var i = 0; i < indexerList.length; i++) {
			validIds[indexerList[i].id] = true;
		}
		var cleaned = selectedIndexers.filter(function (id) { return validIds[id]; });
		if (cleaned.length !== selectedIndexers.length) {
			selectedIndexers = cleaned;
			saveSelectedIndexers();
		}
	}

	// ── Categories (Newznab/Torznab top-level) ─────────────────────────
	var CATEGORY_OPTIONS = [
		{ value: "",     label: "All categories" },
		{ value: "2000", label: "Movies" },
		{ value: "5000", label: "TV" },
		{ value: "3000", label: "Audio" },
		{ value: "7000", label: "Books" },
		{ value: "1000", label: "Console" },
		{ value: "4000", label: "PC" },
		{ value: "6000", label: "XXX" },
		{ value: "8000", label: "Other" }
	];

	// ── Helpers ─────────────────────────────────────────────────────────
	function escapeHtml(s) {
		if (s === null || typeof s === "undefined") return "";
		return String(s)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#39;");
	}

	function formatSize(bytes) {
		if (!bytes || bytes < 0) return "—";
		var units = ["B", "KB", "MB", "GB", "TB"];
		var i = 0;
		var n = bytes;
		while (n >= 1024 && i < units.length - 1) {
			n /= 1024;
			i++;
		}
		return n.toFixed(n < 10 && i > 0 ? 2 : 1) + " " + units[i];
	}

	function formatAge(publishDate) {
		if (!publishDate) return "—";
		var then = new Date(publishDate).getTime();
		if (isNaN(then)) return "—";
		var diffSec = Math.max(0, (Date.now() - then) / 1000);
		if (diffSec < 60)        return Math.floor(diffSec) + "s";
		if (diffSec < 3600)      return Math.floor(diffSec / 60) + "m";
		if (diffSec < 86400)     return Math.floor(diffSec / 3600) + "h";
		if (diffSec < 86400*30)  return Math.floor(diffSec / 86400) + "d";
		if (diffSec < 86400*365) return Math.floor(diffSec / (86400 * 30)) + "mo";
		return Math.floor(diffSec / (86400 * 365)) + "y";
	}

	function indexerName(result) {
		if (result.indexer) return result.indexer;
		if (result.indexerId && indexerMap[result.indexerId]) return indexerMap[result.indexerId];
		return "?";
	}

	function setStatus(text, cls) {
		var el = document.getElementById("prowlarr_status");
		if (!el) return;
		el.textContent = text || "";
		el.className = "prowlarr-status" + (cls ? " " + cls : "");
	}

	// ── DOM helpers (AMO-safe: no innerHTML) ───────────────────────────
	function clearChildren(el) {
		if (el) el.textContent = "";
	}

	function makeDiv(className, text) {
		var d = document.createElement("div");
		if (className) d.className = className;
		if (text !== undefined && text !== null) d.textContent = text;
		return d;
	}

	// Parse an HTML string into DOM nodes safely (DOMParser doesn't execute scripts).
	// Wraps the HTML in the correct parent so table rows/cells/options parse correctly
	// instead of being hoisted out by the HTML parser.
	function htmlToNodes(html, parentTag) {
		parentTag = (parentTag || "div").toLowerCase();
		var wrapOpen, wrapClose, unwrapDepth;

		if (parentTag === "tbody" || parentTag === "thead" || parentTag === "tfoot") {
			// <tr> must live inside <table><tbody>, otherwise the parser drops it.
			wrapOpen = "<table><" + parentTag + ">";
			wrapClose = "</" + parentTag + "></table>";
			unwrapDepth = 2; // drill into table > tbody
		} else if (parentTag === "tr") {
			// <td> must live inside <table><tbody><tr>
			wrapOpen = "<table><tbody><tr>";
			wrapClose = "</tr></tbody></table>";
			unwrapDepth = 3;
		} else if (parentTag === "select") {
			wrapOpen = "<select>";
			wrapClose = "</select>";
			unwrapDepth = 1;
		} else {
			wrapOpen = "<div>";
			wrapClose = "</div>";
			unwrapDepth = 1;
		}

		var parser = new DOMParser();
		var doc = parser.parseFromString(wrapOpen + html + wrapClose, "text/html");
		var root = doc.body.firstChild;
		for (var i = 1; i < unwrapDepth && root; i++) {
			root = root.firstChild;
		}
		var frag = document.createDocumentFragment();
		while (root && root.firstChild) {
			frag.appendChild(root.firstChild);
		}
		return frag;
	}

	function replaceChildrenHTML(el, html) {
		if (!el) return;
		el.textContent = "";
		// Infer the parent tag so table rows parse correctly
		var parentTag = el.tagName ? el.tagName.toLowerCase() : "div";
		el.appendChild(htmlToNodes(html, parentTag));
	}

	// ── Indexer multi-select ────────────────────────────────────────────
	function loadIndexers() {
		if (loadIndexersInFlight) return;
		loadIndexersInFlight = true;

		var itemsEl = document.getElementById("prowlarr_indexer_items");
		if (itemsEl && !indexersLoaded) {
			clearChildren(itemsEl);
			itemsEl.appendChild(makeDiv("ms-loading", "Loading indexers…"));
		}

		Prowlarr.getIndexers()
			.success(function (list) {
				loadIndexersInFlight = false;
				if (!Array.isArray(list)) {
					if (itemsEl) {
						clearChildren(itemsEl);
						itemsEl.appendChild(makeDiv("ms-error", "Unexpected response."));
					}
					return;
				}
				indexerList = list
					.filter(function (x) { return x.enable !== false; })
					.sort(function (a, b) { return (a.name || "").localeCompare(b.name || ""); });
				indexerMap = {};
				for (var i = 0; i < indexerList.length; i++) {
					indexerMap[indexerList[i].id] = indexerList[i].name;
				}
				indexersLoaded = true;
				reconcileSelectedIndexersWithList();
				renderIndexerList();
			})
			.error(function (_, __, err) {
				loadIndexersInFlight = false;
				debug_log("Prowlarr: failed to load indexers", err);
				if (itemsEl) {
					clearChildren(itemsEl);
					var errDiv = makeDiv("ms-error", "Could not load indexers. ");
					var retryLink = document.createElement("a");
					retryLink.href = "#";
					retryLink.id = "prowlarr_indexer_retry";
					retryLink.textContent = "Retry";
					errDiv.appendChild(retryLink);
					itemsEl.appendChild(errDiv);
					var retry = document.getElementById("prowlarr_indexer_retry");
					if (retry) retry.addEventListener("click", function (e) {
						e.preventDefault();
						loadIndexers();
					});
				}
			});
	}

	function renderIndexerList() {
		var itemsEl = document.getElementById("prowlarr_indexer_items");
		if (!itemsEl) return;

		if (!indexerList.length) {
			clearChildren(itemsEl);
			itemsEl.appendChild(makeDiv("ms-error", "No indexers configured in Prowlarr."));
			return;
		}

		clearChildren(itemsEl);
		var frag = document.createDocumentFragment();
		for (var i = 0; i < indexerList.length; i++) {
			var ix = indexerList[i];
			var protoText = ix.protocol === "usenet" ? "nzb" : (ix.protocol || "");

			var lbl = el("label", { className: "ms-item", "data-id": ix.id });

			var chk = el("input", { type: "checkbox", className: "ms-check", value: ix.id });
			if (selectedIndexers.indexOf(ix.id) !== -1) chk.checked = true;
			lbl.appendChild(chk);

			lbl.appendChild(el("span", { className: "ms-name" }, ix.name || ""));

			if (protoText) {
				lbl.appendChild(el("span", {
					className: "ms-proto ms-proto-" + (ix.protocol || "")
				}, protoText));
			}
			frag.appendChild(lbl);
		}
		itemsEl.appendChild(frag);
		updateIndexerAllState();
		updateIndexerLabel();
	}

	function updateIndexerAllState() {
		var all = document.getElementById("prowlarr_indexer_all");
		if (!all) return;
		all.checked = (selectedIndexers.length === 0);
	}

	function updateIndexerLabel() {
		var label = document.getElementById("prowlarr_indexer_label");
		if (!label) return;
		if (selectedIndexers.length === 0) {
			label.textContent = "All indexers";
		} else if (selectedIndexers.length === 1) {
			label.textContent = indexerMap[selectedIndexers[0]] || "1 indexer";
		} else {
			label.textContent = selectedIndexers.length + " indexers";
		}
	}

	function openIndexerMenu() {
		var menu = document.getElementById("prowlarr_indexer_menu");
		var dd   = document.getElementById("prowlarr_indexer_ms");
		if (!menu || !dd) return;
		dd.classList.add("ms-open");
		// Close on outside click
		setTimeout(function () {
			document.addEventListener("mousedown", handleOutsideClick);
		}, 0);
	}

	function closeIndexerMenu() {
		var dd = document.getElementById("prowlarr_indexer_ms");
		if (!dd) return;
		dd.classList.remove("ms-open");
		document.removeEventListener("mousedown", handleOutsideClick);
	}

	function handleOutsideClick(e) {
		var dd = document.getElementById("prowlarr_indexer_ms");
		if (!dd) return;
		if (!dd.contains(e.target)) closeIndexerMenu();
	}

	function wireIndexerDropdown() {
		var toggle = document.getElementById("prowlarr_indexer_toggle");
		var allBox = document.getElementById("prowlarr_indexer_all");
		var items  = document.getElementById("prowlarr_indexer_items");
		var dd     = document.getElementById("prowlarr_indexer_ms");
		if (!toggle || !allBox || !items || !dd) return;

		toggle.addEventListener("click", function (e) {
			e.preventDefault();
			if (dd.classList.contains("ms-open")) closeIndexerMenu();
			else {
				openIndexerMenu();
				// Refresh on every open if we haven't loaded yet
				if (!indexersLoaded && !loadIndexersInFlight) loadIndexers();
			}
		});

		allBox.addEventListener("change", function () {
			if (this.checked) {
				selectedIndexers = [];
			} else {
				// If user unchecked "All" while no individuals are selected,
				// re-check it — we never want an empty selection that means
				// "nothing".
				if (selectedIndexers.length === 0) {
					this.checked = true;
					return;
				}
			}
			// Reflect in the checkbox list
			var boxes = items.querySelectorAll(".ms-check");
			for (var i = 0; i < boxes.length; i++) {
				boxes[i].checked = selectedIndexers.indexOf(parseInt(boxes[i].value, 10)) !== -1;
			}
			updateIndexerLabel();
			saveSelectedIndexers();
		});

		DomHelper.on(items, "change", ".ms-check", function () {
			var id = parseInt(this.value, 10);
			var idx = selectedIndexers.indexOf(id);
			if (this.checked && idx === -1) selectedIndexers.push(id);
			else if (!this.checked && idx !== -1) selectedIndexers.splice(idx, 1);
			updateIndexerAllState();
			updateIndexerLabel();
			saveSelectedIndexers();
		});
	}

	// ── Category dropdown ───────────────────────────────────────────────
	function loadCategories() {
		var select = document.getElementById("prowlarr_category");
		if (!select) return;
		select.textContent = "";
		for (var i = 0; i < CATEGORY_OPTIONS.length; i++) {
			var opt = document.createElement("option");
			opt.value = CATEGORY_OPTIONS[i].value;
			opt.textContent = CATEGORY_OPTIONS[i].label;
			select.appendChild(opt);
		}
	}

	// ── Sorting ─────────────────────────────────────────────────────────
	function sortResults(results) {
		var sorted = results.slice();
		sorted.sort(function (a, b) {
			var av, bv;
			switch (sortColumn) {
				case "title":
					av = (a.title || "").toLowerCase();
					bv = (b.title || "").toLowerCase();
					return av < bv ? -1 : av > bv ? 1 : 0;
				case "indexer":
					av = indexerName(a).toLowerCase();
					bv = indexerName(b).toLowerCase();
					return av < bv ? -1 : av > bv ? 1 : 0;
				case "size":
					return (a.size || 0) - (b.size || 0);
				case "age":
					av = new Date(a.publishDate || 0).getTime() || 0;
					bv = new Date(b.publishDate || 0).getTime() || 0;
					return bv - av;
				case "leechers":
					return (a.leechers || 0) - (b.leechers || 0);
				case "seeders":
				default:
					return (a.seeders || 0) - (b.seeders || 0);
			}
		});
		if (sortDesc) sorted.reverse();
		return sorted;
	}

	// ── Row rendering ───────────────────────────────────────────────────
	// Helper — create an element with optional className/textContent/attrs
	function el(tag, attrs, text) {
		var e = document.createElement(tag);
		if (attrs) {
			for (var k in attrs) {
				if (k === "className") e.className = attrs[k];
				else if (k === "dataset") {
					for (var d in attrs[k]) e.dataset[d] = attrs[k][d];
				}
				else if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
			}
		}
		if (text !== undefined && text !== null) e.textContent = text;
		return e;
	}

	function buildRow(result, index) {
		var proto = result.protocol || "torrent";
		var canGrab = !!(result.guid && result.indexerId);
		var hasDownload = !!result.downloadUrl;
		var hasMagnet   = !!result.magnetUrl;
		var info = result.infoUrl || result.guid || "";

		var seeds = (typeof result.seeders === "number") ? result.seeders : "—";
		var leech = (typeof result.leechers === "number") ? result.leechers : "—";

		var tr = el("tr", { className: "prowlarr_row", "data-idx": index });

		// Title cell
		var titleCell = el("td", { className: "p_col_title" });
		if (info) {
			var link = el("a", { href: info, target: "_blank", rel: "noopener" }, result.title);
			titleCell.appendChild(link);
		} else {
			titleCell.appendChild(document.createTextNode(result.title || ""));
		}
		var protoBadge = el("span", { className: "p_proto p_proto_" + proto }, proto);
		titleCell.appendChild(protoBadge);
		tr.appendChild(titleCell);

		// Indexer
		tr.appendChild(el("td", { className: "p_col_indexer" }, indexerName(result)));

		// Size
		tr.appendChild(el("td", { className: "p_col_size" }, formatSize(result.size)));

		// Age
		tr.appendChild(el("td", {
			className: "p_col_age",
			title: result.publishDate || ""
		}, formatAge(result.publishDate)));

		// Seeds / Leech
		var slCell = el("td", { className: "p_col_sl" });
		slCell.appendChild(el("span", { className: "seeds" }, String(seeds)));
		slCell.appendChild(document.createTextNode(" / "));
		slCell.appendChild(el("span", { className: "leech" }, String(leech)));
		tr.appendChild(slCell);

		// Actions
		var actionsCell = el("td", { className: "p_col_actions" });
		if (canGrab) {
			actionsCell.appendChild(el("button", {
				type: "button",
				className: "p_send clean-gray",
				title: "Grab — Prowlarr pushes to its download client"
			}, "⬇ Grab"));
		}
		if (hasDownload) {
			actionsCell.appendChild(el("button", {
				type: "button",
				className: "p_copy",
				title: "Copy download URL",
				"data-url": result.downloadUrl
			}, "⧉"));
		}
		if (hasMagnet) {
			actionsCell.appendChild(el("button", {
				type: "button",
				className: "p_copy",
				title: "Copy magnet URL",
				"data-url": result.magnetUrl
			}, "🧲"));
		}
		tr.appendChild(actionsCell);

		return tr;
	}

	function renderResults() {
		var tbody = document.getElementById("prowlarr_results_body");
		if (!tbody) return;

		if (!currentResults.length) {
			clearChildren(tbody);
			var emptyRow = document.createElement("tr");
			var emptyCell = document.createElement("td");
			emptyCell.colSpan = 6;
			emptyCell.className = "p_empty";
			emptyCell.textContent = "No results.";
			emptyRow.appendChild(emptyCell);
			tbody.appendChild(emptyRow);
			updateCountLabel(0);
			return;
		}

		var sorted = sortResults(currentResults);
		currentResults = sorted;

		clearChildren(tbody);
		var frag = document.createDocumentFragment();
		for (var i = 0; i < sorted.length; i++) {
			frag.appendChild(buildRow(sorted[i], i));
		}
		tbody.appendChild(frag);
		updateCountLabel(sorted.length);

		var headers = document.querySelectorAll("#prowlarr_results thead th[data-sort]");
		for (var h = 0; h < headers.length; h++) {
			headers[h].classList.remove("sort-asc", "sort-desc");
			if (headers[h].getAttribute("data-sort") === sortColumn) {
				headers[h].classList.add(sortDesc ? "sort-desc" : "sort-asc");
			}
		}
	}

	function updateCountLabel(n) {
		var el = document.getElementById("prowlarr_result_count");
		if (el) el.textContent = n === 1 ? "1 result" : n + " results";
	}

	// ── Search execution ────────────────────────────────────────────────
	// Sequence counter so responses from superseded or cancelled searches
	// don't overwrite the UI of the current one.
	var searchSequence = 0;

	function setSearchingState(on) {
		var btn = document.getElementById("prowlarr_search_btn");
		if (!btn) return;
		if (on) {
			btn.classList.add("is-loading");
			// Leave the button enabled so the user can click it to cancel
		} else {
			btn.classList.remove("is-loading");
			btn.disabled = false;
		}
	}

	function cancelSearch(silent) {
		// Bump the sequence so any in-flight response is treated as stale.
		searchSequence++;
		setSearchingState(false);
		if (!silent) setStatus("Search cancelled.", "warn");
		Prowlarr.cancelSearch();  // fire-and-forget
	}

	function runSearch(overrides) {
		overrides = overrides || {};
		var queryEl    = document.getElementById("prowlarr_query");
		var categoryEl = document.getElementById("prowlarr_category");
		var searchBtn  = document.getElementById("prowlarr_search_btn");

		var query    = overrides.query    !== undefined ? overrides.query    : (queryEl.value || "").trim();
		var category = overrides.category !== undefined ? overrides.category : (categoryEl ? categoryEl.value : "");
		var indexers = overrides.indexers !== undefined ? overrides.indexers.slice() : selectedIndexers.slice();

		if (!query) {
			setStatus("Enter a search term.", "warn");
			if (queryEl) queryEl.focus();
			return;
		}

		// Reflect overrides back into the UI (for history replay)
		if (queryEl && queryEl.value !== query) queryEl.value = query;
		if (categoryEl && categoryEl.value !== category) categoryEl.value = category;
		if (overrides.indexers !== undefined) {
			selectedIndexers = indexers.slice();
			renderIndexerList();
		}

		// If a previous search is still running, cancel it first. The bg
		// handler already supersedes controllers, but doing it explicitly
		// here gives us a clean UI transition.
		if (searchBtn.classList.contains("is-loading")) {
			Prowlarr.cancelSearch();
		}

		var mySeq = ++searchSequence;

		var opts = {};
		if (indexers.length) opts.indexerIds = indexers;
		if (category) opts.categories = [category];
		if (ExtensionConfig.prowlarr_results_limit) opts.limit = ExtensionConfig.prowlarr_results_limit;

		setSearchingState(true);
		setStatus("Searching…", "loading");
		currentResults = [];
		renderResults();

		Prowlarr.search(query, opts)
			.success(function (results) {
				if (mySeq !== searchSequence) return; // stale response, ignore
				setSearchingState(false);
				if (!Array.isArray(results)) {
					currentResults = [];
					setStatus("Unexpected response from Prowlarr.", "error");
					renderResults();
					return;
				}
				currentResults = results;
				setStatus("");
				renderResults();
				if (!results.length) {
					setStatus("No results for “" + query + "”.", "warn");
				}
				saveToHistory({
					query:      query,
					indexerIds: indexers,
					category:   category,
					ts:         Date.now(),
					count:      results.length
				});
			})
			.error(function (_, __, err) {
				if (mySeq !== searchSequence) return; // stale response, ignore
				setSearchingState(false);
				currentResults = [];
				renderResults();
				if (err && err.type === "cancelled") {
					setStatus("Search cancelled.", "warn");
					return;
				}
				var msg = "Search failed.";
				if (err) {
					if (err.type === "auth")        msg = "✗ Authentication failed — check API key.";
					else if (err.type === "network") msg = "✗ Cannot reach Prowlarr — check the address.";
					else if (err.type === "timeout") msg = "✗ Search timed out.";
					else if (err.type === "http")    msg = "✗ HTTP " + (err.status || "?") + " from Prowlarr.";
					else if (err.message)            msg = "✗ " + err.message;
				}
				setStatus(msg, "error");
			});
	}

	// ── Grab action — POST /api/v1/search {guid, indexerId} ─────────────
	function grabRelease(result, button) {
		if (!result || !result.guid || !result.indexerId) {
			setStatus("This release is missing guid/indexerId — cannot grab.", "error");
			return;
		}
		if (button) {
			button.disabled = true;
			button.textContent = "Sending…";
		}
		setStatus("Grabbing “" + result.title + "” via Prowlarr…", "loading");

		Prowlarr.grab(result.guid, result.indexerId)
			.success(function () {
				setStatus("Sent “" + result.title + "” to Prowlarr's download client.", "success");
				if (button) {
					button.textContent = "✓ Sent";
					button.classList.add("p_send_sent");
				}
			})
			.error(function (_, __, err) {
				var msg = "Grab failed.";
				if (err) {
					if (err.type === "http" && err.status === 400)      msg = "✗ Prowlarr rejected this release (400). Check that a download client is configured in Prowlarr.";
					else if (err.type === "http" && err.status === 500) msg = "✗ Prowlarr couldn't push to the download client (500). Check the Prowlarr logs.";
					else if (err.type === "auth")                       msg = "✗ API key rejected by Prowlarr.";
					else if (err.type === "network")                    msg = "✗ Cannot reach Prowlarr.";
					else if (err.type === "timeout")                    msg = "✗ Grab timed out.";
					else if (err.type === "http")                       msg = "✗ HTTP " + err.status + " from Prowlarr.";
					else if (err.message)                                msg = "✗ " + err.message;
				}
				setStatus(msg, "error");
				if (button) {
					button.disabled = false;
					button.textContent = "⬇ Grab";
				}
			});
	}

	// ── Clipboard ───────────────────────────────────────────────────────
	function copyToClipboard(text) {
		if (!text) return;
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(text).then(function () {
				setStatus("Copied URL to clipboard.", "success");
			}).catch(function () { fallbackCopy(text); });
		} else {
			fallbackCopy(text);
		}
	}

	function fallbackCopy(text) {
		var ta = document.createElement("textarea");
		ta.value = text;
		ta.style.position = "fixed";
		ta.style.left = "-9999px";
		document.body.appendChild(ta);
		ta.select();
		try {
			document.execCommand("copy");
			setStatus("Copied URL to clipboard.", "success");
		} catch (_) {
			setStatus("Could not copy — select the URL manually.", "error");
		}
		document.body.removeChild(ta);
	}

	// ── Search History ──────────────────────────────────────────────────
	function getHistory(cb) {
		try {
			chrome.storage.local.get(HISTORY_KEY, function (items) {
				var arr = (items && Array.isArray(items[HISTORY_KEY])) ? items[HISTORY_KEY] : [];
				cb(arr);
			});
		} catch (_) { cb([]); }
	}

	function setHistory(arr, cb) {
		var payload = {};
		payload[HISTORY_KEY] = arr;
		chrome.storage.local.set(payload, function () {
			if (cb) cb();
		});
	}

	function historyKeyOf(entry) {
		// Deduplicate by query + sorted indexers + category (case-insensitive query).
		var ixs = (entry.indexerIds || []).slice().sort(function (a, b) { return a - b; }).join(",");
		return (entry.query || "").trim().toLowerCase() + "|" + ixs + "|" + (entry.category || "");
	}

	function saveToHistory(entry) {
		getHistory(function (arr) {
			var key = historyKeyOf(entry);
			// Drop any existing entry with the same key, then prepend
			arr = arr.filter(function (e) { return historyKeyOf(e) !== key; });
			arr.unshift(entry);
			if (arr.length > HISTORY_MAX) arr.length = HISTORY_MAX;
			setHistory(arr, function () {
				// If the History tab is currently visible, refresh it
				var panel = document.getElementById("tab-history");
				if (panel && panel.classList.contains("active")) renderHistory();
			});
		});
	}

	function formatRelativeTs(ts) {
		if (!ts) return "";
		var diffSec = Math.max(0, (Date.now() - ts) / 1000);
		if (diffSec < 60)        return "just now";
		if (diffSec < 3600)      return Math.floor(diffSec / 60) + "m ago";
		if (diffSec < 86400)     return Math.floor(diffSec / 3600) + "h ago";
		if (diffSec < 86400*30)  return Math.floor(diffSec / 86400) + "d ago";
		if (diffSec < 86400*365) return Math.floor(diffSec / (86400 * 30)) + "mo ago";
		return Math.floor(diffSec / (86400 * 365)) + "y ago";
	}

	function describeFilters(entry) {
		var parts = [];
		if (!entry.indexerIds || !entry.indexerIds.length) {
			parts.push("All indexers");
		} else if (entry.indexerIds.length === 1) {
			parts.push(indexerMap[entry.indexerIds[0]] || ("Indexer #" + entry.indexerIds[0]));
		} else {
			parts.push(entry.indexerIds.length + " indexers");
		}
		if (entry.category) {
			for (var i = 0; i < CATEGORY_OPTIONS.length; i++) {
				if (CATEGORY_OPTIONS[i].value === entry.category) {
					parts.push(CATEGORY_OPTIONS[i].label);
					break;
				}
			}
		}
		return parts.join(" · ");
	}

	pub.renderHistory = renderHistory;
	function renderHistory() {
		var listEl = document.getElementById("prowlarr_history_list");
		if (!listEl) return;
		clearChildren(listEl);
		listEl.appendChild(makeDiv("ph-empty", "Loading…"));

		getHistory(function (arr) {
			if (!arr.length) {
				clearChildren(listEl);
				listEl.appendChild(makeDiv("ph-empty", "No searches yet."));
				return;
			}

			clearChildren(listEl);
			var frag = document.createDocumentFragment();

			for (var i = 0; i < arr.length; i++) {
				var e = arr[i];
				var countLabel = typeof e.count === "number"
					? (e.count === 1 ? "1 result" : e.count + " results")
					: "";

				var entry = el("div", { className: "ph-entry", "data-i": i });

				var main = el("div", { className: "ph-main" });
				main.appendChild(el("div", { className: "ph-query" }, e.query || ""));

				var meta = el("div", { className: "ph-meta" });
				meta.appendChild(el("span", { className: "ph-when" }, formatRelativeTs(e.ts)));
				meta.appendChild(el("span", { className: "ph-sep" }, "·"));
				meta.appendChild(el("span", { className: "ph-filters" }, describeFilters(e)));
				if (countLabel) {
					meta.appendChild(el("span", { className: "ph-sep" }, "·"));
					meta.appendChild(el("span", { className: "ph-count" }, countLabel));
				}
				main.appendChild(meta);
				entry.appendChild(main);

				var actions = el("div", { className: "ph-actions" });
				actions.appendChild(el("button", {
					type: "button",
					className: "ph-replay",
					title: "Run this search again"
				}, "⟳"));
				actions.appendChild(el("button", {
					type: "button",
					className: "ph-delete",
					title: "Remove from history"
				}, "✕"));
				entry.appendChild(actions);

				frag.appendChild(entry);
			}
			listEl.appendChild(frag);

			// Cache the array for click handlers
			listEl._historyCache = arr;
		});
	}

	function wireHistory() {
		var listEl  = document.getElementById("prowlarr_history_list");
		var clearEl = document.getElementById("prowlarr_history_clear");
		if (!listEl || !clearEl) return;

		clearEl.addEventListener("click", function () {
			if (!confirm("Clear all search history?")) return;
			setHistory([], renderHistory);
		});

		// Clicking the main area replays the search; explicit buttons for
		// replay and delete also work.
		DomHelper.on(listEl, "click", ".ph-main", function () {
			replayFromEntryEl(this.closest(".ph-entry"));
		});
		DomHelper.on(listEl, "click", ".ph-replay", function (e) {
			e.stopPropagation();
			replayFromEntryEl(this.closest(".ph-entry"));
		});
		DomHelper.on(listEl, "click", ".ph-delete", function (e) {
			e.stopPropagation();
			var row = this.closest(".ph-entry");
			if (!row) return;
			var idx = parseInt(row.getAttribute("data-i"), 10);
			var cached = listEl._historyCache || [];
			if (isNaN(idx) || !cached[idx]) return;
			var targetKey = historyKeyOf(cached[idx]);
			getHistory(function (arr) {
				arr = arr.filter(function (e) { return historyKeyOf(e) !== targetKey; });
				setHistory(arr, renderHistory);
			});
		});
	}

	function replayFromEntryEl(row) {
		if (!row) return;
		var idx = parseInt(row.getAttribute("data-i"), 10);
		var listEl = document.getElementById("prowlarr_history_list");
		var cached = listEl ? listEl._historyCache : null;
		if (isNaN(idx) || !cached || !cached[idx]) return;
		var e = cached[idx];
		// Switch to Search tab then fire the query
		document.dispatchEvent(new CustomEvent("SwitchTab", { detail: "search" }));
		// Ensure indexers are loaded so we can render selection state properly
		if (!indexersLoaded && !loadIndexersInFlight) loadIndexers();
		runSearch({
			query:    e.query,
			indexers: e.indexerIds || [],
			category: e.category || ""
		});
	}

	// ── Initialization ──────────────────────────────────────────────────
	pub.init = function () {
		if (initialized) return;
		initialized = true;

		// Restore previously-saved indexer selection before we load the
		// fresh list from Prowlarr. reconcileSelectedIndexersWithList() runs
		// after loadIndexers resolves and will prune any stale IDs.
		if (Array.isArray(ExtensionConfig.prowlarr_selected_indexers)) {
			selectedIndexers = ExtensionConfig.prowlarr_selected_indexers.slice();
		}

		loadCategories();
		wireIndexerDropdown();
		loadIndexers();   // eager — do not wait for the user to click
		wireHistory();

		var form     = document.getElementById("prowlarr_form");
		var queryEl  = document.getElementById("prowlarr_query");
		var searchBtn = document.getElementById("prowlarr_search_btn");
		var tbody    = document.getElementById("prowlarr_results_body");
		var headers  = document.querySelectorAll("#prowlarr_results thead th[data-sort]");

		var link = document.getElementById("prowlarr_webui_link");
		if (link) link.href = Prowlarr.endpoint();

		if (form) {
			form.addEventListener("submit", function (e) {
				e.preventDefault();
				runSearch();
			});
		}
		// Clicking the search button while a search is in flight cancels
		// instead of starting a new one. We intercept in the capture phase so
		// it runs before the form's submit handler.
		if (searchBtn) {
			searchBtn.addEventListener("click", function (e) {
				if (searchBtn.classList.contains("is-loading")) {
					e.preventDefault();
					e.stopPropagation();
					cancelSearch();
				}
			}, true);
		}
		if (queryEl) {
			queryEl.addEventListener("keydown", function (e) {
				if (e.keyCode === 13) {
					e.preventDefault();
					runSearch();
				}
			});
			document.addEventListener("ProwlarrTabActivated", function () {
				setTimeout(function () { queryEl.focus(); }, 50);
				// Retry indexer load if the first attempt failed during cold start
				if (!indexersLoaded && !loadIndexersInFlight) loadIndexers();
			});
		}

		document.addEventListener("ProwlarrHistoryTabActivated", renderHistory);

		for (var i = 0; i < headers.length; i++) {
			headers[i].addEventListener("click", function () {
				var col = this.getAttribute("data-sort");
				if (col === sortColumn) {
					sortDesc = !sortDesc;
				} else {
					sortColumn = col;
					sortDesc = (col !== "title" && col !== "indexer");
				}
				renderResults();
			});
		}

		if (tbody) {
			DomHelper.on(tbody, "click", ".p_send", function () {
				var row = this.closest(".prowlarr_row");
				if (!row) return;
				var idx = parseInt(row.getAttribute("data-idx"), 10);
				var result = currentResults[idx];
				if (result) grabRelease(result, this);
			});
			DomHelper.on(tbody, "click", ".p_copy", function () {
				copyToClipboard(this.getAttribute("data-url"));
			});
		}

		// Cross-device / multi-popup sync — if the selection changes in
		// another popup or via Firefox Sync, reflect it here without a reload.
		chrome.storage.onChanged.addListener(function (changes, area) {
			if (area !== "sync" || !changes[SELECTED_INDEXERS_KEY]) return;
			var incoming = changes[SELECTED_INDEXERS_KEY].newValue;
			if (!Array.isArray(incoming)) return;
			// Skip if it matches what we already have (we probably wrote it)
			if (incoming.length === selectedIndexers.length &&
				incoming.every(function (id, i) { return id === selectedIndexers[i]; })) {
				return;
			}
			selectedIndexers = incoming.slice();
			if (indexersLoaded) {
				reconcileSelectedIndexersWithList();
				renderIndexerList();
			}
		});

		setStatus("Ready. Enter a search term.", "");
	};

	pub.refreshIndexers = function () { indexersLoaded = false; loadIndexers(); };

	return pub;
}());
