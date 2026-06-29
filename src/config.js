const path = require("path");
const fs = require("fs");

function value(name, fallback) {
  return process.env[name] && process.env[name] !== "" ? process.env[name] : fallback;
}

function secret(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim() : "";
}

const dataDir = value("BOOKS_DATA_DIR", "/srv/books");
const configDir = path.join(dataDir, "config");
const downloadDir = path.join(dataDir, "downloads");
const logDir = path.join(dataDir, "log");

module.exports = {
  publicHost: value("BOOKS_PUBLIC_HOST", "books.example.com"),
  localBaseUrl: "http://proxy:8000",
  dataDir,
  configDir,
  downloadDir,
  importDir: path.join(dataDir, "import"),
  logDir,
  libraryDir: path.join(dataDir, "library"),
  userDb: path.join(configDir, "users.sqlite"),
  stateFile: path.join(configDir, "state.json"),
  secretsFile: path.join(configDir, "secrets.json"),
  calibreLibraryId: "library",
  calibreUrl: "http://calibre:8080",
  calibreAdminUser: "books_admin",
  kosyncInternalUrl: "http://kosync:17200",
  annasBin: "/opt/books/bin/annas-mcp",
  annasSecretKey: secret("/run/secrets/annas_secret_key"),
  annasBaseUrl: "annas-archive.li",
  annasDownloadPath: downloadDir,
  hardcoverDailyDownloadCap: Number(value("HARDCOVER_DAILY_DOWNLOAD_CAP", "10")),
  defaultLanguage: "eng",
  defaultTags: "agent-imported"
};
