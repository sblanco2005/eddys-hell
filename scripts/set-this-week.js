#!/usr/bin/env node
/**
 * Copy a this-week.json into data/ (and dist/data/ if present).
 * Usage:
 *   node scripts/set-this-week.js path/to/this-week.json
 *   node scripts/set-this-week.js   # reads ./this-week.json from cwd
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const src = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(process.cwd(), "this-week.json");

if (!fs.existsSync(src)) {
  console.error("Missing file:", src);
  console.error("Usage: node scripts/set-this-week.js [path/to/this-week.json]");
  process.exit(1);
}

const raw = fs.readFileSync(src, "utf8");
JSON.parse(raw); // validate

const dests = [
  path.join(root, "data", "this-week.json"),
  path.join(root, "dist", "data", "this-week.json"),
];
for (const d of dests) {
  const dir = path.dirname(d);
  if (!fs.existsSync(dir)) continue;
  fs.writeFileSync(d, raw.endsWith("\n") ? raw : raw + "\n");
  console.log("Wrote", d);
}
console.log("Done. Re-run scripts/publish-pages.sh to share on GitHub Pages.");
