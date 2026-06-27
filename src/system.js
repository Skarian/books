const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const config = require("./config");
const state = require("./state");

function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.stdio || "pipe",
    cwd: options.cwd,
    env: options.env || process.env
  });
  if (options.check !== false && result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(output || `${command} ${args.join(" ")} failed with ${result.status}`);
  }
  return result;
}

function ensureDir(dir, mode = 0o750) {
  fs.mkdirSync(dir, { recursive: true, mode });
}

function calibreUsers() {
  const result = run("calibre-server", ["--userdb", config.userDb, "--manage-users", "--", "list"], { check: false });
  return result.status === 0 ? result.stdout.split(/\r?\n/).filter(Boolean) : [];
}

function calibreUserExists(user) {
  return calibreUsers().includes(user);
}

function calibreSetUser(user, password, readonly) {
  if (calibreUserExists(user)) {
    run("calibre-server", ["--userdb", config.userDb, "--manage-users", "--", "chpass", user, password]);
  } else {
    const args = ["--userdb", config.userDb, "--manage-users", "--", "add", user, password];
    if (readonly) args.push("--readonly");
    run("calibre-server", args);
  }
  run("calibre-server", ["--userdb", config.userDb, "--manage-users", "--", "readonly", user, readonly ? "set" : "reset"]);
  run("calibre-server", ["--userdb", config.userDb, "--manage-users", "--", "change_set_password", user, readonly ? "reset" : "set"]);
}

function calibreRemoveUser(user) {
  if (calibreUserExists(user)) {
    run("calibre-server", ["--userdb", config.userDb, "--manage-users", "--", "remove", user], { check: false });
  }
}

function dockerRedis(args, check = true) {
  return run("docker", ["exec", config.kosyncContainer, "redis-cli", "-n", "1", ...args], { check });
}

function kosyncSetUser(user, rawPassword) {
  dockerRedis(["SET", `user:${user}:key`, state.md5(rawPassword)]);
}

function kosyncDisableUser(user) {
  dockerRedis(["DEL", `user:${user}:key`], false);
}

function kosyncPurgeUser(user) {
  const result = dockerRedis(["--scan", "--pattern", `user:${user}:*`], false);
  const keys = result.stdout.split(/\r?\n/).filter(Boolean);
  if (keys.length) dockerRedis(["DEL", ...keys], false);
}

function reconcileAccount(row) {
  const username = state.serviceUser(row);
  const password = state.servicePassword(row);
  if (row.status === "active") {
    calibreSetUser(username, password, true);
    if (row.opds_user && row.opds_user !== username) calibreRemoveUser(row.opds_user);
    kosyncSetUser(username, password);
    if (row.kosync_user && row.kosync_user !== username) kosyncDisableUser(row.kosync_user);
    return `reconciled active user ${row.slug}`;
  }
  calibreSetUser(username, state.randomPassword(), false);
  if (row.opds_user && row.opds_user !== username) calibreSetUser(row.opds_user, state.randomPassword(), false);
  kosyncDisableUser(username);
  if (row.kosync_user) kosyncDisableUser(row.kosync_user);
  return `disabled service access for ${row.slug}`;
}

function reconcile(slug) {
  const rows = slug ? [state.getAccount(slug)] : state.listAccounts();
  return rows.map(reconcileAccount);
}

function annas(args, options = {}) {
  if (!config.annasSecretKey) throw new Error(`ANNAS_SECRET_KEY is not configured in ${config.ENV_FILE}.`);
  ensureDir(config.annasDownloadPath, 0o770);
  const env = {
    ...process.env,
    ANNAS_SECRET_KEY: config.annasSecretKey,
    ANNAS_DOWNLOAD_PATH: config.annasDownloadPath,
    ANNAS_BASE_URL: config.annasBaseUrl
  };
  return run("runuser", ["-u", "books", "--", "env", ...Object.entries(env)
    .filter(([key]) => key.startsWith("ANNAS_"))
    .map(([key, value]) => `${key}=${value}`), config.annasBin, ...args], options);
}

