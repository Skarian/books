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
  process.env.BOOKS_ENV_FILE = path.join(dir, "missing.env");
  process.env.BOOKS_DATA_DIR = dir;
  process.env.BOOKS_CONFIG_DIR = dir;
  process.env.BOOKS_ACCOUNTS_DB = path.join(dir, "accounts.sqlite");
  process.env.BOOKS_PUBLIC_HOST = "books.test";
  return require("../src/state");
}

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "books-test-"));
}

test("fresh database initializes to the v2 schema", () => {
  const dir = tmpdir();
  const state = loadState(dir);
  state.migrate();
  const database = state.db();
  assert.equal(database.prepare("pragma user_version").get().user_version, 2);
  const accountColumns = database.prepare("pragma table_info(accounts)").all().map((row) => row.name);
  assert.ok(accountColumns.includes("books_password"));
  assert.ok(!accountColumns.includes("login_password"));
  assert.ok(!accountColumns.includes("opds_user"));
  assert.ok(database.prepare("select name from sqlite_schema where type='table' and name='hardcover_requests'").get());
  state.closeForTests();
});
