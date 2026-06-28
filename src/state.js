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

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
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

function scalar(database, sql, params = []) {
  const row = database.prepare(sql).get(...params);
  return row ? Object.values(row)[0] : undefined;
}

function tableExists(database, table) {
  return Boolean(database.prepare("select 1 from sqlite_schema where type='table' and name=?").get(table));
}

function columns(database, table) {
  if (!tableExists(database, table)) return new Set();
  return new Set(database.prepare(`pragma table_info(${table})`).all().map((row) => row.name));
}

function integrity(database) {
  return scalar(database, "pragma integrity_check");
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
  throw new Error("accounts.sqlite uses the old schema. Run ./scripts/books users migrate-v2 --execute before starting v2 services.");
}

function migrate(database = db()) {
  ensureSchema(database);
}

function readAll(database, table) {
  return tableExists(database, table) ? database.prepare(`select * from ${table}`).all() : [];
}

function migrationPlan(dbPath = config.accountsDb) {
  const database = new DatabaseSync(dbPath);
  try {
    database.exec("pragma busy_timeout = 5000");
    const accountColumns = columns(database, "accounts");
    if (accountColumns.has("books_password")) {
      return { alreadyV2: true, dbPath, userVersion: Number(scalar(database, "pragma user_version") || 0) };
    }
    if (!accountColumns.has("login_password")) throw new Error("Missing login_password column; refusing v2 migration.");
    const integrityResult = integrity(database);
    if (integrityResult !== "ok") throw new Error(`SQLite integrity check failed: ${integrityResult}`);
    const accounts = database.prepare(`
      select slug, status, login_user, opds_user, kosync_user, setup_user,
             login_password, opds_password, kosync_password, setup_password,
             hardcover_sync_enabled, hardcover_token, hardcover_username
      from accounts order by slug
    `).all();
    for (const row of accounts) {
      if (!row.login_password) throw new Error(`Missing login_password for ${row.slug}; refusing to generate a replacement.`);
      if ((row.login_user || row.slug) !== row.slug) throw new Error(`login_user must equal slug for ${row.slug}; username rename is not supported.`);
      if (row.hardcover_sync_enabled && !row.hardcover_token) throw new Error(`Hardcover sync is enabled for ${row.slug}, but token is missing.`);
    }
    const orphanRequests = tableExists(database, "hardcover_processed")
      ? Number(scalar(database, `
          select count(*)
          from hardcover_processed hp
          left join accounts a on a.slug=hp.user_slug
          where a.slug is null
        `) || 0)
      : 0;
    if (orphanRequests) throw new Error(`Found ${orphanRequests} orphaned Hardcover request row(s).`);
    return {
      alreadyV2: false,
      dbPath,
      accountCount: accounts.length,
      requestCount: tableExists(database, "hardcover_processed") ? Number(scalar(database, "select count(*) from hardcover_processed") || 0) : 0,
      dailyCountRows: tableExists(database, "hardcover_daily_downloads") ? Number(scalar(database, "select count(*) from hardcover_daily_downloads") || 0) : 0,
      auditRows: tableExists(database, "audit_log") ? Number(scalar(database, "select count(*) from audit_log") || 0) : 0,
      legacyAccounts: accounts.map((row) => ({
        slug: row.slug,
        opds_user: row.opds_user,
        kosync_user: row.kosync_user,
        setup_user: row.setup_user
      }))
    };
  } finally {
    database.close();
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function sqlQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function archiveV1(database, dbPath, backupDir, plan) {
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const backupDb = path.join(backupDir, "accounts.sqlite.pre-v2.bak");
  database.exec(`vacuum main into ${sqlQuote(backupDb)}`);
  fs.chmodSync(backupDb, 0o600);
  for (const suffix of ["-wal", "-shm"]) {
    const source = `${dbPath}${suffix}`;
    if (fs.existsSync(source)) {
      const target = path.join(backupDir, `accounts.sqlite${suffix}.pre-v2.bak`);
      fs.copyFileSync(source, target);
      fs.chmodSync(target, 0o600);
    }
  }
  const schema = database.prepare("select type, name, sql from sqlite_schema where sql is not null order by type, name").all();
  writeJson(path.join(backupDir, "accounts.schema.pre-v2.json"), schema);
  writeJson(path.join(backupDir, "audit_log.pre-v2.json"), readAll(database, "audit_log"));
  writeJson(path.join(backupDir, "legacy-service-users.pre-v2.json"), plan.legacyAccounts);
  writeJson(path.join(backupDir, "hardcover_processed.pre-v2.json"), readAll(database, "hardcover_processed"));
  writeJson(path.join(backupDir, "hardcover_daily_downloads.pre-v2.json"), readAll(database, "hardcover_daily_downloads"));
}

function migrateV2({ execute = false, dbPath = config.accountsDb, backupDir } = {}) {
  const plan = migrationPlan(dbPath);
  if (plan.alreadyV2 || !execute) return plan;
  const finalBackupDir = backupDir || path.join(config.dataDir, "backups", `v2-schema-${stamp()}`);
  const database = new DatabaseSync(dbPath);
  try {
    database.exec("pragma busy_timeout = 5000");
    database.exec("pragma foreign_keys = off");
    archiveV1(database, dbPath, finalBackupDir, plan);
    const hasProcessed = tableExists(database, "hardcover_processed");
    const hasDailyDownloads = tableExists(database, "hardcover_daily_downloads");
    database.exec("begin immediate");
    database.exec(`
      create table accounts_new (
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
      insert into accounts_new(
        slug, display_name, email, status, books_password,
        hardcover_token, hardcover_user_id, hardcover_username,
        created_at, updated_at, disabled_at
      )
      select
        slug,
        display_name,
        email,
        case when status='disabled' then 'disabled' else 'active' end,
        login_password,
        case when coalesce(hardcover_sync_enabled, 0)=1 then hardcover_token else null end,
        case when coalesce(hardcover_sync_enabled, 0)=1 then hardcover_user_id else null end,
        case when coalesce(hardcover_sync_enabled, 0)=1 then hardcover_username else null end,
        created_at,
        updated_at,
        disabled_at
      from accounts;
      create unique index accounts_new_hardcover_user_id_uq
        on accounts_new(hardcover_user_id)
        where hardcover_user_id is not null;
      create table hardcover_requests_new (
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
      create table hardcover_daily_downloads_new (
        day text primary key,
        download_count integer not null default 0 check(download_count >= 0),
        updated_at text not null
      );
    `);
    if (hasProcessed) {
      database.exec(`
        insert into hardcover_requests_new(
          account_slug, hardcover_user_book_id, hardcover_book_id, title, author, status,
          selected_md5, selected_title, selected_format, selected_language,
          download_path, imported_at, moved_at, error, created_at, updated_at
        )
        select
          user_slug, user_book_id, hardcover_book_id, title, author, status,
          selected_md5, selected_title, selected_format, selected_language,
          download_path, imported_at, moved_at, error, created_at, updated_at
        from hardcover_processed;
      `);
    }
    if (hasDailyDownloads) {
      database.exec(`
        insert into hardcover_daily_downloads_new(day, download_count, updated_at)
        select day, count, updated_at from hardcover_daily_downloads;
      `);
    }
    const migratedAccounts = Number(scalar(database, "select count(*) from accounts_new") || 0);
    const migratedRequests = Number(scalar(database, "select count(*) from hardcover_requests_new") || 0);
    const migratedDailyRows = Number(scalar(database, "select count(*) from hardcover_daily_downloads_new") || 0);
    if (migratedAccounts !== plan.accountCount) throw new Error("Account row count changed during migration.");
    if (migratedRequests !== plan.requestCount) throw new Error("Hardcover request row count changed during migration.");
    if (migratedDailyRows !== plan.dailyCountRows) throw new Error("Daily download row count changed during migration.");
    database.exec(`
      drop table accounts;
      drop table if exists hardcover_processed;
      drop table if exists hardcover_daily_downloads;
      drop table if exists audit_log;
      alter table accounts_new rename to accounts;
      alter table hardcover_requests_new rename to hardcover_requests;
      alter table hardcover_daily_downloads_new rename to hardcover_daily_downloads;
      create index hardcover_requests_status_idx on hardcover_requests(account_slug, status, updated_at);
      pragma user_version = 2;
      commit;
    `);
    database.exec("pragma foreign_keys = on");
    database.exec("pragma wal_checkpoint(truncate)");
    database.exec("vacuum");
    const integrityResult = integrity(database);
    if (integrityResult !== "ok") throw new Error(`Post-migration integrity check failed: ${integrityResult}`);
    return { ...plan, backupDir: finalBackupDir, migrated: true };
  } catch (error) {
    try {
      database.exec("rollback");
    } catch {}
    throw error;
  } finally {
    database.close();
  }
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
  migrateV2,
  migrationPlan,
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
