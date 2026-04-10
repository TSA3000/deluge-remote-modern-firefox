/*
 * Minimal DOM helpers — replaces jQuery's fade/animate and a few utilities.
 * Everything else uses native DOM APIs directly.
 */
var DomHelper = {
	/**
	 * Fade an element in over duration ms.
	 */
	fadeIn: function (el, duration, callback) {
		duration = duration || 300;
		el.style.opacity = "0";
		el.style.display = "";
		el.style.transition = "opacity " + duration + "ms ease";
		// Force reflow so transition triggers
		el.offsetHeight;
		el.style.opacity = "1";
		if (callback) {
			setTimeout(callback, duration);
		}
	},

	/**
	 * Fade an element out over duration ms.
	 */
	fadeOut: function (el, duration, callback) {
		duration = duration || 300;
		el.style.transition = "opacity " + duration + "ms ease";
		el.style.opacity = "0";
		setTimeout(function () {
			el.style.display = "none";
			el.style.transition = "";
			if (callback) callback();
		}, duration);
	},

	/**
	 * Show an element (remove display:none).
	 */
	show: function (el) {
		el.style.display = "block";
	},

	/**
	 * Hide an element.
	 */
	hide: function (el) {
		el.style.display = "none";
	},

	/**
	 * Delegate event listener — like jQuery .on(event, selector, handler).
	 */
	on: function (parent, event, selector, handler) {
		parent.addEventListener(event, function (e) {
			var target = e.target.closest(selector);
			if (target && parent.contains(target)) {
				handler.call(target, e);
			}
		});
	}
};
