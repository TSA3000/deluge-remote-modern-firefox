debug_log("Creating click handler");
document.body.addEventListener("click", function (event) {
	var link = event.target.closest("a");
	if (!link) return;

	var url = link.href;
	debug_log("Click handler activated. URL: " + url);

	// 1. Check for Magnet Links first
	if (ExtensionConfig.handle_magnets) {
		debug_log("Handling magnets enabled");
		if (url.indexOf("magnet:") === 0) {
			debug_log("Detected link as magnet");
			event.stopPropagation();
			event.preventDefault();
			debug_log("Captured magnet link " + url);
			chrome.runtime.sendMessage({
				"method": "add_torrent_from_magnet",
				"url": url
			});
			debug_log("Link sent to Deluge.");
			return; // Stop running! We already handled the click.
		}
	}

	// 2. Check for .torrent files
	if (ExtensionConfig.handle_torrents) {
		debug_log("Handling torrents enabled");
		
		try {
			// Parse the URL to safely ignore query parameters like ?passkey=123
			var parsedUrl = new URL(url);
			
			// Check if the actual file path ends with .torrent (case-insensitive)
			if (parsedUrl.pathname.toLowerCase().endsWith(".torrent")) {
				debug_log("Detected link as a torrent");
				event.stopPropagation();
				event.preventDefault();
				debug_log("Captured .torrent link " + url);
				chrome.runtime.sendMessage({
					"method": "add_torrent_from_url",
					"url": url
				});
				debug_log("Link sent to Deluge.");
			}
		} catch (error) {
			// If the webpage has a weird/broken link that new URL() can't parse,
			// just quietly ignore it so we don't break the webpage.
			debug_log("Could not parse URL: " + url);
		}
	}
});

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
	debug_log(request.msg);
});