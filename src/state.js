const crypto = require("crypto");
const fs = require("fs");
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
  for (let i = 0; i < 4; i += 1) {
    parts.push(WORDS[crypto.randomInt(WORDS.length)]);
  }
  return parts.join("-");
}

function randomPassword() {
  return crypto.randomBytes(18).toString("base64url");
}

function db() {
  if (cachedDb) return cachedDb;
  fs.mkdirSync(config.configDir, { recursive: true });
  cachedDb = new DatabaseSync(config.accountsDb);
  cachedDb.exec("pragma busy_timeout = 5000");
  cachedDb.exec("pragma journal_mode = wal");
  migrate(cachedDb);
  return cachedDb;
}

function columns(database, table) {
  return new Set(database.prepare(`pragma table_info(${table})`).all().map((row) => row.name));
}

function addColumn(database, table, name, type) {
  if (!columns(database, table).has(name)) {
    database.exec(`alter table ${table} add column ${name} ${type}`);
  }
}

function migrate(database = db()) {
  database.exec(`
    create table if not exists accounts (
      slug text primary key,
      display_name text not null,
      email text,
      status text not null default 'active',
      roles text not null default 'reader',
      login_user text unique,
      login_password text,
      opds_user text not null unique,
      opds_password text not null,
      kosync_user text not null unique,
      kosync_password text not null,
      kosync_userkey text not null,
      setup_user text not null unique,
      setup_password text not null,
      hardcover_token text,
      hardcover_user_id integer,
      hardcover_username text,
      hardcover_sync_enabled integer not null default 0,
      hardcover_updated_at text,
      created_at text not null,
      updated_at text not null,
      disabled_at text,
      purged_at text
    );
    create table if not exists audit_log (
      id integer primary key autoincrement,
      created_at text not null,
      actor text not null,
      action text not null,
      target text not null,
      detail text not null default '{}'
    );
    create table if not exists hardcover_processed (
      user_slug text not null,
      user_book_id integer not null,
      hardcover_book_id integer,
      title text not null,
      author text,
      status text not null,
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
      primary key(user_slug, user_book_id)
    );
    create table if not exists hardcover_daily_downloads (
      day text primary key,
      count integer not null default 0,
      updated_at text not null
    );
  `);

  const accountColumns = [
    ["login_user", "text"],
    ["login_password", "text"],
    ["hardcover_token", "text"],
    ["hardcover_user_id", "integer"],
    ["hardcover_username", "text"],
    ["hardcover_sync_enabled", "integer not null default 0"],
    ["hardcover_updated_at", "text"]
  ];
  for (const [name, type] of accountColumns) addColumn(database, "accounts", name, type);

  const processedColumns = [
    ["selected_md5", "text"],
    ["selected_title", "text"],
    ["selected_format", "text"],
    ["selected_language", "text"],
    ["download_path", "text"],
    ["imported_at", "text"],
    ["moved_at", "text"],
    ["error", "text"]
  ];
  for (const [name, type] of processedColumns) addColumn(database, "hardcover_processed", name, type);

  for (const row of database.prepare("select slug, login_user, login_password from accounts").all()) {
    const updates = {};
    if (!row.login_user) updates.login_user = row.slug;
    if (!row.login_password) updates.login_password = passphrase();
    if (Object.keys(updates).length) {
      updateAccount(row.slug, updates, database);
    }
  }
}

