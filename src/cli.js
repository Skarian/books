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
  status                 Show service status
  health                 Check local nginx, Calibre, Node, OPDS, and KOSync health
  verify [USER]          Run local production checks for routes and per-user auth
  restart                Restart services and reload nginx
  import [--convert] F   Import EPUB files into Calibre
  sync-fixture           Generate and import the Books Sync Fixture EPUB
  anna ARGS...           Run Anna's Archive MCP/CLI through the configured env
  users ARGS...          Manage family users and credentials
  hardcover ARGS...      Sync Hardcover Want to Read items into the library
  opds-url               Print the catalog OPDS URL
  kosync-url             Print the KOSync URL
  proxy-commands         Print documented exe.dev share commands
  install-skill          Install/symlink the repo books skill into CODEX_HOME`);
}

function printAccount(row, json = false) {
  const payload = state.accountPayload(row);
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(`${payload.display_name} (${payload.slug}) [${payload.status}]`);
  console.log(`Setup: ${payload.setup_url}`);
  console.log();
  console.log("Use this login for setup, the book catalog, and reading sync:");
  console.log(`Username: ${payload.login_user}`);
  console.log(`Password: ${payload.login_password}`);
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

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function readSecret(prompt) {
  if (!process.stdin.isTTY) return readStdin();
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

async function users(args) {
  const command = args.shift();
  if (command === "init") {
    state.migrate();
    console.log(`Initialized ${config.accountsDb}`);
  } else if (command === "list") {
    for (const row of state.listAccounts()) {
      console.log(`${row.slug}\t${row.status}\t${row.display_name}\t${row.email || ""}\t${row.roles}`);
    }
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
    for (const line of system.reconcile(row.slug)) console.log(line);
    printAccount(state.getAccount(row.slug));
  } else if (command === "show") {
    const user = requireArg(args.shift(), "Missing user.");
    printAccount(state.getAccount(user), args.includes("--json"));
  } else if (command === "disable") {
    const user = requireArg(args.shift(), "Missing user.");
    state.disableAccount(user);
    for (const line of system.reconcile(user)) console.log(line);
  } else if (command === "rotate") {
    const user = requireArg(args.shift(), "Missing user.");
    const service = requireArg(args.shift(), "Missing service.");
    if (!["login", "all"].includes(service)) throw new Error("service must be login or all.");
    state.rotateLogin(user);
    for (const line of system.reconcile(user)) console.log(line);
    printAccount(state.getAccount(user));
  } else if (command === "purge") {
    const user = requireArg(args.shift(), "Missing user.");
    if (!args.includes("--yes")) throw new Error("Refusing to purge without --yes.");
    const row = state.getAccount(user);
    system.kosyncPurgeUser(row.kosync_user);
    system.kosyncPurgeUser(state.serviceUser(row));
    system.calibreRemoveUser(row.opds_user);
    system.calibreRemoveUser(state.serviceUser(row));
    state.purgeAccount(user);
  } else if (command === "reconcile") {
    const user = args.shift();
    for (const line of system.reconcile(user)) console.log(line);
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
    const rows = user ? [state.getAccount(user)] : state.listAccounts();
    for (const row of rows) {
      const enabled = row.hardcover_sync_enabled && row.hardcover_token ? "enabled" : "disabled";
      console.log(`${row.slug}\t${enabled}\t${row.hardcover_username || "-"}`);
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
  let convert = false;
  const files = [];
  while (args.length) {
    const arg = args.shift();
    if (arg === "--convert") convert = true;
    else files.push(arg);
  }
  if (!files.length) throw new Error("No files supplied. Usage: ./scripts/books import [--convert] FILE [FILE ...]");
  system.importFiles(files, convert);
}

function syncFixture(args) {
  let noImport = false;
  let output;
  while (args.length) {
    const arg = args.shift();
    if (arg === "--no-import") noImport = true;
    else if (arg === "--output") output = requireArg(args.shift(), "Missing --output value.");
    else throw new Error(`Unknown sync-fixture option: ${arg}`);
  }
  const target = output || path.join(config.downloadDir, "books-sync-fixture.epub");
  system.writeSyncFixture(target);
  console.log(`Wrote ${target}`);
  if (!noImport) {
    system.importFiles([target], false);
    console.log("Imported Books Sync Fixture into Calibre.");
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args.shift();
  if (!command || ["-h", "--help"].includes(command)) {
    usage();
  } else if (command === "status") {
    system.run("systemctl", ["--no-pager", "--full", "status", "books-calibre", "books-node", "books-kosync", "books-hardcover-sync.timer", "nginx"], { stdio: "inherit" });
  } else if (command === "health") {
    console.log(await system.health());
  } else if (command === "verify") {
    console.log("Checking services...");
    console.log(await system.verify(args.shift()));
  } else if (command === "restart") {
    system.run("systemctl", ["restart", "books-calibre"]);
    system.run("systemctl", ["restart", "books-node"]);
    system.run("systemctl", ["restart", "books-kosync"]);
    system.run("systemctl", ["start", "books-hardcover-sync.timer"]);
    system.run("nginx", ["-t"], { stdio: "inherit" });
    system.run("systemctl", ["reload", "nginx"]);
  } else if (command === "import") {
    importCommand(args);
  } else if (command === "sync-fixture") {
    syncFixture(args);
  } else if (command === "anna") {
    const result = system.annas(args, { stdio: "inherit", check: false });
    process.exitCode = result.status || 0;
  } else if (command === "users") {
    await users(args);
  } else if (command === "hardcover") {
    await hardcoverCommand(args);
  } else if (command === "opds-url") {
    console.log(`https://${config.publicHost}/catalog`);
  } else if (command === "kosync-url") {
    console.log(`https://${config.publicHost}/kosync`);
  } else if (command === "proxy-commands") {
    const vm = config.publicHost.split(".")[0];
    console.log(`Run these from your local machine, per exe.dev docs:

ssh exe.dev share port ${vm} ${config.proxyPort}
ssh exe.dev share set-public ${vm}

To return to private access:
ssh exe.dev share set-private ${vm}`);
  } else if (command === "install-skill") {
    system.run(path.join(__dirname, "..", "scripts", "install-skill"), [], { stdio: "inherit" });
  } else {
    usage();
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
