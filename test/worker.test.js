import test from "node:test";
import assert from "node:assert/strict";
import worker, { _internals } from "../worker.js";

class MockD1 {
  constructor() {
    this.products = [];
    this.attempts = new Map();
    this.queryCount = 0;
  }

  prepare(sql) {
    this.queryCount += 1;
    const database = this;
    return {
      args: [],
      bind(...args) { this.args = args; return this; },
      async all() {
        if (sql.includes("FROM products WHERE image_data")) return { results: database.products.filter(item => item.image_data) };
        throw new Error(`Unhandled all query: ${sql}`);
      },
      async first() {
        if (sql.includes("FROM admin_login_attempts")) return database.attempts.get(this.args[0]) || null;
        if (sql.includes("FROM products WHERE id")) return database.products.find(item => item.id === this.args[0]) || null;
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
            in_stock: this.args[4], image_small_key: this.args[5], image_large_key: this.args[6],
            image_ratio: this.args[7], image_data: this.args[8], image_etag: this.args[9], created_at: now, updated_at: now
          });
          return { success: true };
        }
        if (sql.startsWith("UPDATE products")) {
          const withImage = sql.includes("image_data = ?");
          const item = database.products.find(product => product.id === this.args[withImage ? 7 : 4]);
          Object.assign(item, { name: this.args[0], name_en: this.args[1], price: this.args[2], in_stock: this.args[3], updated_at: Math.floor(Date.now() / 1000) });
          if (withImage) Object.assign(item, { image_ratio: this.args[4], image_data: this.args[5], image_etag: this.args[6] });
          return { success: true };
        }
        if (sql.startsWith("DELETE FROM products")) {
          database.products = database.products.filter(product => product.id !== this.args[0]);
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
  form.set("inStock", overrides.inStock || "true");
  form.set("imageRatio", overrides.imageRatio || "1.25");
  if (!overrides.withoutImages) {
    form.set("image", new File([new Uint8Array([1, 2, 3, 4])], "image.webp", { type: "image/webp" }));
  }
  return form;
}

test("public product listing uses one query and returns safe response fields", async () => {
  const env = environment();
  env.DB.products.push({
    id: "a", name: "চার্জার", name_en: "Charger", price: 450, in_stock: 1,
    image_small_key: "d1/a.webp", image_large_key: "d1/a-large.webp",
    image_ratio: 1, image_data: [1], image_etag: "etag", updated_at: 1, created_at: 1
  });
  const response = await call(env, "/api/products");
  assert.equal(response.status, 200);
  assert.equal(env.DB.queryCount, 1);
  const payload = await response.json();
  assert.equal(payload.products[0].imageUrl, "/product-images/a.webp?v=d1-etag");
  assert.equal(payload.products[0].inStock, true);
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
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

test("authenticated product create, update, image read and delete work end to end", async () => {
  const env = environment();
  const loginResponse = await login(env);
  const cookie = loginResponse.headers.get("Set-Cookie").split(";")[0];
  const headers = { Origin: "https://studio.test", Cookie: cookie };

  const createdResponse = await call(env, "/api/admin/products", { method: "POST", headers, body: productForm() });
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()).product;
  assert.equal(created.name, "ফাস্ট চার্জার");
  const imageResponse = await call(env, created.imageUrl);
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get("Content-Type"), "image/webp");
  assert.deepEqual(Array.from(new Uint8Array(await imageResponse.arrayBuffer())), [1, 2, 3, 4]);

  const update = productForm({ name: "টাইপ-সি চার্জার", price: "650", inStock: "false", withoutImages: true });
  const updatedResponse = await call(env, `/api/admin/products/${created.id}`, { method: "PUT", headers, body: update });
  assert.equal(updatedResponse.status, 200);
  const updated = (await updatedResponse.json()).product;
  assert.equal(updated.name, "টাইপ-সি চার্জার");
  assert.equal(updated.price, 650);
  assert.equal(updated.inStock, false);

  const deletedResponse = await call(env, `/api/admin/products/${created.id}`, { method: "DELETE", headers });
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
