const SESSION_COOKIE = "arif_admin";
const SESSION_SECONDS = 12 * 60 * 60;
const MAX_IMAGE_BYTES = 500 * 1024;
const MAX_PROFILE_IMAGE_BYTES = 500 * 1024;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_MAX_FAILURES = 5;
const ANALYTICS_CACHE_SECONDS = 5 * 60;
const CLOUDFLARE_ACCOUNT_TAG = "e2b1b46e43b33d3704fbbcea77ab9aba";
const ANALYTICS_HOST = "arifstudio.pages.dev";

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
  if (path === "/api/site-settings" && request.method === "GET") {
    return getPublicSiteSettings(request, env, ctx);
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
  if (path === "/api/admin/settings" && request.method === "GET") {
    return adminRead(request, env, getAdminSiteSettings);
  }
  if (path === "/api/admin/analytics" && request.method === "GET") {
    if (!await readSession(request, env)) return json({ error: "Please sign in again." }, 401);
    return getAdminAnalytics(request, env, ctx);
  }
  if (path === "/api/admin/settings" && request.method === "PUT") {
    return adminMutation(request, env, ctx, updateSiteSettings);
  }
  const adminProfileMatch = path.match(/^\/api\/admin\/profile-images\/(proprietor|technician)$/);
  if (adminProfileMatch && request.method === "PUT") {
    return adminMutation(request, env, ctx, (req, bindings, execution) => updateProfileImage(req, bindings, execution, adminProfileMatch[1]));
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
  const profileImageMatch = path.match(/^\/profile-images\/(proprietor|technician)-([a-f0-9]{64})\.webp$/);
  if (profileImageMatch && request.method === "GET") {
    return getProfileImage(env, profileImageMatch[1], profileImageMatch[2]);
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

async function adminRead(request, env, action) {
  if (!await readSession(request, env)) return json({ error: "Please sign in again." }, 401);
  return action(env);
}

async function getAdminAnalytics(request, env, ctx) {
  if (!env.CLOUDFLARE_ANALYTICS_TOKEN) {
    return json({ error: "Visitor analytics are not configured." }, 503, { "Cache-Control": "no-store" });
  }

  const range = Number(new URL(request.url).searchParams.get("range") || 1);
  if (range !== 1 && range !== 7 && range !== 30) {
    return json({ error: "Choose the last 24 hours, 7 days or 30 days." }, 400, { "Cache-Control": "no-store" });
  }

  const cache = defaultCache();
  const key = analyticsCacheKey(request, range);
  if (cache) {
    try {
      const cached = await cache.match(key);
      if (cached) return json(await cached.json(), 200, { "Cache-Control": "no-store" });
    } catch (error) {
      console.warn("Analytics cache read failed", error);
    }
  }

  const window = analyticsWindow(range);
  const query = `query VisitorStats($accountTag: string!, $host: string!, $start: Time!, $end: Time!) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        summary: rumPageloadEventsAdaptiveGroups(
          limit: 1
          filter: { requestHost: $host, datetime_geq: $start, datetime_lt: $end }
        ) { count sum { visits } }
        daily: rumPageloadEventsAdaptiveGroups(
          limit: 31
          orderBy: [date_ASC]
          filter: { requestHost: $host, datetime_geq: $start, datetime_lt: $end }
        ) { count sum { visits } dimensions { date } }
        pages: rumPageloadEventsAdaptiveGroups(
          limit: 10
          orderBy: [count_DESC]
          filter: { requestHost: $host, datetime_geq: $start, datetime_lt: $end }
        ) { count sum { visits } dimensions { requestPath } }
        countries: rumPageloadEventsAdaptiveGroups(
          limit: 10
          orderBy: [sum_visits_DESC]
          filter: { requestHost: $host, datetime_geq: $start, datetime_lt: $end }
        ) { count sum { visits } dimensions { countryName } }
        devices: rumPageloadEventsAdaptiveGroups(
          limit: 10
          orderBy: [sum_visits_DESC]
          filter: { requestHost: $host, datetime_geq: $start, datetime_lt: $end }
        ) { count sum { visits } dimensions { deviceType } }
        browsers: rumPageloadEventsAdaptiveGroups(
          limit: 10
          orderBy: [sum_visits_DESC]
          filter: { requestHost: $host, datetime_geq: $start, datetime_lt: $end }
        ) { count sum { visits } dimensions { userAgentBrowser } }
        operatingSystems: rumPageloadEventsAdaptiveGroups(
          limit: 10
          orderBy: [sum_visits_DESC]
          filter: { requestHost: $host, datetime_geq: $start, datetime_lt: $end }
        ) { count sum { visits } dimensions { userAgentOS } }
        referrers: rumPageloadEventsAdaptiveGroups(
          limit: 10
          orderBy: [sum_visits_DESC]
          filter: { requestHost: $host, datetime_geq: $start, datetime_lt: $end }
        ) { count sum { visits } dimensions { refererHost } }
      }
    }
  }`;

  const fetcher = typeof env.ANALYTICS_FETCH === "function" ? env.ANALYTICS_FETCH : fetch;
  let response;
  try {
    response = await fetcher("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_ANALYTICS_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        query,
        variables: {
          accountTag: CLOUDFLARE_ACCOUNT_TAG,
          host: ANALYTICS_HOST,
          start: window.start,
          end: window.end
        }
      })
    });
  } catch (error) {
    console.error("Cloudflare analytics request failed", error);
    return json({ error: "Visitor analytics could not be loaded." }, 502, { "Cache-Control": "no-store" });
  }

  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const account = body?.data?.viewer?.accounts?.[0];
  if (!response.ok || body?.errors?.length || !account) {
    console.error("Cloudflare analytics returned an invalid response", response.status, body?.errors || []);
    return json({ error: "Visitor analytics could not be loaded." }, 502, { "Cache-Control": "no-store" });
  }

  const payload = analyticsPayload(account, range, window);
  putAnalyticsCache(cache, key, payload, ctx);
  return json(payload, 200, { "Cache-Control": "no-store" });
}

