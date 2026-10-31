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
