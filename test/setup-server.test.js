const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Writable } = require("node:stream");
const test = require("node:test");

function resetModules() {
  for (const mod of ["../src/setup-server", "../src/crosspoint", "../src/koreader", "../src/readest", "../src/system", "../src/state", "../src/config"]) {
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
    setup: require("../src/setup-server")
  };
}

function auth(user, password) {
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

function writeFakeDictionary(config) {
  const dict = path.join(config.configDir, "english-wiktionary-stardict");
  fs.mkdirSync(dict, { recursive: true });
  fs.writeFileSync(path.join(dict, "English-English Wiktionary dictionary.ifo"), "StarDict's dict ifo file\nbookname=English\n");
  fs.writeFileSync(path.join(dict, "English-English Wiktionary dictionary.idx"), "idx");
  fs.writeFileSync(path.join(dict, "English-English Wiktionary dictionary.dict.dz"), "dict");
  fs.writeFileSync(path.join(dict, "English-English Wiktionary dictionary.syn"), "syn");
}

class MockResponse extends Writable {
  constructor() {
    super();
    this.chunks = [];
    this.headers = {};
    this.statusCode = null;
  }

  _write(chunk, _encoding, callback) {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }

  writeHead(statusCode, headers) {
    this.statusCode = statusCode;
    this.headers = headers;
    return this;
  }

  text() {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

async function request(setup, url, authorization, options) {
  const res = new MockResponse();
  setup.serve({ method: "GET", url, headers: { authorization } }, res, options);
  await new Promise((resolve) => res.on("finish", resolve));
  return res;
}

test("setup server gates bundle downloads by Books account auth", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "books-setup-test-"));
  const { config, state, setup } = load(dir);
  state.createAccount({ name: "Alice", slug: "alice" });
  state.createAccount({ name: "Bob", slug: "bob" });
  state.updateAccount("alice", { books_password: "alice-password" });
  state.updateAccount("bob", { books_password: "bob-password" });
  const options = {
    downloadSimpleUi: () => {
      const simpleUi = path.join(config.configDir, "simpleui.koplugin");
      fs.mkdirSync(simpleUi, { recursive: true });
      fs.writeFileSync(path.join(simpleUi, "main.lua"), "return {}\n");
    },
    downloadDictionary: () => {
      writeFakeDictionary(config);
    }
  };

  let response = await request(setup, "/koreader", auth("alice", "alice-password"), options);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Content-Type"], "text/html; charset=utf-8");
  assert.match(response.text(), /\/setup\/koreader-android-kindle\.zip/);
  assert.match(response.text(), /\/setup\/koreader-kobo\.zip/);
  assert.doesNotMatch(response.text(), /bob/);

  response = await request(setup, "/koreader", auth("alice", "wrong"), options);
  assert.equal(response.statusCode, 401);

  response = await request(setup, "/readest", auth("alice", "alice-password"), options);
  assert.equal(response.statusCode, 200);
  assert.match(response.text(), /\/setup\/readest\.zip/);
  assert.match(response.text(), /Restore Library/);
  assert.doesNotMatch(response.text(), /bob/);

  response = await request(setup, "/crosspoint", auth("alice", "alice-password"), options);
  assert.equal(response.statusCode, 200);
  assert.match(response.text(), /\/setup\/crosspoint\.zip/);
  assert.match(response.text(), /SD card root/);
  assert.doesNotMatch(response.text(), /bob/);

  response = await request(setup, "/setup/koreader-kobo.zip", auth("alice", "alice-password"), options);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Cache-Control"], "private, no-store");
  assert.ok(response.text().startsWith("PK"));

  response = await request(setup, "/setup/readest.zip", auth("alice", "alice-password"), options);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Content-Disposition"], 'attachment; filename="readest.zip"');
  assert.ok(response.text().startsWith("PK"));

  response = await request(setup, "/setup/crosspoint.zip", auth("alice", "alice-password"), options);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Content-Disposition"], 'attachment; filename="crosspoint.zip"');
  assert.ok(response.text().startsWith("PK"));

  response = await request(setup, "/setup/koreader-kobo.zip", auth("alice", "wrong"), options);
  assert.equal(response.statusCode, 401);
  assert.match(response.headers["WWW-Authenticate"], /Books setup/);

  response = await request(setup, "/setup/not-a-bundle.zip", auth("alice", "alice-password"), options);
  assert.equal(response.statusCode, 404);

  response = await request(setup, "/setup/../koreader-kobo.zip", auth("alice", "alice-password"), options);
  assert.equal(response.statusCode, 404);
});
