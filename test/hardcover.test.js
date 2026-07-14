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

async function withFetch(fetch, callback) {
  const previous = global.fetch;
  global.fetch = fetch;
  try {
    return await callback();
  } finally {
    global.fetch = previous;
  }
}

function annaStats(statsByHash) {
  return async (url) => {
    const hash = String(url).split("/").pop();
    return { ok: true, json: async () => statsByHash[hash] || {} };
  };
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
  assert.equal(hardcover._test.editionIsbn({ isbn_13: "978-0-062010-61-2", isbn_10: "0062010619" }), "0062010619");
  assert.equal(hardcover._test.progressPages(0.023, 288), 6);
  assert.equal(hardcover._test.progressPages(0.003, 500), 1);
  assert.equal(hardcover._test.progressPages(0.003, 100), null);
  assert.equal(hardcover._test.progressPages(1.2, 100), null);
});

test("Anna candidate gate requires title and author identity", () => {
  const { hardcover } = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-")));
  const good = {
    title: "High Growth Handbook: Scaling Startups From 10 to 10,000 People",
    authors: "Gil, Elad",
    language: "English",
    format: "EPUB",
    hash: "hash"
  };
  assert.equal(hardcover._test.isEligibleCandidate(good, "High Growth Handbook", "Elad Gil"), true);
  assert.equal(hardcover._test.isEligibleCandidate({ ...good, title: "Some Other Book" }, "High Growth Handbook", "Elad Gil"), false);
  assert.equal(hardcover._test.isEligibleCandidate({ ...good, authors: "Other Person" }, "High Growth Handbook", "Elad Gil"), false);
  assert.equal(hardcover._test.isEligibleCandidate({ ...good, format: "PDF" }, "High Growth Handbook", "Elad Gil"), false);
  assert.equal(hardcover._test.isEligibleCandidate({ ...good, language: "Spanish" }, "High Growth Handbook", "Elad Gil"), false);
});

test("Anna candidate gate fails closed on weak title evidence", () => {
  const { hardcover } = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-")));
  const base = { authors: "Jeffrey Pfeffer", language: "English", format: "EPUB", hash: "hash" };
  assert.equal(hardcover._test.isEligibleCandidate({ ...base, title: "Power : why some people have it-- and others don't" }, "Power", "Jeffrey Pfeffer"), true);
  assert.equal(hardcover._test.isEligibleCandidate({ ...base, title: "7 Rules of Power : Surprising Advice" }, "Power", "Jeffrey Pfeffer"), false);
  assert.equal(hardcover._test.isEligibleCandidate({ ...base, title: "The Power of Habit" }, "Power", "Jeffrey Pfeffer"), false);
  assert.equal(hardcover._test.isEligibleCandidate({
    title: "快思慢想 = Thinking, Fast and Slow",
    authors: "康納曼 (Daniel Kahneman)",
    language: "English",
    format: "EPUB",
    hash: "hash"
  }, "Thinking, Fast and Slow", "Daniel Kahneman"), false);
});

test("Anna candidate title identity tolerates common release naming", () => {
  const { hardcover } = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-")));
  const base = { authors: "George Orwell", language: "English", format: "EPUB", hash: "hash" };
  assert.equal(hardcover._test.isEligibleCandidate({ ...base, title: "George Orwell - 1984" }, "1984", "George Orwell"), true);
  assert.equal(hardcover._test.isEligibleCandidate({ ...base, title: "Orwell, George - 1984 (Penguin)" }, "1984", "George Orwell"), true);
  assert.equal(hardcover._test.isEligibleCandidate({ ...base, title: "Animal Farm and 1984" }, "1984", "George Orwell"), false);
  assert.equal(hardcover._test.isEligibleCandidate({ ...base, title: "Dune Messiah", authors: "Frank Herbert" }, "Dune", "Frank Herbert"), false);
  assert.equal(hardcover._test.titleIdentityScore("George Orwell - 1984", "1984", "George Orwell"), 100);
});

