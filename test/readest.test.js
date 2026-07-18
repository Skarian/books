const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

function resetModules() {
  for (const mod of ["../src/readest", "../src/system", "../src/state", "../src/config"]) {
    delete require.cache[require.resolve(mod)];
  }
}

function load(dir) {
  resetModules();
  process.env.BOOKS_DATA_DIR = dir;
  process.env.BOOKS_PUBLIC_HOST = "books.test";
  return {
    state: require("../src/state"),
    readest: require("../src/readest")
  };
}

function zipRead(file, entry) {
  const result = spawnSync("unzip", ["-p", file, entry], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test("Readest restore bundle includes OPDS and KOSync settings", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "books-readest-test-"));
  const { state, readest } = load(dir);
  state.createAccount({ name: "Alice", slug: "alice" });
  state.updateAccount("alice", { books_password: "alpha-bravo-charlie-delta-echo-foxtrot" });

  const bundle = readest.generate(state.getAccount("alice"));
  assert.deepEqual(JSON.parse(zipRead(bundle.path, "library.json")), []);

  const settings = JSON.parse(zipRead(bundle.path, "settings.json"));
  assert.deepEqual(settings.opdsCatalogs, [{
    id: "books",
    name: "Books",
    url: "https://books.test/catalog",
    username: "alice",
    password: "alpha-bravo-charlie-delta-echo-foxtrot",
    autoDownload: true,
    contentId: state.md5("opds:https://books.test/catalog"),
    addedAt: settings.opdsCatalogs[0].addedAt
  }]);
  assert.equal(typeof settings.opdsCatalogs[0].addedAt, "number");
  assert.equal(settings.kosync.enabled, true);
  assert.equal(settings.kosync.serverUrl, "https://books.test/kosync");
  assert.equal(settings.kosync.username, "alice");
  assert.equal(settings.kosync.userkey, state.md5("alpha-bravo-charlie-delta-echo-foxtrot"));
  assert.equal(settings.kosync.password, "alpha-bravo-charlie-delta-echo-foxtrot");
  assert.equal(settings.kosync.checksumMethod, "binary");
  assert.equal(settings.kosync.strategy, "prompt");
  assert.deepEqual(settings.syncCategories, {
    book: false,
    progress: false,
    note: true,
    dictionary: false,
    font: true,
    texture: true,
    opds_catalog: true,
    settings: true,
    credentials: true
  });
  readest.cleanup(bundle);
});
