const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

function resetModules() {
  for (const mod of ["../src/crosspoint", "../src/system", "../src/state", "../src/config"]) {
    delete require.cache[require.resolve(mod)];
  }
}

function load(dir) {
  resetModules();
  process.env.BOOKS_DATA_DIR = dir;
  process.env.BOOKS_PUBLIC_HOST = "books.test";
  return {
    state: require("../src/state"),
    crosspoint: require("../src/crosspoint")
  };
}

function zipRead(file, entry) {
  const result = spawnSync("unzip", ["-p", file, entry], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function zipList(file) {
  const result = spawnSync("unzip", ["-Z", "-1", file], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim().split(/\r?\n/);
}

test("CrossPoint bundle includes OPDS and binary KOSync settings", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "books-crosspoint-test-"));
  const { state, crosspoint } = load(dir);
  state.createAccount({ name: "Alice", slug: "alice" });
  state.updateAccount("alice", { books_password: "alpha-bravo-charlie-delta-echo-foxtrot" });

  const bundle = crosspoint.generate(state.getAccount("alice"));
  assert.deepEqual(zipList(bundle.path).sort(), [".crosspoint/", ".crosspoint/koreader.json", ".crosspoint/opds.json"]);

  const opds = JSON.parse(zipRead(bundle.path, ".crosspoint/opds.json"));
  assert.deepEqual(opds.servers, [{
    name: "Books",
    url: "https://books.test/catalog",
    username: "alice",
    password: "alpha-bravo-charlie-delta-echo-foxtrot"
  }]);

  const kosync = JSON.parse(zipRead(bundle.path, ".crosspoint/koreader.json"));
  assert.deepEqual(kosync, {
    username: "alice",
    password: "alpha-bravo-charlie-delta-echo-foxtrot",
    serverUrl: "https://books.test/kosync",
    matchMethod: 1
  });

  crosspoint.cleanup(bundle);
});
