const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

function resetModules() {
  for (const mod of ["../src/hardcover", "../src/shelfmark", "../src/ai", "../src/system", "../src/state", "../src/config"]) {
    delete require.cache[require.resolve(mod)];
  }
}

function load(dir) {
  resetModules();
  process.env.BOOKS_DATA_DIR = dir;
  process.env.BOOKS_PUBLIC_HOST = "books.test";
  return {
    hardcover: require("../src/hardcover"),
    shelfmark: require("../src/shelfmark"),
    ai: require("../src/ai"),
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

test("Anna candidate ranking prefers higher-download files", async () => {
  const { hardcover } = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-")));
  const base = { title: "Thinking, Fast and Slow", authors: "Daniel Kahneman", language: "English", format: "EPUB" };
  const low = "11111111111111111111111111111111";
  const high = "22222222222222222222222222222222";
  const ranked = await withFetch(annaStats({ [low]: { downloads_total: 10 }, [high]: { downloads_total: 1000 } }), () => hardcover._test.rankCandidates([
    { ...base, hash: low },
    { ...base, hash: high }
  ], "Thinking, Fast and Slow"));
  assert.equal(ranked[0].hash, high);
});

test("Anna candidate ranking treats stats failures as neutral", async () => {
  const { hardcover } = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-")));
  const base = { title: "Power", authors: "Jeffrey Pfeffer", language: "English", format: "EPUB" };
  const first = "33333333333333333333333333333333";
  const second = "44444444444444444444444444444444";
  const ranked = await withFetch(async () => { throw new Error("stats unavailable"); }, () => hardcover._test.rankCandidates([
    { ...base, hash: first },
    { ...base, hash: second }
  ], "Power"));
  assert.equal(ranked[0].hash, first);
});

test("Anna candidate ranking caches duplicate MD5 stats", async () => {
  const { hardcover } = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-")));
  let fetches = 0;
  const hash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const ranked = await withFetch(async () => {
    fetches += 1;
    return { ok: true, json: async () => ({ downloads_total: 1 }) };
  }, () => hardcover._test.rankCandidates([
    { title: "Foo Bar Extra", authors: "Alice Brown", language: "English", format: "EPUB", hash },
    { title: "Foo Bar", authors: "Alice Brown", language: "English", format: "EPUB", hash: hash.toUpperCase() }
  ], "Foo Bar"));
  assert.equal(ranked[0].title, "Foo Bar Extra");
  assert.equal(fetches, 1);
});

test("candidate selection uses AI for multiple candidates in deterministic rank order", async () => {
  const { hardcover, ai } = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-")));
  const original = ai.selectBookCandidate;
  const popular = "66666666666666666666666666666666";
  const selected = "77777777777777777777777777777777";
  let supplied;
  ai.selectBookCandidate = async (book, candidates) => {
    supplied = { book, candidates };
    return { selected_md5: selected, reason: "Closer match to the requested work." };
  };
  try {
    const picked = await withFetch(annaStats({
      [popular]: { downloads_total: 1000 },
      [selected]: { downloads_total: 100 }
    }), () => hardcover._test.selectCandidate([
      { title: "Requested Work Collection", authors: "A. Writer", language: "English", format: "EPUB", hash: popular },
      { title: "Requested Work", authors: "A. Writer", language: "English", format: "EPUB", hash: selected }
    ], "Requested Work", "A. Writer", { isbn_13: "9781234567897" }));
    assert.deepEqual(supplied.candidates.map((item) => item.hash), [popular, selected]);
    assert.equal(supplied.book.isbn_13, "9781234567897");
    assert.equal(picked.hash, selected);
    assert.equal(picked._candidateCount, 2);
    assert.equal(picked._selectionReason, "Closer match to the requested work.");
  } finally {
    ai.selectBookCandidate = original;
  }
});

test("candidate selection skips AI for zero or one candidate", async () => {
  const { hardcover, ai } = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-")));
  const original = ai.selectBookCandidate;
  ai.selectBookCandidate = async () => { throw new Error("AI should not run"); };
  try {
    await assert.rejects(() => hardcover._test.selectCandidate([], "Missing", "A. Writer"), /No English EPUB candidate/);
    const hash = "88888888888888888888888888888888";
    const picked = await withFetch(annaStats({ [hash]: { downloads_total: 10 } }), () => hardcover._test.selectCandidate([
      { title: "Only Work", authors: "A. Writer", language: "English", format: "EPUB", hash }
    ], "Only Work", "A. Writer"));
    assert.equal(picked.hash, hash);
    assert.equal(picked._selectionReason, "only candidate");
  } finally {
    ai.selectBookCandidate = original;
  }
});

test("candidate selection fails without a heuristic fallback when AI fails", async () => {
  const { hardcover, ai } = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-")));
  const original = ai.selectBookCandidate;
  ai.selectBookCandidate = async () => { throw new Error("provider unavailable"); };
  const base = { title: "Requested Work", authors: "A. Writer", language: "English", format: "EPUB" };
  try {
    await assert.rejects(() => withFetch(annaStats({}), () => hardcover._test.selectCandidate([
      { ...base, hash: "99999999999999999999999999999999" },
      { ...base, hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
    ], "Requested Work", "A. Writer")), /provider unavailable/);
  } finally {
    ai.selectBookCandidate = original;
  }
});

test("Hardcover fulfillment prefers exact ISBN Anna branches before title search", async () => {
  const { hardcover, shelfmark } = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-")));
  const original = { ...shelfmark };
  const queries = [];
  Object.assign(shelfmark, {
    searchReleases: async (query) => {
      queries.push(query);
      if (query === "0441172717") return [{
        source: "direct_download",
        source_id: "11111111111111111111111111111111",
        title: "Dune",
        extra: { author: "Frank Herbert" },
        language: "English",
        format: "EPUB"
      }];
      if (query === "9783423026185") return [];
      throw new Error("title fallback should not run");
    }
  });
  try {
    const candidate = await withFetch(annaStats({ "11111111111111111111111111111111": { downloads_total: 10 } }), () =>
      hardcover._test.findCandidate("Dune", "Frank Herbert", { isbn_10: "0441172717", isbn_13: "9783423026185" }));
    assert.equal(candidate.hash, "11111111111111111111111111111111");
    assert.equal(candidate._isbn, "0441172717");
    assert.deepEqual(queries, ["0441172717", "9783423026185"]);
  } finally {
    Object.assign(shelfmark, original);
  }
});

test("Hardcover fulfillment falls back to title search when ISBN branches have no EPUB", async () => {
  const { hardcover, shelfmark } = load(fs.mkdtempSync(path.join(os.tmpdir(), "books-hardcover-test-")));
  const original = { ...shelfmark };
  const queries = [];
  Object.assign(shelfmark, {
    searchReleases: async (query) => {
      queries.push(query);
      if (query === "0441172717") return [{
        source_id: "22222222222222222222222222222222",
        title: "Dune",
        extra: { author: "Frank Herbert" },
        language: "English",
        format: "PDF"
      }];
      if (query === "9783423026185") return [];
      if (query === "Dune Frank Herbert") return [{
        source_id: "33333333333333333333333333333333",
        title: "Dune",
        extra: { author: "Frank Herbert" },
        language: "English",
        format: "EPUB"
      }];
      throw new Error(`unexpected query: ${query}`);
    }
  });
  try {
    const candidate = await withFetch(annaStats({ "33333333333333333333333333333333": { downloads_total: 10 } }), () =>
      hardcover._test.findCandidate("Dune", "Frank Herbert", { isbn_10: "0441172717", isbn_13: "9783423026185" }));
    assert.equal(candidate.hash, "33333333333333333333333333333333");
    assert.equal(candidate._isbn, undefined);
    assert.deepEqual(queries, ["0441172717", "9783423026185", "Dune Frank Herbert"]);
  } finally {
    Object.assign(shelfmark, original);
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
  const { hardcover, shelfmark, system } = load(dir);
  const original = { ...system };
  const originalShelfmark = { ...shelfmark };
  let importedPath;
  let importOptions;
  Object.assign(system, {
    findBookByIdentifier: () => null,
    importFiles: (files, options) => {
      importedPath = files[0];
      importOptions = options;
      return [{ calibre_book_id: 55, users: ["alice"] }];
    },
    addIdentifier: () => {}
  });
  Object.assign(shelfmark, {
    downloadRelease: async (_release, requestedTitle) => {
      const staged = path.join(dir, "shelfmark", "downloads", `${requestedTitle}.epub`);
      fs.mkdirSync(path.dirname(staged), { recursive: true });
      fs.writeFileSync(staged, "epub");
      return staged;
    }
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
    Object.assign(shelfmark, originalShelfmark);
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
