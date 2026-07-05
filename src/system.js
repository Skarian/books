const fs = require("fs");
const crypto = require("crypto");
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

function withDirLock(name, callback) {
  const lockDir = path.join(config.configDir, `${name}.lock`);
  fs.mkdirSync(config.configDir, { recursive: true });
  for (let i = 0; ; i += 1) {
    try {
      fs.mkdirSync(lockDir);
      break;
    } catch (error) {
      if (error.code !== "EEXIST" || i === 400) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  try {
    return callback();
  } finally {
    fs.rmSync(lockDir, { recursive: true, force: true });
  }
}

function secrets(create = false) {
  let data = {};
  if (fs.existsSync(config.secretsFile)) {
    data = JSON.parse(fs.readFileSync(config.secretsFile, "utf8"));
  } else if (!create) {
    throw new Error("Run `docker compose run --rm admin bootstrap` before this command.");
  }
  if (!data.calibre_admin_password && create) {
    data.calibre_admin_password = crypto.randomBytes(24).toString("hex");
    fs.writeFileSync(config.secretsFile, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  }
  return data;
}

function calibreAdminPassword(create = false) {
  return secrets(create).calibre_admin_password;
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

function calibredb(args, options = {}) {
  const passwordDir = fs.mkdtempSync(path.join(os.tmpdir(), "books-calibre-"));
  const passwordFile = path.join(passwordDir, "password");
  fs.writeFileSync(passwordFile, calibreAdminPassword(), { mode: 0o600 });
  try {
    return run("calibredb", [
      "--with-library", options.library || `${config.calibreUrl}/#${config.calibreLibraryId}`,
      "--username", config.calibreAdminUser,
      "--password", `<f:${passwordFile}>`,
      ...args
    ], options);
  } finally {
    fs.rmSync(passwordDir, { recursive: true, force: true });
  }
}

function parseBookIds(output) {
  const match = String(output || "").match(/(?:Added|Merged) book ids:\s*([0-9,\s]+)/);
  return match ? match[1].split(/[,\s]+/).filter(Boolean).map((id) => Number(id)) : [];
}

function ensureOwnershipColumn() {
  const result = calibredb(["custom_columns"], { check: false });
  if (result.status === 0 && /\bbooks_users\b/.test(result.stdout)) return;
  const local = run("calibredb", ["--with-library", config.libraryDir, "custom_columns"], { check: false });
  if (local.status === 0 && /\bbooks_users\b/.test(local.stdout)) return;
  const add = run("calibredb", ["--with-library", config.libraryDir, "add_custom_column", "books_users", "Books Users", "text", "--is-multiple"], { check: false });
  if (add.status !== 0 && !/(books_users|UNIQUE constraint failed: custom_columns\.label)/i.test(`${add.stdout}\n${add.stderr}`)) {
    throw new Error([add.stdout, add.stderr].filter(Boolean).join("\n").trim() || "Could not create Calibre ownership column.");
  }
}

function setCalibreRestrictions(user, restriction) {
  const restrictions = restriction ? { library_restrictions: { [config.calibreLibraryId]: restriction } } : { library_restrictions: {} };
  run("calibre-debug", ["-c", [
    "from calibre.srv.users import UserManager",
    `m=UserManager(${JSON.stringify(config.userDb)})`,
    `m.update_user_restrictions(${JSON.stringify(user)}, ${JSON.stringify(restrictions)})`
  ].join(";")]);
}

function calibreSearch(query) {
  const result = calibredb(["search", query], { check: false });
  if (result.status !== 0 && !/No books matching/i.test(`${result.stdout}\n${result.stderr}`)) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(output || `Calibre search failed: ${query}`);
  }
  return String(result.stdout || "").split(/[,\s]+/).map((id) => Number(id)).filter(Number.isSafeInteger);
}

function findBookByIdentifier(key, value) {
  return value ? calibreSearch(`identifiers:${key}:${value}`)[0] || null : null;
}

function listUserEpubBooks(slug) {
  const user = state.validateUsers([slug])[0];
  const result = calibredb(["list", "--search", `#books_users:"=${user}"`, "--fields", "id,title,authors,identifiers,formats", "--for-machine"], { library: config.libraryDir });
  return JSON.parse(result.stdout).map((book) => ({
    id: Number(book.id),
    title: book.title || "",
    authors: book.authors || "",
    identifiers: book.identifiers || {},
    epubPath: (book.formats || []).find((file) => /\.epub$/i.test(file))
  })).filter((book) => book.epubPath);
}

function addIdentifier(calibreBookId, key, value) {
  const result = calibredb(["list", "--search", `id:=${calibreBookId}`, "--fields", "id,identifiers", "--for-machine"], { library: config.libraryDir });
  const [book] = JSON.parse(result.stdout);
  if (!book || Number(book.id) !== Number(calibreBookId)) throw new Error(`Calibre book not found: ${calibreBookId}`);
  const identifiers = { ...(book.identifiers || {}), [key]: String(value) };
  const field = Object.entries(identifiers).map(([name, id]) => `${name}:${id}`).join(",");
  calibredb(["set_metadata", String(calibreBookId), "--field", `identifiers:${field}`], { library: config.libraryDir });
}

function koreaderDocumentHash(file) {
  const hash = crypto.createHash("md5");
  const buffer = Buffer.alloc(1024);
  const fd = fs.openSync(file, "r");
  try {
    for (const offset of [0, ...Array.from({ length: 10 }, (_, i) => 1024 * (4 ** i))]) {
      const size = fs.readSync(fd, buffer, 0, buffer.length, offset);
      if (!size) break;
      hash.update(buffer.subarray(0, size));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

async function kosyncProgress(row, documentHash) {
  const response = await fetch(`${config.kosyncInternalUrl}/syncs/progress/${documentHash}`, {
    headers: {
      Accept: "application/vnd.koreader.v1+json",
      "x-auth-user": row.slug,
      "x-auth-key": state.md5(row.books_password)
    }
  });
  if (!response.ok) throw new Error(`KOSync progress lookup failed for ${documentHash}: ${response.status}`);
  const payload = await response.json();
  return Number.isFinite(Number(payload.percentage)) ? { ...payload, percentage: Number(payload.percentage) } : null;
}

function finalizedImportCopy(input, options) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "books-import-"));
  const output = path.join(tempDir, path.basename(input));
  try {
    fs.copyFileSync(input, output);
    const args = [output, "--tags", config.defaultTags, "--language", config.defaultLanguage];
    if (options.title) args.push("--title", options.title);
    if (options.authors && options.authors.length) args.push("--authors", options.authors.join(" & "));
    if (options.annaMd5) args.push("--identifier", `anna:${options.annaMd5}`);
    run("ebook-meta", args);
    return { path: output, cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }) };
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

function grantBookVisibility(calibreBookId, users) {
  ensureOwnershipColumn();
  const slugs = state.validateUsers(users);
  for (const slug of slugs) calibredb(["set_custom", "--append", "books_users", String(calibreBookId), slug]);
  return slugs;
}

async function kosyncAuth(user, rawPassword) {
  const response = await fetch(`${config.kosyncInternalUrl}/users/auth`, {
    headers: {
      Accept: "application/vnd.koreader.v1+json",
      "x-auth-user": user,
      "x-auth-key": state.md5(rawPassword)
    }
  });
  return response.ok;
}

async function kosyncCreateUser(user, rawPassword) {
  if (await kosyncAuth(user, rawPassword)) return;
  const response = await fetch(`${config.kosyncInternalUrl}/users/create`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.koreader.v1+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ username: user, password: state.md5(rawPassword) })
  });
  if (response.status === 201 && await kosyncAuth(user, rawPassword)) return;
  const body = await response.text();
  throw new Error(`KOSync user create failed for ${user}: ${response.status} ${body}`.trim());
}

