const fs = require("fs");
const crypto = require("crypto");
const os = require("os");
const path = require("path");
const ai = require("./ai");
const config = require("./config");
const state = require("./state");
const system = require("./system");

const SIMPLEUI_VERSION = "2.1";
const SIMPLEUI_URL = `https://github.com/doctorhetfield-cmd/simpleui.koplugin/archive/refs/tags/${SIMPLEUI_VERSION}.tar.gz`;
const SIMPLEUI_DIR = path.join(config.configDir, `simpleui-${SIMPLEUI_VERSION}.koplugin`);
const DICTIONARY_URL = "https://raw.githubusercontent.com/Vuizur/Wiktionary-Dictionaries/master/English-English%20Wiktionary%20dictionary%20stardict.tar.gz";
const DICTIONARY_SHA256 = "2800f630d2975ea29a7b5763e7d79ed71dab9abcc6157534d75c7cd721e8b64b";
// TODO: Add Google search as a dictionary lookup option.
const DICTIONARY_DIR = path.join(config.configDir, "english-wiktionary-stardict");
const AI_DICTIONARY_DIR = path.join(__dirname, "..", "assets", "books-ai-dictionary.koplugin");
const BOOKS_PLUGIN_DIR = path.join(__dirname, "..", "assets", "books.koplugin");
const KOBO_STYLE_SCREENSAVER_PATCH = path.join(__dirname, "..", "assets", "kobo-patches", "2-kobo-style-screensaver.lua");
const BUNDLES = {
  "koreader-android-kindle.zip": "koreader",
  "koreader-kobo.zip": ".adds/koreader"
};

function lua(value, depth = 0) {
  const indent = "  ".repeat(depth);
  const next = "  ".repeat(depth + 1);
  if (Array.isArray(value)) return `{\n${value.map((item) => `${next}${lua(item, depth + 1)},`).join("\n")}\n${indent}}`;
  if (value && typeof value === "object") {
    return `{\n${Object.entries(value).map(([key, item]) => `${next}["${key}"] = ${lua(item, depth + 1)},`).join("\n")}\n${indent}}`;
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return "nil";
}

function writeLua(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `return ${lua(value)}\n`, { mode: 0o600 });
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function writeLegacyKosyncPatch(file, settings, network, token, koboStyle) {
  const readerDefaults = {
    copt_font_size: 30,
    twelve_hour_clock: true
  };
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, [
    `local token = ${lua(token)}`,
    `local desired = ${lua(settings)}`,
    `local network = ${lua(network)}`,
    `local reader_defaults = ${lua(readerDefaults)}`,
    ...(koboStyle ? [`local kobo_style = ${lua(koboStyle)}`] : []),
    'local DataStorage = require("datastorage")',
    'local ok_lfs, lfs = pcall(require, "libs/libkoreader-lfs")',
    'local books_dir = (DataStorage:getDataDir() or "."):gsub("/+$", "") .. "/books"',
    'if ok_lfs and not lfs.attributes(books_dir) then lfs.mkdir(books_dir) end',
    "local changed = false",
    'local marker = G_reader_settings:readSetting("books_kosync_setup_token")',
    'local kosync = G_reader_settings:readSetting("kosync") or {}',
    "if marker ~= token then",
    "  for key, value in pairs(desired) do kosync[key] = value end",
    '  G_reader_settings:saveSetting("home_dir", books_dir)',
    '  G_reader_settings:saveSetting("download_dir", books_dir)',
    '  G_reader_settings:saveSetting("lastdir", books_dir)',
    '  G_reader_settings:saveSetting("quickstart_shown_version", 9999999999)',
    '  local help_dir = (DataStorage:getDataDir() or "."):gsub("/+$", "") .. "/help"',
    '  if ok_lfs and lfs.attributes(help_dir, "mode") == "directory" then for name in lfs.dir(help_dir) do if name:match("^quickstart%-.*%.html$") then os.remove(help_dir .. "/" .. name) end end end',
    '  G_reader_settings:saveSetting("kosync", kosync)',
    '  G_reader_settings:saveSetting("books_kosync_setup_token", token)',
    "  changed = true",
    "end",
    "for key, value in pairs(network) do",
    "  if G_reader_settings:readSetting(key) == nil then",
    "    G_reader_settings:saveSetting(key, value)",
    "    changed = true",
    "  end",
    "end",
    "for key, value in pairs(reader_defaults) do",
    "  if G_reader_settings:readSetting(key) == nil then",
    "    G_reader_settings:saveSetting(key, value)",
    "    changed = true",
    "  end",
    "end",
    ...(koboStyle ? [
      'if not G_reader_settings:isTrue("books_kobo_style_screensaver_v1") then',
      '  local current_type = G_reader_settings:readSetting("screensaver_type")',
      '  if current_type == nil or current_type == "cover" then',
      '    G_reader_settings:saveSetting("screensaver_type", "kobo_style")',
      "    changed = true",
      "  end",
      "  for key, value in pairs(kobo_style) do",
      "    if G_reader_settings:readSetting(key) == nil then",
      "      G_reader_settings:saveSetting(key, value)",
      "      changed = true",
      "    end",
      "  end",
      '  G_reader_settings:makeTrue("books_kobo_style_screensaver_v1")',
      "  changed = true",
      "end"
    ] : []),
    "if changed then G_reader_settings:flush() end",
    ""
  ].join("\n"), { mode: 0o600 });
}