test("Anna candidate ranking uses popularity only after identity eligibility", async () => {
  const { hardcover } = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-")));
  const base = { authors: "Jeffrey Pfeffer", language: "English", format: "EPUB" };
  const picked = await withFetch(annaStats({ wrong: { downloads_total: 999999 }, right: { downloads_total: 1 } }), () => hardcover._test.selectCandidate([
    { ...base, hash: "wrong", title: "7 Rules of Power : Surprising Advice" },
    { ...base, hash: "right", title: "Power : why some people have it-- and others don't" }
  ], "Power", "Jeffrey Pfeffer"));
  assert.equal(picked.hash, "right");
});

test("Anna candidate ranking prefers higher-download eligible files", async () => {
  const { hardcover } = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-")));
  const base = { title: "Thinking, Fast and Slow", authors: "Daniel Kahneman", language: "English", format: "EPUB" };
  const picked = await withFetch(annaStats({ low: { downloads_total: 10 }, high: { downloads_total: 1000 } }), () => hardcover._test.selectCandidate([
    { ...base, hash: "low" },
    { ...base, hash: "high" }
  ], "Thinking, Fast and Slow", "Daniel Kahneman"));
  assert.equal(picked.hash, "high");
});

test("Anna candidate ranking treats stats failures as neutral", async () => {
  const { hardcover } = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-")));
  const base = { title: "Power", authors: "Jeffrey Pfeffer", language: "English", format: "EPUB" };
  const picked = await withFetch(async () => { throw new Error("stats unavailable"); }, () => hardcover._test.selectCandidate([
    { ...base, hash: "first" },
    { ...base, hash: "second" }
  ], "Power", "Jeffrey Pfeffer"));
  assert.equal(picked.hash, "first");
});

test("Anna candidate ranking caches duplicate MD5 stats", async () => {
  const { hardcover } = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-")));
  let fetches = 0;
  const picked = await withFetch(async () => {
    fetches += 1;
    return { ok: true, json: async () => ({ downloads_total: 1 }) };
  }, () => hardcover._test.selectCandidate([
    { title: "Foo Bar Extra", authors: "Alice Brown", language: "English", format: "EPUB", hash: "same" },
    { title: "Foo Bar", authors: "Alice Brown", language: "English", format: "EPUB", hash: "same" }
  ], "Foo Bar", "Alice Brown"));
  assert.equal(picked.title, "Foo Bar Extra");
  assert.equal(fetches, 1);
});

test("Hardcover fulfillment prefers exact ISBN Anna branches before title search", async () => {
  const { hardcover, system } = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-")));
  const original = { ...system };
  const queries = [];
  Object.assign(system, {
    annas: (args) => {
      queries.push(args[1]);
      if (args[1] === "0441172717") return { status: 0, stderr: "", stdout: [
        "Book 1:",
        "Title: Dune",
        "Authors: Frank Herbert",
        "Language: English",
        "Format: EPUB",
        "Hash: right"
      ].join("\n") };
      if (args[1] === "9783423026185") return { status: 0, stderr: "", stdout: "" };
      throw new Error("title fallback should not run");
    }
  });
  try {
    const candidate = await withFetch(annaStats({ right: { downloads_total: 10 } }), () =>
      hardcover._test.findCandidate("Dune", "Frank Herbert", { isbn_10: "0441172717", isbn_13: "9783423026185" }));
    assert.equal(candidate.hash, "right");
    assert.equal(candidate._isbn, "0441172717");
    assert.deepEqual(queries, ["0441172717", "9783423026185"]);
  } finally {
    Object.assign(system, original);
  }
});

test("Hardcover fulfillment falls back to title search when ISBN branches have no EPUB", async () => {
  const { hardcover, system } = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-")));
  const original = { ...system };
  const queries = [];
  Object.assign(system, {
    annas: (args) => {
      queries.push(args[1]);
      if (args[1] === "0441172717") return { status: 0, stderr: "", stdout: [
        "Book 1:",
        "Title: Dune",
        "Authors: Frank Herbert",
        "Language: English",
        "Format: PDF",
        "Hash: pdf"
      ].join("\n") };
      if (args[1] === "9783423026185") return { status: 0, stderr: "", stdout: "" };
      if (args[1] === "Dune Frank Herbert epub english") return { status: 0, stderr: "", stdout: [
        "Book 1:",
        "Title: Dune",
        "Authors: Frank Herbert",
        "Language: English",
        "Format: EPUB",
        "Hash: fallback"
      ].join("\n") };
      throw new Error(`unexpected query: ${args[1]}`);
    }
  });
  try {
    const candidate = await withFetch(annaStats({ fallback: { downloads_total: 10 } }), () =>
      hardcover._test.findCandidate("Dune", "Frank Herbert", { isbn_10: "0441172717", isbn_13: "9783423026185" }));
    assert.equal(candidate.hash, "fallback");
    assert.equal(candidate._isbn, undefined);
    assert.deepEqual(queries, ["0441172717", "9783423026185", "Dune Frank Herbert epub english"]);
  } finally {
    Object.assign(system, original);
  }
});

