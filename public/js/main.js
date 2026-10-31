/* Arif Studio — fills in values from config.js, handles language switch, copy buttons and open/closed badge.
   Written in plain ES5 so it also runs on older phone browsers. */
(function () {
  "use strict";

  var C = window.SITE_CONFIG || {};
  var LANG_KEY = "ms-lang";
  var BN_DIGITS = "০১২৩৪৫৬৭৮৯";
  var lang = "bn";

  var STR = {
    bn: {
      open: "এখন খোলা",
      closed: "এখন বন্ধ",
      copied: "নম্বর কপি হয়েছে",
      copyFail: "কপি করা যায়নি",
      everyDay: "প্রতিদিন খোলা",
      weekly: "সাপ্তাহিক বন্ধ: ",
      waMsg: "আসসালামু আলাইকুম, আরিফ স্টুডিও।",
      askMsg: "আমি %s সম্পর্কে জানতে চাই।",
      days: ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"]
    },
    en: {
      open: "Open now",
      closed: "Closed now",
      copied: "Number copied",
      copyFail: "Could not copy",
      everyDay: "Open every day",
      weekly: "Weekly closed: ",
      waMsg: "Hello, Arif Studio.",
      askMsg: "I would like to know about %s.",
      days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    }
  };

  function each(sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); }
  function get(path) {
    return path.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, C);
  }
  function t(key) { return STR[lang][key]; }
  function localNum(s) {
    s = String(s);
    return lang === "bn" ? s.replace(/\d/g, function (d) { return BN_DIGITS[d]; }) : s;
  }
  function digits(s) { return String(s || "").replace(/\D/g, ""); }
  // 01712345678 -> 01712-345678 ; Rocket 017123456789 -> 01712-345678-9
  function fmtPhone(s) {
    var d = digits(s);
    if (d.length === 11) return d.slice(0, 5) + "-" + d.slice(5);
    if (d.length === 12) return d.slice(0, 5) + "-" + d.slice(5, 11) + "-" + d.slice(11);
    return d;
  }
  // Local 01XXXXXXXXX -> 8801XXXXXXXXX
  function intl(s) {
    var d = digits(s);
    return d.charAt(0) === "0" ? "88" + d : d;
  }

  function toMin(hm) {
    var p = String(hm).split(":");
    return (+p[0]) * 60 + (+p[1] || 0);
  }
  function fmtTime(hm) {
    var p = String(hm).split(":");
    var h = +p[0];
    var m = p[1] || "00";
    var h12 = (h % 12) || 12;
    if (lang === "en") return h12 + ":" + m + (h < 12 ? " AM" : " PM");
    var part = h < 4 ? "রাত" : h < 12 ? "সকাল" : h < 15 ? "দুপুর" : h < 18 ? "বিকাল" : h < 20 ? "সন্ধ্যা" : "রাত";
    return part + " " + localNum(h12 + ":" + m);
  }

  // Shop time is always Bangladesh time (UTC+6), whatever the visitor's phone says.
  function isOpenNow() {
    var H = C.hours;
    if (!H || !H.open || !H.close) return null;
    var now = new Date(Date.now() + 6 * 3600 * 1000);
    if ((H.closedDays || []).indexOf(now.getUTCDay()) !== -1) return false;
    var cur = now.getUTCHours() * 60 + now.getUTCMinutes();
    var o = toMin(H.open);
    var c = toMin(H.close);
    return c > o ? cur >= o && cur < c : cur >= o || cur < c; // handles closing after midnight
  }

  function render() {
    // Phone numbers always in English digits (as on SIMs, bills and phone keypads); only formatted 01984-993221
    each("[data-num]", function (el) { el.textContent = fmtPhone(get(el.getAttribute("data-num"))); });
    each("[data-tel]", function (a) { a.href = "tel:+" + intl(get(a.getAttribute("data-tel"))); });
    each("[data-wa]", function (a) {
      var msg = t("waMsg");
      // Service-card links pre-fill the service name, e.g. "…আমি বিল পেমেন্ট সম্পর্কে জানতে চাই।"
      if (a.hasAttribute("data-ask")) {
        var h = a.parentNode.querySelector("h3");
        msg += " " + t("askMsg").replace("%s", h ? h.textContent : "");
      }
      a.href = "https://wa.me/" + intl(get(a.getAttribute("data-wa"))) + "?text=" + encodeURIComponent(msg);
    });
    each("[data-map]", function (a) { a.href = C.mapUrl || "#contact"; });
    each("[data-fb]", function (a) {
      if (C.facebook) a.href = C.facebook;
      else a.hidden = true;
    });
    each("[data-agent]", function (el) { el.hidden = !digits(get("agents." + el.getAttribute("data-agent"))); });
    each("[data-addr]", function (el) { el.textContent = (C.address && C.address[lang]) || ""; });
    // Any config value: data-cfg="proprietor.name" (bn/en objects pick the current language)
    each("[data-cfg]", function (el) {
      var v = get(el.getAttribute("data-cfg"));
      el.textContent = v && typeof v === "object" ? (v[lang] || v.bn || "") : (v || "");
    });
    each("[data-mail]", function (a) {
      if (C.email) { a.href = "mailto:" + C.email; a.textContent = C.email; } else { a.hidden = true; }
    });

    var H = C.hours || {};
    each("[data-hours]", function (el) { el.textContent = H.open ? fmtTime(H.open) + " – " + fmtTime(H.close) : ""; });
    each("[data-closed]", function (el) {
      var days = (H.closedDays || []).map(function (d) { return t("days")[d]; });
      el.textContent = days.length ? t("weekly") + days.join(", ") : t("everyDay");
    });
    each("[data-year]", function (el) { el.textContent = localNum(new Date().getFullYear()); });

    var open = isOpenNow();
    if (open !== null) {
      each(".status", function (st) {
        st.hidden = false;
        st.classList.toggle("closed", !open);
        st.lastElementChild.textContent = t(open ? "open" : "closed");
      });
    }
  }

  /* ---------- Language ----------
     Bangla text lives in the HTML (fast first paint, good for search).
     English text lives in js/en.js and is downloaded only when someone switches. */
  function applyText(l) {
    var EN = window.SITE_EN || {};
    // innerHTML so headings can keep their <em> highlight; all strings come from our own files.
    each("[data-i18n]", function (el) {
      if (el._bn === undefined) el._bn = el.innerHTML;
      el.innerHTML = l === "en" ? (EN[el.getAttribute("data-i18n")] || el._bn) : el._bn;
    });
    each("[data-i18n-aria]", function (el) {
      if (el._bnAria === undefined) el._bnAria = el.getAttribute("aria-label");
      el.setAttribute("aria-label", l === "en" ? (EN[el.getAttribute("data-i18n-aria")] || el._bnAria) : el._bnAria);
    });
    if (document._bnTitle === undefined) document._bnTitle = document.title;
    document.title = l === "en" && EN._title ? EN._title : document._bnTitle;
    document.documentElement.lang = l;

    each("[data-lang]", function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-lang") === l)); });
  }

  function setLang(l) {
    if (l === "en" && !window.SITE_EN) {
      var s = document.createElement("script");
      s.src = "js/en.js";
      s.onload = function () { setLang("en"); };
      document.head.appendChild(s);
      return;
    }
    lang = l;
    applyText(l);
    render();
    try { localStorage.setItem(LANG_KEY, l); } catch (e) { /* private mode */ }
  }

  /* ---------- Copy agent number ---------- */
  var toastTimer;
  function toast(msg) {
    var el = document.getElementById("toast");
    el.textContent = msg;
    el.className = "toast show";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = "toast"; }, 2000);
  }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast(t("copied")); }, function () { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { /* unsupported */ }
    document.body.removeChild(ta);
    toast(t(ok ? "copied" : "copyFail"));
  }

  /* ---------- Structured data for Google (LocalBusiness) ---------- */
  function addSchema() {
    var H = C.hours || {};
    var days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
      .filter(function (d, i) { return (H.closedDays || []).indexOf(i) === -1; });
    var data = {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: (C.shopName && C.shopName.en) || "Arif Studio & Telecom",
      alternateName: (C.shopName && C.shopName.bn) || "আরিফ স্টুডিও এন্ড টেলিকম",
      email: C.email || undefined,
      telephone: "+" + intl(C.phone),
      address: (C.address && C.address.en) || "",
      hasMap: C.mapUrl,
      url: location.origin + location.pathname
    };
    if (H.open) data.openingHoursSpecification = [{ "@type": "OpeningHoursSpecification", dayOfWeek: days, opens: H.open, closes: H.close }];
    var s = document.createElement("script");
    s.type = "application/ld+json";
    s.textContent = JSON.stringify(data);
    document.head.appendChild(s);
  }

  /* ---------- Fade-in on scroll ----------
     Skipped on old browsers, data-saver mode and reduced-motion, so content is never hidden there. */
  function setupReveal() {
    if (!("IntersectionObserver" in window) || !document.body.classList) return;
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (navigator.connection && navigator.connection.saveData) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: "0px 0px -6% 0px" });

    each(".pcard, .agent, .steps li, .duo-card, .why, .qa", function (el) {
      var i = Array.prototype.indexOf.call(el.parentNode.children, el);
      el.style.transitionDelay = Math.min(i, 5) * 70 + "ms, " + Math.min(i, 5) * 70 + "ms, 0ms";
      el.classList.add("reveal");
      io.observe(el);
    });
  }

  /* ---------- Service detail panel ---------- */
  var modal = document.getElementById("modal");
  var lastFocus = null;
  function openDetail(card) {
    var title = card.querySelector("h3").textContent;
    var use = card.querySelector(".disc use");
    document.getElementById("mTitle").textContent = title;
    if (use) document.getElementById("mIcon").firstElementChild.setAttribute("href", use.getAttribute("href"));
    document.getElementById("mBody").innerHTML = card.querySelector(".detail").innerHTML;
    document.getElementById("mWa").href = "https://wa.me/" + intl(C.whatsapp) + "?text=" +
      encodeURIComponent(t("waMsg") + " " + t("askMsg").replace("%s", title));
    document.getElementById("mAgents").hidden = card.id !== "s-cash";
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add("lock");
    modal.querySelector(".sheet").focus();
  }
  function closeDetail() {
    if (modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove("lock");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDetail(); });

  /* ---------- Start ---------- */
  document.addEventListener("click", function (e) {
    if (!e.target.closest) return;
    var b = e.target.closest("[data-copy]");
    if (b) copyText(digits(get(b.getAttribute("data-copy"))));
    var l = e.target.closest("[data-lang]");
    if (l && l.getAttribute("data-lang") !== lang) { closeDetail(); setLang(l.getAttribute("data-lang")); }
    var d = e.target.closest("[data-detail]");
    if (d) openDetail(d.closest(".pcard"));
    if (e.target.closest("[data-close]")) closeDetail();
  });

  var saved = null;
  try { saved = localStorage.getItem(LANG_KEY); } catch (e) { /* private mode */ }
  if (/[?&]lang=en\b/.test(location.search)) saved = "en";
  if (saved === "en") setLang("en");
  else render();

  addSchema();
  setupReveal();
  setInterval(render, 60000); // keep the open/closed badge current
})();