function analyticsWindow(range, current = new Date()) {
  const end = new Date(current);
  if (range === 1) {
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    return { start: start.toISOString(), end: end.toISOString(), startDate: start.toISOString().slice(0, 10) };
  }
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (range - 1));
  return { start: start.toISOString(), end: end.toISOString(), startDate: start.toISOString().slice(0, 10) };
}

function analyticsPayload(account, range, window) {
  const summary = account.summary?.[0] || {};
  const pageViews = safeCount(summary.count);
  const visits = safeCount(summary.sum?.visits);
  const dailyValues = new Map((account.daily || []).map(item => [item.dimensions?.date, item]));
  const start = new Date(`${window.startDate}T00:00:00.000Z`);
  const endDate = window.end.slice(0, 10);
  const daily = [];
  for (let index = 0; ; index += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    if (key > endDate) break;
    const item = dailyValues.get(key) || {};
    daily.push({ date: key, pageViews: safeCount(item.count), visits: safeCount(item.sum?.visits) });
  }
  const pages = (account.pages || []).map(item => ({
    path: cleanAnalyticsPath(item.dimensions?.requestPath),
    pageViews: safeCount(item.count),
    visits: safeCount(item.sum?.visits)
  })).filter(item => item.path).slice(0, 10);
  return {
    range,
    generatedAt: window.end,
    pageViews,
    visits,
    pagesPerVisit: visits ? Number((pageViews / visits).toFixed(1)) : 0,
    daily,
    pages,
    countries: analyticsBreakdown(account.countries, "countryName", "Unknown country"),
    devices: analyticsBreakdown(account.devices, "deviceType", "Unknown device"),
    browsers: analyticsBreakdown(account.browsers, "userAgentBrowser", "Unknown browser"),
    operatingSystems: analyticsBreakdown(account.operatingSystems, "userAgentOS", "Unknown operating system"),
    referrers: analyticsBreakdown(account.referrers, "refererHost", "Direct / Bookmarks")
  };
}

function safeCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.round(count) : 0;
}

function cleanAnalyticsPath(value) {
  if (typeof value !== "string" || !value.startsWith("/")) return "";
  return value.slice(0, 240);
}

function analyticsBreakdown(rows, dimension, fallback) {
  return (rows || []).map(item => {
    const value = item.dimensions?.[dimension];
    const label = typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : fallback;
    return { label, pageViews: safeCount(item.count), visits: safeCount(item.sum?.visits) };
  }).filter(item => item.pageViews || item.visits).slice(0, 10);
}

function analyticsCacheKey(request, range) {
  return new Request(new URL(`/api/admin/analytics?range=${range}&v=3`, request.url).toString(), { method: "GET" });
}