test("Hardcover fulfillment reuses exact stored Hardcover ids only", async () => {
  const { hardcover, system } = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-")));
  const original = { ...system };
  const identifiers = [];
  Object.assign(system, {
    findBookByIdentifier: (key, value) => key === "hardcover" && Number(value) === 42 ? 99 : null,
    grantBookVisibility: (id, users) => (assert.equal(id, 99), users),
    addIdentifier: (id, key, value) => identifiers.push({ id, key, value }),
    importFiles: () => { throw new Error("existing book should not import"); }
  });
  try {
    const result = await withFetch(async () => ({ ok: true, text: async () => JSON.stringify({ data: { update_user_book: { id: 7 } } }) }), () =>
      hardcover._test.fulfillRequest({ slug: "alice", hardcover_token: "token" }, { id: 7, book_id: 42 }, "Power", "Jeffrey Pfeffer", { hash: "abc" }));
    assert.equal(result.calibre_book_id, 99);
    assert.deepEqual(identifiers, [{ id: 99, key: "hardcover", value: 42 }]);
  } finally {
    Object.assign(system, original);
  }
});

test("Hardcover fulfillment downloads new books with title filenames", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-"));
  const { hardcover, system } = load(dir);
  const original = { ...system };
  let importedPath;
  let importOptions;
  Object.assign(system, {
    findBookByIdentifier: () => null,
    annas: (_args, options) => {
      const filename = _args[2];
      fs.mkdirSync(path.join(dir, "downloads"), { recursive: true });
      fs.writeFileSync(path.join(dir, "downloads", filename), "epub");
      return { status: 0, stdout: "", stderr: "", ...options };
    },
    importFiles: (files, options) => {
      importedPath = files[0];
      importOptions = options;
      return [{ calibre_book_id: 55, users: ["alice"] }];
    },
    addIdentifier: () => {}
  });
  try {
    await withFetch(async () => ({ ok: true, text: async () => JSON.stringify({ data: { update_user_book: { id: 7 } } }) }), () =>
      hardcover._test.fulfillRequest({ slug: "alice", hardcover_token: "token" }, {
        id: 7,
        book_id: 42,
        edition: { isbn_13: "9780062010612" }
      }, "Power", "Jeffrey Pfeffer", { hash: "abc", _isbn: "9780062010612" }));
    assert.equal(path.basename(importedPath), "Power.epub");
    assert.equal(importOptions.isbn, "9780062010612");
  } finally {
    Object.assign(system, original);
  }
});

test("Hardcover GraphQL retries transient plain-text failures", async () => {
  const { hardcover } = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-")));
  let calls = 0;
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (callback) => (callback(), 0);
  try {
    const profile = await withFetch(async () => {
      calls += 1;
      return calls === 1
        ? { ok: false, status: 503, text: async () => "no available server" }
        : { ok: true, status: 200, text: async () => JSON.stringify({ data: { me: [{ id: 1, username: "neil" }] } }) };
    }, () => hardcover.verifyToken("token"));
    assert.deepEqual(profile, { id: 1, username: "neil" });
    assert.equal(calls, 2);
  } finally {
    global.setTimeout = originalSetTimeout;
  }
});

