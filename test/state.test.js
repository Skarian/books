const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

function resetModules() {
  for (const mod of ["../src/state", "../src/config"]) {
    delete require.cache[require.resolve(mod)];
  }
}

function loadState(dir) {
  resetModules();
  process.env.BOOKS_DATA_DIR = dir;
  process.env.BOOKS_PUBLIC_HOST = "books.test";
  return require("../src/state");
}

test("fresh state file initializes and persists the Books data model", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "books-test-"));
  const state = loadState(dir);
  const row = state.createAccount({ name: "Alice", slug: "alice", email: "alice@example.com" });
  assert.equal(row.slug, "alice");
  assert.match(row.books_password, /^[a-z]+(-[a-z]+){5}$/);
  state.updateAccount("alice", { books_password: "beacon-forest-river-window" });
  state.incrementDaily();

  resetModules();
  const reloaded = require("../src/state");
  assert.equal(reloaded.getAccount("alice").books_password, "beacon-forest-river-window");
  assert.equal(reloaded.dailyCount(), 1);
  assert.deepEqual(Object.keys(reloaded.readState()).sort(), ["accounts", "hardcover_daily_downloads", "version"]);
});
