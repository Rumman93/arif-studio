(function () {
  "use strict";

  var C = window.SITE_CONFIG || {};
  var LANG_KEY = "ms-lang";
  var lang = "bn";
  var products = [];
  var copy = {
    bn: {
      brand: "আরিফ স্টুডিও",
      shop: "এক্সেসরিজ শপ",
      home: "হোম",
      eyebrow: "আরিফ স্টুডিও এন্ড টেলিকম",
      title: "এক্সেসরিজ ও ইলেকট্রনিক্স",
      intro: "দোকানে থাকা পণ্যের বর্তমান দাম ও স্টক দেখুন। কেনার আগে ফোন করে নিশ্চিত হতে পারেন।",
      call: "পণ্য সম্পর্কে কল করুন",
      products: "পণ্যসমূহ",
      refresh: "আবার লোড করুন",
      retry: "আবার চেষ্টা করুন",
      inStock: "স্টকে আছে",
      outOfStock: "স্টক শেষ",
      count: "%sটি পণ্য",
      emptyTitle: "এখনও কোনো পণ্য যোগ করা হয়নি",
      emptyMessage: "নতুন পণ্য যোগ হলে এখানে দেখা যাবে।",
      errorTitle: "পণ্য লোড করা যায়নি",
      errorMessage: "ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।",
      price: "৳%s"
    },
    en: {
      brand: "Arif Studio",
      shop: "Accessories Shop",
      home: "Home",
      eyebrow: "Arif Studio & Telecom",
      title: "Accessories & Electronics",
      intro: "Browse current prices and stock in the shop. You can call before visiting to confirm availability.",
      call: "Call about a product",
      products: "Products",
      refresh: "Refresh",
      retry: "Try again",
      inStock: "In stock",
      outOfStock: "Out of stock",
      count: "%s products",
      emptyTitle: "No products have been added yet",
      emptyMessage: "New products will appear here when they are added.",
      errorTitle: "Products could not be loaded",
      errorMessage: "Check your connection and try again.",
      price: "৳%s"
    }
  };

  var grid = document.getElementById("product-grid");
  var state = document.getElementById("catalog-state");
  var count = document.getElementById("product-count");

  function t(key) { return copy[lang][key]; }
  function digits(value) { return String(value || "").replace(/\D/g, ""); }
  function phone(value) {
    var number = digits(value);
    return number.charAt(0) === "0" ? "88" + number : number;
  }
  function formatNumber(value) {
    return new Intl.NumberFormat(lang === "bn" ? "bn-BD" : "en-BD", { maximumFractionDigits: 0 }).format(value);
  }

  function setLanguage(next) {
    lang = next === "en" ? "en" : "bn";
    document.documentElement.lang = lang;
    document.title = lang === "en" ? "Accessories | Arif Studio" : "এক্সেসরিজ | আরিফ স্টুডিও";
    document.querySelectorAll("[data-copy]").forEach(function (element) {
      element.textContent = t(element.getAttribute("data-copy"));
    });
    document.querySelectorAll("[data-lang]").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.getAttribute("data-lang") === lang));
    });
    document.querySelectorAll("[data-address]").forEach(function (element) {
      element.textContent = C.address ? (C.address[lang] || C.address.bn || "") : "";
    });
    try { localStorage.setItem(LANG_KEY, lang); } catch (error) { /* private mode */ }
    renderProducts();
  }

  function renderProducts() {
    if (!products.length) return;
    grid.replaceChildren();
    products.forEach(function (product) {
      var card = document.createElement("article");
      card.className = "product-card";

      var media = document.createElement("div");
      media.className = "product-media";
      var image = document.createElement("img");
      image.src = product.imageUrl;
      image.alt = lang === "en" && product.nameEn ? product.nameEn : product.name;
      image.width = 720;
      image.height = 720;
      image.loading = "lazy";
      image.decoding = "async";
      media.appendChild(image);

      var body = document.createElement("div");
      body.className = "product-body";
      var name = document.createElement("h3");
      name.className = "product-name";
      name.textContent = lang === "en" && product.nameEn ? product.nameEn : product.name;
      var meta = document.createElement("div");
      meta.className = "product-meta";
      var price = document.createElement("strong");
      price.className = "product-price";
      price.textContent = t("price").replace("%s", formatNumber(product.price));
      var stock = document.createElement("span");
      stock.className = "stock" + (product.inStock ? "" : " out");
      stock.textContent = t(product.inStock ? "inStock" : "outOfStock");
      meta.append(price, stock);
      body.append(name, meta);
      card.append(media, body);
      grid.appendChild(card);
    });
    count.textContent = t("count").replace("%s", formatNumber(products.length));
  }

  function showState(type) {
    grid.hidden = true;
    state.hidden = false;
    document.getElementById("state-title").textContent = t(type + "Title");
    document.getElementById("state-message").textContent = t(type + "Message");
    document.getElementById("retry-products").hidden = type === "empty";
    count.textContent = "";
  }

  async function loadProducts() {
    grid.hidden = false;
    state.hidden = true;
    grid.setAttribute("aria-busy", "true");
    if (!products.length) {
      grid.innerHTML = "<div class=\"product-skeleton\" aria-hidden=\"true\"></div>".repeat(4);
    }
    try {
      var response = await fetch("/api/products", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Request failed");
      var payload = await response.json();
      products = Array.isArray(payload.products) ? payload.products : [];
      if (!products.length) showState("empty");
      else {
        grid.hidden = false;
        state.hidden = true;
        renderProducts();
      }
    } catch (error) {
      products = [];
      showState("error");
    } finally {
      grid.setAttribute("aria-busy", "false");
    }
  }

  document.addEventListener("click", function (event) {
    var language = event.target.closest("[data-lang]");
    if (language) setLanguage(language.getAttribute("data-lang"));
  });
  document.getElementById("refresh-products").addEventListener("click", loadProducts);
  document.getElementById("retry-products").addEventListener("click", loadProducts);
  function start() {
    document.querySelectorAll("[data-phone]").forEach(function (link) {
      link.href = "tel:+" + phone(C.phone);
    });
    document.getElementById("year").textContent = new Date().getFullYear();

    var saved = "bn";
    try { saved = localStorage.getItem(LANG_KEY) || "bn"; } catch (error) { /* private mode */ }
    setLanguage(saved);
    loadProducts();
  }

  Promise.resolve(window.SITE_CONFIG_READY).then(start, start);
})();
