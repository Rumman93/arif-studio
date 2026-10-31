const SESSION_COOKIE = "arif_admin";
const SESSION_SECONDS = 12 * 60 * 60;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_MAX_FAILURES = 5;

export default {
  async fetch(request, env, ctx) {
    try {
      return withSecurityHeaders(await route(request, env, ctx), request);
    } catch (error) {
      console.error("Unhandled request error", error);
      return withSecurityHeaders(json({ error: "The server could not complete this request." }, 500), request);
    }
  }
};

async function route(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/api/products" && request.method === "GET") {
    return listProducts(env);
  }
  if (path === "/api/admin/login" && request.method === "POST") {
    if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
    return login(request, env);
  }
  if (path === "/api/admin/logout" && request.method === "POST") {
    if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
    return logout();
  }
  if (path === "/api/admin/session" && request.method === "GET") {
    return json({ authenticated: Boolean(await readSession(request, env)) }, 200, { "Cache-Control": "no-store" });
  }
  if (path === "/api/admin/products" && request.method === "POST") {
    return adminMutation(request, env, ctx, createProduct);
  }

  const productMatch = path.match(/^\/api\/admin\/products\/([a-f0-9-]+)$/i);
  if (productMatch && request.method === "PUT") {
    return adminMutation(request, env, ctx, (req, bindings, execution) => updateProduct(req, bindings, execution, productMatch[1]));
  }
  if (productMatch && request.method === "DELETE") {
    return adminMutation(request, env, ctx, (req, bindings, execution) => deleteProduct(bindings, execution, productMatch[1]));
  }

  if (path.startsWith("/product-images/") && request.method === "GET") {
    return getProductImage(env, decodeURIComponent(path.slice(1)));
  }
  if (path.startsWith("/api/")) {
    return json({ error: "Not found." }, 404);
  }

  if (!env.ASSETS) return new Response("Static asset binding is not configured.", { status: 503 });
  return env.ASSETS.fetch(request);
}

async function adminMutation(request, env, ctx, action) {
  if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
  if (!await readSession(request, env)) return json({ error: "Please sign in again." }, 401);
  return action(request, env, ctx);
}

async function listProducts(env) {
  requireBindings(env, ["DB"]);
  const result = await env.DB.prepare(
    "SELECT id, name, name_en, price, in_stock, image_small_key, image_large_key, image_ratio, updated_at FROM products ORDER BY created_at DESC"
  ).all();
  return json({ products: (result.results || []).map(publicProduct) }, 200, {
    "Cache-Control": "public, max-age=15, stale-while-revalidate=60"
  });
}

async function login(request, env) {
  requireBindings(env, ["DB", "ADMIN_PASSWORD", "SESSION_SECRET"]);
  if (!isJson(request)) return json({ error: "Expected a JSON request." }, 415);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const password = typeof body.password === "string" ? body.password : "";
  if (!password || password.length > 256) return json({ error: "Enter the admin password." }, 400);

  const ip = (request.headers.get("CF-Connecting-IP") || "local").slice(0, 64);
  const now = Math.floor(Date.now() / 1000);
  const attempt = await env.DB.prepare(
    "SELECT failed_count, window_started, blocked_until FROM admin_login_attempts WHERE ip = ? LIMIT 1"
  ).bind(ip).first();

  if (attempt && attempt.blocked_until > now) {
    return json({ error: "Too many attempts. Try again later." }, 429, {
      "Retry-After": String(attempt.blocked_until - now),
      "Cache-Control": "no-store"
    });
  }

  if (!await constantTimeEqual(password, env.ADMIN_PASSWORD)) {
    const inWindow = attempt && attempt.window_started > now - LOGIN_WINDOW_SECONDS;
    const failedCount = inWindow ? attempt.failed_count + 1 : 1;
    const windowStarted = inWindow ? attempt.window_started : now;
    const blockedUntil = failedCount >= LOGIN_MAX_FAILURES ? now + LOGIN_WINDOW_SECONDS : 0;
    const cleanup = env.DB.prepare(
      "DELETE FROM admin_login_attempts WHERE ip IN (SELECT ip FROM admin_login_attempts WHERE window_started < ? AND blocked_until < ? LIMIT 100)"
    ).bind(now - 24 * 60 * 60, now);
    const recordFailure = env.DB.prepare(
      "INSERT INTO admin_login_attempts (ip, failed_count, window_started, blocked_until) VALUES (?, ?, ?, ?) ON CONFLICT(ip) DO UPDATE SET failed_count = excluded.failed_count, window_started = excluded.window_started, blocked_until = excluded.blocked_until"
    ).bind(ip, failedCount, windowStarted, blockedUntil);
    await env.DB.batch([cleanup, recordFailure]);
    return json({ error: "Incorrect password." }, 401, { "Cache-Control": "no-store" });
  }

  await env.DB.prepare("DELETE FROM admin_login_attempts WHERE ip = ?").bind(ip).run();
  const token = await createSession(env.SESSION_SECRET, now);
  return json({ authenticated: true }, 200, {
    "Cache-Control": "no-store",
    "Set-Cookie": `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`
  });
}