function stageKoboStyleScreensaver(root) {
  const target = path.join(root, "patches", "2-kobo-style-screensaver.lua");
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.copyFileSync(KOBO_STYLE_SCREENSAVER_PATCH, target);
}

function downloadSimpleUi() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "books-simpleui-"));
  const archive = path.join(tempDir, "simpleui.tar.gz");
  const pending = `${SIMPLEUI_DIR}.${process.pid}.tmp`;
  try {
    system.run("curl", ["-fsSL", SIMPLEUI_URL, "-o", archive]);
    system.run("tar", ["-xzf", archive, "-C", tempDir]);
    const source = fs.readdirSync(tempDir).map((name) => path.join(tempDir, name)).find((file) => fs.statSync(file).isDirectory());
    if (!source || !fs.existsSync(path.join(source, "main.lua"))) throw new Error("Downloaded SimpleUI archive did not contain main.lua.");
    fs.rmSync(pending, { recursive: true, force: true });
    fs.cpSync(source, pending, { recursive: true });
    fs.renameSync(pending, SIMPLEUI_DIR);
  } finally {
    fs.rmSync(pending, { recursive: true, force: true });
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function stageSimpleUi(root, download = downloadSimpleUi) {
  if (!fs.existsSync(SIMPLEUI_DIR) || !fs.statSync(SIMPLEUI_DIR).isDirectory()) download();
  fs.mkdirSync(path.join(root, "plugins"), { recursive: true, mode: 0o700 });
  fs.cpSync(SIMPLEUI_DIR, path.join(root, "plugins", "simpleui.koplugin"), { recursive: true });
}

function dictionaryReady() {
  if (!fs.existsSync(DICTIONARY_DIR) || !fs.statSync(DICTIONARY_DIR).isDirectory()) return false;
  const files = fs.readdirSync(DICTIONARY_DIR);
  return [".ifo", ".idx", ".dict.dz", ".syn"].every((suffix) => files.some((name) => name.endsWith(suffix)));
}

function relabelDictionary(dir) {
  const ifo = fs.readdirSync(dir).find((name) => name.endsWith(".ifo"));
  if (!ifo) throw new Error("Downloaded dictionary archive did not contain an .ifo file.");
  const file = path.join(dir, ifo);
  const content = fs.readFileSync(file, "utf8").replace(/^bookname=.*$/m, "bookname=English");
  if (!/^bookname=English$/m.test(content)) throw new Error("Downloaded dictionary archive did not contain bookname metadata.");
  fs.writeFileSync(file, content);
  fs.writeFileSync(path.join(dir, "NOTICE.txt"), [
    "English dictionary from Vuizur/Wiktionary-Dictionaries.",
    "Source: https://github.com/Vuizur/Wiktionary-Dictionaries",
    "Data derived from Wiktionary and licensed under CC BY-SA/GFDL.",
    ""
  ].join("\n"));
}

function downloadDictionary() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "books-dict-"));
  const archive = path.join(tempDir, "dictionary.tar.gz");
  const pending = `${DICTIONARY_DIR}.${process.pid}.tmp`;
  try {
    system.run("curl", ["-fsSL", DICTIONARY_URL, "-o", archive]);
    if (sha256(archive) !== DICTIONARY_SHA256) throw new Error("Downloaded dictionary checksum did not match.");
    system.run("tar", ["-xzf", archive, "-C", tempDir]);
    const source = fs.readdirSync(tempDir).map((name) => path.join(tempDir, name)).find((file) => fs.statSync(file).isDirectory());
    if (!source) throw new Error("Downloaded dictionary archive did not contain a directory.");
    relabelDictionary(source);
    fs.rmSync(pending, { recursive: true, force: true });
    fs.cpSync(source, pending, { recursive: true });
    fs.rmSync(DICTIONARY_DIR, { recursive: true, force: true });
    fs.renameSync(pending, DICTIONARY_DIR);
  } finally {
    fs.rmSync(pending, { recursive: true, force: true });
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function stageDictionary(root, download = downloadDictionary) {
  if (!dictionaryReady()) download();
  const target = path.join(root, "data", "dict", "English");
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.cpSync(DICTIONARY_DIR, target, { recursive: true });
}

function stageAiDictionary(root) {
  fs.mkdirSync(path.join(root, "plugins"), { recursive: true, mode: 0o700 });
  fs.cpSync(AI_DICTIONARY_DIR, path.join(root, "plugins", "books-ai-dictionary.koplugin"), { recursive: true });
}

function stageBooksPlugin(root, row, homeProfile) {
  const target = path.join(root, "plugins", "books.koplugin");
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.cpSync(BOOKS_PLUGIN_DIR, target, { recursive: true });
  writeLua(path.join(target, "config.lua"), {
    browse_url: `https://${config.publicHost}/catalog`,
    updates_url: `https://${config.publicHost}/catalog/navcatalog/4f6e6577657374?library_id=library`,
    home_profile: homeProfile,
    username: row.slug,
    password: row.books_password
  });
}

function generate(row, name, options = {}) {
  const rootName = BUNDLES[name];
  if (!rootName) return null;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "books-koreader-"));
  const root = path.join(tempDir, rootName);
  const zipPath = path.join(tempDir, name);
  const kosync = {
    custom_server: `https://${config.publicHost}/kosync`,
    username: row.slug,
    userkey: state.md5(row.books_password),
    auto_sync: true,
    sync_forward: 2,
    sync_backward: 3,
    checksum_method: 0
  };
  const network = {
    wifi_enable_action: "turn_on"
  };
  let koboStyle;
  if (name === "koreader-kobo.zip") {
    network.wifi_disable_action = "turn_off";
    network.auto_disable_wifi = true;
    network.auto_restore_wifi = true;
    koboStyle = {
      kobo_style_language: "en",
      kobo_style_global_scale: 100,
      kobo_style_show_title: true,
      kobo_style_show_chapter: true,
      kobo_style_show_progress: true,
      kobo_style_show_time_left: true,
      kobo_style_show_today_time: false,
      kobo_style_show_cover: true,
      kobo_style_show_pages: true,
      kobo_style_show_quote: false
    };
  }
  try {
    fs.mkdirSync(path.join(root, "books"), { recursive: true, mode: 0o700 });
    writeLegacyKosyncPatch(path.join(root, "patches", "2-books-kosync.lua"), kosync, network, state.md5(`${row.slug}:${kosync.userkey}:${kosync.custom_server}:books-folder-v2`), koboStyle);
    if (koboStyle) stageKoboStyleScreensaver(root);
    stageSimpleUi(root, options.downloadSimpleUi);
    stageBooksPlugin(root, row, name === "koreader-kobo.zip" ? "kobo" : "android");
    stageDictionary(root, options.downloadDictionary);
    if (ai.enabled()) stageAiDictionary(root);
    system.run("zip", ["-qr", zipPath, rootName.split("/")[0]], { cwd: tempDir });
    return { path: zipPath, tempDir };
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

function cleanup(bundle) {
  if (bundle) fs.rmSync(bundle.tempDir, { recursive: true, force: true });
}

module.exports = {
  BUNDLES,
  cleanup,
  generate
};
