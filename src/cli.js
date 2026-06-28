#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const readline = require("node:readline/promises");
const config = require("./config");
const state = require("./state");
const system = require("./system");
const hardcover = require("./hardcover");

function usage() {
  console.log(`Usage: ./scripts/books COMMAND [ARGS...]

Commands:
  bootstrap              Initialize container data paths and Calibre admin user
  health                 Check proxy, OPDS, and KOSync health
  verify [USER]          Run local route and per-user auth checks
  import FILE...         Import EPUB files into Calibre
  sync-fixture           Copy and import the Books Sync Fixture EPUB
  anna ARGS...           Run Anna's Archive MCP/CLI through the configured env
  users ARGS...          Manage reader users and credentials
  hardcover ARGS...      Sync Hardcover Want to Read items into the library
  opds-url               Print the catalog OPDS URL
  kosync-url             Print the KOSync URL`);
}

function printAccount(row, json = false) {
  const payload = state.accountPayload(row);
  if (json) return console.log(JSON.stringify(payload, null, 2));
  console.log(`${payload.display_name} (${payload.slug}) [${payload.status}]`);
  console.log(`Setup: ${payload.setup_url}`);
  console.log();
  console.log("Use this login for setup, the book catalog, and reading sync:");
  console.log(`Username: ${payload.books_username}`);
  console.log(`Password: ${payload.books_password}`);
  console.log();
  console.log(`Readest: ${payload.readest_url}`);
  console.log("Readest account: create or sign in with your own Readest account.");
  console.log();
  console.log(`OPDS URL: ${payload.opds_url}`);
  console.log();
  console.log(`KOSync URL: ${payload.kosync_url}`);
  if (payload.hardcover_sync_enabled) {
    console.log();
    console.log(`Hardcover: ${payload.hardcover_username}`);
  }
}

async function readSecret(prompt) {
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8");
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(prompt);
  } finally {
    rl.close();
  }
}

function requireArg(value, message) {
  if (!value) throw new Error(message);
  return value;
}

async function reconcile(user) {
  for (const line of await system.reconcile(user)) console.log(line);
}

async function users(args) {
  const command = args.shift();
  if (command === "list") {
    for (const row of state.listAccounts()) console.log(`${row.slug}\t${row.status}\t${row.display_name}\t${row.email || ""}`);
  } else if (command === "create") {
    const name = requireArg(args.shift(), "Missing name.");
    let slug;
    let email;
    while (args.length) {
      const arg = args.shift();
      if (arg === "--slug") slug = requireArg(args.shift(), "Missing --slug value.");
      else if (arg === "--email") email = requireArg(args.shift(), "Missing --email value.");
      else throw new Error(`Unknown users create option: ${arg}`);
    }
    const row = state.createAccount({ name, slug, email });
    await reconcile(row.slug);
    printAccount(state.getAccount(row.slug));
  } else if (command === "show") {
    const user = requireArg(args.shift(), "Missing user.");
    printAccount(state.getAccount(user), args.includes("--json"));
  } else if (command === "reconcile") {
    await reconcile(args.shift());
  } else {
    throw new Error("Unknown users command.");
  }
}

async function hardcoverCommand(args) {
  const command = args.shift();
  if (command === "set-token") {
    const user = requireArg(args.shift(), "Missing user.");
    let tokenFile;
    while (args.length) {
      const arg = args.shift();
      if (arg === "--token-file") tokenFile = requireArg(args.shift(), "Missing --token-file value.");
      else throw new Error(`Unknown hardcover set-token option: ${arg}`);
    }
    const token = hardcover.normalizeToken(tokenFile ? fs.readFileSync(tokenFile, "utf8") : await readSecret("Hardcover API token: "));
    const profile = await hardcover.verifyToken(token);
    state.getAccount(user);
    state.setHardcoverToken(user, token, profile);
    console.log(`Hardcover sync enabled for ${user} as ${profile.username} (${profile.id}).`);
  } else if (command === "clear-token") {
    const user = requireArg(args.shift(), "Missing user.");
    state.clearHardcoverToken(user);
    console.log(`Hardcover sync disabled for ${user}.`);
  } else if (command === "status") {
    const user = args.shift();
    for (const row of user ? [state.getAccount(user)] : state.listAccounts()) {
      console.log(`${row.slug}\t${row.hardcover_token ? "enabled" : "disabled"}\t${row.hardcover_username || "-"}`);
    }
    console.log(`daily_downloads\t${state.dailyCount()}/${config.hardcoverDailyDownloadCap}\t${state.today()}`);
  } else if (command === "sync") {
    const options = {};
    while (args.length) {
      const arg = args.shift();
      if (arg === "--user") options.user = requireArg(args.shift(), "Missing --user value.");
      else if (arg === "--dry-run") options.dryRun = true;
      else if (arg === "--limit") options.limit = Number(requireArg(args.shift(), "Missing --limit value."));
      else throw new Error(`Unknown hardcover sync option: ${arg}`);
    }
    await hardcover.sync(options);
  } else {
    throw new Error("Unknown hardcover command.");
  }
}

function importCommand(args) {
  if (!args.length) throw new Error("No files supplied. Usage: ./scripts/books import FILE [FILE ...]");
  system.importFiles(args);
}

function syncFixture() {
  const target = path.join(config.downloadDir, "books-sync-fixture.epub");
  system.writeSyncFixture(target);
  console.log(`Wrote ${target}`);
  system.importFiles([target]);
  console.log("Imported Books Sync Fixture into Calibre.");
}

async function main() {
  const args = process.argv.slice(2);
  const command = args.shift();
  if (!command || ["-h", "--help"].includes(command)) usage();
  else if (command === "bootstrap") system.bootstrap();
  else if (command === "health") console.log(await system.health());
  else if (command === "verify") console.log(await system.verify(args.shift()));
  else if (command === "import") importCommand(args);
  else if (command === "sync-fixture") syncFixture();
  else if (command === "anna") {
    const result = system.annas(args, { stdio: "inherit", check: false });
    process.exitCode = result.status || 0;
  } else if (command === "users") await users(args);
  else if (command === "hardcover") await hardcoverCommand(args);
  else if (command === "opds-url") console.log(`https://${config.publicHost}/catalog`);
  else if (command === "kosync-url") console.log(`https://${config.publicHost}/kosync`);
  else throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
