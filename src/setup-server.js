const fs = require("fs");
const http = require("http");
const crosspoint = require("./crosspoint");
const koreader = require("./koreader");
const readest = require("./readest");
const state = require("./state");
const ai = require("./ai");
const hardcover = require("./hardcover");

function unauthorized(res) {
  res.writeHead(401, {
    "WWW-Authenticate": 'Basic realm="Books setup"',
    "Cache-Control": "private, no-store"
  });
  res.end("authentication required\n");
}

function basicCredentials(header) {
  if (!header || !header.startsWith("Basic ")) return null;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const split = decoded.indexOf(":");
  if (split < 0) return null;
  return { user: decoded.slice(0, split), password: decoded.slice(split + 1) };
}

function authenticatedAccount(req) {
  const credentials = basicCredentials(req.headers.authorization);
  if (!credentials) return null;
  try {
    const row = state.getAccount(credentials.user);
    return row.books_password === credentials.password ? row : null;
  } catch {
    return null;
  }
}

function requestedBundle(req) {
  try {
    const parts = new URL(req.url, "http://books.local").pathname.split("/").filter(Boolean);
    if (parts.length !== 2 || parts[0] !== "setup") return null;
    const name = decodeURIComponent(parts[1]);
    if (koreader.BUNDLES[name]) return { name, generator: koreader };
    if (name === "crosspoint.zip") return { name, generator: crosspoint };
    if (name === "readest.zip") return { name, generator: readest };
    return null;
  } catch {
    return null;
  }
}

function isPage(req, paths) {
  try {
    return paths.includes(new URL(req.url, "http://books.local").pathname);
  } catch {
    return false;
  }
}

async function readJson(req) {
  let body = "";
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) throw new Error("request too large");
    body += chunk;
  }
  return JSON.parse(body || "{}");
}

async function aiLookup(req, res, options) {
  if (!ai.enabled()) {
    res.writeHead(404, { "Cache-Control": "private, no-store" });
    res.end("not found\n");
    return;
  }
  if (!authenticatedAccount(req)) return unauthorized(res);
  try {
    const entry = await (options.aiLookup || ai.lookup)(await readJson(req));
    res.writeHead(200, {
      "Cache-Control": "private, no-store",
      "Content-Type": "application/json; charset=utf-8"
    });
    res.end(`${JSON.stringify(entry)}\n`);
  } catch (error) {
    const status = error instanceof SyntaxError || error.message === "request too large" ? 400 : 503;
    res.writeHead(status, { "Cache-Control": "private, no-store" });
    res.end(status === 400 ? "bad request\n" : "lookup failed\n");
  }
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Cache-Control": "private, no-store",
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });
  res.end(`${JSON.stringify(body)}\n`);
}

async function requestsApi(req, res, options, action) {
  const row = authenticatedAccount(req);
  if (!row) return json(res, 401, { error: "unauthorized" }, { "WWW-Authenticate": 'Basic realm="Books requests"' });
  if (!row.hardcover_token) return json(res, 409, { error: "hardcover_not_configured" });
  try {
    const input = await readJson(req);
    if (action === "search") {
      const results = await (options.searchBooks || hardcover.searchBooks)(row.hardcover_token, input.query);
      return json(res, 200, { results });
    }
    const result = await (options.requestBook || hardcover.requestBook)(row.hardcover_token, input.book_id);
    return json(res, 200, result);
  } catch (error) {
    if (error.code === "already_in_library") {
      const statuses = { 1: "want_to_read", 2: "currently_reading", 3: "read", 5: "did_not_finish" };
      return json(res, 409, {
        error: error.code,
        book_status: statuses[error.statusId] || "unknown",
        status_id: error.statusId
      });
    }
    if (error instanceof SyntaxError || error.message === "request too large"
        || /^(Search query|book_id)/.test(error.message)) {
      return json(res, 400, { error: "invalid_request" });
    }
    return json(res, 502, { error: "hardcover_unavailable" });
  }
}

