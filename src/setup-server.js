const fs = require("fs");
const http = require("http");
const koreader = require("./koreader");
const state = require("./state");

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
    return koreader.BUNDLES[name] ? { name } : null;
  } catch {
    return null;
  }
}

function isKoreaderPage(req) {
  try {
    return ["/koreader", "/koreader/"].includes(new URL(req.url, "http://books.local").pathname);
  } catch {
    return false;
  }
}

function setupPage() {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KOReader setup</title>
<style>
body{font-family:system-ui,sans-serif;max-width:42rem;margin:3rem auto;padding:0 1rem;line-height:1.45}
a{display:block;margin:.75rem 0;padding:.85rem 1rem;border:1px solid #ccc;border-radius:6px;color:#111;text-decoration:none}
</style>
</head>
<body>
<h1>KOReader setup</h1>
<p>Download the setup ZIP for this device, extract it at the device storage root, then restart KOReader.</p>
<a href="/setup/koreader-android-kindle.zip">Android (GitHub APK) or Kindle</a>
<a href="/setup/koreader-kobo.zip">Kobo</a>
</body>
</html>
`;
}

function serve(req, res, options = {}) {
  if (req.method !== "GET") {
    res.writeHead(404, { "Cache-Control": "private, no-store" });
    res.end("not found\n");
    return;
  }
  if (isKoreaderPage(req)) {
    const row = authenticatedAccount(req);
    if (!row) return unauthorized(res);
    res.writeHead(200, {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/html; charset=utf-8"
    });
    res.end(setupPage());
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
    output = koreader.generate(row, bundle.name, options);
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
    koreader.cleanup(output);
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
