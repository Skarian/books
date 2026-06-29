const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const generatePassphrase = require("eff-diceware-passphrase");
const config = require("./config");

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
  for (;;) {
    const words = generatePassphrase(6);
    if (words.every((word) => /^[a-z]+$/.test(word))) return words.join("-");
  }
}

function blank() {
  return { version: 1, accounts: [], hardcover_daily_downloads: {} };
}

function readState() {
  return fs.existsSync(config.stateFile) ? JSON.parse(fs.readFileSync(config.stateFile, "utf8")) : blank();
}

function writeState(data) {
  fs.mkdirSync(path.dirname(config.stateFile), { recursive: true });
  const tmp = `${config.stateFile}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, config.stateFile);
}

function mutate(change) {
  const lockDir = `${config.stateFile}.lock`;
  fs.mkdirSync(path.dirname(config.stateFile), { recursive: true });
  for (let i = 0; ; i += 1) {
    try {
      fs.mkdirSync(lockDir);
      break;
    } catch (error) {
      if (error.code !== "EEXIST" || i === 199) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try {
    const data = readState();
    const result = change(data);
    writeState(data);
    return result;
  } finally {
    fs.rmSync(lockDir, { recursive: true, force: true });
  }
}

function account(data, slug) {
  return data.accounts.find((row) => row.slug === slug);
}

function getAccount(slug) {
  const row = account(readState(), slug);
  if (!row) throw new Error(`No account named ${slug}.`);
  return row;
}

function activeAccountsWithHardcover() {
  return readState().accounts
    .filter((row) => row.hardcover_token)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

function listAccounts() {
  return readState().accounts.slice().sort((a, b) => a.display_name.localeCompare(b.display_name));
}

function firstActiveAccount() {
  return readState().accounts.slice().sort((a, b) => a.slug.localeCompare(b.slug))[0];
}

function updateAccount(slug, values) {
  if (!Object.keys(values).length) return;
  mutate((data) => {
    const row = account(data, slug);
    if (!row) throw new Error(`No account named ${slug}.`);
    Object.assign(row, values, { updated_at: values.updated_at || now() });
  });
}

function createAccount({ name, slug, email }) {
  const finalSlug = slug || slugify(name);
  return mutate((data) => {
    if (account(data, finalSlug)) throw new Error(`Account already exists: ${finalSlug}`);
    const timestamp = now();
    const row = {
      slug: finalSlug,
      display_name: name,
      email: email || null,
      books_password: passphrase(),
      hardcover_token: null,
      hardcover_user_id: null,
      hardcover_username: null,
      created_at: timestamp,
      updated_at: timestamp
    };
    data.accounts.push(row);
    return row;
  });
}

function setHardcoverToken(slug, token, profile) {
  updateAccount(slug, { hardcover_token: token, hardcover_user_id: profile.id, hardcover_username: profile.username });
}

function clearHardcoverToken(slug) {
  updateAccount(slug, { hardcover_token: null, hardcover_user_id: null, hardcover_username: null });
}

function dailyCount() {
  return Number(readState().hardcover_daily_downloads[today()]?.download_count || 0);
}

function incrementDaily() {
  mutate((data) => {
    const daily = data.hardcover_daily_downloads[today()] || { download_count: 0 };
    data.hardcover_daily_downloads[today()] = { download_count: daily.download_count + 1, updated_at: now() };
  });
}

module.exports = {
  now, today, md5, passphrase, readState, writeState, getAccount, listAccounts,
  firstActiveAccount, activeAccountsWithHardcover, createAccount,
  updateAccount, setHardcoverToken, clearHardcoverToken, dailyCount, incrementDaily
};
