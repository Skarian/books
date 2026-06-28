const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const config = require("./config");

const WORDS = `
amber anchor apple autumn baker beacon bridge bright cabin cedar cherry circle
clear coffee comet cotton creek crystal daily delta desert ember engine feather
forest garden gentle golden harbor honest island lantern maple meadow mellow
mirror morning native ocean orange pepper planet pocket quiet river silver
simple steady summer sunset temple timber valley velvet window winter wonder
`.trim().split(/\s+/);

let cachedDb;

function now() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function md5(value) {
  return crypto.createHash("md5").update(String(value), "utf8").digest("hex");
}

function slugify(value) {
  const slug = String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  if (!slug) throw new Error("Could not derive a slug from that name.");
  return slug;
}

function passphrase() {
  const parts = [];
  for (let i = 0; i < 4; i += 1) parts.push(WORDS[crypto.randomInt(WORDS.length)]);
  return parts.join("-");
}

function db(file = config.accountsDb) {
  if (cachedDb) return cachedDb;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  cachedDb = new DatabaseSync(file);
  cachedDb.exec("pragma busy_timeout = 5000");
  cachedDb.exec("pragma foreign_keys = on");
  cachedDb.exec("pragma journal_mode = wal");
  ensureSchema(cachedDb);
  return cachedDb;
}

function closeForTests() {
  if (cachedDb) cachedDb.close();
  cachedDb = null;
}

function tableExists(database, table) {
  return Boolean(database.prepare("select 1 from sqlite_schema where type='table' and name=?").get(table));
}

function columns(database, table) {
  if (!tableExists(database, table)) return new Set();
  return new Set(database.prepare(`pragma table_info(${table})`).all().map((row) => row.name));
}

function createSchema(database) {
  database.exec(`
    pragma foreign_keys = on;
    create table if not exists accounts (
      slug text primary key
        check(length(slug) between 1 and 48
          and slug not glob '*[^a-z0-9-]*'
          and slug not like '-%'
          and slug not like '%-'),
      display_name text not null check(length(trim(display_name)) > 0),
      email text,
      status text not null default 'active' check(status in ('active', 'disabled')),
      books_password text not null check(length(books_password) > 0),
      hardcover_token text,
      hardcover_user_id integer,
      hardcover_username text,
      created_at text not null,
      updated_at text not null,
      disabled_at text
    );
    create unique index if not exists accounts_hardcover_user_id_uq
      on accounts(hardcover_user_id)
      where hardcover_user_id is not null;
    create table if not exists hardcover_requests (
      account_slug text not null references accounts(slug) on delete cascade,
      hardcover_user_book_id integer not null,
      hardcover_book_id integer,
      title text not null,
      author text,
      status text not null check(status in ('downloading', 'fulfilled', 'error')),
      selected_md5 text,
      selected_title text,
      selected_format text,
      selected_language text,
      download_path text,
      imported_at text,
      moved_at text,
      error text,
      created_at text not null,
      updated_at text not null,
      primary key(account_slug, hardcover_user_book_id)
    );
    create index if not exists hardcover_requests_status_idx
      on hardcover_requests(account_slug, status, updated_at);
    create table if not exists hardcover_daily_downloads (
      day text primary key,
      download_count integer not null default 0 check(download_count >= 0),
      updated_at text not null
    );
    pragma user_version = 2;
  `);
}

function ensureSchema(database = db()) {
  if (!tableExists(database, "accounts")) {
    createSchema(database);
    return;
  }
  if (columns(database, "accounts").has("books_password")) {
    createSchema(database);
    return;
  }
  throw new Error("accounts.sqlite is not the current Books schema. Restore the current /srv/books/config/accounts.sqlite or recreate this VM from the current repo.");
}

function migrate(database = db()) {
  ensureSchema(database);
}

function getAccount(slug) {
  const row = db().prepare("select * from accounts where slug=?").get(slug);
  if (!row) throw new Error(`No account named ${slug}.`);
  return row;
}

function activeAccountsWithHardcover() {
  return db().prepare(`
    select * from accounts
    where status='active'
      and hardcover_token is not null
    order by slug
  `).all();
}

function listAccounts() {
  return db().prepare("select * from accounts order by display_name").all();
}

function firstActiveAccount() {
  return db().prepare("select * from accounts where status='active' order by slug limit 1").get();
}

function accountPayload(row) {
  return {
    slug: row.slug,
    display_name: row.display_name,
    email: row.email,
    status: row.status,
    setup_url: `https://${config.publicHost}/setup/${row.slug}`,
    books_username: row.slug,
    books_password: row.books_password,
    readest_url: "https://web.readest.com/",
    opds_url: `https://${config.publicHost}/catalog`,
    kosync_url: `https://${config.publicHost}/kosync`,
    hardcover_username: row.hardcover_username,
    hardcover_sync_enabled: Boolean(row.hardcover_token)
  };
}

