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
  process.env.BOOKS_STATE_FILE = path.join(dir, "state.json");
  process.env.BOOKS_PUBLIC_HOST = "books.test";
  const state = require("../src/state");
  state.createAccount({ name: "Neil", slug: "neil", email: "neil@example.com" });
  state.updateAccount("neil", { books_password: "beacon-forest-river-window" });
  return { state, handler: require("../src/server").handler };
}

function request(handler, url, headers = {}) {
  return new Promise((resolve) => {
    const res = {
      status: 0,
      headers: {},
      body: "",
      writeHead(status, responseHeaders) {
        this.status = status;
        this.headers = responseHeaders || {};
      },
      end(body = "") {
        this.body += body;
        resolve(this);
      }
    };
    handler({ method: "GET", url, headers }, res);
  });
}

test("setup page uses the single Books login", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "books-server-test-"));
  const { handler } = loadApp(dir);
  assert.equal((await request(handler, "/healthz")).status, 200);
  assert.equal((await request(handler, "/setup/neil")).status, 401);
  assert.equal((await request(handler, "/setup/missing")).status, 404);

  const badAuth = Buffer.from("opds_neil:beacon-forest-river-window").toString("base64");
  assert.equal((await request(handler, "/setup/neil", { authorization: `Basic ${badAuth}` })).status, 401);

  const goodAuth = Buffer.from("neil:beacon-forest-river-window").toString("base64");
  const response = await request(handler, "/setup/neil", { authorization: `Basic ${goodAuth}` });
  assert.equal(response.status, 200);
  assert.match(response.body, /https:\/\/books\.test\/catalog/);
  assert.match(response.body, /https:\/\/books\.test\/kosync/);
  assert.match(response.body, /beacon-forest-river-window/);
});