function audit(action, target, detail = {}) {
  db().prepare("insert into audit_log(created_at, actor, action, target, detail) values(?,?,?,?,?)")
    .run(now(), process.env.USER || "unknown", action, target, JSON.stringify(detail));
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
      and hardcover_sync_enabled=1
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

function serviceUser(row) {
  return row.login_user || row.slug;
}

function servicePassword(row) {
  return row.login_password || row.opds_password;
}

function accountPayload(row) {
  return {
    slug: row.slug,
    display_name: row.display_name,
    email: row.email,
    status: row.status,
    roles: row.roles,
    setup_url: `https://${config.publicHost}/setup/${row.slug}`,
    login_user: serviceUser(row),
    login_password: servicePassword(row),
    readest_url: "https://web.readest.com/",
    opds_url: `https://${config.publicHost}/catalog`,
    opds_user: serviceUser(row),
    opds_password: servicePassword(row),
    kosync_url: `https://${config.publicHost}/kosync`,
    kosync_user: serviceUser(row),
    kosync_password: servicePassword(row),
    setup_user: serviceUser(row),
    setup_password: servicePassword(row),
    hardcover_username: row.hardcover_username,
    hardcover_sync_enabled: Boolean(row.hardcover_sync_enabled && row.hardcover_token)
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
  const sharedPassword = passphrase();
  const roles = ["reader"];
  const timestamp = now();
  database.prepare(`
    insert into accounts(
      slug, display_name, email, status, roles,
      login_user, login_password,
      opds_user, opds_password,
      kosync_user, kosync_password, kosync_userkey,
      setup_user, setup_password, created_at, updated_at
    ) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    finalSlug,
    name,
    email || null,
    "active",
    roles.join(","),
    finalSlug,
    sharedPassword,
    `opds_${finalSlug}`,
    sharedPassword,
    `sync_${finalSlug}`,
    sharedPassword,
    md5(sharedPassword),
    `setup_${finalSlug}`,
    sharedPassword,
    timestamp,
    timestamp
  );
  audit("create", finalSlug, { email, roles });
  return getAccount(finalSlug);
}

function rotateLogin(slug) {
  const sharedPassword = passphrase();
  updateAccount(slug, {
    login_password: sharedPassword,
    opds_password: sharedPassword,
    kosync_password: sharedPassword,
    kosync_userkey: md5(sharedPassword),
    setup_password: sharedPassword
  });
  audit("rotate", slug, { service: "login" });
}

function disableAccount(slug) {
  const timestamp = now();
  updateAccount(slug, { status: "disabled", disabled_at: timestamp, updated_at: timestamp });
  audit("disable", slug);
}

function purgeAccount(slug) {
  db().prepare("delete from accounts where slug=?").run(slug);
  audit("purge", slug);
}

function setHardcoverToken(slug, token, profile) {
  updateAccount(slug, {
    hardcover_token: token,
    hardcover_user_id: profile.id,
    hardcover_username: profile.username,
    hardcover_sync_enabled: 1,
    hardcover_updated_at: now()
  });
  audit("hardcover_set_token", slug, { hardcover_user_id: profile.id, hardcover_username: profile.username });
}

function clearHardcoverToken(slug) {
  updateAccount(slug, {
    hardcover_token: null,
    hardcover_user_id: null,
    hardcover_username: null,
    hardcover_sync_enabled: 0,
    hardcover_updated_at: now()
  });
  audit("hardcover_clear_token", slug);
}

function dailyCount() {
  const row = db().prepare("select count from hardcover_daily_downloads where day=?").get(today());
  return row ? Number(row.count) : 0;
}

function incrementDaily() {
  db().prepare(`
    insert into hardcover_daily_downloads(day, count, updated_at)
    values(?, 1, ?)
    on conflict(day) do update set count=count + 1, updated_at=excluded.updated_at
  `).run(today(), now());
}

function processed(userSlug, userBookId) {
  return db().prepare("select * from hardcover_processed where user_slug=? and user_book_id=?").get(userSlug, Number(userBookId));
}

function saveProcessed(userSlug, userBook, values) {
  const existing = processed(userSlug, userBook.id);
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
      update hardcover_processed
      set hardcover_book_id=?, title=?, author=?, status=?, selected_md5=?, selected_title=?,
          selected_format=?, selected_language=?, download_path=?, imported_at=?, moved_at=?, error=?, updated_at=?
      where user_slug=? and user_book_id=?
    `).run(
      row.hardcover_book_id, row.title, row.author, row.status, row.selected_md5, row.selected_title,
      row.selected_format, row.selected_language, row.download_path, row.imported_at, row.moved_at, row.error,
      row.updated_at, userSlug, Number(userBook.id)
    );
  } else {
    db().prepare(`
      insert into hardcover_processed(
        user_slug, user_book_id, hardcover_book_id, title, author, status,
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
  randomPassword,
  db,
  migrate,
  audit,
  getAccount,
  listAccounts,
  firstActiveAccount,
  activeAccountsWithHardcover,
  serviceUser,
  servicePassword,
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
  processed,
  saveProcessed
};
