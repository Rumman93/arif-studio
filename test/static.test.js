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
