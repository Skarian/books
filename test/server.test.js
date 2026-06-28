const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

function resetModules() {
  for (const mod of ["../src/server", "../src/state", "../src/config"]) {
    delete require.cache[require.resolve(mod)];
  }
}

function loadApp(dir) {
  resetModules();
  process.env.BOOKS_ENV_FILE = path.join(dir, "missing.env");
  process.env.BOOKS_DATA_DIR = dir;
  process.env.BOOKS_CONFIG_DIR = dir;
  process.env.BOOKS_ACCOUNTS_DB = path.join(dir, "accounts.sqlite");
  process.env.BOOKS_PUBLIC_HOST = "books.test";
  const state = require("../src/state");
  state.createAccount({ name: "Neil", slug: "neil", email: "neil@example.com" });
  state.updateAccount("neil", { books_password: "beacon-forest-river-window" });
  const server = require("../src/server").createServer();
  return { state, server };
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

test("setup page uses the single Books login", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "books-server-test-"));
  const { state, server } = loadApp(dir);
  await listen(server);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    assert.equal((await fetch(`${base}/setup/neil`)).status, 401);
    assert.equal((await fetch(`${base}/setup/missing`)).status, 404);

    const badAuth = Buffer.from("opds_neil:beacon-forest-river-window").toString("base64");
    assert.equal((await fetch(`${base}/setup/neil`, { headers: { Authorization: `Basic ${badAuth}` } })).status, 401);

    const goodAuth = Buffer.from("neil:beacon-forest-river-window").toString("base64");
    const response = await fetch(`${base}/setup/neil`, { headers: { Authorization: `Basic ${goodAuth}` } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /https:\/\/books\.test\/catalog/);
    assert.match(html, /https:\/\/books\.test\/kosync/);
    assert.match(html, /beacon-forest-river-window/);
  } finally {
    await close(server);
    state.closeForTests();
  }
});