function page(title, body) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:42rem;margin:3rem auto;padding:0 1rem;line-height:1.45}
a{display:block;margin:.75rem 0;padding:.85rem 1rem;border:1px solid #ccc;border-radius:6px;color:#111;text-decoration:none}
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

function koreaderPage() {
  return page("KOReader setup", `
<h1>KOReader setup</h1>
<p>Download the setup ZIP for this device, extract it at the device storage root, then restart KOReader.</p>
<a href="/setup/koreader-android-kindle.zip">Android (GitHub APK) or Kindle</a>
<a href="/setup/koreader-kobo.zip">Kobo</a>
`);
}

function readestPage() {
  return page("Readest setup", `
<h1>Readest setup</h1>
<p>Download the restore ZIP, then in Readest use Advanced Settings -> Backup & Restore -> Restore Library.</p>
<a href="/setup/readest.zip">Readest restore ZIP</a>
`);
}

function crosspointPage() {
  return page("CrossPoint setup", `
<h1>CrossPoint setup</h1>
<p>This CrossPoint 1.4.1 fresh-device preset replaces CrossPoint preferences, OPDS servers, and KOSync credentials. It installs the Books profile and Literata font.</p>
<p>The ZIP contains your Books password. Extract it at the SD card root, restart CrossPoint, then delete the downloaded ZIP.</p>
<a href="/setup/crosspoint.zip">Books + CrossPoint 1.4.1 preset</a>
`);
}

function serve(req, res, options = {}) {
  if (req.method === "POST" && isPage(req, ["/requests/search"])) {
    requestsApi(req, res, options, "search");
    return;
  }
  if (req.method === "POST" && isPage(req, ["/requests/submit"])) {
    requestsApi(req, res, options, "submit");
    return;
  }
  if (req.method === "POST" && isPage(req, ["/ai-dictionary/lookup"])) {
    aiLookup(req, res, options);
    return;
  }
  if (req.method !== "GET") {
    res.writeHead(404, { "Cache-Control": "private, no-store" });
    res.end("not found\n");
    return;
  }
  if (isPage(req, ["/koreader", "/koreader/"]) || isPage(req, ["/readest", "/readest/"]) || isPage(req, ["/crosspoint", "/crosspoint/"])) {
    const row = authenticatedAccount(req);
    if (!row) return unauthorized(res);
    res.writeHead(200, {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/html; charset=utf-8"
    });
    if (isPage(req, ["/readest", "/readest/"])) return res.end(readestPage());
    res.end(isPage(req, ["/crosspoint", "/crosspoint/"]) ? crosspointPage() : koreaderPage());
    return;
  }
  const bundle = requestedBundle(req);
  if (!bundle) {
    res.writeHead(404, { "Cache-Control": "private, no-store" });
    res.end("not found\n");
    return;
  }
  const row = authenticatedAccount(req);
  if (!row) return unauthorized(res);
  let output;
  try {
    output = bundle.generator.generate(row, bundle.name, options);
  } catch {
    res.writeHead(502, { "Cache-Control": "private, no-store" });
    res.end("setup generation failed\n");
    return;
  }
  const stat = fs.statSync(output.path);
  res.writeHead(200, {
    "Cache-Control": "private, no-store",
    "Content-Disposition": `attachment; filename="${bundle.name}"`,
    "Content-Length": stat.size,
    "Content-Type": "application/zip"
  });
  let cleaned = false;
  const clean = () => {
    if (cleaned) return;
    cleaned = true;
    bundle.generator.cleanup(output);
  };
  res.on("finish", clean);
  res.on("close", clean);
  fs.createReadStream(output.path).pipe(res);
}

if (require.main === module) {
  http.createServer(serve).listen(3000, "0.0.0.0", () => {
    console.log("setup server listening on 3000");
  });
}

module.exports = {
  serve
};
