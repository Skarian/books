const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");

function resetModules() {
  for (const mod of ["../src/state", "../src/config"]) {
    delete require.cache[require.resolve(mod)];
  }
}

function loadState(dir) {
  resetModules();
  process.env.BOOKS_ENV_FILE = path.join(dir, "missing.env");
  process.env.BOOKS_DATA_DIR = dir;
  process.env.BOOKS_CONFIG_DIR = dir;
  process.env.BOOKS_ACCOUNTS_DB = path.join(dir, "accounts.sqlite");
  process.env.BOOKS_PUBLIC_HOST = "books.test";
  return require("../src/state");
}

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "books-test-"));
}

function createV1Database(file, overrides = {}) {
  const database = new DatabaseSync(file);
  database.exec(`
    create table accounts (
      slug text primary key,
      display_name text not null,
      email text,
      status text not null,
      roles text,
      login_user text,
      login_password text,
      opds_user text,
      opds_password text,
      kosync_user text,
      kosync_password text,
      setup_user text,
      setup_password text,
      readest_email text,
      hardcover_sync_enabled integer,
      hardcover_token text,
      hardcover_user_id integer,
      hardcover_username text,
      created_at text not null,
      updated_at text not null,
      disabled_at text,
      purged_at text
    );
    create table hardcover_processed (
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
    create table hardcover_daily_downloads (
      day text primary key,
      count integer not null,
      updated_at text not null
    );
    create table audit_log (
      id integer primary key,
      actor text,
      action text,
      created_at text not null
    );
  `);
  const row = {
    slug: "neil",
    display_name: "Neil",
    email: "neil@example.com",
    status: "active",
    roles: "owner",
    login_user: "neil",
    login_password: "beacon-forest-river-window",
    opds_user: "opds_neil",
    opds_password: "old-opds",
    kosync_user: "sync_neil",
    kosync_password: "old-sync",
    setup_user: "setup_neil",
    setup_password: "old-setup",
    readest_email: null,
    hardcover_sync_enabled: 1,
    hardcover_token: "Bearer token",
    hardcover_user_id: 59280,
    hardcover_username: "neil",
    created_at: "2026-06-01T00:00:00+00:00",
    updated_at: "2026-06-01T00:00:00+00:00",
    disabled_at: null,
    purged_at: null,
    ...overrides
  };
  database.prepare(`
    insert into accounts values (
      $slug, $display_name, $email, $status, $roles, $login_user, $login_password,
      $opds_user, $opds_password, $kosync_user, $kosync_password, $setup_user,
      $setup_password, $readest_email, $hardcover_sync_enabled, $hardcover_token,
      $hardcover_user_id, $hardcover_username, $created_at, $updated_at,
      $disabled_at, $purged_at
    )
  `).run(row);
  database.prepare(`
    insert into hardcover_processed values (
      'neil', 101, 501, 'Fixture Book', 'A. Writer', 'fulfilled', 'abc',
      'Fixture Book', 'epub', 'english', '/srv/books/downloads/book.epub',
      '2026-06-02T00:00:00+00:00', '2026-06-02T00:00:00+00:00',
      null, '2026-06-02T00:00:00+00:00', '2026-06-02T00:00:00+00:00'
    )
  `).run();
  database.prepare("insert into hardcover_daily_downloads values ('2026-06-02', 1, '2026-06-02T00:00:00+00:00')").run();
  database.prepare("insert into audit_log(actor, action, created_at) values ('test', 'created', '2026-06-02T00:00:00+00:00')").run();
  database.close();
}

test("fresh database initializes to the v2 schema", () => {
  const dir = tmpdir();
  const state = loadState(dir);
  state.migrate();
  const database = state.db();
  assert.equal(database.prepare("pragma user_version").get().user_version, 2);
  const accountColumns = database.prepare("pragma table_info(accounts)").all().map((row) => row.name);
  assert.ok(accountColumns.includes("books_password"));
  assert.ok(!accountColumns.includes("login_password"));
  assert.ok(!accountColumns.includes("opds_user"));
  assert.ok(database.prepare("select name from sqlite_schema where type='table' and name='hardcover_requests'").get());
  state.closeForTests();
});

test("v1 migration archives old data and preserves the one Books password", () => {
  const dir = tmpdir();
  const dbPath = path.join(dir, "accounts.sqlite");
  createV1Database(dbPath);
  const state = loadState(dir);
  const backupDir = path.join(dir, "backup");
  const result = state.migrateV2({ execute: true, backupDir });
  assert.equal(result.migrated, true);
  assert.equal(fs.existsSync(path.join(backupDir, "accounts.sqlite.pre-v2.bak")), true);
  assert.equal(fs.existsSync(path.join(backupDir, "audit_log.pre-v2.json")), true);

  const database = new DatabaseSync(dbPath);
  const row = database.prepare("select * from accounts where slug='neil'").get();
  assert.equal(row.books_password, "beacon-forest-river-window");
  assert.equal(row.hardcover_user_id, 59280);
  assert.equal(database.prepare("select count(*) as count from hardcover_requests").get().count, 1);
  assert.equal(database.prepare("select download_count from hardcover_daily_downloads where day='2026-06-02'").get().download_count, 1);
  const accountColumns = database.prepare("pragma table_info(accounts)").all().map((item) => item.name);
  assert.ok(!accountColumns.includes("login_user"));
  assert.ok(!accountColumns.includes("roles"));
  assert.equal(database.prepare("select name from sqlite_schema where type='table' and name='audit_log'").get(), undefined);
  assert.equal(database.prepare("pragma integrity_check").get().integrity_check, "ok");
  database.close();
});

test("v1 migration refuses username rename data", () => {
  const dir = tmpdir();
  createV1Database(path.join(dir, "accounts.sqlite"), { login_user: "other-neil" });
  const state = loadState(dir);
  assert.throws(() => state.migrationPlan(), /username rename is not supported/);
});
