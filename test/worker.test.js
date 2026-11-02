import test from "node:test";
import assert from "node:assert/strict";
import worker, { _internals } from "../worker.js";

class MockD1 {
  constructor() {
    this.products = [];
    this.profileImages = new Map();
    this.attempts = new Map();
    this.queryCount = 0;
    this.settings = {
      shop_name_bn: "আরিফ স্টুডিও এন্ড টেলিকম", shop_name_en: "Arif Studio & Telecom",
      proprietor_name_bn: "আরিফুল ইসলাম", proprietor_name_en: "Ariful Islam", proprietor_phone: "01984993221",
      servicing_name_bn: "আশরাফুল", servicing_name_en: "Ashraful", servicing_phone: "01970779989",
      email: "arif.patwary35@gmail.com", phone: "01984993221", whatsapp: "01984993221",
      agent_bkash: "01970100271", agent_nagad: "01750100271", agent_rocket: "01639099723", agent_upay: "01970100271",
      facebook: "", map_url: "https://maps.app.goo.gl/D1qnpb4jLAiJMfFE9",
      address_bn: "আয়েশা এম্পোরিয়াম, ফাজিলের ঘাট, দাগনভূঞা, ফেনী",
      address_en: "Ayesha Emporium, Faziler Ghat, Daganbhuiyan, Feni",
      hours_open: "09:00", hours_close: "22:00", closed_days: "[]", updated_at: 1
    };
  }

  prepare(sql) {
    this.queryCount += 1;
    const database = this;
    return {
      args: [],
      bind(...args) { this.args = args; return this; },
      async all() {
        if (sql.includes("FROM products")) {
          return { results: database.products.filter(item => item.image_data).map(item => ({ ...item })) };
        }
        throw new Error(`Unhandled all query: ${sql}`);
      },
      async first() {
        if (sql.includes("FROM admin_login_attempts")) return database.attempts.get(this.args[0]) || null;
        if (sql.includes("FROM products WHERE id")) return database.products.find(item => item.id === this.args[0]) || null;
        if (sql.startsWith("SELECT image_data, image_etag FROM site_profile_images")) {
          const image = database.profileImages.get(this.args[0]);
          return image && image.image_etag === this.args[1] ? image : null;
        }
        if (sql.includes("FROM site_settings")) {
          return {
            ...database.settings,
            proprietor_image_etag: database.profileImages.get("proprietor")?.image_etag || null,
            technician_image_etag: database.profileImages.get("technician")?.image_etag || null
          };
        }
        throw new Error(`Unhandled first query: ${sql}`);
      },
      async run() {
        if (sql.startsWith("DELETE FROM admin_login_attempts WHERE ip IN")) {
          return { success: true };
        }
        if (sql.startsWith("INSERT INTO admin_login_attempts")) {
          database.attempts.set(this.args[0], {
            failed_count: this.args[1],
            window_started: this.args[2],
            blocked_until: this.args[3]
          });
          return { success: true };
        }
        if (sql.startsWith("DELETE FROM admin_login_attempts")) {
          database.attempts.delete(this.args[0]);
          return { success: true };
        }
        if (sql.startsWith("INSERT INTO products")) {
          const now = Math.floor(Date.now() / 1000);
          database.products.push({
            id: this.args[0], name: this.args[1], name_en: this.args[2], price: this.args[3],
            in_stock: this.args[4], stock_quantity: this.args[5], image_small_key: this.args[6], image_large_key: this.args[7],
            image_ratio: this.args[8], image_data: this.args[9], image_etag: this.args[10], created_at: now, updated_at: now
          });
          return { success: true };
        }
        if (sql.startsWith("UPDATE products")) {
          const withImage = sql.includes("image_data = ?");
          const item = database.products.find(product => product.id === this.args[withImage ? 8 : 5]);
          Object.assign(item, { name: this.args[0], name_en: this.args[1], price: this.args[2], in_stock: this.args[3], stock_quantity: this.args[4], updated_at: Math.floor(Date.now() / 1000) });
          if (withImage) Object.assign(item, { image_ratio: this.args[5], image_data: this.args[6], image_etag: this.args[7] });
          return { success: true };
        }
        if (sql.startsWith("DELETE FROM products")) {
          database.products = database.products.filter(product => product.id !== this.args[0]);
          return { success: true };
        }
        if (sql.startsWith("UPDATE site_settings")) {
          Object.assign(database.settings, {
            shop_name_bn: this.args[0], shop_name_en: this.args[1],
            proprietor_name_bn: this.args[2], proprietor_name_en: this.args[3], proprietor_phone: this.args[4],
            servicing_name_bn: this.args[5], servicing_name_en: this.args[6], servicing_phone: this.args[7],
            email: this.args[8], phone: this.args[9], whatsapp: this.args[10],
            agent_bkash: this.args[11], agent_nagad: this.args[12], agent_rocket: this.args[13], agent_upay: this.args[14],
            facebook: this.args[15], map_url: this.args[16], address_bn: this.args[17], address_en: this.args[18],
            hours_open: this.args[19], hours_close: this.args[20], closed_days: this.args[21], updated_at: 2
          });
          return { success: true };
        }
        if (sql.startsWith("INSERT INTO site_profile_images")) {
          database.profileImages.set(this.args[0], {
            role: this.args[0], image_data: this.args[1], image_etag: this.args[2], updated_at: 2
          });
          return { success: true };
        }
        throw new Error(`Unhandled run query: ${sql}`);
      }
    };
  }