function logout() {
  return json({ authenticated: false }, 200, {
    "Cache-Control": "no-store",
    "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
  });
}

async function createProduct(request, env) {
  requireBindings(env, ["DB", "BUCKET"]);
  const form = await readProductForm(request, true);
  if (form.error) return json({ error: form.error }, 400);

  const id = crypto.randomUUID();
  const keys = imageKeys(id);
  await putImages(env.BUCKET, keys, form.smallImage, form.largeImage);

  try {
    await env.DB.prepare(
      "INSERT INTO products (id, name, name_en, price, in_stock, image_small_key, image_large_key, image_ratio) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, form.name, form.nameEn, form.price, form.inStock, keys.small, keys.large, form.imageRatio).run();
  } catch (error) {
    await Promise.all([env.BUCKET.delete(keys.small), env.BUCKET.delete(keys.large)]);
    throw error;
  }

  const row = await env.DB.prepare(
    "SELECT id, name, name_en, price, in_stock, image_small_key, image_large_key, image_ratio, updated_at FROM products WHERE id = ? LIMIT 1"
  ).bind(id).first();
  return json({ product: publicProduct(row) }, 201, { "Cache-Control": "no-store" });
}

async function updateProduct(request, env, ctx, id) {
  requireBindings(env, ["DB", "BUCKET"]);
  const current = await env.DB.prepare(
    "SELECT id, image_small_key, image_large_key, image_ratio FROM products WHERE id = ? LIMIT 1"
  ).bind(id).first();
  if (!current) return json({ error: "Product not found." }, 404);

  const form = await readProductForm(request, false);
  if (form.error) return json({ error: form.error }, 400);
  const hasNewImages = Boolean(form.smallImage && form.largeImage);
  const keys = hasNewImages ? imageKeys(`${id}-${crypto.randomUUID()}`) : {
    small: current.image_small_key,
    large: current.image_large_key
  };
  if (hasNewImages) await putImages(env.BUCKET, keys, form.smallImage, form.largeImage);

  try {
    await env.DB.prepare(
      "UPDATE products SET name = ?, name_en = ?, price = ?, in_stock = ?, image_small_key = ?, image_large_key = ?, image_ratio = ?, updated_at = unixepoch() WHERE id = ?"
    ).bind(form.name, form.nameEn, form.price, form.inStock, keys.small, keys.large, form.imageRatio || current.image_ratio, id).run();
  } catch (error) {
    if (hasNewImages) await Promise.all([env.BUCKET.delete(keys.small), env.BUCKET.delete(keys.large)]);
    throw error;
  }

  if (hasNewImages) {
    const cleanup = Promise.all([
      env.BUCKET.delete(current.image_small_key),
      env.BUCKET.delete(current.image_large_key)
    ]);
    if (ctx && ctx.waitUntil) ctx.waitUntil(cleanup);
    else await cleanup;
  }

  const row = await env.DB.prepare(
    "SELECT id, name, name_en, price, in_stock, image_small_key, image_large_key, image_ratio, updated_at FROM products WHERE id = ? LIMIT 1"
  ).bind(id).first();
  return json({ product: publicProduct(row) }, 200, { "Cache-Control": "no-store" });
}

async function deleteProduct(env, ctx, id) {
  requireBindings(env, ["DB", "BUCKET"]);
  const current = await env.DB.prepare(
    "SELECT id, image_small_key, image_large_key FROM products WHERE id = ? LIMIT 1"
  ).bind(id).first();
  if (!current) return json({ error: "Product not found." }, 404);

  await env.DB.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
  const cleanup = Promise.all([
    env.BUCKET.delete(current.image_small_key),
    env.BUCKET.delete(current.image_large_key)
  ]);
  if (ctx && ctx.waitUntil) ctx.waitUntil(cleanup);
  else await cleanup;
  return json({ deleted: true }, 200, { "Cache-Control": "no-store" });
}

async function readProductForm(request, requireImages) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("multipart/form-data")) return { error: "Expected product form data." };

  let data;
  try {
    data = await request.formData();
  } catch {
    return { error: "Invalid product form data." };
  }
  const name = cleanText(data.get("name"), 120);
  const nameEn = cleanText(data.get("nameEn"), 120);
  const priceText = String(data.get("price") || "");
  const price = Number(priceText);
  const inStockText = String(data.get("inStock") || "");
  const imageRatio = Number(data.get("imageRatio"));
  const smallImage = fileValue(data.get("imageSmall"));
  const largeImage = fileValue(data.get("imageLarge"));

  if (!name) return { error: "Product name is required." };
  if (!/^\d{1,9}$/.test(priceText) || !Number.isSafeInteger(price) || price < 0) {
    return { error: "Price must be a whole number from 0 to 999,999,999." };
  }
  if (inStockText !== "true" && inStockText !== "false") return { error: "Choose a valid stock status." };
  if (Boolean(smallImage) !== Boolean(largeImage)) return { error: "Both optimized image sizes are required." };
  if (requireImages && (!smallImage || !largeImage)) return { error: "A product image is required." };
  if (smallImage && !validImage(smallImage)) return { error: "The small image must be a WebP file under 2 MB." };
  if (largeImage && !validImage(largeImage)) return { error: "The large image must be a WebP file under 2 MB." };
  if ((smallImage || requireImages) && (!Number.isFinite(imageRatio) || imageRatio < 0.2 || imageRatio > 5)) {
    return { error: "Invalid image dimensions." };
  }

  return {
    name,
    nameEn,
    price,
    inStock: inStockText === "true" ? 1 : 0,
    imageRatio: Number.isFinite(imageRatio) ? imageRatio : null,
    smallImage,
    largeImage
  };
}

