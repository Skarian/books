const assert = require("node:assert/strict");
const test = require("node:test");

function loadAi() {
  process.env.BOOKS_AI_PROVIDER = "openai";
  process.env.BOOKS_AI_MODEL = "test-model";
  process.env.OPENAI_API_KEY = "test-key";
  for (const mod of ["../src/ai", "../src/config"]) delete require.cache[require.resolve(mod)];
  return require("../src/ai");
}

function sse(value) {
  const chunk = Buffer.from(`data: ${JSON.stringify({ delta: JSON.stringify(value) })}\n\n`);
  return {
    ok: true,
    status: 200,
    body: {
      async *[Symbol.asyncIterator]() {
        yield chunk;
      }
    }
  };
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

test("book candidate selection sends ranked evidence without web tools", async () => {
  const ai = loadAi();
  const selected = "11111111111111111111111111111111";
  const other = "22222222222222222222222222222222";
  let request;
  const result = await withFetch(async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return sse({ selected_md5: selected, reason: "Best complete-work match with strong popularity." });
  }, () => ai.selectBookCandidate({
    title: "Requested Work",
    author: "A. Writer",
    isbn_10: "1234567890",
    isbn_13: "9781234567897"
  }, [{
    hash: selected,
    title: "Requested Work",
    authors: "A. Writer",
    language: "English",
    format: "EPUB",
    _isbn: "9781234567897",
    _annaRank: 0,
    _annaStats: { downloads_total: 900, great_quality_count: 4, lists_count: 3, reports_count: 0 }
  }, {
    hash: other,
    title: "Requested Work Collection",
    authors: "A. Writer",
    language: "English",
    format: "EPUB",
    _annaRank: 1,
    _annaStats: { downloads_total: 1200, great_quality_count: 2, lists_count: 1, reports_count: 1 }
  }]));

  assert.equal(request.url, "https://api.openai.com/v1/responses");
  assert.equal(request.body.model, "test-model");
  assert.equal(request.body.tools, undefined);
  assert.equal(request.body.tool_choice, undefined);
  const prompt = request.body.input[0].content[0].text;
  assert.match(prompt, /Choose exactly one supplied candidate/);
  assert.match(prompt, /download popularity as the strongest quality proxy/);
  assert.match(prompt, /"downloads":900/);
  assert.match(prompt, /"isbn_provenance":"9781234567897"/);
  assert.deepEqual(result, { selected_md5: selected, reason: "Best complete-work match with strong popularity." });
});

test("book candidate selection rejects an MD5 outside the supplied set", async () => {
  const ai = loadAi();
  await assert.rejects(() => withFetch(async () => sse({
    selected_md5: "ffffffffffffffffffffffffffffffff",
    reason: "Not supplied."
  }), () => ai.selectBookCandidate({ title: "Requested Work", author: "A. Writer" }, [{
    hash: "33333333333333333333333333333333",
    title: "Requested Work",
    authors: "A. Writer",
    language: "English",
    format: "EPUB"
  }])), /invalid candidate selection/);
});

test("dictionary lookup retains its web-search request and response contract", async () => {
  const ai = loadAi();
  let body;
  const result = await withFetch(async (_url, options) => {
    body = JSON.parse(options.body);
    return sse({ label: "noun", definitions: ["A concise meaning."] });
  }, () => ai.lookup({
    selection: "term",
    passage: "The term appeared in this passage.",
    book: "A Book",
    chapter: "One",
    progress: "10%"
  }));
  assert.deepEqual(body.tools, [{ type: "web_search", external_web_access: true, search_context_size: "medium" }]);
  assert.equal(body.tool_choice, "auto");
  assert.deepEqual(result, { label: "noun", definitions: ["A concise meaning."] });
});
