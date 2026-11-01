(function () {
  "use strict";

  var loginView = document.getElementById("login-view");
  var dashboardView = document.getElementById("dashboard-view");
  var loginForm = document.getElementById("login-form");
  var loginError = document.getElementById("login-error");
  var productDialog = document.getElementById("product-dialog");
  var productForm = document.getElementById("product-form");
  var productError = document.getElementById("product-error");
  var productList = document.getElementById("admin-products");
  var adminState = document.getElementById("admin-state");
  var settingsForm = document.getElementById("settings-form");
  var settingsState = document.getElementById("settings-state");
  var settingsError = document.getElementById("settings-error");
  var products = [];
  var settingsLoaded = false;
  var settingsDirty = false;
  var settingsSnapshot = "";
  var previewUrl = "";
  var toastTimer;

  function showToast(message) {
    var toast = document.getElementById("admin-toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("show"); }, 2200);
  }

  async function api(path, options) {
    var response = await fetch(path, Object.assign({
      credentials: "same-origin",
      headers: { Accept: "application/json" }
    }, options || {}));
    var payload = {};
    try { payload = await response.json(); } catch (error) { /* non-JSON server error */ }
    if (response.status === 401 && path !== "/api/admin/login") showLogin();
    if (!response.ok) throw new Error(payload.error || "অনুরোধটি সম্পন্ন হয়নি।");
    return payload;
  }

  function showLogin() {
    dashboardView.hidden = true;
    loginView.hidden = false;
    settingsLoaded = false;
    settingsDirty = false;
    document.getElementById("admin-password").focus();
  }

  function showDashboard() {
    loginView.hidden = true;
    dashboardView.hidden = false;
    document.querySelector('[data-admin-tab="products"]').click();
    loadProducts();
  }

  async function checkSession() {
    try {
      var result = await api("/api/admin/session");
      if (result.authenticated) showDashboard();
      else showLogin();
    } catch (error) {
      showLogin();
      loginError.textContent = "সার্ভারের সাথে যোগাযোগ করা যায়নি।";
    }
  }

  loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    loginError.textContent = "";
    var button = loginForm.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = "লগইন হচ্ছে…";
    try {
      await api("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ password: document.getElementById("admin-password").value })
      });
      loginForm.reset();
      showDashboard();
    } catch (error) {
      loginError.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = "লগইন করুন";
    }
  });

  document.getElementById("logout-button").addEventListener("click", async function () {
    try { await api("/api/admin/logout", { method: "POST" }); } catch (error) { /* cookie still expires server-side response when reachable */ }
    showLogin();
  });

  document.querySelectorAll("[data-admin-tab]").forEach(function (button) {
    button.addEventListener("click", function () {
      var tab = button.getAttribute("data-admin-tab");
      document.querySelectorAll("[data-admin-tab]").forEach(function (item) {
        var active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-selected", String(active));
      });
      document.getElementById("products-panel").hidden = tab !== "products";
      document.getElementById("settings-panel").hidden = tab !== "settings";
      if (tab === "settings" && !settingsLoaded) loadSettings();
    });
  });

  async function loadSettings() {
    settingsState.hidden = false;
    settingsState.textContent = "তথ্য লোড হচ্ছে…";
    settingsForm.hidden = true;
    settingsError.textContent = "";
    try {
      var result = await api("/api/admin/settings");
      fillSettings(result.settings);
      settingsLoaded = true;
      settingsState.hidden = true;
      settingsForm.hidden = false;
    } catch (error) {
      settingsState.textContent = error.message;
    }
  }

  function fillSettings(settings) {
    document.getElementById("setting-shop-bn").value = settings.shopName.bn;
    document.getElementById("setting-shop-en").value = settings.shopName.en;
    document.getElementById("setting-owner-bn").value = settings.proprietor.name.bn;
    document.getElementById("setting-owner-en").value = settings.proprietor.name.en;
    document.getElementById("setting-owner-phone").value = settings.proprietor.phone;
    document.getElementById("setting-phone").value = settings.phone;
    document.getElementById("setting-whatsapp").value = settings.whatsapp;
    document.getElementById("setting-email").value = settings.email;
    document.getElementById("setting-facebook").value = settings.facebook || "";
    document.getElementById("setting-bkash").value = settings.agents.bkash || "";
    document.getElementById("setting-nagad").value = settings.agents.nagad || "";
    document.getElementById("setting-rocket").value = settings.agents.rocket || "";
    document.getElementById("setting-upay").value = settings.agents.upay || "";
    document.getElementById("setting-tech-bn").value = settings.servicing.name.bn;
    document.getElementById("setting-tech-en").value = settings.servicing.name.en;
    document.getElementById("setting-tech-phone").value = settings.servicing.phone;
    document.getElementById("setting-address-bn").value = settings.address.bn;
    document.getElementById("setting-address-en").value = settings.address.en;
    document.getElementById("setting-map").value = settings.mapUrl;
    document.getElementById("setting-open").value = settings.hours.open;
    document.getElementById("setting-close").value = settings.hours.close;
    document.querySelectorAll('input[name="closed-day"]').forEach(function (checkbox) {
      checkbox.checked = settings.hours.closedDays.indexOf(Number(checkbox.value)) !== -1;
    });
    setProfileImagePreview("proprietor", settings.profileImages && settings.profileImages.proprietor);
    setProfileImagePreview("technician", settings.profileImages && settings.profileImages.technician);
    settingsSnapshot = JSON.stringify(readSettingsForm());
    settingsDirty = false;
  }

  function readSettingsForm() {
    return {
      shopName: {
        bn: document.getElementById("setting-shop-bn").value,
        en: document.getElementById("setting-shop-en").value
      },
      proprietor: {
        name: {
          bn: document.getElementById("setting-owner-bn").value,
          en: document.getElementById("setting-owner-en").value
        },
        phone: document.getElementById("setting-owner-phone").value
      },
      servicing: {
        name: {
          bn: document.getElementById("setting-tech-bn").value,
          en: document.getElementById("setting-tech-en").value
        },
        phone: document.getElementById("setting-tech-phone").value
      },
      email: document.getElementById("setting-email").value,
      phone: document.getElementById("setting-phone").value,
      whatsapp: document.getElementById("setting-whatsapp").value,
      agents: {
        bkash: document.getElementById("setting-bkash").value,
        nagad: document.getElementById("setting-nagad").value,
        rocket: document.getElementById("setting-rocket").value,
        upay: document.getElementById("setting-upay").value
      },
      facebook: document.getElementById("setting-facebook").value,
      mapUrl: document.getElementById("setting-map").value,
      address: {
        bn: document.getElementById("setting-address-bn").value,
        en: document.getElementById("setting-address-en").value
      },
      hours: {
        open: document.getElementById("setting-open").value,
        close: document.getElementById("setting-close").value,
        closedDays: Array.from(document.querySelectorAll('input[name="closed-day"]:checked')).map(function (checkbox) {
          return Number(checkbox.value);
        })
      }
    };
  }

  settingsForm.addEventListener("input", function () {
    if (settingsLoaded) settingsDirty = JSON.stringify(readSettingsForm()) !== settingsSnapshot;
  });
  settingsForm.addEventListener("change", function () {
    if (settingsLoaded) settingsDirty = JSON.stringify(readSettingsForm()) !== settingsSnapshot;
  });
  settingsForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    settingsError.textContent = "";
    var button = document.getElementById("save-settings");
    button.disabled = true;
    button.textContent = "সেভ হচ্ছে…";
    try {
      var result = await api("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(readSettingsForm())
      });
      fillSettings(result.settings);
      showToast("ওয়েবসাইটের তথ্য সেভ হয়েছে");
    } catch (error) {
      settingsError.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = "পরিবর্তন সেভ করুন";
    }
  });

  window.addEventListener("beforeunload", function (event) {
    if (!settingsDirty) return;
    event.preventDefault();
    event.returnValue = "";
  });

  async function loadProducts() {
    adminState.hidden = false;
    adminState.textContent = "পণ্য লোড হচ্ছে…";
    productList.replaceChildren();
    try {
      var result = await api("/api/products");
      products = result.products || [];
      renderProducts();
    } catch (error) {
      adminState.textContent = error.message;
    }
  }

  function renderProducts() {
    productList.replaceChildren();
    document.getElementById("admin-count").textContent = products.length + "টি পণ্য";
    if (!products.length) {
      adminState.hidden = false;
      adminState.textContent = "এখনও কোনো পণ্য যোগ করা হয়নি।";
      return;
    }
    adminState.hidden = true;
    products.forEach(function (product) {
      var card = document.createElement("article");
      card.className = "admin-product";
      var image = document.createElement("img");
      image.src = product.imageUrl;
      image.alt = product.name;
      image.width = 96;
      image.height = 96;
      image.loading = "lazy";

      var body = document.createElement("div");
      body.className = "admin-product-body";
      var name = document.createElement("h2");
      name.textContent = product.name;
      var meta = document.createElement("div");
      meta.className = "admin-product-meta";
      var price = document.createElement("strong");
      price.textContent = "৳" + new Intl.NumberFormat("bn-BD").format(product.price);
      var stock = document.createElement("span");
      stock.className = product.inStock ? "available" : "unavailable";
      stock.textContent = product.inStock ? "স্টকে আছে" : "স্টক শেষ";
      meta.append(price, stock);
      body.append(name, meta);

      var actions = document.createElement("div");
      actions.className = "product-actions";
      var edit = document.createElement("button");
      edit.type = "button";
      edit.className = "edit-product";
      edit.textContent = "এডিট";
      edit.addEventListener("click", function () { openProductDialog(product); });
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "delete-product";
      remove.textContent = "ডিলিট";
      remove.addEventListener("click", function () { deleteProduct(product); });
      actions.append(edit, remove);
      card.append(image, body, actions);
      productList.appendChild(card);
    });
  }

  function openProductDialog(product) {
    productForm.reset();
    productError.textContent = "";
    clearPreview();
    var editing = Boolean(product);
    document.getElementById("dialog-title").textContent = editing ? "পণ্য আপডেট করুন" : "নতুন পণ্য যোগ করুন";
    document.getElementById("product-id").value = editing ? product.id : "";
    document.getElementById("product-name").value = editing ? product.name : "";
    document.getElementById("product-name-en").value = editing ? product.nameEn : "";
    document.getElementById("product-price").value = editing ? product.price : "";
    document.getElementById("product-stock").checked = editing ? product.inStock : true;
    document.getElementById("product-image").required = !editing;
    document.getElementById("image-required").hidden = editing;
    if (editing) setPreview(product.imageUrl, false);
    productDialog.showModal();
    document.getElementById("product-name").focus();
  }

  function closeProductDialog() {
    productDialog.close();
    clearPreview();
  }

  document.getElementById("add-product").addEventListener("click", function () { openProductDialog(null); });
  document.getElementById("close-dialog").addEventListener("click", closeProductDialog);
  document.getElementById("cancel-product").addEventListener("click", closeProductDialog);
  productDialog.addEventListener("click", function (event) {
    if (event.target === productDialog) closeProductDialog();
  });
  productDialog.addEventListener("close", clearPreview);

  document.getElementById("product-image").addEventListener("change", function (event) {
    var file = event.target.files[0];
    productError.textContent = "";
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 15 * 1024 * 1024) {
      event.target.value = "";
      productError.textContent = "JPG, PNG বা WebP ছবি দিন; মূল ফাইল সর্বোচ্চ ১৫ MB হতে পারে।";
      return;
    }
    setPreview(URL.createObjectURL(file), true);
  });

  function setPreview(url, revoke) {
    clearPreview();
    previewUrl = revoke ? url : "";
    document.getElementById("preview-image").src = url;
    document.getElementById("image-preview").hidden = false;
  }

  function clearPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = "";
    document.getElementById("preview-image").removeAttribute("src");
    document.getElementById("image-preview").hidden = true;
  }

  productForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    productError.textContent = "";
    var id = document.getElementById("product-id").value;
    var file = document.getElementById("product-image").files[0];
    var button = document.getElementById("save-product");
    button.disabled = true;
    button.textContent = file ? "ছবি প্রস্তুত হচ্ছে…" : "সেভ হচ্ছে…";

    try {
      var form = new FormData();
      form.append("name", document.getElementById("product-name").value);
      form.append("nameEn", document.getElementById("product-name-en").value);
      form.append("price", document.getElementById("product-price").value);
      form.append("inStock", String(document.getElementById("product-stock").checked));
      if (file) {
        var optimized = await optimizeImage(file);
        form.append("image", optimized.image, "product.webp");
        form.append("imageRatio", String(optimized.ratio));
        button.textContent = "আপলোড হচ্ছে…";
      }
      var result = await api(id ? "/api/admin/products/" + id : "/api/admin/products", {
        method: id ? "PUT" : "POST",
        body: form
      });
      if (id) products = products.map(function (item) { return item.id === id ? result.product : item; });
      else products.unshift(result.product);
      renderProducts();
      closeProductDialog();
      showToast(id ? "পণ্য আপডেট হয়েছে" : "পণ্য যোগ হয়েছে");
    } catch (error) {
      productError.textContent = error.message || "পণ্য সেভ করা যায়নি।";
    } finally {
      button.disabled = false;
      button.textContent = "পণ্য সেভ করুন";
    }
  });

  async function optimizeImage(file) {
    var bitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (error) {
      throw new Error("ছবিটি পড়া যায়নি। অন্য JPG, PNG বা WebP ছবি চেষ্টা করুন।");
    }
    if (!bitmap.width || !bitmap.height) {
      bitmap.close();
      throw new Error("ছবির মাপ সঠিক নয়।");
    }
    var ratio = bitmap.width / bitmap.height;
    var image = await resizeToWebP(bitmap, 720, .82);
    bitmap.close();
    if (image.size > 500 * 1024) throw new Error("ছবিটি অপটিমাইজ করার পরও বড় হয়েছে। কম বিস্তারিত ছবি চেষ্টা করুন।");
    return { image: image, ratio: ratio };
  }

  function resizeToWebP(bitmap, maxDimension, quality) {
    var scale = Math.min(1, maxDimension / bitmap.width, maxDimension / bitmap.height);
    var width = Math.max(1, Math.round(bitmap.width * scale));
    var height = Math.max(1, Math.round(bitmap.height * scale));
    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    var context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error("ছবিটি অপটিমাইজ করা যায়নি।"));
      }, "image/webp", quality);
    });
  }

  async function deleteProduct(product) {
    if (!window.confirm("‘" + product.name + "’ পণ্যটি স্থায়ীভাবে ডিলিট করবেন?")) return;
    try {
      await api("/api/admin/products/" + product.id, { method: "DELETE" });
      products = products.filter(function (item) { return item.id !== product.id; });
      renderProducts();
      showToast("পণ্য ডিলিট হয়েছে");
    } catch (error) {
      showToast(error.message);
    }
  }

  function profileUploader(role) {
    return document.querySelector('[data-profile-uploader="' + role + '"]');
  }

  function setProfileImagePreview(role, imageUrl) {
    var uploader = profileUploader(role);
    var image = uploader.querySelector(".profile-upload-preview img");
    var empty = uploader.querySelector(".profile-upload-preview span");
    if (imageUrl) {
      image.src = imageUrl;
      image.hidden = false;
      empty.hidden = true;
    } else {
      image.removeAttribute("src");
      image.hidden = true;
      empty.hidden = false;
    }
  }

  function setProfileImageStatus(role, message, failed) {
    var status = profileUploader(role).querySelector(".profile-upload-status");
    status.textContent = message;
    status.classList.toggle("error", Boolean(failed));
  }

  async function uploadProfileImage(role, input) {
    var file = input.files[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 15 * 1024 * 1024) {
      input.value = "";
      setProfileImageStatus(role, "JPG, PNG বা WebP ছবি দিন; মূল ফাইল সর্বোচ্চ ১৫ MB।", true);
      return;
    }

    input.disabled = true;
    setProfileImageStatus(role, "ছবি কাটা ও ছোট করা হচ্ছে…", false);
    try {
      var optimized = await optimizeProfileImage(file);
      var form = new FormData();
      form.append("image", optimized, role + ".webp");
      setProfileImageStatus(role, "ছবি আপলোড হচ্ছে…", false);
      var result = await api("/api/admin/profile-images/" + role, { method: "PUT", body: form });
      setProfileImagePreview(role, result.imageUrl);
      setProfileImageStatus(role, "ছবি আপডেট হয়েছে।", false);
      showToast("প্রোফাইল ছবি আপডেট হয়েছে");
    } catch (error) {
      setProfileImageStatus(role, error.message || "ছবি আপলোড করা যায়নি।", true);
    } finally {
      input.disabled = false;
      input.value = "";
    }
  }

  async function optimizeProfileImage(file) {
    var bitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (error) {
      throw new Error("ছবিটি পড়া যায়নি। অন্য JPG, PNG বা WebP ছবি চেষ্টা করুন।");
    }
    if (!bitmap.width || !bitmap.height) {
      bitmap.close();
      throw new Error("ছবির মাপ সঠিক নয়।");
    }
    var image;
    try {
      image = await cropProfileToWebP(bitmap, .82);
      if (image.size > 500 * 1024) image = await cropProfileToWebP(bitmap, .66);
    } finally {
      bitmap.close();
    }
    if (!image || image.size > 500 * 1024) throw new Error("ছবিটি অপটিমাইজ করার পরও বড় হয়েছে। অন্য ছবি চেষ্টা করুন।");
    return image;
  }

  function cropProfileToWebP(bitmap, quality) {
    var sourceSize = Math.min(bitmap.width, bitmap.height);
    var sourceX = Math.round((bitmap.width - sourceSize) / 2);
    var sourceY = Math.round((bitmap.height - sourceSize) / 2);
    var canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 480;
    var context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 480, 480);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 480, 480);
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error("ছবিটি অপটিমাইজ করা যায়নি।"));
      }, "image/webp", quality);
    });
  }

  document.querySelectorAll("[data-profile-uploader] input[type=file]").forEach(function (input) {
    input.addEventListener("change", function () {
      uploadProfileImage(input.closest("[data-profile-uploader]").getAttribute("data-profile-uploader"), input);
    });
  });

  checkSession();
})();