async function reconcileAccount(row) {
  calibreSetUser(row.slug, row.books_password, true);
  setCalibreRestrictions(row.slug, `#books_users:"=${row.slug}"`);
  await kosyncCreateUser(row.slug, row.books_password);
  return `reconciled user ${row.slug}`;
}

async function reconcile(slug) {
  calibreSetUser(config.calibreAdminUser, calibreAdminPassword(true), false);
  setCalibreRestrictions(config.calibreAdminUser, null);
  ensureOwnershipColumn();
  const rows = slug ? [state.getAccount(slug)] : state.listAccounts();
  const output = [];
  for (const row of rows) output.push(await reconcileAccount(row));
  return output;
}

function annas(args, options = {}) {
  if (!config.annasSecretKey) throw new Error("ANNAS_SECRET_KEY is not configured in .env.");
  ensureDir(config.annasDownloadPath, 0o770);
  const env = {
    ...process.env,
    ANNAS_SECRET_KEY: config.annasSecretKey,
    ANNAS_DOWNLOAD_PATH: config.annasDownloadPath,
    ANNAS_BASE_URL: config.annasBaseUrl
  };
  return run(config.annasBin, args, { ...options, env });
}

function importFiles(files, options = {}) {
  const users = state.validateUsers(options.users || []);
  if (!users.length) throw new Error("Import requires at least one --user owner.");
  ensureDir(config.libraryDir, 0o770);
  return withDirLock("calibre-write", () => {
    const imported = [];
    for (const input of files) {
      if (!fs.existsSync(input) || !fs.statSync(input).isFile()) throw new Error(`Not a file: ${input}`);
      const extension = path.extname(input).slice(1).toLowerCase();
      if (extension !== "epub") throw new Error(`Only EPUB imports are supported: ${input}`);
      const title = options.title || path.basename(input, path.extname(input));
      let calibreBookId;
      const finalized = finalizedImportCopy(input, options);
      const args = ["add", "--automerge", "overwrite", "--languages", config.defaultLanguage, "--tags", config.defaultTags];
      if (options.title) args.push("--title", options.title);
      if (options.authors && options.authors.length) args.push("--authors", options.authors.join(" & "));
      if (options.annaMd5) args.push("--identifier", `anna:${options.annaMd5}`);
      try {
        const result = calibredb([...args, finalized.path]);
        const ids = parseBookIds(`${result.stdout}\n${result.stderr}`);
        if (ids.length !== 1) throw new Error(`Could not determine imported Calibre book id for ${input}`);
        calibreBookId = ids[0];
      } finally {
        finalized.cleanup();
      }
      const granted = grantBookVisibility(calibreBookId, users);
      imported.push({ calibre_book_id: calibreBookId, users: granted, title });
    }
    return imported;
  });
}