  async batch(statements) {
    return Promise.all(statements.map(statement => statement.run()));
  }
}

function environment() {
  return {
    DB: new MockD1(),
    ADMIN_PASSWORD: "correct horse battery staple",
    SESSION_SECRET: "a-long-random-test-secret-that-is-not-production",
    ASSETS: { fetch: () => new Response("asset") }
  };
}

function context() {
  return { promises: [], waitUntil(promise) { this.promises.push(promise); } };
}

async function call(env, path, options = {}) {
  const request = new Request(`https://studio.test${path}`, options);
  return worker.fetch(request, env, context());
}

async function login(env, password = env.ADMIN_PASSWORD) {
  const response = await call(env, "/api/admin/login", {
    method: "POST",
    headers: { Origin: "https://studio.test", "Content-Type": "application/json", "CF-Connecting-IP": "127.0.0.1" },
    body: JSON.stringify({ password })
  });
  return response;
}

function productForm(overrides = {}) {
  const form = new FormData();
  form.set("name", overrides.name || "ফাস্ট চার্জার");
  form.set("nameEn", overrides.nameEn || "Fast charger");
  form.set("price", overrides.price || "500");
  form.set("stockQuantity", overrides.stockQuantity === undefined ? "10" : overrides.stockQuantity);
  form.set("imageRatio", overrides.imageRatio || "1.25");
  if (!overrides.withoutImages) {
    form.set("image", new File([new Uint8Array([1, 2, 3, 4])], "image.webp", { type: "image/webp" }));
  }
  return form;
}

function settingsPayload() {
  return {
    shopName: { bn: "আরিফ স্টুডিও এন্ড টেলিকম", en: "Arif Studio & Telecom" },
    proprietor: { name: { bn: "আরিফুল ইসলাম", en: "Ariful Islam" }, phone: "01984993221" },
    servicing: { name: { bn: "আশরাফুল", en: "Ashraful" }, phone: "01970779989" },
    email: "arif.patwary35@gmail.com",
    phone: "01984993221",
    whatsapp: "01984993221",
    agents: { bkash: "01970100271", nagad: "01750100271", rocket: "01639099723", upay: "" },
    facebook: "",
    mapUrl: "https://maps.app.goo.gl/D1qnpb4jLAiJMfFE9",
    address: {
      bn: "আয়েশা এম্পোরিয়াম, ফাজিলের ঘাট বাজার, দাগনভূঞা, ফেনী",
      en: "Ayesha Emporium, Fazilerghat Bazar, Daganbhuiyan, Feni"
    },
    hours: { open: "09:00", close: "22:00", closedDays: [5] }
  };
}

