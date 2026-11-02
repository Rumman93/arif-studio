import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const pages = ["public/index.html", "public/accessories.html", "public/admin/index.html"];

test("all local HTML asset references resolve inside the public directory", () => {
  for (const page of pages) {
    const html = readFileSync(page, "utf8");
    const directory = dirname(resolve(page));
    const references = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(match => match[1]);
    for (const reference of references) {
      if (/^(?:https?:|tel:|mailto:|\/)/.test(reference)) continue;
      const cleanReference = reference.split("?")[0];
      assert.ok(existsSync(resolve(directory, cleanReference)), `${page}: missing ${reference}`);
    }
  }
});

test("each page has unique element IDs", () => {
  for (const page of pages) {
    const html = readFileSync(page, "utf8");
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, `${page}: duplicate ID found`);
  }
});

test("every homepage translation key has an English entry", () => {
  const html = readFileSync("public/index.html", "utf8");
  const english = readFileSync("public/js/en.js", "utf8");
  const keys = new Set([...html.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)].map(match => match[1]));
  for (const key of keys) {
    assert.match(english, new RegExp(`\\b${key}\\s*:`), `missing English translation: ${key}`);
  }
});

test("homepage accessories preview shows four slots and opens the full catalog in a new tab", () => {
  const html = readFileSync("public/index.html", "utf8");
  const gridPosition = html.indexOf('id="home-product-grid"');
  const morePosition = html.indexOf('class="more home-products-more"');
  assert.ok(gridPosition >= 0);
  assert.ok(morePosition > gridPosition, "the full catalog link must follow the four product cards");
  assert.equal((html.match(/class="home-product-skeleton"/g) || []).length, 4);
  assert.match(html, /href="accessories\.html" target="_blank" rel="noopener"[^>]*>[\s\S]*?data-i18n="homeProductsMore"/);
});

