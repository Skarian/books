const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

function load(dir) {
  process.env.BOOKS_DATA_DIR = dir;
  for (const mod of ["../src/shelfmark", "../src/config"]) delete require.cache[require.resolve(mod)];
  return require("../src/shelfmark");
}

function response(status, payload) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

async function withFetch(fetch, callback) {
  const previous = global.fetch;
  global.fetch = fetch;
  try {
    return await callback();
  } finally {
    global.fetch = previous;
  }
}

test("Shelfmark search uses the direct English EPUB query and preserves release order", async () => {
  const shelfmark = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-shelfmark-test-")));
  const releases = [
    { source_id: "11111111111111111111111111111111", title: "First", extra: { author: "Writer" } },
    { source_id: "22222222222222222222222222222222", title: "Second", extra: { author: "Writer" } }
  ];
  let requested;
  const result = await withFetch(async (url) => {
    requested = new URL(url);
    return response(200, { releases });
  }, () => shelfmark.searchReleases("9780062010612"));
  assert.equal(requested.origin, "http://shelfmark:8084");
  assert.equal(requested.pathname, "/api/releases");
  assert.deepEqual(Object.fromEntries(requested.searchParams), {
    source: "direct_download",
    query: "9780062010612",
    format: "epub",
    lang: "en"
  });
  assert.deepEqual(result, releases);
});

test("Shelfmark search rejects API failures and invalid release payloads", async () => {
  const shelfmark = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-shelfmark-test-")));
  await withFetch(async () => response(503, { error: "bypasser unavailable" }), () =>
    assert.rejects(() => shelfmark.searchReleases("Dune"), /bypasser unavailable/));
  await withFetch(async () => response(200, { releases: {} }), () =>
    assert.rejects(() => shelfmark.searchReleases("Dune"), /invalid releases payload/));
});

test("Shelfmark download queues an MD5 and returns only a contained EPUB path", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "books-shelfmark-test-"));
  const staging = path.join(dir, "shelfmark", "downloads");
  fs.mkdirSync(staging, { recursive: true });
  fs.writeFileSync(path.join(staging, "Power.epub"), "epub");
  const shelfmark = load(dir);
  const md5 = "33333333333333333333333333333333";
  const calls = [];
  const result = await withFetch(async (url, options = {}) => {
    calls.push({ url: new URL(url), options });
    if (options.method === "POST") return response(200, { status: "queued" });
    return response(200, { complete: { [md5]: { download_path: "/books/Power.epub" } } });
  }, () => shelfmark.downloadRelease({
    source_id: md5,
    title: "A release title",
    format: "EPUB",
    language: "English",
    extra: { author: "Jeffrey Pfeffer" }
  }, "Power"));
  assert.equal(result, fs.realpathSync(path.join(staging, "Power.epub")));
  assert.equal(calls[0].url.pathname, "/api/releases/download");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    source: "direct_download",
    source_id: md5,
    title: "Power",
    format: "epub",
    language: "English",
    extra: { author: "Jeffrey Pfeffer" }
  });
  assert.equal(calls[1].url.pathname, "/api/status");

  const outside = path.join(dir, "shelfmark", "outside.epub");
  fs.writeFileSync(outside, "epub");
  await withFetch(async (_url, options = {}) => options.method === "POST"
    ? response(200, { status: "queued" })
    : response(200, { complete: { [md5]: { download_path: "/books/../outside.epub" } } }), () =>
    assert.rejects(() => shelfmark.downloadRelease({ source_id: md5 }, "Power"), /outside its staging directory/));
});

test("Shelfmark download attaches to duplicates and surfaces terminal or timeout failures", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "books-shelfmark-test-"));
  const staging = path.join(dir, "shelfmark", "downloads");
  fs.mkdirSync(staging, { recursive: true });
  fs.writeFileSync(path.join(staging, "Power.epub"), "epub");
  const shelfmark = load(dir);
  const md5 = "44444444444444444444444444444444";

  let call = 0;
  const attached = await withFetch(async () => ++call === 1
    ? response(500, { error: "Release is already in the download queue" })
    : response(200, { complete: { [md5]: { download_path: "/books/Power.epub" } } }), () =>
    shelfmark.downloadRelease({ source_id: md5 }, "Power"));
  assert.equal(attached, fs.realpathSync(path.join(staging, "Power.epub")));

  call = 0;
  await withFetch(async () => ++call === 1
    ? response(200, { status: "queued" })
    : response(200, { error: { [md5]: { status_message: "premium link failed" } } }), () =>
    assert.rejects(() => shelfmark.downloadRelease({ source_id: md5 }, "Power"), /premium link failed/));

  const originalNow = Date.now;
  let ticks = 0;
  Date.now = () => ticks++ === 0 ? 0 : 600001;
  try {
    await withFetch(async () => response(200, { status: "queued" }), () =>
      assert.rejects(() => shelfmark.downloadRelease({ source_id: md5 }, "Power"), /timed out/));
  } finally {
    Date.now = originalNow;
  }
});
