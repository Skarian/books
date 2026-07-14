const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Readable } = require("node:stream");
const { Writable } = require("node:stream");
const test = require("node:test");

function resetModules() {
  for (const mod of ["../src/setup-server", "../src/crosspoint", "../src/koreader", "../src/readest", "../src/system", "../src/state", "../src/config", "../src/ai", "../src/hardcover"]) {
    delete require.cache[require.resolve(mod)];
  }
}

function load(dir, env = {}) {
  resetModules();
  process.env.BOOKS_DATA_DIR = dir;
  process.env.BOOKS_PUBLIC_HOST = "books.test";
  delete process.env.BOOKS_AI_PROVIDER;
  delete process.env.BOOKS_AI_MODEL;
  Object.assign(process.env, env);
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

async function request(setup, url, authorization, options, body) {
  const req = body ? Readable.from([Buffer.from(JSON.stringify(body))]) : {};
  req.method = body ? "POST" : "GET";
  req.url = url;
  req.headers = { authorization };
  const res = new MockResponse();
  setup.serve(req, res, options || {});
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
      const simpleUi = path.join(config.configDir, "simpleui-2.1.koplugin");
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

test("AI dictionary endpoint is opt-in and Books-auth gated", async () => {
  let dir = fs.mkdtempSync(path.join(os.tmpdir(), "books-setup-test-"));
  let loaded = load(dir);
  let response = await request(loaded.setup, "/ai-dictionary/lookup", null, null, { selection: "gom jabbar" });
  assert.equal(response.statusCode, 404);

  dir = fs.mkdtempSync(path.join(os.tmpdir(), "books-setup-test-"));
  loaded = load(dir, { BOOKS_AI_PROVIDER: "codex" });
  const { state, setup } = loaded;
  state.createAccount({ name: "Alice", slug: "alice" });
  state.updateAccount("alice", { books_password: "alice-password" });
  let seen;
  response = await request(setup, "/ai-dictionary/lookup", auth("alice", "alice-password"), {
    aiLookup: async (input) => {
      seen = input;
      return { label: "object", definitions: ["A poisoned needle used as a test."] };
    }
  }, {
    book: "Dune by Frank Herbert",
    chapter: "chapter 1",
    progress: "about 4% through the book",
    selection: "gom jabbar",
    passage: "test {{{ gom jabbar }}} passage"
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.text()), { label: "object", definitions: ["A poisoned needle used as a test."] });
  assert.equal(seen.book, "Dune by Frank Herbert");
  assert.equal(seen.selection, "gom jabbar");

  response = await request(setup, "/ai-dictionary/lookup", auth("alice", "wrong"), null, { selection: "gom jabbar" });
  assert.equal(response.statusCode, 401);
  assert.match(fs.readFileSync(path.join(__dirname, "..", "src", "ai.js"), "utf8"), /AbortSignal\.timeout\(60_000\)/);
});

test("book request endpoints use Books auth and the account Hardcover token", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "books-setup-test-"));
  const { state, setup } = load(dir);
  state.createAccount({ name: "Alice", slug: "alice" });
  state.updateAccount("alice", { books_password: "alice-password", hardcover_token: "Bearer secret" });
  let searched;
  let submitted;
  const options = {
    searchBooks: async (token, query) => {
      searched = { token, query };
      return [{ id: 42, title: "Dune", author: "Frank Herbert", year: 1965, users_count: 13289 }];
    },
    requestBook: async (token, bookId) => {
      submitted = { token, bookId };
      return { status: "queued", existing: false, book: { id: 42, title: "Dune", author: "Frank Herbert" } };
    }
  };

  let response = await request(setup, "/requests/search", auth("alice", "alice-password"), options, { query: "dune" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.text()), {
    results: [{ id: 42, title: "Dune", author: "Frank Herbert", year: 1965, users_count: 13289 }]
  });
  assert.deepEqual(searched, { token: "Bearer secret", query: "dune" });

  response = await request(setup, "/requests/submit", auth("alice", "alice-password"), options, { book_id: 42 });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.text()), {
    status: "queued", existing: false, book: { id: 42, title: "Dune", author: "Frank Herbert" }
  });
  assert.deepEqual(submitted, { token: "Bearer secret", bookId: 42 });

  response = await request(setup, "/requests/search", auth("alice", "wrong"), options, { query: "dune" });
  assert.equal(response.statusCode, 401);
  assert.deepEqual(JSON.parse(response.text()), { error: "unauthorized" });
  assert.match(response.headers["WWW-Authenticate"], /Books requests/);
});

test("book request endpoint returns stable JSON errors", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "books-setup-test-"));
  const { state, setup } = load(dir);
  state.createAccount({ name: "Alice", slug: "alice" });
  state.updateAccount("alice", { books_password: "alice-password", hardcover_token: "Bearer secret" });
  const conflict = new Error("already present");
  conflict.code = "already_in_library";
  conflict.statusId = 2;
  let response = await request(setup, "/requests/submit", auth("alice", "alice-password"), {
    requestBook: async () => { throw conflict; }
  }, { book_id: 42 });
  assert.equal(response.statusCode, 409);
  assert.deepEqual(JSON.parse(response.text()), {
    error: "already_in_library", book_status: "currently_reading", status_id: 2
  });

  response = await request(setup, "/requests/search", auth("alice", "alice-password"), null, { query: "" });
  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(response.text()), { error: "invalid_request" });
});

test("book request endpoints reject accounts without Hardcover configuration", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "books-setup-test-"));
  const { state, setup } = load(dir);
  state.createAccount({ name: "Alice", slug: "alice" });
  state.updateAccount("alice", { books_password: "alice-password" });
  const response = await request(setup, "/requests/search", auth("alice", "alice-password"), null, { query: "dune" });
  assert.equal(response.statusCode, 409);
  assert.deepEqual(JSON.parse(response.text()), { error: "hardcover_not_configured" });
});