function putAnalyticsCache(cache, key, payload, ctx) {
  if (!cache) return;
  const cached = json(payload, 200, { "Cache-Control": `public, max-age=${ANALYTICS_CACHE_SECONDS}` });
  const operation = cache.put(key, cached).catch(error => console.warn("Analytics cache write failed", error));
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(operation);
}

async function listProducts(env) {
  requireBindings(env, ["DB"]);
  const result = await env.DB.prepare(
    "SELECT id, name, name_en, price, in_stock, image_ratio, image_etag, updated_at FROM products WHERE image_data IS NOT NULL ORDER BY created_at DESC"
  ).all();
  return json({ products: (result.results || []).map(publicProduct) }, 200, {
    "Cache-Control": "public, max-age=15, stale-while-revalidate=60"
  });
}

const SITE_SETTINGS_SELECT = `SELECT
  shop_name_bn, shop_name_en,
  proprietor_name_bn, proprietor_name_en, proprietor_phone,
  servicing_name_bn, servicing_name_en, servicing_phone,
  email, phone, whatsapp,
  agent_bkash, agent_nagad, agent_rocket, agent_upay,
  facebook, map_url, address_bn, address_en,
  hours_open, hours_close, closed_days, updated_at,
  (SELECT image_etag FROM site_profile_images WHERE role = 'proprietor') AS proprietor_image_etag,
  (SELECT image_etag FROM site_profile_images WHERE role = 'technician') AS technician_image_etag
  FROM site_settings WHERE id = 1 LIMIT 1`;

async function getPublicSiteSettings(request, env, ctx) {
  requireBindings(env, ["DB"]);
  const cache = defaultCache();
  const key = settingsCacheKey(request);
  if (cache) {
    try {
      const cached = await cache.match(key);
      if (cached) return cached;
    } catch (error) {
      console.warn("Settings cache read failed", error);
    }
  }

  const row = await env.DB.prepare(SITE_SETTINGS_SELECT).first();
  if (!row) return json({ error: "Site settings are not configured." }, 503, { "Cache-Control": "no-store" });
  const response = publicSettingsResponse(siteSettings(row));
  putSettingsCache(cache, key, response, ctx);
  return response;
}

async function getAdminSiteSettings(env) {
  requireBindings(env, ["DB"]);
  const row = await env.DB.prepare(SITE_SETTINGS_SELECT).first();
  if (!row) return json({ error: "Site settings are not configured." }, 503, { "Cache-Control": "no-store" });
  return json({ settings: siteSettings(row) }, 200, { "Cache-Control": "no-store" });
}

async function updateSiteSettings(request, env, ctx) {
  requireBindings(env, ["DB"]);
  if (!isJson(request)) return json({ error: "Expected a JSON request." }, 415);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid settings data." }, 400);
  }
  const checked = validateSiteSettings(body);
  if (checked.error) return json({ error: checked.error }, 400, { "Cache-Control": "no-store" });
  const value = checked.settings;

  await env.DB.prepare(`UPDATE site_settings SET
    shop_name_bn = ?, shop_name_en = ?,
    proprietor_name_bn = ?, proprietor_name_en = ?, proprietor_phone = ?,
    servicing_name_bn = ?, servicing_name_en = ?, servicing_phone = ?,
    email = ?, phone = ?, whatsapp = ?,
    agent_bkash = ?, agent_nagad = ?, agent_rocket = ?, agent_upay = ?,
    facebook = ?, map_url = ?, address_bn = ?, address_en = ?,
    hours_open = ?, hours_close = ?, closed_days = ?, updated_at = unixepoch()
    WHERE id = 1`).bind(
    value.shopName.bn, value.shopName.en,
    value.proprietor.name.bn, value.proprietor.name.en, value.proprietor.phone,
    value.servicing.name.bn, value.servicing.name.en, value.servicing.phone,
    value.email, value.phone, value.whatsapp,
    value.agents.bkash, value.agents.nagad, value.agents.rocket, value.agents.upay,
    value.facebook, value.mapUrl, value.address.bn, value.address.en,
    value.hours.open, value.hours.close, JSON.stringify(value.hours.closedDays)
  ).run();

  const row = await env.DB.prepare(SITE_SETTINGS_SELECT).first();
  if (!row) return json({ error: "Site settings could not be loaded after saving." }, 500, { "Cache-Control": "no-store" });
  const settings = siteSettings(row);
  putSettingsCache(defaultCache(), settingsCacheKey(request), publicSettingsResponse(settings), ctx);
  return json({ settings }, 200, { "Cache-Control": "no-store" });
}

