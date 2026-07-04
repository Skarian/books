const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

function resetModules() {
  for (const mod of ["../src/hardcover", "../src/system", "../src/state", "../src/config"]) {
    delete require.cache[require.resolve(mod)];
  }
}

function load(dir) {
  resetModules();
  process.env.BOOKS_DATA_DIR = dir;
  process.env.BOOKS_PUBLIC_HOST = "books.test";
  return {
    hardcover: require("../src/hardcover"),
    system: require("../src/system")
  };
}

function fixtureFile() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "books-hash-test-")), "fixture.epub");
  const data = Buffer.alloc(20000);
  for (let i = 0; i < data.length; i += 1) data[i] = i % 251;
  fs.writeFileSync(file, data);
  return { file, data };
}

test("KOReader document hash uses the binary partial MD5 sampling", () => {
  const { system } = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-")));
  const { file, data } = fixtureFile();
  const expected = crypto.createHash("md5");
  for (const offset of [0, 1024, 4096, 16384]) expected.update(data.subarray(offset, offset + 1024));
  assert.equal(system.koreaderDocumentHash(file), expected.digest("hex"));
});

test("progress conversion uses one percent or one page threshold", () => {
  const { hardcover } = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-")));
  assert.deepEqual(hardcover._test.isbnValues({ isbn: "978-0-061789-08-3, 1260027090" }), ["9780061789083", "1260027090"]);
  assert.equal(hardcover._test.progressPages(0.023, 288), 6);
  assert.equal(hardcover._test.progressPages(0.003, 500), 1);
  assert.equal(hardcover._test.progressPages(0.003, 100), null);
  assert.equal(hardcover._test.progressPages(1.2, 100), null);
});

test("progress push dry-run creates only from exact identifiers", async () => {
  const { hardcover } = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-")));
  const logs = [];
  const row = { slug: "alice", books_password: "pw", hardcover_token: "token" };
  const pushed = await hardcover._test.pushReadingProgress(row, {
    dryRun: true,
    log: (line) => logs.push(line),
    books: [{ id: 7, title: "Power: Why Some People Have It and Others Don't", authors: "Jeffrey Pfeffer", identifiers: { isbn: "9780061789083" }, epubPath: "/unused" }],
    userBooks: [],
    hash: () => "48c8da44c9c553a740545376df91bac6",
    progress: async () => ({ percentage: 0.023, timestamp: 1783185160 }),
    resolveEdition: async () => ({ id: 538676, book_id: 441142, pages: 288 }),
    createUserBook: async () => { throw new Error("dry-run should not create"); },
    upsertRead: async () => { throw new Error("dry-run should not upsert"); }
  });
  assert.equal(pushed, 1);
  assert.ok(logs.some((line) => line.includes("dry-run progress Power") && line.includes("create") && line.includes("page 6")));
});

test("progress push reuses existing read rows and skips regressions", async () => {
  const { hardcover } = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-")));
  const writes = [];
  const row = { slug: "alice", books_password: "pw", hardcover_token: "token" };
  const userBooks = [{
    id: 10,
    book_id: 20,
    status_id: 2,
    edition_id: 30,
    edition: { id: 30, pages: 200 },
    book: { title: "Existing Book", contributions: [{ author: { name: "Jane Writer" } }] },
    user_book_reads: [{ id: 40, started_at: "2026-07-04", finished_at: null, progress_pages: 10 }]
  }];

  const pushed = await hardcover._test.pushReadingProgress(row, {
    log: () => {},
    books: [{ id: 1, title: "Calibre Title", authors: "Different Writer", identifiers: { hardcover: "20" }, epubPath: "/unused" }],
    userBooks,
    hash: () => "hash",
    progress: async () => ({ percentage: 0.25, timestamp: 1783185160 }),
    upsertRead: async (_token, userBook, payload) => writes.push({ userBook, payload })
  });
  assert.equal(pushed, 1);
  assert.equal(writes[0].userBook.id, 10);
  assert.deepEqual(writes[0].payload, {
    id: 40,
    edition_id: 30,
    progress_pages: 50,
    started_at: "2026-07-04",
    action_at: "2026-07-04T17:12:40.000Z"
  });

  const skipped = await hardcover._test.pushReadingProgress(row, {
    log: () => {},
    books: [{ id: 1, title: "Calibre Title", authors: "Different Writer", identifiers: { hardcover: "20" }, epubPath: "/unused" }],
    userBooks,
    hash: () => "hash",
    progress: async () => ({ percentage: 0.02, timestamp: 1783185160 }),
    upsertRead: async () => { throw new Error("should skip regression"); }
  });
  assert.equal(skipped, 0);
});

test("progress push skips unsafe Hardcover creation", async () => {
  const { hardcover } = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-")));
  const logs = [];
  const row = { slug: "alice", books_password: "pw", hardcover_token: "token" };
  const pushed = await hardcover._test.pushReadingProgress(row, {
    log: (line) => logs.push(line),
    books: [{ id: 9, title: "Anna Only", authors: "No Isbn", identifiers: { hardcover: "999" }, epubPath: "/unused" }],
    userBooks: [],
    hash: () => "hash",
    progress: async () => ({ percentage: 0.5, timestamp: 1783185160 }),
    resolveEdition: async () => { throw new Error("should not create from stored Hardcover id"); },
    createUserBook: async () => { throw new Error("should not create without exact identifier"); }
  });
  assert.equal(pushed, 0);
  assert.ok(logs.some((line) => line.includes("no stored Hardcover row for user")));
});