test("runtime settings preserve config.js as the fallback and admin has no settings delete control", () => {
  for (const page of ["public/index.html", "public/accessories.html"]) {
    const html = readFileSync(page, "utf8");
    assert.ok(html.indexOf("config.js") < html.indexOf("site-settings.js"), `${page}: config fallback must load first`);
  }
  const loader = readFileSync("public/js/site-settings.js", "utf8");
  assert.match(loader, /catch\(function \(\) \{\s*return defaults;/);
  const admin = readFileSync("public/admin/index.html", "utf8");
  assert.match(admin, /id="settings-form"/);
  assert.doesNotMatch(admin, /delete-settings|settings-delete/);
});

test("site settings migration is additive, seeded from config defaults and prevents deletion", () => {
  const migration = readFileSync("migrations/0003_site_settings.sql", "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS site_settings/);
  assert.match(migration, /আরিফ স্টুডিও এন্ড টেলিকম/);
  assert.match(migration, /prevent_site_settings_delete/);
  assert.doesNotMatch(migration, /(?:ALTER|DROP|DELETE FROM)\s+products/i);
});

test("profile images have mobile admin upload controls and repeat-safe additive storage", () => {
  const homepage = readFileSync("public/index.html", "utf8");
  const admin = readFileSync("public/admin/index.html", "utf8");
  const adminScript = readFileSync("public/js/admin.js", "utf8");
  const migration = readFileSync("migrations/0004_profile_images.sql", "utf8");
  assert.match(homepage, /data-profile-image="proprietor"/);
  assert.match(homepage, /data-profile-image="technician"/);
  assert.match(admin, /data-profile-uploader="proprietor"/);
  assert.match(admin, /data-profile-uploader="technician"/);
  assert.match(adminScript, /canvas\.width = 480/);
  assert.match(adminScript, /canvas\.height = 480/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS site_profile_images/);
  assert.match(migration, /role TEXT PRIMARY KEY/);
  assert.doesNotMatch(migration, /\b(?:ALTER|INSERT|UPDATE|DELETE|DROP)\b/i);
});

test("catalog inventory, filters and WhatsApp ordering are additive and mobile-ready", () => {
  const migration = readFileSync("migrations/0005_product_stock_quantity.sql", "utf8");
  const catalog = readFileSync("public/accessories.html", "utf8");
  const catalogScript = readFileSync("public/js/accessories.js", "utf8");
  const catalogStyles = readFileSync("public/css/accessories.css", "utf8");
  const admin = readFileSync("public/admin/index.html", "utf8");
  const adminScript = readFileSync("public/js/admin.js", "utf8");

  assert.match(migration, /ALTER TABLE products/);
  assert.match(migration, /ADD COLUMN stock_quantity INTEGER DEFAULT 10/);
  assert.match(migration, /CHECK \(stock_quantity BETWEEN 0 AND 1000\)/);
  assert.doesNotMatch(migration, /product_inventory/i);
  for (const id of ["filter-in-stock", "filter-min-price", "filter-max-price", "clear-filters", "initial-products"]) {
    assert.match(catalog, new RegExp(`id="${id}"`));
  }
  assert.match(catalog, /<!-- SERVER_PRODUCT_CARDS -->/);
  assert.match(catalogScript, /https:\/\/wa\.me\//);
  assert.match(catalogScript, /encodeURIComponent\(message\)/);
  assert.match(catalogStyles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(admin, /id="product-stock-quantity"[^>]*max="1000"[^>]*value="10"/);
  assert.match(adminScript, /form\.append\("stockQuantity"/);
  assert.doesNotMatch(catalog + catalogScript, /\breviews?\b|\bratings?\b/i);
});

test("product deletion shows a permanent warning and requires password confirmation", () => {
  const admin = readFileSync("public/admin/index.html", "utf8");
  const adminScript = readFileSync("public/js/admin.js", "utf8");
  const worker = readFileSync("worker.js", "utf8");

  assert.match(admin, /id="delete-dialog"/);
  assert.match(admin, /id="delete-password"[^>]*type="password"[^>]*required/);
  assert.match(admin, /স্থায়ীভাবে মুছে যাবে। এটি ফিরিয়ে আনা যাবে না।/);
  assert.match(adminScript, /JSON\.stringify\(\{ password:/);
  assert.doesNotMatch(adminScript, /window\.confirm/);
  assert.match(worker, /constantTimeEqual\(password, env\.ADMIN_PASSWORD\)/);
  assert.match(worker, /Incorrect password\. The product was not deleted\./);
});

test("security policies allow Cloudflare Web Analytics automatic injection", () => {
  for (const file of ["worker.js", "public/_headers"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /script-src 'self' https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js/);
    assert.match(source, /connect-src 'self' https:\/\/cloudflareinsights\.com/);
  }
});

test("admin visitor stats are protected, mobile-ready and do not add D1 storage", () => {
  const worker = readFileSync("worker.js", "utf8");
  const admin = readFileSync("public/admin/index.html", "utf8");
  const adminScript = readFileSync("public/js/admin.js", "utf8");
  const styles = readFileSync("public/css/admin.css", "utf8");
  assert.match(admin, /data-admin-tab="analytics"/);
  assert.match(admin, /id="analytics-panel"/);
  assert.match(admin, /class="active" data-stats-range="1" aria-pressed="true">শেষ ২৪ ঘণ্টা/);
  assert.match(admin, /data-stats-range="7"/);
  assert.match(admin, /data-stats-range="30"/);
  for (const id of ["stats-countries", "stats-devices", "stats-browsers", "stats-operating-systems", "stats-referrers"]) {
    assert.match(admin, new RegExp(`id="${id}"`));
  }
  assert.match(admin, /id="stats-top-page"/);
  assert.match(styles, /grid-template-columns: repeat\(3, 1fr\)/);
  assert.match(styles, /\.stats-primary-grid \{[^}]*display: grid/);
  assert.match(styles, /\.stats-breakdowns \{[^}]*grid-template-columns: 1fr/);
  assert.match(styles, /@media \(min-width: 720px\)[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(adminScript, /createElementNS\(namespace, "svg"\)/);
  assert.match(adminScript, /document\.createElement\("progress"\)/);
  assert.match(adminScript, /getElementById\("stats-top-page"\)/);
  assert.doesNotMatch(adminScript, /chart\.style|bar\.style/);
  assert.match(worker, /if \(!await readSession\(request, env\)\).*401/);
  assert.match(worker, /ANALYTICS_CACHE_SECONDS = 5 \* 60/);
  assert.match(worker, /range !== 1 && range !== 7 && range !== 30/);
  for (const dimension of ["countryName", "deviceType", "userAgentBrowser", "userAgentOS", "refererHost"]) {
    assert.match(worker, new RegExp(`dimensions \\{ ${dimension} \\}`));
  }
  assert.doesNotMatch(worker.match(/async function getAdminAnalytics[\s\S]*?\n}\n\nfunction analyticsWindow/)?.[0] || "", /env\.DB/);
});