test("public product listing uses one query and returns safe response fields", async () => {
  const env = environment();
  env.DB.products.push({
    id: "a", name: "চার্জার", name_en: "Charger", price: 450, in_stock: 1,
    image_small_key: "d1/a.webp", image_large_key: "d1/a-large.webp",
    stock_quantity: null, image_ratio: 1, image_data: [1], image_etag: "etag", updated_at: 1, created_at: 1
  });
  const response = await call(env, "/api/products");
  assert.equal(response.status, 200);
  assert.equal(env.DB.queryCount, 1);
  const payload = await response.json();
  assert.equal(payload.products[0].imageUrl, "/product-images/a.webp?v=d1-etag");
  assert.equal(payload.products[0].inStock, true);
  assert.equal(payload.products[0].stockQuantity, 10);
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
});

test("public product cache reuses one joined D1 read", async () => {
  const previousCaches = globalThis.caches;
  const stored = new Map();
  globalThis.caches = { default: {
    async match(request) { return stored.get(request.url)?.clone(); },
    async put(request, response) { stored.set(request.url, response.clone()); },
    async delete(request) { return stored.delete(request.url); }
  } };
  try {
    const env = environment();
    env.DB.products.push({
      id: "cached", name: "কেবল", name_en: "Cable", price: 200, in_stock: 1,
      image_ratio: 1, image_data: [1], image_etag: "etag", updated_at: 1, created_at: 1
    });
    const first = await call(env, "/api/products");
    const second = await call(env, "/api/products");
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(env.DB.queryCount, 1);
    assert.equal((await second.json()).products[0].stockQuantity, 10);
  } finally {
    if (previousCaches === undefined) delete globalThis.caches;
    else globalThis.caches = previousCaches;
  }
});

test("product mutations invalidate the shared public cache", async () => {
  const previousCaches = globalThis.caches;
  const stored = new Map();
  let deletions = 0;
  globalThis.caches = { default: {
    async match(request) { return stored.get(request.url)?.clone(); },
    async put(request, response) { stored.set(request.url, response.clone()); },
    async delete(request) { deletions += 1; return stored.delete(request.url); }
  } };
  try {
    const env = environment();
    await call(env, "/api/products");
    assert.equal(stored.size, 1);

    const loginResponse = await login(env);
    const cookie = loginResponse.headers.get("Set-Cookie").split(";")[0];
    const created = await call(env, "/api/admin/products", {
      method: "POST",
      headers: { Origin: "https://studio.test", Cookie: cookie },
      body: productForm()
    });
    assert.equal(created.status, 201);
    assert.equal(deletions, 1);
    assert.equal(stored.size, 0);

    const beforeRefresh = env.DB.queryCount;
    await call(env, "/api/products");
    assert.equal(env.DB.queryCount, beforeRefresh + 1);
  } finally {
    if (previousCaches === undefined) delete globalThis.caches;
    else globalThis.caches = previousCaches;
  }
});

test("accessories page includes crawlable product cards and safe initial data", async () => {
  const env = environment();
  env.DB.products.push({
    id: "crawl", name: "<চার্জার>", name_en: "Charger", price: 500, in_stock: 1,
    image_ratio: 1, image_data: [1], image_etag: "etag", updated_at: 1, created_at: 1
  });
  env.ASSETS.fetch = request => {
    assert.equal(new URL(request.url).pathname, "/accessories");
    return new Response(
      '<main><div id="product-grid"><!-- SERVER_PRODUCT_CARDS --></div><script id="initial-products" type="application/json"><!-- INITIAL_PRODUCTS --></script></main>',
      { headers: { "Content-Type": "text/html" } }
    );
  };
  const response = await call(env, "/accessories");
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(env.DB.queryCount, 1);
  assert.match(html, /class="product-card"/);
  assert.match(html, /&lt;চার্জার&gt;/);
  assert.match(html, /\\u003cচার্জার>/);
  assert.doesNotMatch(html, /<চার্জার>/);
});

