(function () {
  "use strict";

  var grid = document.getElementById("home-product-grid");
  var state = document.getElementById("home-product-state");
  if (!grid || !state) return;

  var products = [];
  var copy = {
    bn: { inStock: "স্টকে আছে", outOfStock: "স্টক শেষ", unavailable: "পণ্যগুলো এখন লোড করা যাচ্ছে না। আরও দেখতে এক্সেসরিজ পাতায় যান।" },
    en: { inStock: "In stock", outOfStock: "Out of stock", unavailable: "Products cannot be loaded right now. Visit the accessories page to see more." }
  };

  function language() {
    return document.documentElement.lang === "en" ? "en" : "bn";
  }

  function formatPrice(value) {
    return "৳" + new Intl.NumberFormat(language() === "bn" ? "bn-BD" : "en-BD", {
      maximumFractionDigits: 0
    }).format(value);
  }

  function render() {
    if (!products.length) return;
    var lang = language();
    grid.replaceChildren();
    products.slice(0, 4).forEach(function (product) {
      var card = document.createElement("article");
      card.className = "home-product-card";

      var media = document.createElement("div");
      media.className = "home-product-media";
      var image = document.createElement("img");
      image.src = product.imageUrl;
      image.alt = lang === "en" && product.nameEn ? product.nameEn : product.name;
      image.width = 720;
      image.height = 720;
      image.loading = "lazy";
      image.decoding = "async";
      media.appendChild(image);

      var body = document.createElement("div");
      body.className = "home-product-body";
      var name = document.createElement("h3");
      name.textContent = image.alt;
      var price = document.createElement("strong");
      price.textContent = formatPrice(product.price);
      var stock = document.createElement("span");
      stock.className = "home-product-stock" + (product.inStock ? "" : " out");
      stock.textContent = copy[lang][product.inStock ? "inStock" : "outOfStock"];
      body.append(name, price, stock);
      card.append(media, body);
      grid.appendChild(card);
    });
  }

  async function load() {
    try {
      var response = await fetch("/api/products", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Request failed");
      var payload = await response.json();
      products = Array.isArray(payload.products) ? payload.products.slice(0, 4) : [];
      if (!products.length) throw new Error("No products");
      state.hidden = true;
      grid.hidden = false;
      render();
    } catch (error) {
      grid.hidden = true;
      state.textContent = copy[language()].unavailable;
      state.hidden = false;
    } finally {
      grid.setAttribute("aria-busy", "false");
    }
  }

  new MutationObserver(function (changes) {
    if (changes.some(function (change) { return change.attributeName === "lang"; })) {
      if (products.length) render();
      else if (!state.hidden) state.textContent = copy[language()].unavailable;
    }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });

  load();
})();