function importFiles(files, convert = false) {
  ensureDir(config.libraryDir, 0o770);
  ensureDir(config.importDir, 0o770);
  const passwordDir = fs.mkdtempSync(path.join(os.tmpdir(), "books-calibre-"));
  const passwordFile = path.join(passwordDir, "password");
  fs.writeFileSync(passwordFile, config.calibreAdminPassword, { mode: 0o600 });
  const libraryUrl = `http://127.0.0.1:${config.calibrePort}/#${config.calibreLibraryId}`;
  try {
    for (const input of files) {
      if (!fs.existsSync(input) || !fs.statSync(input).isFile()) throw new Error(`Not a file: ${input}`);
      const extension = path.extname(input).slice(1).toLowerCase();
      let importFile = input;
      if (extension !== "epub") {
        if (!convert) {
          console.error(`Skipping non-EPUB file without --convert: ${input}`);
          continue;
        }
        const safeName = path.basename(input, path.extname(input)).replace(/[^A-Za-z0-9._ -]+/g, "").trim() || "book";
        importFile = path.join(config.importDir, `${safeName}.epub`);
        run("ebook-convert", [input, importFile]);
      }
      run("calibredb", [
        "--with-library", libraryUrl,
        "--username", config.calibreAdminUser,
        "--password", `<f:${passwordFile}>`,
        "add",
        "--automerge", "overwrite",
        "--languages", config.defaultLanguage,
        "--tags", config.defaultTags,
        importFile
      ]);
    }
  } finally {
    fs.rmSync(passwordDir, { recursive: true, force: true });
  }
}

