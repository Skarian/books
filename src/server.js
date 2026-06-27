const express = require("express");
const config = require("./config");
const state = require("./state");

const app = express();

const css = `
body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f7f5f1;color:#191815}
a{color:#166157;text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:960px;margin:0 auto;padding:24px}.top{margin-bottom:18px}.brand{font-size:26px;font-weight:720}.muted{color:#655f57}
.hero,.card{background:#fff;border:1px solid #ded8cf;border-radius:8px;padding:18px;margin-bottom:14px}
.hero h1{margin:0 0 8px;font-size:30px;line-height:1.1}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}
.field{border:1px solid #e2dbd1;background:#fbfaf7;border-radius:8px;padding:10px;margin-top:8px}
.field b{display:block;font-size:12px;color:#635b52;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em}
.field span,.code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}
.button{display:inline-block;background:#1f5f55;color:#fff;padding:10px 14px;border-radius:6px;border:0;font-weight:650;margin-top:10px}.button:hover{text-decoration:none;background:#184c44}
ol{padding-left:20px}li,p{line-height:1.5}@media(max-width:720px){.wrap{padding:16px}.hero h1{font-size:26px}}
`;

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sendHtml(res, title, body, status = 200) {
  res.status(status)
    .set("Content-Type", "text/html; charset=utf-8")
    .set("Cache-Control", "no-store")
    .set("Referrer-Policy", "no-referrer")
    .send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>${css}</style></head><body><main class="wrap">${body}</main></body></html>`);
}

function parseBasicAuth(req) {
  const header = req.get("authorization") || "";
  if (!header.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const index = decoded.indexOf(":");
    if (index < 0) return null;
    return { username: decoded.slice(0, index), password: decoded.slice(index + 1) };
  } catch {
    return null;
  }
}

function requireSetupAuth(req, res) {
  const row = state.getAccount(req.params.user);
  if (row.status !== "active") throw new Error("Account is not active.");
  const credentials = parseBasicAuth(req);
  if (!credentials || credentials.username !== state.serviceUser(row) || credentials.password !== state.servicePassword(row)) {
    res.status(401).set("WWW-Authenticate", 'Basic realm="Books setup"').end();
    return null;
  }
  return row;
}

app.get("/healthz", (_req, res) => {
  res.type("text/plain").send("ok\n");
});

app.get("/setup/:user", (req, res) => {
  let row;
  try {
    row = requireSetupAuth(req, res);
  } catch {
    sendHtml(res, "Not found", '<section class="card"><h1>Not found</h1></section>', 404);
    return;
  }
  if (!row) return;
  const user = state.serviceUser(row);
  const password = state.servicePassword(row);
  const hardcover = row.hardcover_sync_enabled && row.hardcover_username
    ? `<p>Book requests use Hardcover. Add a book to Want to Read in Hardcover account <span class="code">${esc(row.hardcover_username)}</span>; the server checks every five minutes.</p>`
    : "<p>Book requests use Hardcover. Ask Neil to connect your Hardcover account before using Want to Read as your request list.</p>";
  sendHtml(res, `Setup ${row.display_name}`, `
    <div class="top"><div class="brand">Neil's Books for ${esc(row.display_name)}</div><div class="muted">shared books, private reading place</div></div>
    <section class="hero">
      <h1>Start here</h1>
      <p>Use this one Books login for the catalog and reading-position sync. Readest still has its own account.</p>
      <div class="grid">
        <div class="field"><b>Username</b><span>${esc(user)}</span></div>
        <div class="field"><b>Password</b><span>${esc(password)}</span></div>
      </div>
      <a class="button" href="https://web.readest.com/">Open Readest</a>
    </section>
    <section class="card">
      <h2>Add the catalog</h2>
      <ol>
        <li>Open Readest, then Settings, then Integrations.</li>
        <li>Open OPDS Catalogs and add the catalog below.</li>
        <li>Use the Books username and password from this page.</li>
      </ol>
      <div class="field"><b>Catalog URL</b><span>https://${esc(config.publicHost)}/catalog</span></div>
    </section>
    <section class="card">
      <h2>Turn on progress sync</h2>
      <ol>
        <li>Open KOReader Sync in Readest integrations.</li>
        <li>Use the server below with the same Books username and password.</li>
        <li>Leave Checksum Method set to File Content.</li>
      </ol>
      <div class="field"><b>KOSync server</b><span>https://${esc(config.publicHost)}/kosync</span></div>
    </section>
    <section class="card">
      <h2>Book requests</h2>
      ${hardcover}
    </section>
    <section class="card">
      <h2>Test sync once</h2>
      <p>Open <b>Books Sync Fixture</b> from the catalog on two devices. Move to Sync marker three on one device, sync, then pull progress on the other device.</p>
    </section>
  `);
});

app.use((_req, res) => {
  sendHtml(res, "Not found", '<section class="card"><h1>Not found</h1></section>', 404);
});

app.listen(config.nodePort, "127.0.0.1", () => {
  console.log(`books-node listening on 127.0.0.1:${config.nodePort}`);
});