test("Hardcover search returns compact results in search rank order", async () => {
  const { hardcover } = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-")));
  const bodies = [];
  const responses = [
    { data: { search: { ids: [42, 7] } } },
    { data: { books: [
      { id: 7, title: "Second", release_year: null, users_count: 4, image: null, contributions: [{ author: { name: "Writer Two" } }] },
      { id: 42, title: "First", release_year: 2024, users_count: 1200,
        image: { url: "https://assets.hardcover.app/first.jpg", width: 600, height: 900 }, contributions: [
        { author: { name: "Writer One" } }, { author: { name: "An Editor" } }
      ] }
    ] } }
  ];
  const results = await withFetch(async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return { ok: true, status: 200, text: async () => JSON.stringify(responses.shift()) };
  }, () => hardcover.searchBooks("token", " ranked books "));
  assert.deepEqual(results, [
    { id: 42, title: "First", author: "Writer One", year: 2024, users_count: 1200, cover_url: "https://assets.hardcover.app/first.jpg" },
    { id: 7, title: "Second", author: "Writer Two", year: null, users_count: 4, cover_url: null }
  ]);
  assert.deepEqual(bodies[0].variables, { query: "ranked books", perPage: 25, page: 1 });
  assert.deepEqual(bodies[1].variables, { ids: [42, 7], limit: 50 });
});

test("Hardcover search follows a second API page up to the 50-result cap", async () => {
  const { hardcover } = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-")));
  const first = Array.from({ length: 25 }, (_, index) => index + 1);
  const ids = [...first, 26];
  const bodies = [];
  const responses = [
    { data: { search: { ids: first } } },
    { data: { search: { ids: [25, 26] } } },
    { data: { books: ids.map((id) => ({
      id, title: `Book ${id}`, release_year: 2000 + id, users_count: id,
      image: null, contributions: []
    })) } }
  ];
  const results = await withFetch(async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return { ok: true, status: 200, text: async () => JSON.stringify(responses.shift()) };
  }, () => hardcover.searchBooks("token", "many books"));
  assert.equal(results.length, 26);
  assert.deepEqual(results.map((book) => book.id), ids);
  assert.deepEqual(bodies[1].variables, { query: "many books", perPage: 25, page: 2 });
  assert.deepEqual(bodies[2].variables, { ids, limit: 50 });
});

test("Hardcover request is idempotent for existing Want to Read books", async () => {
  const { hardcover } = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-")));
  let calls = 0;
  const result = await withFetch(async () => {
    calls += 1;
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: { me: [{ user_books: [{
      id: 9, book_id: 42, status_id: 1,
      book: { title: "Queued", contributions: [{ author: { name: "An Author" } }] }
    }] }] } }) };
  }, () => hardcover.requestBook("token", 42));
  assert.deepEqual(result, { status: "queued", existing: true, book: { id: 42, title: "Queued", author: "An Author" } });
  assert.equal(calls, 1);
});

test("Hardcover request inserts a new Want to Read book", async () => {
  const { hardcover } = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-")));
  const bodies = [];
  const responses = [
    { data: { me: [{ user_books: [] }] } },
    { data: { insert_user_book: { error: null, user_book: {
      book_id: 42, book: { title: "Requested", contributions: [{ author: { name: "An Author" } }] }
    } } } }
  ];
  const result = await withFetch(async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return { ok: true, status: 200, text: async () => JSON.stringify(responses.shift()) };
  }, () => hardcover.requestBook("token", 42));
  assert.deepEqual(result, { status: "queued", existing: false, book: { id: 42, title: "Requested", author: "An Author" } });
  assert.deepEqual(bodies[1].variables, { object: { book_id: 42, status_id: 1 } });
});

test("Hardcover GraphQL retries transient GraphQL errors", async () => {
  const { hardcover } = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-")));
  let calls = 0;
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (callback) => (callback(), 0);
  try {
    const profile = await withFetch(async () => {
      calls += 1;
      return calls === 1
        ? { ok: true, status: 200, text: async () => JSON.stringify({ errors: [{ message: "no available server" }] }) }
        : { ok: true, status: 200, text: async () => JSON.stringify({ data: { me: [{ id: 1, username: "neil" }] } }) };
    }, () => hardcover.verifyToken("token"));
    assert.deepEqual(profile, { id: 1, username: "neil" });
    assert.equal(calls, 2);
  } finally {
    global.setTimeout = originalSetTimeout;
  }
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