function publicSettingsResponse(settings) {
  return json({ settings }, 200, {
    "Cache-Control": "public, max-age=300, stale-while-revalidate=60"
  });
}

function defaultCache() {
  return typeof caches !== "undefined" && caches.default ? caches.default : null;
}

function settingsCacheKey(request) {
  return new Request(new URL("/api/site-settings", request.url).toString(), { method: "GET" });
}

function putSettingsCache(cache, key, response, ctx) {
  if (!cache) return;
  const operation = cache.put(key, response.clone()).catch(error => console.warn("Settings cache write failed", error));
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(operation);
}

function siteSettings(row) {
  let closedDays = [];
  try {
    const parsed = JSON.parse(row.closed_days || "[]");
    if (Array.isArray(parsed)) closedDays = parsed;
  } catch { /* migration default remains in use */ }
  return {
    shopName: { bn: row.shop_name_bn, en: row.shop_name_en },
    proprietor: {
      name: { bn: row.proprietor_name_bn, en: row.proprietor_name_en },
      phone: row.proprietor_phone
    },
    servicing: {
      name: { bn: row.servicing_name_bn, en: row.servicing_name_en },
      phone: row.servicing_phone
    },
    email: row.email,
    phone: row.phone,
    whatsapp: row.whatsapp,
    agents: {
      bkash: row.agent_bkash,
      nagad: row.agent_nagad,
      rocket: row.agent_rocket,
      upay: row.agent_upay
    },
    facebook: row.facebook,
    mapUrl: row.map_url,
    address: { bn: row.address_bn, en: row.address_en },
    hours: { open: row.hours_open, close: row.hours_close, closedDays },
    profileImages: {
      proprietor: profileImageUrl("proprietor", row.proprietor_image_etag),
      technician: profileImageUrl("technician", row.technician_image_etag)
    },
    updatedAt: row.updated_at
  };
}

