const assert = require("node:assert/strict");
const crypto = require("crypto");
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

function zipReadBuffer(file, entry) {
  const result = spawnSync("unzip", ["-p", file, entry], { maxBuffer: 2 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr.toString());
  return result.stdout;
}

function zipList(file) {
  const result = spawnSync("unzip", ["-Z", "-1", file], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim().split(/\r?\n/);
}

test("CrossPoint bundle includes the Books fresh-device preset", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "books-crosspoint-test-"));
  const { state, crosspoint } = load(dir);
  state.createAccount({ name: "Alice", slug: "alice" });
  state.updateAccount("alice", { books_password: "alpha-bravo-charlie-delta-echo-foxtrot" });

  const bundle = crosspoint.generate(state.getAccount("alice"));
  const entries = zipList(bundle.path);
  assert.deepEqual(entries.sort(), [
    ".crosspoint/",
    ".crosspoint/books-preset.json",
    ".crosspoint/koreader.json",
    ".crosspoint/opds.json",
    ".crosspoint/settings.json",
    ".fonts/",
    ".fonts/Literata/",
    ".fonts/Literata/Literata_12.cpfont",
    ".fonts/Literata/Literata_14.cpfont",
    ".fonts/Literata/Literata_16.cpfont",
    ".fonts/Literata/Literata_18.cpfont",
    ".fonts/Literata/NOTICE.txt",
    ".fonts/Literata/OFL.txt"
  ].sort());

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

  const settings = JSON.parse(zipRead(bundle.path, ".crosspoint/settings.json"));
  const expectedSettings = JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/crosspoint/.crosspoint/settings.json")));
  assert.deepEqual(settings, expectedSettings);

  const preset = JSON.parse(zipRead(bundle.path, ".crosspoint/books-preset.json"));
  for (const [name, expected] of Object.entries(preset.literataSha256)) {
    const actual = crypto.createHash("sha256").update(zipReadBuffer(bundle.path, `.fonts/Literata/${name}`)).digest("hex");
    assert.equal(actual, expected);
  }
  crosspoint.cleanup(bundle);
});