function writeFile(root, name, content) {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function chapter(title, paragraphs) {
  const body = paragraphs.map((text) => `    <p>${text}</p>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
  <head>
    <title>${title}</title>
    <style>
      body { font-family: serif; line-height: 1.55; margin: 2em; }
      h1 { margin-bottom: 1em; }
      p { margin: 0 0 1em; }
    </style>
  </head>
  <body>
    <h1>${title}</h1>
${body}
  </body>
</html>
`;
}

function writeSyncFixture(output) {
  const title = "Books Sync Fixture";
  const author = "Neil's Books";
  const identifier = "urn:uuid:1c156b10-24c7-4a3c-a606-7f2e7f7c8c1a";
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "books-fixture-"));
  try {
    writeFile(workDir, "mimetype", "application/epub+zip");
    writeFile(workDir, "META-INF/container.xml", `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`);
    writeFile(workDir, "EPUB/package.opf", `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" unique-identifier="bookid" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${identifier}</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-06-26T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="chapter2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
    <item id="chapter3" href="chapter3.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chapter1"/>
    <itemref idref="chapter2"/>
    <itemref idref="chapter3"/>
  </spine>
</package>
`);
    writeFile(workDir, "EPUB/nav.xhtml", `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
  <head><title>Contents</title></head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>Contents</h1>
      <ol>
        <li><a href="chapter1.xhtml">Start here</a></li>
        <li><a href="chapter2.xhtml">Sync marker two</a></li>
        <li><a href="chapter3.xhtml">Sync marker three</a></li>
      </ol>
    </nav>
  </body>
</html>
`);
    writeFile(workDir, "EPUB/chapter1.xhtml", chapter("Start here", [
      "This is a generated EPUB for testing Neil's Books.",
      "It is not a real book. It exists so every device can download the same file from the catalog and try progress sync safely.",
      "Open this book on one device, move to a marker, then open the same book on another device and pull progress."
    ]));
    writeFile(workDir, "EPUB/chapter2.xhtml", chapter("Sync marker two", [
      "Marker two. Stop somewhere on this page when testing a short sync hop.",
      "If the second device lands here, the catalog and KOSync are talking about the same EPUB.",
      "If it opens at the beginning, check that both devices downloaded this book from the catalog."
    ]));
    writeFile(workDir, "EPUB/chapter3.xhtml", chapter("Sync marker three", [
      "Marker three. Use this page for the main test.",
      "Device one should push progress from here.",
      "Device two should pull progress and land close to this page.",
      "A small difference is fine. Opening at the beginning means sync did not work."
    ]));
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.rmSync(output, { force: true });
    run("zip", ["-X0", output, "mimetype"], { cwd: workDir });
    run("zip", ["-Xr9D", output, "META-INF", "EPUB"], { cwd: workDir });
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

async function fetchOk(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response;
}

async function health() {
  const row = state.firstActiveAccount();
  const user = row ? state.serviceUser(row) : config.calibreAdminUser;
  const password = row ? state.servicePassword(row) : config.calibreAdminPassword;
  const auth = Buffer.from(`${user}:${password}`).toString("base64");
  await fetchOk(`http://127.0.0.1:${config.proxyPort}/healthz`);
  await fetchOk(`http://127.0.0.1:${config.proxyPort}/opds`, { headers: { Authorization: `Basic ${auth}` } });
  await fetchOk(`http://127.0.0.1:${config.proxyPort}/kosync/healthcheck`, { headers: { Accept: "application/vnd.koreader.v1+json" } });
  return "ok";
}

async function verify(slug) {
  const row = slug ? state.getAccount(slug) : state.firstActiveAccount();
  if (!row) throw new Error('No active user exists. Create one with ./scripts/books users create "Name" --email person@example.com');
  const user = state.serviceUser(row);
  const password = state.servicePassword(row);
  const basic = Buffer.from(`${user}:${password}`).toString("base64");
  for (const service of ["books-calibre", "books-node", "books-kosync", "nginx"]) {
    run("systemctl", ["is-active", "--quiet", service]);
  }
  await fetchOk(`http://127.0.0.1:${config.proxyPort}/healthz`);
  const root = await fetch(`http://127.0.0.1:${config.proxyPort}/`);
  if (root.status !== 404) throw new Error(`root route returned ${root.status}, expected 404`);
  const library = await fetch(`http://127.0.0.1:${config.proxyPort}/library`, { redirect: "manual" });
  if (![301, 302, 307, 308].includes(library.status)) throw new Error(`library route returned ${library.status}, expected redirect`);
  const setupUnauthed = await fetch(`http://127.0.0.1:${config.proxyPort}/setup/${row.slug}`);
  if (setupUnauthed.status !== 401) throw new Error(`setup without auth returned ${setupUnauthed.status}, expected 401`);
  await fetchOk(`http://127.0.0.1:${config.proxyPort}/setup/${row.slug}`, { headers: { Authorization: `Basic ${basic}` } });
  await fetchOk(`http://127.0.0.1:${config.proxyPort}/opds`, { headers: { Authorization: `Basic ${basic}` } });
  await fetchOk(`http://127.0.0.1:${config.proxyPort}/catalog`, { headers: { Authorization: `Basic ${basic}` } });
  await fetchOk(`http://127.0.0.1:${config.proxyPort}/kosync/healthcheck`, { headers: { Accept: "application/vnd.koreader.v1+json" } });
  const kosyncHeaders = {
    Accept: "application/vnd.koreader.v1+json",
    "Content-Type": "application/json",
    "x-auth-user": user,
    "x-auth-key": state.md5(password)
  };
  await fetchOk(`http://127.0.0.1:${config.proxyPort}/kosync/users/auth`, { headers: kosyncHeaders });
  const doc = "0123456789abcdef0123456789abcdef";
  await fetchOk(`http://127.0.0.1:${config.proxyPort}/kosync/syncs/progress`, {
    method: "PUT",
    headers: kosyncHeaders,
    body: JSON.stringify({ document: doc, progress: "/body/DocFragment[1]/p[1]", percentage: 0.42, device: "books-verify", device_id: "books-verify" })
  });
  const progress = await fetchOk(`http://127.0.0.1:${config.proxyPort}/kosync/syncs/progress/${doc}`, { headers: kosyncHeaders });
  const data = await progress.json();
  if (data.document !== doc || Math.abs(Number(data.percentage) - 0.42) > 0.001) {
    throw new Error("KOSync progress verification failed");
  }
  run("docker", ["image", "inspect", config.kosyncImage]);
  return `ok: local production checks passed for ${row.slug}`;
}

module.exports = {
  run,
  ensureDir,
  reconcile,
  kosyncDisableUser,
  kosyncPurgeUser,
  calibreRemoveUser,
  annas,
  importFiles,
  writeSyncFixture,
  health,
  verify
};
