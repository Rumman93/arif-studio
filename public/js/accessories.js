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
      retry: "আবার চেষ্টা করুন",
      filter: "ফিল্টার",
      onlyInStock: "শুধু স্টকে আছে",
      minPrice: "সর্বনিম্ন দাম",
      maxPrice: "সর্বোচ্চ দাম",
      clearFilters: "ফিল্টার মুছুন",
      inStockCount: "স্টকে %sটি আছে",
      outOfStock: "স্টক শেষ",
      resultCount: "%sটির মধ্যে %vটি পণ্য",
      emptyTitle: "এখনও কোনো পণ্য যোগ করা হয়নি",
      emptyMessage: "নতুন পণ্য যোগ হলে এখানে দেখা যাবে।",
      noResultsTitle: "কোনো পণ্য মেলেনি",
      noResultsMessage: "দাম বা স্টক ফিল্টার পরিবর্তন করে আবার দেখুন।",
      errorTitle: "পণ্য লোড করা যায়নি",
      errorMessage: "ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।",
      price: "৳%s",
      order: "WhatsApp-এ অর্ডার করুন",
      orderMessage: "আসসালামু আলাইকুম, আমি আরিফ স্টুডিও থেকে “%n” (%p) অর্ডার করতে চাই।",
      imageUnavailable: "ছবি পাওয়া যায়নি"
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
      retry: "Try again",
      filter: "Filter",
      onlyInStock: "In-stock products only",
      minPrice: "Minimum price",
      maxPrice: "Maximum price",
      clearFilters: "Clear filters",
      inStockCount: "%s in stock",
      outOfStock: "Out of stock",
      resultCount: "%v of %s products",
      emptyTitle: "No products have been added yet",
      emptyMessage: "New products will appear here when they are added.",
      noResultsTitle: "No products match",
      noResultsMessage: "Change the price or stock filters and try again.",
      errorTitle: "Products could not be loaded",
      errorMessage: "Check your connection and try again.",
      price: "৳%s",
      order: "Order on WhatsApp",
      orderMessage: "Hello, I would like to order “%n” (%p) from Arif Studio.",
      imageUnavailable: "Image unavailable"
    }
  };

  var grid = document.getElementById("product-grid");
  var state = document.getElementById("catalog-state");
  var count = document.getElementById("product-count");
  var stockFilter = document.getElementById("filter-in-stock");
  var minPriceFilter = document.getElementById("filter-min-price");
  var maxPriceFilter = document.getElementById("filter-max-price");

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
    minPriceFilter.placeholder = lang === "en" ? "৳ 0" : "৳ ০";
    maxPriceFilter.placeholder = lang === "en" ? "৳ 2000" : "৳ ২০০০";
    try { localStorage.setItem(LANG_KEY, lang); } catch (error) { /* private mode */ }
    renderProducts();
  }

  function activeFilters() {
    return Number(stockFilter.checked) + Number(minPriceFilter.value !== "") + Number(maxPriceFilter.value !== "");
  }

  function filteredProducts() {
    var minimum = minPriceFilter.value === "" ? 0 : Number(minPriceFilter.value);
    var maximum = maxPriceFilter.value === "" ? Infinity : Number(maxPriceFilter.value);
    return products.filter(function (product) {
      return (!stockFilter.checked || product.inStock) && product.price >= minimum && product.price <= maximum;
    });
  }

  function productCard(product) {
    var card = document.createElement("article");
    card.className = "product-card";

    var media = document.createElement("div");
    media.className = "product-media";
    var image = document.createElement("img");
    var productName = lang === "en" && product.nameEn ? product.nameEn : product.name;
    image.src = product.imageUrl;
    image.alt = productName;
    image.width = 720;
    image.height = 720;
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", function () {
      var fallback = document.createElement("span");
      fallback.className = "image-fallback";
      fallback.textContent = t("imageUnavailable");
      media.replaceChildren(fallback);
    }, { once: true });
    media.appendChild(image);

    var body = document.createElement("div");
    body.className = "product-body";
    var name = document.createElement("h3");
    name.className = "product-name";
    name.textContent = productName;
    var meta = document.createElement("div");
    meta.className = "product-meta";
    var price = document.createElement("strong");
    price.className = "product-price";
    price.textContent = t("price").replace("%s", formatNumber(product.price));
    var stock = document.createElement("span");
    stock.className = "stock" + (product.inStock ? "" : " out");
    stock.textContent = product.inStock
      ? t("inStockCount").replace("%s", formatNumber(product.stockQuantity))
      : t("outOfStock");
    meta.append(price, stock);

    var order = document.createElement("a");
    order.className = "product-order";
    order.textContent = t("order");
    var whatsapp = phone(C.whatsapp);
    if (product.inStock && whatsapp) {
      var message = t("orderMessage")
        .replace("%n", productName)
        .replace("%p", price.textContent);
      order.href = "https://wa.me/" + whatsapp + "?text=" + encodeURIComponent(message);
      order.target = "_blank";
      order.rel = "noopener";
    } else {
      order.setAttribute("aria-disabled", "true");
      order.tabIndex = -1;
    }

    body.append(name, meta, order);
    card.append(media, body);
    return card;
  }

  function renderProducts() {
    if (!products.length) return;
    var visible = filteredProducts();
    document.getElementById("active-filter-count").textContent = formatNumber(activeFilters());
    count.textContent = t("resultCount")
      .replace("%v", formatNumber(visible.length))
      .replace("%s", formatNumber(products.length));
    if (!visible.length) {
      showState("noResults", false);
      return;
    }
    state.hidden = true;
    grid.hidden = false;
    grid.replaceChildren();
    visible.forEach(function (product) { grid.appendChild(productCard(product)); });
  }

  function showState(type, clearCount) {
    grid.hidden = true;
    state.hidden = false;
    document.getElementById("state-title").textContent = t(type + "Title");
    document.getElementById("state-message").textContent = t(type + "Message");
    document.getElementById("retry-products").hidden = type !== "error";
    if (clearCount) count.textContent = "";
  }

  function readInitialProducts() {
    try {
      var value = JSON.parse(document.getElementById("initial-products").textContent);
      return Array.isArray(value) ? value : [];
    } catch (error) {
      return [];
    }
  }

  async function loadProducts() {
    var previous = products;
    state.hidden = true;
    grid.hidden = false;
    grid.setAttribute("aria-busy", "true");
    if (!products.length) {
      grid.innerHTML = "<div class=\"product-skeleton\" aria-hidden=\"true\"></div>".repeat(4);
    }
    try {
      var response = await fetch("/api/products", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Request failed");
      var payload = await response.json();
      products = Array.isArray(payload.products) ? payload.products : [];
      if (!products.length) showState("empty", true);
      else renderProducts();
    } catch (error) {
      products = previous;
      if (products.length) renderProducts();
      else showState("error", true);
    } finally {
      grid.setAttribute("aria-busy", "false");
    }
  }

  document.addEventListener("click", function (event) {
    var language = event.target.closest("[data-lang]");
    if (language) setLanguage(language.getAttribute("data-lang"));
  });
  [stockFilter, minPriceFilter, maxPriceFilter].forEach(function (control) {
    control.addEventListener("input", renderProducts);
  });
  document.getElementById("clear-filters").addEventListener("click", function () {
    stockFilter.checked = false;
    minPriceFilter.value = "";
    maxPriceFilter.value = "";
    renderProducts();
  });
  document.getElementById("retry-products").addEventListener("click", loadProducts);

  function start() {
    document.querySelectorAll("[data-phone]").forEach(function (link) {
      link.href = "tel:+" + phone(C.phone);
    });
    document.getElementById("year").textContent = new Date().getFullYear();
    products = readInitialProducts();

    var saved = "bn";
    try { saved = localStorage.getItem(LANG_KEY) || "bn"; } catch (error) { /* private mode */ }
    setLanguage(saved);
    if (products.length) grid.setAttribute("aria-busy", "false");
    else loadProducts();
  }

  Promise.resolve(window.SITE_CONFIG_READY).then(start, start);
})();
