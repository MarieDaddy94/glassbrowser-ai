const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), "utf8");

test("App.tsx contains no inline timer API calls", () => {
  const app = read("App.tsx");
  assert.equal(/\b(?:window\.)?setTimeout\s*\(/.test(app), false);
  assert.equal(/\b(?:window\.)?setInterval\s*\(/.test(app), false);
});
