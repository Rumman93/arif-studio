(function () {
  "use strict";

  var defaults = window.SITE_CONFIG || {};

  function merge(target, source) {
    Object.keys(source || {}).forEach(function (key) {
      var value = source[key];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        if (!target[key] || typeof target[key] !== "object" || Array.isArray(target[key])) target[key] = {};
        merge(target[key], value);
      } else {
        target[key] = value;
      }
    });
    return target;
  }

  window.SITE_CONFIG_READY = fetch("/api/site-settings", {
    headers: { Accept: "application/json" }
  }).then(function (response) {
    if (!response.ok) throw new Error("Settings unavailable");
    return response.json();
  }).then(function (payload) {
    if (payload && payload.settings) merge(defaults, payload.settings);
    return defaults;
  }).catch(function () {
    return defaults;
  });
})();
