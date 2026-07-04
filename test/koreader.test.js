const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

function resetModules() {
  for (const mod of ["../src/koreader", "../src/system", "../src/state", "../src/config"]) {
    delete require.cache[require.resolve(mod)];
  }
}

function load(dir) {
  resetModules();
  process.env.BOOKS_DATA_DIR = dir;
  process.env.BOOKS_PUBLIC_HOST = "books.test";
  return {
    config: require("../src/config"),
    state: require("../src/state"),
    koreader: require("../src/koreader")
  };
}

function zipList(file) {
  const result = spawnSync("unzip", ["-Z", "-1", file], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim().split(/\r?\n/);
}

function zipRead(file, entry) {
  const result = spawnSync("unzip", ["-p", file, entry], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test("KOReader starter bundles include account settings and SimpleUI paths", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "books-koreader-test-"));
  const { config, state, koreader } = load(dir);
  state.createAccount({ name: "Alice", slug: "alice" });
  state.updateAccount("alice", { books_password: "alpha-bravo-charlie-delta-echo-foxtrot" });
  const row = state.getAccount("alice");
  const simpleUi = path.join(config.configDir, "simpleui.koplugin");
  fs.mkdirSync(simpleUi, { recursive: true });
  fs.writeFileSync(path.join(simpleUi, "main.lua"), "return {}\n");

  const androidBundle = koreader.generate(row, "koreader-android-kindle.zip");
  const koboBundle = koreader.generate(row, "koreader-kobo.zip");
  const android = zipList(androidBundle.path);
  assert.ok(android.includes("koreader/books/"));
  assert.ok(android.includes("koreader/settings/opds.lua"));
  assert.ok(!android.includes("koreader/settings/kosync.lua"));
  assert.ok(android.includes("koreader/patches/2-books-kosync.lua"));
  assert.ok(android.includes("koreader/plugins/simpleui.koplugin/main.lua"));

  const kobo = zipList(koboBundle.path);
  assert.ok(kobo.includes(".adds/koreader/books/"));
  assert.ok(kobo.includes(".adds/koreader/settings/opds.lua"));
  assert.ok(!kobo.includes(".adds/koreader/settings/kosync.lua"));
  assert.ok(kobo.includes(".adds/koreader/patches/2-books-kosync.lua"));
  assert.ok(kobo.includes(".adds/koreader/plugins/simpleui.koplugin/main.lua"));

  const opds = zipRead(androidBundle.path, "koreader/settings/opds.lua");
  assert.match(opds, /https:\/\/books\.test\/catalog/);
  assert.match(opds, /alpha-bravo-charlie-delta-echo-foxtrot/);

  const patch = zipRead(androidBundle.path, "koreader/patches/2-books-kosync.lua");
  assert.match(patch, /DataStorage:getDataDir/);
  assert.match(patch, /books_dir/);
  assert.match(patch, /home_dir/);
  assert.match(patch, /download_dir/);
  assert.match(patch, /lastdir/);
  assert.match(patch, /quickstart_shown_version/);
  assert.match(patch, /quickstart%-\.\*%\.html/);
  assert.match(patch, /G_reader_settings:readSetting\("kosync"\)/);
  assert.match(patch, /G_reader_settings:saveSetting\("kosync", kosync\)/);
  assert.match(patch, /https:\/\/books\.test\/kosync/);
  assert.match(patch, /auto_sync"\] = true/);
  assert.match(patch, /sync_forward"\] = 2/);
  assert.match(patch, /sync_backward"\] = 3/);
  assert.match(patch, /checksum_method"\] = 0/);
  assert.match(patch, /"wifi_enable_action"\] = "turn_on"/);
  assert.doesNotMatch(patch, /wifi_disable_action/);
  koreader.cleanup(androidBundle);
  koreader.cleanup(koboBundle);
});

test("starter bundles download SimpleUI when the cached plugin source is missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "books-koreader-test-"));
  const { config, state, koreader } = load(dir);
  state.createAccount({ name: "Alice", slug: "alice" });
  state.updateAccount("alice", { books_password: "one-two-three-four-five-six" });
  const row = state.getAccount("alice");

  const bundle = koreader.generate(row, "koreader-android-kindle.zip", {
    downloadSimpleUi: () => {
      const simpleUi = path.join(config.configDir, "simpleui.koplugin");
      fs.mkdirSync(simpleUi, { recursive: true });
      fs.writeFileSync(path.join(simpleUi, "main.lua"), "return {}\n");
    }
  });
  assert.ok(zipList(bundle.path).includes("koreader/plugins/simpleui.koplugin/main.lua"));
  koreader.cleanup(bundle);
});