function bootstrap() {
  for (const dir of [
    config.configDir, config.libraryDir, config.downloadDir, config.importDir,
    config.logDir, path.join(config.dataDir, "kosync", "redis"),
    path.join(config.logDir, "kosync", "redis"), path.join(config.logDir, "kosync", "app")
  ]) ensureDir(dir, dir === config.configDir || dir === config.logDir ? 0o750 : 0o770);
  calibreSetUser(config.calibreAdminUser, calibreAdminPassword(true), false);
  setCalibreRestrictions(config.calibreAdminUser, null);
  run("calibredb", ["--with-library", config.libraryDir, "list"], { check: false });
  ensureOwnershipColumn();
}

async function fetchOk(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response;
}

async function health() {
  const row = state.firstActiveAccount();
  const user = row ? row.slug : config.calibreAdminUser;
  const password = row ? row.books_password : calibreAdminPassword();
  const auth = Buffer.from(`${user}:${password}`).toString("base64");
  await fetchOk(`${config.localBaseUrl}/healthz`);
  await fetchOk(`${config.localBaseUrl}/opds`, { headers: { Authorization: `Basic ${auth}` } });
  await fetchOk(`${config.localBaseUrl}/kosync/healthcheck`, { headers: { Accept: "application/vnd.koreader.v1+json" } });
  return "ok";
}

module.exports = {
  run,
  ensureDir,
  bootstrap,
  reconcile,
  annas,
  importFiles,
  findBookByIdentifier,
  listUserEpubBooks,
  addIdentifier,
  koreaderDocumentHash,
  kosyncProgress,
  grantBookVisibility,
  health
};