function validateSiteSettings(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Invalid settings data." };
  const required = [
    [body.shopName?.bn, 120, "Bangla shop name"], [body.shopName?.en, 120, "English shop name"],
    [body.proprietor?.name?.bn, 120, "Bangla proprietor name"], [body.proprietor?.name?.en, 120, "English proprietor name"],
    [body.servicing?.name?.bn, 120, "Bangla technician name"], [body.servicing?.name?.en, 120, "English technician name"],
    [body.address?.bn, 240, "Bangla address"], [body.address?.en, 240, "English address"]
  ];
  const values = [];
  for (const [input, max, label] of required) {
    const result = checkedText(input, max);
    if (!result) return { error: `${label} is required and must be under ${max} characters.` };
    values.push(result);
  }

  const proprietorPhone = checkedPhone(body.proprietor?.phone, false);
  const servicingPhone = checkedPhone(body.servicing?.phone, false);
  const phone = checkedPhone(body.phone, false);
  const whatsapp = checkedPhone(body.whatsapp, false);
  if (!proprietorPhone || !servicingPhone || !phone || !whatsapp) {
    return { error: "Main, WhatsApp, proprietor and technician numbers must be valid 11-digit Bangladesh mobile numbers." };
  }
  const agents = {};
  for (const name of ["bkash", "nagad", "rocket", "upay"]) {
    const number = checkedPhone(body.agents?.[name], true, true);
    if (number === null) return { error: `${name} agent number must be empty or a valid Bangladesh mobile number.` };
    agents[name] = number;
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  const facebook = checkedUrl(body.facebook, true);
  const mapUrl = checkedUrl(body.mapUrl, false);
  if (facebook === null) return { error: "Facebook URL must be empty or a valid HTTPS link." };
  if (!mapUrl) return { error: "Google Maps URL must be a valid HTTPS link." };

  const open = checkedTime(body.hours?.open);
  const close = checkedTime(body.hours?.close);
  if (!open || !close || open === close) return { error: "Choose valid and different opening and closing times." };
  const closedDays = body.hours?.closedDays;
  if (!Array.isArray(closedDays) || closedDays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) {
    return { error: "Choose valid weekly closed days." };
  }
  const uniqueDays = [...new Set(closedDays)].sort((a, b) => a - b);

  return { settings: {
    shopName: { bn: values[0], en: values[1] },
    proprietor: { name: { bn: values[2], en: values[3] }, phone: proprietorPhone },
    servicing: { name: { bn: values[4], en: values[5] }, phone: servicingPhone },
    email,
    phone,
    whatsapp,
    agents,
    facebook,
    mapUrl,
    address: { bn: values[6], en: values[7] },
    hours: { open, close, closedDays: uniqueDays }
  } };
}

function checkedText(value, maxLength) {
  if (typeof value !== "string") return "";
  const result = value.trim().replace(/\s+/g, " ");
  return result && result.length <= maxLength ? result : "";
}

function checkedPhone(value, optional, allowTwelve = false) {
  const result = typeof value === "string" ? value.replace(/\D/g, "") : "";
  if (!result && optional) return "";
  const pattern = allowTwelve ? /^01\d{9,10}$/ : /^01\d{9}$/;
  return pattern.test(result) ? result : null;
}

function checkedUrl(value, optional) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result && optional) return "";
  if (!result || result.length > 500) return null;
  try {
    const url = new URL(result);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function checkedTime(value) {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
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
  requireBindings(env, ["DB"]);
  const form = await readProductForm(request, true);
  if (form.error) return json({ error: form.error }, 400);

  const id = crypto.randomUUID();
  const imageBytes = await form.image.arrayBuffer();
  const imageEtag = await sha256Hex(imageBytes);
  await env.DB.prepare(
    "INSERT INTO products (id, name, name_en, price, in_stock, image_small_key, image_large_key, image_ratio, image_data, image_etag) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, form.name, form.nameEn, form.price, form.inStock, `d1/${id}-image.webp`, `d1/${id}-image-large.webp`, form.imageRatio, imageBytes, imageEtag).run();

  const row = await env.DB.prepare(
    "SELECT id, name, name_en, price, in_stock, image_ratio, image_etag, updated_at FROM products WHERE id = ? LIMIT 1"
  ).bind(id).first();
  return json({ product: publicProduct(row) }, 201, { "Cache-Control": "no-store" });
}

async function updateProduct(request, env, _ctx, id) {
  requireBindings(env, ["DB"]);
  const current = await env.DB.prepare(
    "SELECT id, image_ratio FROM products WHERE id = ? LIMIT 1"
  ).bind(id).first();
  if (!current) return json({ error: "Product not found." }, 404);

  const form = await readProductForm(request, false);
  if (form.error) return json({ error: form.error }, 400);
  if (form.image) {
    const imageBytes = await form.image.arrayBuffer();
    const imageEtag = await sha256Hex(imageBytes);
    await env.DB.prepare(
      "UPDATE products SET name = ?, name_en = ?, price = ?, in_stock = ?, image_ratio = ?, image_data = ?, image_etag = ?, updated_at = unixepoch() WHERE id = ?"
    ).bind(form.name, form.nameEn, form.price, form.inStock, form.imageRatio, imageBytes, imageEtag, id).run();
  } else {
    await env.DB.prepare(
      "UPDATE products SET name = ?, name_en = ?, price = ?, in_stock = ?, updated_at = unixepoch() WHERE id = ?"
    ).bind(form.name, form.nameEn, form.price, form.inStock, id).run();
  }

  const row = await env.DB.prepare(
    "SELECT id, name, name_en, price, in_stock, image_ratio, image_etag, updated_at FROM products WHERE id = ? LIMIT 1"
  ).bind(id).first();
  return json({ product: publicProduct(row) }, 200, { "Cache-Control": "no-store" });
}

async function deleteProduct(env, _ctx, id) {
  requireBindings(env, ["DB"]);
  const current = await env.DB.prepare(
    "SELECT id FROM products WHERE id = ? LIMIT 1"
  ).bind(id).first();
  if (!current) return json({ error: "Product not found." }, 404);

  await env.DB.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
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
  const image = fileValue(data.get("image"));

  if (!name) return { error: "Product name is required." };
  if (!/^\d{1,9}$/.test(priceText) || !Number.isSafeInteger(price) || price < 0) {
    return { error: "Price must be a whole number from 0 to 999,999,999." };
  }
  if (inStockText !== "true" && inStockText !== "false") return { error: "Choose a valid stock status." };
  if (requireImages && !image) return { error: "A product image is required." };
  if (image && !validImage(image)) return { error: "The image must be a WebP file under 500 KB." };
  if ((image || requireImages) && (!Number.isFinite(imageRatio) || imageRatio < 0.2 || imageRatio > 5)) {
    return { error: "Invalid image dimensions." };
  }

  return {
    name,
    nameEn,
    price,
    inStock: inStockText === "true" ? 1 : 0,
    imageRatio: Number.isFinite(imageRatio) ? imageRatio : null,
    image
  };
}

async function getProductImage(env, key) {
  requireBindings(env, ["DB"]);
  const match = key.match(/^product-images\/([a-f0-9-]+)\.webp$/i);
  if (!match) {
    return new Response("Not found", { status: 404 });
  }
  const image = await env.DB.prepare(
    "SELECT image_data, image_etag FROM products WHERE id = ? AND image_data IS NOT NULL LIMIT 1"
  ).bind(match[1]).first();
  if (!image) return new Response("Not found", { status: 404 });
  const imageBytes = blobBytes(image.image_data);
  if (!imageBytes.byteLength) return new Response("Not found", { status: 404 });
  const headers = new Headers({
    "Content-Type": "image/webp",
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Length": String(imageBytes.byteLength)
  });
  headers.set("ETag", `"${image.image_etag}"`);
  return new Response(imageBytes, { headers });
}

async function updateProfileImage(request, env, ctx, role) {
  requireBindings(env, ["DB"]);
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("multipart/form-data")) return json({ error: "Expected profile image form data." }, 415);

  let data;
  try {
    data = await request.formData();
  } catch {
    return json({ error: "Invalid profile image form data." }, 400);
  }
  const image = fileValue(data.get("image"));
  if (!image || image.type !== "image/webp" || image.size > MAX_PROFILE_IMAGE_BYTES) {
    return json({ error: "The profile image must be a WebP file under 500 KB." }, 400, { "Cache-Control": "no-store" });
  }

  const imageBytes = await image.arrayBuffer();
  const imageEtag = await sha256Hex(imageBytes);
  await env.DB.prepare(
    "INSERT INTO site_profile_images (role, image_data, image_etag, updated_at) VALUES (?, ?, ?, unixepoch()) ON CONFLICT(role) DO UPDATE SET image_data = excluded.image_data, image_etag = excluded.image_etag, updated_at = unixepoch()"
  ).bind(role, imageBytes, imageEtag).run();

  const row = await env.DB.prepare(SITE_SETTINGS_SELECT).first();
  if (row) putSettingsCache(defaultCache(), settingsCacheKey(request), publicSettingsResponse(siteSettings(row)), ctx);
  return json({ imageUrl: profileImageUrl(role, imageEtag) }, 200, { "Cache-Control": "no-store" });
}

async function getProfileImage(env, role, imageEtag) {
  requireBindings(env, ["DB"]);
  const image = await env.DB.prepare(
    "SELECT image_data, image_etag FROM site_profile_images WHERE role = ? AND image_etag = ? LIMIT 1"
  ).bind(role, imageEtag).first();
  if (!image) return new Response("Not found", { status: 404 });
  const imageBytes = blobBytes(image.image_data);
  if (!imageBytes.byteLength) return new Response("Not found", { status: 404 });
  return new Response(imageBytes, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(imageBytes.byteLength),
      ETag: `"${image.image_etag}"`
    }
  });
}

function profileImageUrl(role, imageEtag) {
  return imageEtag ? `/profile-images/${role}-${imageEtag}.webp` : "";
}

function blobBytes(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (Array.isArray(value)) return Uint8Array.from(value);
  return new Uint8Array();
}

function publicProduct(row) {
  return {
    id: row.id,
    name: row.name,
    nameEn: row.name_en || "",
    price: row.price,
    inStock: Boolean(row.in_stock),
    imageUrl: `/product-images/${row.id}.webp?v=d1-${row.image_etag || row.updated_at}`,
    imageRatio: row.image_ratio,
    updatedAt: row.updated_at
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

async function sha256Hex(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
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
  headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com/beacon.min.js; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://cloudflareinsights.com; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  if (new URL(request.url).pathname.startsWith("/admin")) {
    headers.set("X-Robots-Tag", "noindex, nofollow");
    headers.set("Cache-Control", "no-store");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const _internals = {
  analyticsPayload,
  analyticsWindow,
  blobBytes,
  cleanText,
  constantTimeEqual,
  createSession,
  publicProduct,
  readProductForm,
  readSession,
  sameOrigin,
  siteSettings,
  validateSiteSettings
};