test("admin login rejects wrong password and issues a secure session for the correct password", async () => {
  const env = environment();
  const rejected = await login(env, "wrong");
  assert.equal(rejected.status, 401);
  assert.equal(env.DB.attempts.get("127.0.0.1").failed_count, 1);

  const accepted = await login(env);
  assert.equal(accepted.status, 200);
  const cookie = accepted.headers.get("Set-Cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Max-Age=3600/);
});

test("mutations require both a valid session and the same origin", async () => {
  const env = environment();
  const unauthorized = await call(env, "/api/admin/products", {
    method: "POST", headers: { Origin: "https://studio.test" }, body: productForm()
  });
  assert.equal(unauthorized.status, 401);

  const loginResponse = await login(env);
  const cookie = loginResponse.headers.get("Set-Cookie").split(";")[0];
  const crossOrigin = await call(env, "/api/admin/products", {
    method: "POST", headers: { Origin: "https://attacker.test", Cookie: cookie }, body: productForm()
  });
  assert.equal(crossOrigin.status, 403);
});

test("product stock quantity rejects invalid values before writing", async () => {
  const env = environment();
  const loginResponse = await login(env);
  const cookie = loginResponse.headers.get("Set-Cookie").split(";")[0];
  for (const stockQuantity of ["-1", "1001"]) {
    const response = await call(env, "/api/admin/products", {
      method: "POST",
      headers: { Origin: "https://studio.test", Cookie: cookie },
      body: productForm({ stockQuantity })
    });
    assert.equal(response.status, 400);
  }
  assert.equal(env.DB.products.length, 0);
});

test("authenticated product create, update, image read and delete work end to end", async () => {
  const env = environment();
  const loginResponse = await login(env);
  const cookie = loginResponse.headers.get("Set-Cookie").split(";")[0];
  const headers = { Origin: "https://studio.test", Cookie: cookie };

  const createForm = productForm();
  createForm.delete("stockQuantity");
  const createdResponse = await call(env, "/api/admin/products", { method: "POST", headers, body: createForm });
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()).product;
  assert.equal(created.name, "ফাস্ট চার্জার");
  assert.equal(created.stockQuantity, 10);
  assert.equal(env.DB.products[0].stock_quantity, 10);
  const imageResponse = await call(env, created.imageUrl);
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get("Content-Type"), "image/webp");
  assert.deepEqual(Array.from(new Uint8Array(await imageResponse.arrayBuffer())), [1, 2, 3, 4]);

  const update = productForm({ name: "টাইপ-সি চার্জার", price: "650", stockQuantity: "0", withoutImages: true });
  const updatedResponse = await call(env, `/api/admin/products/${created.id}`, { method: "PUT", headers, body: update });
  assert.equal(updatedResponse.status, 200);
  const updated = (await updatedResponse.json()).product;
  assert.equal(updated.name, "টাইপ-সি চার্জার");
  assert.equal(updated.price, 650);
  assert.equal(updated.inStock, false);
  assert.equal(updated.stockQuantity, 0);

  const deleteHeaders = { ...headers, "Content-Type": "application/json" };
  const missingPasswordResponse = await call(env, `/api/admin/products/${created.id}`, {
    method: "DELETE", headers: deleteHeaders, body: JSON.stringify({})
  });
  assert.equal(missingPasswordResponse.status, 400);
  assert.equal(env.DB.products.length, 1);

  const wrongPasswordResponse = await call(env, `/api/admin/products/${created.id}`, {
    method: "DELETE", headers: deleteHeaders, body: JSON.stringify({ password: "wrong" })
  });
  assert.equal(wrongPasswordResponse.status, 403);
  assert.equal(env.DB.products.length, 1);
  const retainedImageResponse = await call(env, created.imageUrl);
  assert.equal(retainedImageResponse.status, 200);

  const deletedResponse = await call(env, `/api/admin/products/${created.id}`, {
    method: "DELETE", headers: deleteHeaders, body: JSON.stringify({ password: env.ADMIN_PASSWORD })
  });
  assert.equal(deletedResponse.status, 200);
  assert.equal(env.DB.products.length, 0);
  const deletedImageResponse = await call(env, created.imageUrl);
  assert.equal(deletedImageResponse.status, 404);
});

test("session signatures cannot be tampered with", async () => {
  const secret = "test-secret";
  const token = await _internals.createSession(secret, Math.floor(Date.now() / 1000));
  const request = new Request("https://studio.test/api/admin/session", { headers: { Cookie: `arif_admin=${token}x` } });
  assert.equal(await _internals.readSession(request, { SESSION_SECRET: secret }), null);
});

