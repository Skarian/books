const fs = require("fs");
const path = require("path");

const ENV_FILE = process.env.BOOKS_ENV_FILE || "/etc/books/books.env";

function unquote(value) {
  const trimmed = String(value || "").trim();
  if (trimmed.length >= 2 && trimmed[0] === "'" && trimmed[trimmed.length - 1] === "'") {
    return trimmed.slice(1, -1).replace(/'\\''/g, "'");
  }
  if (trimmed.length >= 2 && trimmed[0] === '"' && trimmed[trimmed.length - 1] === '"') {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadEnv(file = ENV_FILE) {
  const env = {};
  if (fs.existsSync(file)) {
    for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const index = line.indexOf("=");
      env[line.slice(0, index)] = unquote(line.slice(index + 1));
    }
  }
  return { ...env, ...process.env };
}

const env = loadEnv();

function value(name, fallback) {
  return env[name] && env[name] !== "" ? env[name] : fallback;
}

const dataDir = value("BOOKS_DATA_DIR", "/srv/books");
const configDir = value("BOOKS_CONFIG_DIR", path.join(dataDir, "config"));
const downloadDir = value("BOOKS_DOWNLOAD_DIR", path.join(dataDir, "downloads"));
const importDir = value("BOOKS_IMPORT_DIR", path.join(dataDir, "import"));
const logDir = value("BOOKS_LOG_DIR", path.join(dataDir, "log"));

module.exports = {
  ENV_FILE,
  env,
  publicHost: value("BOOKS_PUBLIC_HOST", "books.exe.xyz"),
  proxyPort: Number(value("BOOKS_PROXY_PORT", "8000")),
  nodePort: Number(value("BOOKS_NODE_PORT", "8090")),
  dataDir,
  configDir,
  downloadDir,
  importDir,
  logDir,
  libraryDir: value("BOOKS_LIBRARY_DIR", path.join(dataDir, "library")),
  userDb: value("BOOKS_USERDB", path.join(configDir, "users.sqlite")),
  accountsDb: value("BOOKS_ACCOUNTS_DB", path.join(configDir, "accounts.sqlite")),
  calibreLibraryId: value("BOOKS_CALIBRE_LIBRARY_ID", "library"),
  calibrePort: Number(value("CALIBRE_PORT", "8080")),
  calibreAdminUser: value("CALIBRE_ADMIN_USER", "books_admin"),
  calibreAdminPassword: value("CALIBRE_ADMIN_PASSWORD", ""),
  kosyncPort: Number(value("KOSYNC_PORT", "7200")),
  kosyncImage: value("KOSYNC_IMAGE", "koreader/kosync@sha256:bb3f13615365703315a43b9059f65e71e876440f867e23a42bf27f2fa18264e1"),
  kosyncContainer: value("KOSYNC_CONTAINER", "books-kosync"),
  annasBin: value("ANNAS_BIN", "/opt/books/bin/annas-mcp"),
  annasSecretKey: value("ANNAS_SECRET_KEY", ""),
  annasBaseUrl: value("ANNAS_BASE_URL", "annas-archive.li"),
  annasDownloadPath: value("ANNAS_DOWNLOAD_PATH", downloadDir),
  hardcoverDailyDownloadCap: Number(value("HARDCOVER_DAILY_DOWNLOAD_CAP", "15")),
  defaultLanguage: value("BOOKS_DEFAULT_LANGUAGE", "eng"),
  defaultTags: value("BOOKS_DEFAULT_TAGS", "agent-imported")
};
