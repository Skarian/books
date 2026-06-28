const path = require("path");

const ENV_FILE = process.env.BOOKS_ENV_FILE || "/etc/books/books.env";

try {
  process.loadEnvFile(ENV_FILE);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

function value(name, fallback) {
  return process.env[name] && process.env[name] !== "" ? process.env[name] : fallback;
}

const dataDir = value("BOOKS_DATA_DIR", "/srv/books");
const configDir = value("BOOKS_CONFIG_DIR", path.join(dataDir, "config"));
const downloadDir = value("BOOKS_DOWNLOAD_DIR", path.join(dataDir, "downloads"));
const importDir = value("BOOKS_IMPORT_DIR", path.join(dataDir, "import"));
const logDir = value("BOOKS_LOG_DIR", path.join(dataDir, "log"));
const proxyPort = Number(value("BOOKS_PROXY_PORT", "8000"));
const calibrePort = Number(value("CALIBRE_PORT", "8080"));

module.exports = {
  ENV_FILE,
  publicHost: value("BOOKS_PUBLIC_HOST", "books.example.com"),
  bindAddr: value("BOOKS_BIND_ADDR", "127.0.0.1"),
  nodeHost: value("BOOKS_NODE_HOST", "127.0.0.1"),
  proxyPort,
  nodePort: Number(value("BOOKS_NODE_PORT", "8090")),
  localBaseUrl: value("BOOKS_LOCAL_BASE_URL", `http://127.0.0.1:${proxyPort}`),
  dataDir,
  configDir,
  downloadDir,
  importDir,
  logDir,
  libraryDir: value("BOOKS_LIBRARY_DIR", path.join(dataDir, "library")),
  userDb: value("BOOKS_USERDB", path.join(configDir, "users.sqlite")),
  stateFile: value("BOOKS_STATE_FILE", path.join(configDir, "state.json")),
  calibreLibraryId: value("BOOKS_CALIBRE_LIBRARY_ID", "library"),
  calibrePort,
  calibreUrl: value("BOOKS_CALIBRE_URL", `http://127.0.0.1:${calibrePort}`),
  calibreAdminUser: value("CALIBRE_ADMIN_USER", "books_admin"),
  calibreAdminPassword: value("CALIBRE_ADMIN_PASSWORD", ""),
  kosyncInternalUrl: value("KOSYNC_INTERNAL_URL", "http://127.0.0.1:7200"),
  annasBin: value("ANNAS_BIN", "/opt/books/bin/annas-mcp"),
  annasSecretKey: value("ANNAS_SECRET_KEY", ""),
  annasBaseUrl: value("ANNAS_BASE_URL", "annas-archive.li"),
  annasDownloadPath: value("ANNAS_DOWNLOAD_PATH", downloadDir),
  hardcoverDailyDownloadCap: Number(value("HARDCOVER_DAILY_DOWNLOAD_CAP", "10")),
  hardcoverSyncIntervalSeconds: Number(value("HARDCOVER_SYNC_INTERVAL_SECONDS", "300")),
  defaultLanguage: value("BOOKS_DEFAULT_LANGUAGE", "eng"),
  defaultTags: value("BOOKS_DEFAULT_TAGS", "agent-imported")
};