test("public site settings use one D1 row read and return cacheable config-compatible data", async () => {
  const env = environment();
  const response = await call(env, "/api/site-settings");
  assert.equal(response.status, 200);
  assert.equal(env.DB.queryCount, 1);
  assert.match(response.headers.get("Cache-Control"), /max-age=300/);
  const payload = await response.json();
  assert.equal(payload.settings.shopName.en, "Arif Studio & Telecom");
  assert.equal(payload.settings.phone, "01984993221");
  assert.deepEqual(payload.settings.hours.closedDays, []);
});

test("site settings are authenticated, update-only and do not affect products", async () => {
  const env = environment();
  env.DB.products.push({ id: "keep-product", image_data: [1] });
  const unauthorized = await call(env, "/api/admin/settings");
  assert.equal(unauthorized.status, 401);

  const loginResponse = await login(env);
  const cookie = loginResponse.headers.get("Set-Cookie").split(";")[0];
  const headers = { Origin: "https://studio.test", Cookie: cookie, "Content-Type": "application/json" };
  const value = settingsPayload();
  const updatedResponse = await call(env, "/api/admin/settings", {
    method: "PUT", headers, body: JSON.stringify(value)
  });
  assert.equal(updatedResponse.status, 200);
  const updated = (await updatedResponse.json()).settings;
  assert.equal(updated.address.en, "Ayesha Emporium, Fazilerghat Bazar, Daganbhuiyan, Feni");
  assert.deepEqual(updated.hours.closedDays, [5]);
  assert.equal(env.DB.products.length, 1);

  const deleteResponse = await call(env, "/api/admin/settings", { method: "DELETE", headers });
  assert.equal(deleteResponse.status, 404);
  assert.equal(env.DB.settings.shop_name_en, "Arif Studio & Telecom");
});