function updateAccount(slug, values, database = db()) {
  const keys = Object.keys(values);
  if (!keys.length) return;
  values.updated_at = values.updated_at || now();
  const allKeys = Object.keys(values);
  const assignments = allKeys.map((key) => `${key}=?`).join(", ");
  database.prepare(`update accounts set ${assignments} where slug=?`).run(...allKeys.map((key) => values[key]), slug);
}

function createAccount({ name, slug, email }) {
  const database = db();
  const finalSlug = slug || slugify(name);
  if (database.prepare("select 1 from accounts where slug=?").get(finalSlug)) {
    throw new Error(`Account already exists: ${finalSlug}`);
  }
  const timestamp = now();
  database.prepare(`
    insert into accounts(slug, display_name, email, status, books_password, created_at, updated_at)
    values(?,?,?,?,?,?,?)
  `).run(finalSlug, name, email || null, "active", passphrase(), timestamp, timestamp);
  return getAccount(finalSlug);
}

function rotateLogin(slug) {
  updateAccount(slug, { books_password: passphrase() });
}

function disableAccount(slug) {
  const timestamp = now();
  updateAccount(slug, { status: "disabled", disabled_at: timestamp, updated_at: timestamp });
}

function purgeAccount(slug) {
  db().prepare("delete from accounts where slug=?").run(slug);
}

function setHardcoverToken(slug, token, profile) {
  updateAccount(slug, {
    hardcover_token: token,
    hardcover_user_id: profile.id,
    hardcover_username: profile.username
  });
}

function clearHardcoverToken(slug) {
  updateAccount(slug, {
    hardcover_token: null,
    hardcover_user_id: null,
    hardcover_username: null
  });
}

function dailyCount() {
  const row = db().prepare("select download_count from hardcover_daily_downloads where day=?").get(today());
  return row ? Number(row.download_count) : 0;
}

function incrementDaily() {
  db().prepare(`
    insert into hardcover_daily_downloads(day, download_count, updated_at)
    values(?, 1, ?)
    on conflict(day) do update set download_count=download_count + 1, updated_at=excluded.updated_at
  `).run(today(), now());
}

function hardcoverRequest(userSlug, userBookId) {
  return db().prepare("select * from hardcover_requests where account_slug=? and hardcover_user_book_id=?").get(userSlug, Number(userBookId));
}

function saveHardcoverRequest(userSlug, userBook, values) {
  const existing = hardcoverRequest(userSlug, userBook.id);
  const row = {
    hardcover_book_id: userBook.book_id || values.hardcover_book_id || null,
    title: values.title,
    author: values.author || null,
    status: values.status,
    selected_md5: values.selected_md5 || null,
    selected_title: values.selected_title || null,
    selected_format: values.selected_format || null,
    selected_language: values.selected_language || null,
    download_path: values.download_path || null,
    imported_at: values.imported_at || null,
    moved_at: values.moved_at || null,
    error: values.error || null,
    updated_at: now()
  };
  if (existing) {
    db().prepare(`
      update hardcover_requests
      set hardcover_book_id=?, title=?, author=?, status=?, selected_md5=?, selected_title=?,
          selected_format=?, selected_language=?, download_path=?, imported_at=?, moved_at=?, error=?, updated_at=?
      where account_slug=? and hardcover_user_book_id=?
    `).run(
      row.hardcover_book_id, row.title, row.author, row.status, row.selected_md5, row.selected_title,
      row.selected_format, row.selected_language, row.download_path, row.imported_at, row.moved_at, row.error,
      row.updated_at, userSlug, Number(userBook.id)
    );
  } else {
    db().prepare(`
      insert into hardcover_requests(
        account_slug, hardcover_user_book_id, hardcover_book_id, title, author, status,
        selected_md5, selected_title, selected_format, selected_language,
        download_path, imported_at, moved_at, error, created_at, updated_at
      ) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      userSlug, Number(userBook.id), row.hardcover_book_id, row.title, row.author, row.status,
      row.selected_md5, row.selected_title, row.selected_format, row.selected_language,
      row.download_path, row.imported_at, row.moved_at, row.error, now(), row.updated_at
    );
  }
}

module.exports = {
  now,
  today,
  md5,
  passphrase,
  db,
  migrate,
  closeForTests,
  getAccount,
  listAccounts,
  firstActiveAccount,
  activeAccountsWithHardcover,
  accountPayload,
  createAccount,
  updateAccount,
  rotateLogin,
  disableAccount,
  purgeAccount,
  setHardcoverToken,
  clearHardcoverToken,
  dailyCount,
  incrementDaily,
  hardcoverRequest,
  saveHardcoverRequest
};
