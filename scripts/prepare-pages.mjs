import { copyFile } from "node:fs/promises";

await copyFile("worker.js", "public/_worker.js");
console.log("Prepared public/_worker.js for Cloudflare Pages Advanced Mode.");