test("site settings reject invalid values and cross-origin updates", async () => {
  const env = environment();
  const loginResponse = await login(env);
  const cookie = loginResponse.headers.get("Set-Cookie").split(";")[0];
  const invalid = settingsPayload();
  invalid.phone = "123";
  const invalidResponse = await call(env, "/api/admin/settings", {
    method: "PUT",
    headers: { Origin: "https://studio.test", Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(invalid)
  });
  assert.equal(invalidResponse.status, 400);

  const crossOrigin = await call(env, "/api/admin/settings", {
    method: "PUT",
    headers: { Origin: "https://attacker.test", Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(settingsPayload())
  });
  assert.equal(crossOrigin.status, 403);
});

test("profile image upload replaces one role row, preserves products and serves an immutable versioned image", async () => {
  const env = environment();
  env.DB.products.push({ id: "keep-product", image_data: [1] });
  const loginResponse = await login(env);
  const cookie = loginResponse.headers.get("Set-Cookie").split(";")[0];
  const headers = { Origin: "https://studio.test", Cookie: cookie };

  const firstForm = new FormData();
  firstForm.set("image", new File([new Uint8Array([1, 2, 3])], "owner.webp", { type: "image/webp" }));
  const firstResponse = await call(env, "/api/admin/profile-images/proprietor", { method: "PUT", headers, body: firstForm });
  assert.equal(firstResponse.status, 200);
  const firstUrl = (await firstResponse.json()).imageUrl;
  assert.match(firstUrl, /^\/profile-images\/proprietor-[a-f0-9]{64}\.webp$/);

  const imageResponse = await call(env, firstUrl);
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get("Content-Type"), "image/webp");
  assert.match(imageResponse.headers.get("Cache-Control"), /immutable/);
  assert.deepEqual(Array.from(new Uint8Array(await imageResponse.arrayBuffer())), [1, 2, 3]);

  const secondForm = new FormData();
  secondForm.set("image", new File([new Uint8Array([4, 5])], "owner.webp", { type: "image/webp" }));
  const secondResponse = await call(env, "/api/admin/profile-images/proprietor", { method: "PUT", headers, body: secondForm });
  const secondUrl = (await secondResponse.json()).imageUrl;
  assert.equal(secondResponse.status, 200);
  assert.notEqual(secondUrl, firstUrl);
  assert.equal(env.DB.profileImages.size, 1);
  assert.equal(env.DB.products.length, 1);
  assert.equal((await call(env, firstUrl)).status, 404);

  const settings = (await (await call(env, "/api/site-settings")).json()).settings;
  assert.equal(settings.profileImages.proprietor, secondUrl);
  assert.equal(settings.profileImages.technician, "");
});

test("profile image updates require authentication, same origin and optimized WebP input", async () => {
  const env = environment();
  const form = new FormData();
  form.set("image", new File([new Uint8Array([1])], "owner.webp", { type: "image/webp" }));
  const unauthorized = await call(env, "/api/admin/profile-images/proprietor", {
    method: "PUT", headers: { Origin: "https://studio.test" }, body: form
  });
  assert.equal(unauthorized.status, 401);

  const loginResponse = await login(env);
  const cookie = loginResponse.headers.get("Set-Cookie").split(";")[0];
  const crossOrigin = await call(env, "/api/admin/profile-images/proprietor", {
    method: "PUT", headers: { Origin: "https://attacker.test", Cookie: cookie }, body: form
  });
  assert.equal(crossOrigin.status, 403);

  const invalid = new FormData();
  invalid.set("image", new File([new Uint8Array([1])], "owner.png", { type: "image/png" }));
  const invalidResponse = await call(env, "/api/admin/profile-images/proprietor", {
    method: "PUT", headers: { Origin: "https://studio.test", Cookie: cookie }, body: invalid
  });
  assert.equal(invalidResponse.status, 400);
  assert.equal(env.DB.profileImages.size, 0);
});

test("visitor analytics require authentication and accept only supported ranges", async () => {
  const env = environment();
  env.CLOUDFLARE_ANALYTICS_TOKEN = "test-token-that-must-not-leak";
  let requests = 0;
  env.ANALYTICS_FETCH = async () => {
    requests += 1;
    return new Response("unexpected");
  };

  const unauthorized = await call(env, "/api/admin/analytics?range=7");
  assert.equal(unauthorized.status, 401);
  assert.equal(requests, 0);

  const loginResponse = await login(env);
  const cookie = loginResponse.headers.get("Set-Cookie").split(";")[0];
  const invalid = await call(env, "/api/admin/analytics?range=365", { headers: { Cookie: cookie } });
  assert.equal(invalid.status, 400);
  assert.equal(requests, 0);
});

test("visitor analytics default to an exact rolling 24 hour window", async () => {
  const env = environment();
  env.CLOUDFLARE_ANALYTICS_TOKEN = "test-token";
  let variables;
  env.ANALYTICS_FETCH = async (url, options) => {
    variables = JSON.parse(options.body).variables;
    return Response.json({ data: { viewer: { accounts: [{ summary: [], daily: [], pages: [] }] } } });
  };
  const loginResponse = await login(env);
  const cookie = loginResponse.headers.get("Set-Cookie").split(";")[0];
  const response = await call(env, "/api/admin/analytics", { headers: { Cookie: cookie } });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.range, 1);
  assert.equal(new Date(variables.end).getTime() - new Date(variables.start).getTime(), 24 * 60 * 60 * 1000);
  assert.ok(payload.daily.length >= 1 && payload.daily.length <= 2);
});

