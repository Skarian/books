#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

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
const source = process.argv[2] || value("BOOKS_ACCOUNTS_DB", path.join(configDir, "accounts.sqlite"));
const target = process.argv[3] || value("BOOKS_STATE_FILE", path.join(configDir, "state.json"));

if (fs.existsSync(target)) {
  console.log(`state exists: ${target}`);
  process.exit(0);
}
if (!fs.existsSync(source)) {
  console.log(`no legacy sqlite state found: ${source}`);
  process.exit(0);
}

const db = new DatabaseSync(source, { readOnly: true });
const accounts = db.prepare("select * from accounts order by slug").all().map((row) => ({
  slug: row.slug,
  display_name: row.display_name,
  email: row.email,
  status: row.status || "active",
  books_password: row.books_password,
  hardcover_token: row.hardcover_token,
  hardcover_user_id: row.hardcover_user_id,
  hardcover_username: row.hardcover_username,
  created_at: row.created_at,
  updated_at: row.updated_at
}));
const daily = {};
for (const row of db.prepare("select * from hardcover_daily_downloads").all()) {
  daily[row.day] = { download_count: row.download_count, updated_at: row.updated_at };
}
db.close();

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify({ version: 1, accounts, hardcover_daily_downloads: daily }, null, 2)}\n`, { mode: 0o600 });
console.log(`cutover ${accounts.length} account(s) from ${source} to ${target}`);