async function putImages(bucket, keys, smallImage, largeImage) {
  const writes = await Promise.allSettled([
    bucket.put(keys.small, smallImage.stream(), {
      httpMetadata: { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" }
    }),
    bucket.put(keys.large, largeImage.stream(), {
      httpMetadata: { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" }
    })
  ]);
  const failed = writes.find(result => result.status === "rejected");
  if (failed) {
    await Promise.allSettled([bucket.delete(keys.small), bucket.delete(keys.large)]);
    throw failed.reason;
  }
}

async function getProductImage(env, key) {
  requireBindings(env, ["BUCKET"]);
  if (!/^product-images\/[a-z0-9-]+-(480|960)\.webp$/i.test(key)) {
    return new Response("Not found", { status: 404 });
  }
  const object = await env.BUCKET.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers({
    "Content-Type": "image/webp",
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Length": String(object.size)
  });
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  return new Response(object.body, { headers });
}

function publicProduct(row) {
  return {
    id: row.id,
    name: row.name,
    nameEn: row.name_en || "",
    price: row.price,
    inStock: Boolean(row.in_stock),
    imageSmallUrl: `/${row.image_small_key}`,
    imageLargeUrl: `/${row.image_large_key}`,
    imageRatio: row.image_ratio,
    updatedAt: row.updated_at
  };
}

function imageKeys(seed) {
  return {
    small: `product-images/${seed}-480.webp`,
    large: `product-images/${seed}-960.webp`
  };
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function fileValue(value) {
  return value && typeof value === "object" && typeof value.stream === "function" && value.size > 0 ? value : null;
}

function validImage(file) {
  return file.type === "image/webp" && file.size <= MAX_IMAGE_BYTES;
}

function isJson(request) {
  return (request.headers.get("Content-Type") || "").includes("application/json");
}

function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}

function requireBindings(env, names) {
  for (const name of names) {
    if (!env[name]) throw new Error(`Missing Cloudflare binding: ${name}`);
  }
}

async function createSession(secret, now = Math.floor(Date.now() / 1000)) {
  const payload = base64Url(JSON.stringify({ exp: now + SESSION_SECONDS }));
  return `${payload}.${await sign(payload, secret)}`;
}

async function readSession(request, env) {
  if (!env.SESSION_SECRET) return null;
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;
  const parts = match[1].split(".");
  if (parts.length !== 2 || !await constantTimeEqual(parts[1], await sign(parts[0], env.SESSION_SECRET))) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[0]));
    return payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
  } catch {
    return null;
  }
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

async function constantTimeEqual(left, right) {
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(left))),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(right)))
  ]);
  const aa = new Uint8Array(a);
  const bb = new Uint8Array(b);
  let different = aa.length ^ bb.length;
  for (let i = 0; i < aa.length; i += 1) different |= aa[i] ^ bb[i];
  return different === 0;
}

function base64Url(value) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders }
  });
}

function withSecurityHeaders(response, request) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  if (new URL(request.url).pathname.startsWith("/admin")) {
    headers.set("X-Robots-Tag", "noindex, nofollow");
    headers.set("Cache-Control", "no-store");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const _internals = {
  cleanText,
  constantTimeEqual,
  createSession,
  imageKeys,
  publicProduct,
  readProductForm,
  readSession,
  sameOrigin
};