test("visitor analytics use one Cloudflare request, no D1 query and return only safe aggregated data", async () => {
  const env = environment();
  env.CLOUDFLARE_ANALYTICS_TOKEN = "test-token-that-must-not-leak";
  let requestDetails;
  env.ANALYTICS_FETCH = async (url, options) => {
    requestDetails = { url, options };
    return Response.json({
      data: { viewer: { accounts: [{
        summary: [{ count: 12, sum: { visits: 7 } }],
        daily: [
          { count: 4, sum: { visits: 3 }, dimensions: { date: "2026-10-30" } },
          { count: 8, sum: { visits: 4 }, dimensions: { date: "2026-11-02" } }
        ],
        pages: [
          { count: 9, sum: { visits: 5 }, dimensions: { requestPath: "/" } },
          { count: 3, sum: { visits: 2 }, dimensions: { requestPath: "/accessories" } }
        ],
        countries: [
          { count: 10, sum: { visits: 6 }, dimensions: { countryName: "Bangladesh" } },
          { count: 2, sum: { visits: 1 }, dimensions: { countryName: "United States" } }
        ],
        devices: [{ count: 11, sum: { visits: 6 }, dimensions: { deviceType: "mobile" } }],
        browsers: [{ count: 10, sum: { visits: 6 }, dimensions: { userAgentBrowser: "Chrome" } }],
        operatingSystems: [{ count: 9, sum: { visits: 5 }, dimensions: { userAgentOS: "Android" } }],
        referrers: [
          { count: 8, sum: { visits: 5 }, dimensions: { refererHost: "" } },
          { count: 4, sum: { visits: 2 }, dimensions: { refererHost: "google.com" } }
        ]
      }] } }
    });
  };

  const loginResponse = await login(env);
  const cookie = loginResponse.headers.get("Set-Cookie").split(";")[0];
  const queryCount = env.DB.queryCount;
  const response = await call(env, "/api/admin/analytics?range=7", { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(env.DB.queryCount, queryCount);
  assert.equal(requestDetails.url, "https://api.cloudflare.com/client/v4/graphql");
  assert.equal(requestDetails.options.headers.Authorization, "Bearer test-token-that-must-not-leak");
  const query = JSON.parse(requestDetails.options.body);
  assert.equal(query.variables.accountTag, "e2b1b46e43b33d3704fbbcea77ab9aba");
  assert.equal(query.variables.host, "arifstudio.pages.dev");
  assert.equal(query.variables.siteTag, undefined);
  assert.doesNotMatch(query.query, /siteTag/);
  for (const dimension of ["countryName", "deviceType", "userAgentBrowser", "userAgentOS", "refererHost"]) {
    assert.match(query.query, new RegExp(`dimensions \\{ ${dimension} \\}`));
  }

  const payload = await response.json();
  assert.equal(payload.pageViews, 12);
  assert.equal(payload.visits, 7);
  assert.equal(payload.pagesPerVisit, 1.7);
  assert.equal(payload.daily.length, 7);
  assert.deepEqual(payload.pages[0], { path: "/", pageViews: 9, visits: 5 });
  assert.deepEqual(payload.countries[0], { label: "Bangladesh", pageViews: 10, visits: 6 });
  assert.deepEqual(payload.devices[0], { label: "mobile", pageViews: 11, visits: 6 });
  assert.deepEqual(payload.browsers[0], { label: "Chrome", pageViews: 10, visits: 6 });
  assert.deepEqual(payload.operatingSystems[0], { label: "Android", pageViews: 9, visits: 5 });
  assert.deepEqual(payload.referrers[0], { label: "Direct / Bookmarks", pageViews: 8, visits: 5 });
  assert.doesNotMatch(JSON.stringify(payload), /test-token/);
});

test("visitor analytics cache prevents repeated Cloudflare reads for five minutes", async () => {
  const previousCaches = globalThis.caches;
  const stored = new Map();
  globalThis.caches = { default: {
    async match(request) { return stored.get(request.url)?.clone(); },
    async put(request, response) { stored.set(request.url, response.clone()); }
  } };
  try {
    const env = environment();
    env.CLOUDFLARE_ANALYTICS_TOKEN = "test-token";
    let requests = 0;
    env.ANALYTICS_FETCH = async () => {
      requests += 1;
      return Response.json({ data: { viewer: { accounts: [{
        summary: [{ count: 1, sum: { visits: 1 } }], daily: [], pages: []
      }] } } });
    };
    const loginResponse = await login(env);
    const cookie = loginResponse.headers.get("Set-Cookie").split(";")[0];
    const first = await call(env, "/api/admin/analytics?range=30", { headers: { Cookie: cookie } });
    const second = await call(env, "/api/admin/analytics?range=30", { headers: { Cookie: cookie } });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(requests, 1);
  } finally {
    if (previousCaches === undefined) delete globalThis.caches;
    else globalThis.caches = previousCaches;
  }
});
