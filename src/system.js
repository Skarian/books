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

function secrets(create = false) {
  let data = {};
  if (fs.existsSync(config.secretsFile)) {
    data = JSON.parse(fs.readFileSync(config.secretsFile, "utf8"));
  } else if (!create) {
    throw new Error("Run `docker compose run --rm admin bootstrap` before this command.");
  }
  if (!data.calibre_admin_password && create) {
    data.calibre_admin_password = crypto.randomBytes(24).toString("base64url");
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
  if (row.status !== "active") return `skipped inactive user ${row.slug}`;
  calibreSetUser(row.slug, row.books_password, true);
  await kosyncCreateUser(row.slug, row.books_password);
  return `reconciled active user ${row.slug}`;
}

async function reconcile(slug) {
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

function importFiles(files) {
  ensureDir(config.libraryDir, 0o770);
  const passwordDir = fs.mkdtempSync(path.join(os.tmpdir(), "books-calibre-"));
  const passwordFile = path.join(passwordDir, "password");
  fs.writeFileSync(passwordFile, calibreAdminPassword(), { mode: 0o600 });
  const libraryUrl = `${config.calibreUrl}/#${config.calibreLibraryId}`;
  try {
    for (const input of files) {
      if (!fs.existsSync(input) || !fs.statSync(input).isFile()) throw new Error(`Not a file: ${input}`);
      const extension = path.extname(input).slice(1).toLowerCase();
      if (extension !== "epub") throw new Error(`Only EPUB imports are supported: ${input}`);
      run("calibredb", [
        "--with-library", libraryUrl,
        "--username", config.calibreAdminUser,
        "--password", `<f:${passwordFile}>`,
        "add",
        "--automerge", "overwrite",
        "--languages", config.defaultLanguage,
        "--tags", config.defaultTags,
        input
      ]);
    }
  } finally {
    fs.rmSync(passwordDir, { recursive: true, force: true });
  }
}

function bootstrap() {
  for (const dir of [
    config.configDir, config.libraryDir, config.downloadDir, config.importDir,
    config.logDir, path.join(config.dataDir, "kosync", "redis"),
    path.join(config.logDir, "kosync", "redis"), path.join(config.logDir, "kosync", "app")
  ]) ensureDir(dir, dir === config.configDir || dir === config.logDir ? 0o750 : 0o770);
  calibreSetUser(config.calibreAdminUser, calibreAdminPassword(true), false);
  run("calibredb", ["--with-library", config.libraryDir, "list"], { check: false });
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

async function verify(slug) {
  const row = slug ? state.getAccount(slug) : state.firstActiveAccount();
  if (!row) throw new Error('No active user exists. Create one with `docker compose run --rm admin users create "Name" --email person@example.com`.');
  const basic = Buffer.from(`${row.slug}:${row.books_password}`).toString("base64");
  await fetchOk(`${config.localBaseUrl}/healthz`);
  const root = await fetch(`${config.localBaseUrl}/`);
  if (root.status !== 404) throw new Error(`root route returned ${root.status}, expected 404`);
  const library = await fetch(`${config.localBaseUrl}/library`, { redirect: "manual" });
  if (![301, 302, 307, 308].includes(library.status)) throw new Error(`library route returned ${library.status}, expected redirect`);
  const setup = await fetch(`${config.localBaseUrl}/setup/${row.slug}`, { headers: { Authorization: `Basic ${basic}` } });
  if (setup.status !== 404) throw new Error(`setup route returned ${setup.status}, expected 404`);
  await fetchOk(`${config.localBaseUrl}/opds`, { headers: { Authorization: `Basic ${basic}` } });
  await fetchOk(`${config.localBaseUrl}/catalog`, { headers: { Authorization: `Basic ${basic}` } });
  await fetchOk(`${config.localBaseUrl}/kosync/healthcheck`, { headers: { Accept: "application/vnd.koreader.v1+json" } });
  const kosyncHeaders = {
    Accept: "application/vnd.koreader.v1+json",
    "Content-Type": "application/json",
    "x-auth-user": row.slug,
    "x-auth-key": state.md5(row.books_password)
  };
  await fetchOk(`${config.localBaseUrl}/kosync/users/auth`, { headers: kosyncHeaders });
  const doc = "0123456789abcdef0123456789abcdef";
  await fetchOk(`${config.localBaseUrl}/kosync/syncs/progress`, {
    method: "PUT",
    headers: kosyncHeaders,
    body: JSON.stringify({ document: doc, progress: "/body/DocFragment[1]/p[1]", percentage: 0.42, device: "books-verify", device_id: "books-verify" })
  });
  const progress = await fetchOk(`${config.localBaseUrl}/kosync/syncs/progress/${doc}`, { headers: kosyncHeaders });
  const data = await progress.json();
  if (data.document !== doc || Math.abs(Number(data.percentage) - 0.42) > 0.001) {
    throw new Error("KOSync progress verification failed");
  }
  return `ok: local production checks passed for ${row.slug}`;
}

module.exports = {
  run,
  ensureDir,
  bootstrap,
  reconcile,
  annas,
  importFiles,
  health,
  verify
};
