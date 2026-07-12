const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

function resetModules() {
  for (const mod of ["../src/koreader", "../src/ai", "../src/system", "../src/state", "../src/config"]) {
    delete require.cache[require.resolve(mod)];
  }
}

function load(dir, env = {}) {
  resetModules();
  process.env.BOOKS_DATA_DIR = dir;
  process.env.BOOKS_PUBLIC_HOST = "books.test";
  delete process.env.BOOKS_AI_PROVIDER;
  Object.assign(process.env, env);
  return {
    config: require("../src/config"),
    state: require("../src/state"),
    koreader: require("../src/koreader")
  };
}

function zipList(file) {
  const result = spawnSync("unzip", ["-Z", "-1", file], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim().split(/\r?\n/);
}

function zipRead(file, entry) {
  const result = spawnSync("unzip", ["-p", file, entry], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function writeFakeDictionary(config) {
  const dict = path.join(config.configDir, "english-wiktionary-stardict");
  fs.mkdirSync(dict, { recursive: true });
  fs.writeFileSync(path.join(dict, "English-English Wiktionary dictionary.ifo"), "StarDict's dict ifo file\nbookname=English\n");
  fs.writeFileSync(path.join(dict, "English-English Wiktionary dictionary.idx"), "idx");
  fs.writeFileSync(path.join(dict, "English-English Wiktionary dictionary.dict.dz"), "dict");
  fs.writeFileSync(path.join(dict, "English-English Wiktionary dictionary.syn"), "syn");
  fs.writeFileSync(path.join(dict, "NOTICE.txt"), "notice\n");
}

test("KOReader starter bundles include account settings and SimpleUI paths", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "books-koreader-test-"));
  const { config, state, koreader } = load(dir);
  state.createAccount({ name: "Alice", slug: "alice" });
  state.updateAccount("alice", { books_password: "alpha-bravo-charlie-delta-echo-foxtrot" });
  const row = state.getAccount("alice");
  const simpleUi = path.join(config.configDir, "simpleui-2.1.koplugin");
  fs.mkdirSync(simpleUi, { recursive: true });
  fs.writeFileSync(path.join(simpleUi, "main.lua"), "return {}\n");
  writeFakeDictionary(config);

  const androidBundle = koreader.generate(row, "koreader-android-kindle.zip");
  const koboBundle = koreader.generate(row, "koreader-kobo.zip");
  const android = zipList(androidBundle.path);
  assert.ok(android.includes("koreader/books/"));
  assert.ok(!android.includes("koreader/settings/opds.lua"));
  assert.ok(!android.includes("koreader/settings/kosync.lua"));
  assert.ok(android.includes("koreader/patches/2-books-kosync.lua"));
  assert.ok(android.includes("koreader/plugins/simpleui.koplugin/main.lua"));
  assert.ok(android.includes("koreader/plugins/books.koplugin/main.lua"));
  assert.ok(android.includes("koreader/plugins/books.koplugin/config.lua"));
  assert.ok(android.includes("koreader/plugins/books.koplugin/_meta.lua"));
  assert.ok(android.includes("koreader/plugins/books.koplugin/resume_home.lua"));
  assert.ok(android.includes("koreader/data/dict/English/English-English Wiktionary dictionary.ifo"));
  assert.ok(android.includes("koreader/data/dict/English/English-English Wiktionary dictionary.idx"));
  assert.ok(android.includes("koreader/data/dict/English/English-English Wiktionary dictionary.dict.dz"));
  assert.ok(android.includes("koreader/data/dict/English/English-English Wiktionary dictionary.syn"));
  assert.ok(android.includes("koreader/data/dict/English/NOTICE.txt"));
  assert.ok(!android.some((entry) => entry.includes("/plugins/books-ai-dictionary.koplugin/")));

  const kobo = zipList(koboBundle.path);
  assert.ok(kobo.includes(".adds/koreader/books/"));
  assert.ok(!kobo.includes(".adds/koreader/settings/opds.lua"));
  assert.ok(!kobo.includes(".adds/koreader/settings/kosync.lua"));
  assert.ok(kobo.includes(".adds/koreader/patches/2-books-kosync.lua"));
  assert.ok(kobo.includes(".adds/koreader/plugins/simpleui.koplugin/main.lua"));
  assert.ok(kobo.includes(".adds/koreader/plugins/books.koplugin/main.lua"));
  assert.ok(kobo.includes(".adds/koreader/data/dict/English/English-English Wiktionary dictionary.ifo"));
  assert.ok(!kobo.some((entry) => entry.includes("/plugins/books-ai-dictionary.koplugin/")));

  const booksConfig = zipRead(androidBundle.path, "koreader/plugins/books.koplugin/config.lua");
  const koboBooksConfig = zipRead(koboBundle.path, ".adds/koreader/plugins/books.koplugin/config.lua");
  assert.match(booksConfig, /https:\/\/books\.test\/catalog/);
  assert.match(booksConfig, /navcatalog\/4f6e6577657374\?library_id=library/);
  assert.match(booksConfig, /\["home_profile"\] = "android"/);
  assert.match(koboBooksConfig, /\["home_profile"\] = "kobo"/);
  assert.match(booksConfig, /alpha-bravo-charlie-delta-echo-foxtrot/);
  const booksPlugin = zipRead(androidBundle.path, "koreader/plugins/books.koplugin/main.lua");
  const resumeHome = zipRead(androidBundle.path, "koreader/plugins/books.koplugin/resume_home.lua");
  assert.match(booksPlugin, /runWhenOnline/);
  assert.match(booksPlugin, /dofile\(plugin_dir \.\. "config\.lua"\)/);
  assert.match(booksPlugin, /Synchronizing library…/);
  assert.match(booksPlugin, /Sync Books/);
  assert.match(booksPlugin, /\{ "sui_settings", "history", action, "power" \}/);
  assert.match(booksPlugin, /Config\.saveTabConfig\{ "homescreen", "home", group \}/);
  assert.match(booksPlugin, /books_simpleui_seeded_v2/);
  assert.match(booksPlugin, /ResumeHome\.seedIfFresh/);
  assert.match(booksPlugin, /config\.home_profile/);
  assert.match(booksPlugin, /ResumeHome\.applyRecentTitles/);
  assert.match(booksPlugin, /ResumeHome\.applyAppsPopupScale/);
  assert.match(resumeHome, /simpleui_onboarding_done/);
  assert.match(resumeHome, /SUISettings:get\("simpleui_layout"\) == nil/);
  assert.match(resumeHome, /SUISettings:get\("simpleui_hs_active_preset"\) == nil/);
  assert.match(resumeHome, /modules = \{ "clock", "currently", "recent" \}/);
  assert.match(resumeHome, /modules = \{ "clock", "quote", "coverdeck" \}/);
  assert.match(resumeHome, /clock_scale"\] = 100/);
  assert.match(resumeHome, /coverdeck_thumb_scale"\] = 110/);
  assert.match(resumeHome, /coverdeck_show_finished"\] = false/);
  assert.match(resumeHome, /clock_enabled"\] = true/);
  assert.match(resumeHome, /clock_date"\] = false/);
  assert.match(resumeHome, /clock_battery"\] = false/);
  assert.match(resumeHome, /recent_show_finished"\] = false/);
  assert.match(resumeHome, /COMPACT_VISUAL_SCALE = 1\.16/);
  assert.match(resumeHome, /math\.floor\(Screen:scaleBySize\(18\) \* COMPACT_VISUAL_SCALE\)/);
  assert.match(resumeHome, /ANDROID_VISUAL_SCALE = 1\.18/);
  assert.match(resumeHome, /opts\.name == "sui_win_qa_folder"/);
  assert.match(resumeHome, /win\._inner_w = win\._modal_w - 2 \* win\._pad_h/);
  assert.match(resumeHome, /math\.floor\(Screen:scaleBySize\(48\) \* ANDROID_VISUAL_SCALE\)/);
  assert.match(resumeHome, /return 6, 1\.47, 0, 3/);
  assert.match(resumeHome, /return 5, 1, 0, 5, Screen:scaleBySize\(18\)/);
  assert.doesNotMatch(resumeHome, /columns = math\.min\(columns, #books\)/);
  assert.match(resumeHome, /height_overflow_show_ellipsis = height ~= nil/);
  assert.match(resumeHome, /BottomContainer:new/);
  assert.match(resumeHome, /LeftContainer:new/);
  assert.match(resumeHome, /HorizontalSpan:new\{ width = column_gap \}/);
  assert.match(resumeHome, /card_w = d\.RECENT_W/);
  assert.match(resumeHome, /\* bodyVisualScale\(\)/);
  assert.match(resumeHome, /title_fs \* 0\.90/);
  assert.match(resumeHome, /mod_id == "clock"/);
  assert.match(resumeHome, /scale \* 0\.40/);
  assert.match(resumeHome, /mod_id == "currently"/);
  assert.match(resumeHome, /scale \* 0\.80/);
  assert.match(resumeHome, /local extra = Screen:scaleBySize\(4\)/);
  assert.match(resumeHome, /UI\.LABEL_PAD_BOT = UI\.LABEL_PAD_BOT \+ extra/);
  assert.match(resumeHome, /return getScaledLabelH\(\.\.\.\) \+ extra/);
  assert.doesNotMatch(resumeHome, /simpleui_topbar_config|simpleui_bar_tabs/);
  assert.match(booksPlugin, /Automatic Book Updates/);
  assert.match(booksPlugin, /Books Library/);
  assert.match(booksPlugin, /choice1_text = _\("Keep"\)/);
  assert.match(booksPlugin, /util\.makePath/);
  assert.match(booksPlugin, /genItemTableFromCatalog/);
  assert.match(booksPlugin, /Update canceled — 1 book updated!/);
  assert.match(booksPlugin, /\.part/);
  assert.match(booksPlugin, /books_coverbrowser_seeded/);
  assert.match(booksPlugin, /filemanager_display_mode/);
  assert.match(booksPlugin, /history_display_mode/);
  assert.match(booksPlugin, /collection_display_mode/);
  assert.match(booksPlugin, /config\.home_profile == "kobo"/);
  assert.match(booksPlugin, /saveSetting\("nb_cols_portrait", 3\)/);
  assert.match(booksPlugin, /saveSetting\("nb_rows_portrait", 2\)/);
  assert.match(booksPlugin, /list_image_meta/);
  assert.match(booksPlugin, /mosaic_image/);
  assert.match(booksPlugin, /BookInfoManager:closeDbConnection\(\)/);
  assert.doesNotMatch(booksPlugin, /setDisplayMode|registerPatchPluginFunc/);
  assert.doesNotMatch(booksPlugin, /nb_(?:cols|rows)_landscape/);
  assert.doesNotMatch(booksPlugin, /local _, name/);
  assert.doesNotMatch(booksPlugin, /onNetworkConnected|onResume|scheduleIn/);
  assert.match(zipRead(androidBundle.path, "koreader/data/dict/English/English-English Wiktionary dictionary.ifo"), /bookname=English/);

  const patch = zipRead(androidBundle.path, "koreader/patches/2-books-kosync.lua");
  assert.match(patch, /DataStorage:getDataDir/);
  assert.match(patch, /books_dir/);
  assert.match(patch, /home_dir/);
  assert.match(patch, /download_dir/);
  assert.match(patch, /lastdir/);
  assert.match(patch, /quickstart_shown_version/);
  assert.match(patch, /quickstart%-\.\*%\.html/);
  assert.match(patch, /G_reader_settings:readSetting\("kosync"\)/);
  assert.match(patch, /G_reader_settings:saveSetting\("kosync", kosync\)/);
  assert.match(patch, /reader_defaults/);
  assert.match(patch, /"copt_font_size"\] = 30/);
  assert.match(patch, /"twelve_hour_clock"\] = true/);
  assert.doesNotMatch(patch, /mosaic_image|bookinfomanager|registerPatchPluginFunc/);
  assert.match(patch, /https:\/\/books\.test\/kosync/);
  assert.match(patch, /auto_sync"\] = true/);
  assert.match(patch, /sync_forward"\] = 2/);
  assert.match(patch, /sync_backward"\] = 3/);
  assert.match(patch, /checksum_method"\] = 0/);
  assert.match(patch, /"wifi_enable_action"\] = "turn_on"/);
  assert.doesNotMatch(patch, /wifi_disable_action/);
  assert.doesNotMatch(patch, /auto_disable_wifi/);
  assert.doesNotMatch(patch, /auto_restore_wifi/);

  const koboPatch = zipRead(koboBundle.path, ".adds/koreader/patches/2-books-kosync.lua");
  assert.match(koboPatch, /"copt_font_size"\] = 30/);
  assert.match(koboPatch, /"twelve_hour_clock"\] = true/);
  assert.match(koboPatch, /"wifi_enable_action"\] = "turn_on"/);
  assert.match(koboPatch, /"wifi_disable_action"\] = "turn_off"/);
  assert.match(koboPatch, /"auto_disable_wifi"\] = true/);
  assert.match(koboPatch, /"auto_restore_wifi"\] = true/);
  koreader.cleanup(androidBundle);
  koreader.cleanup(koboBundle);
});

test("starter bundles download cached assets when missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "books-koreader-test-"));
  const { config, state, koreader } = load(dir);
  state.createAccount({ name: "Alice", slug: "alice" });
  state.updateAccount("alice", { books_password: "one-two-three-four-five-six" });
  const row = state.getAccount("alice");

  const bundle = koreader.generate(row, "koreader-android-kindle.zip", {
    downloadSimpleUi: () => {
      const simpleUi = path.join(config.configDir, "simpleui-2.1.koplugin");
      fs.mkdirSync(simpleUi, { recursive: true });
      fs.writeFileSync(path.join(simpleUi, "main.lua"), "return {}\n");
    },
    downloadDictionary: () => {
      writeFakeDictionary(config);
    }
  });
  assert.ok(zipList(bundle.path).includes("koreader/plugins/simpleui.koplugin/main.lua"));
  assert.ok(zipList(bundle.path).includes("koreader/data/dict/English/English-English Wiktionary dictionary.ifo"));
  koreader.cleanup(bundle);
});

test("KOReader starter bundles include AI dictionary plugin only when AI is enabled", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "books-koreader-test-"));
  const { config, state, koreader } = load(dir, { BOOKS_AI_PROVIDER: "codex" });
  state.createAccount({ name: "Alice", slug: "alice" });
  state.updateAccount("alice", { books_password: "alpha-bravo-charlie-delta-echo-foxtrot" });
  const row = state.getAccount("alice");
  const simpleUi = path.join(config.configDir, "simpleui-2.1.koplugin");
  fs.mkdirSync(simpleUi, { recursive: true });
  fs.writeFileSync(path.join(simpleUi, "main.lua"), "return {}\n");
  writeFakeDictionary(config);

  const androidBundle = koreader.generate(row, "koreader-android-kindle.zip");
  const koboBundle = koreader.generate(row, "koreader-kobo.zip");
  assert.ok(zipList(androidBundle.path).includes("koreader/plugins/books-ai-dictionary.koplugin/main.lua"));
  assert.ok(zipList(androidBundle.path).includes("koreader/plugins/books-ai-dictionary.koplugin/_meta.lua"));
  assert.ok(zipList(koboBundle.path).includes(".adds/koreader/plugins/books-ai-dictionary.koplugin/main.lua"));

  const plugin = zipRead(androidBundle.path, "koreader/plugins/books-ai-dictionary.koplugin/main.lua");
  assert.match(plugin, /AI Dictionary/);
  assert.match(plugin, /\/ai-dictionary\/lookup/);
  assert.match(plugin, /getSelectedWordContext\(40\)/);
  assert.match(plugin, /NetworkMgr:willRerunWhenOnline/);
  assert.match(plugin, /socketutil:set_timeout\(15, 75\)/);
  assert.match(plugin, /Trapper:wrap/);
  assert.match(plugin, /dismissableRunInSubprocess/);
  assert.match(plugin, /UIManager:forceRePaint/);
  assert.match(plugin, /container\/inputcontainer/);
  assert.match(plugin, /onDictButtonsReady/);
  assert.match(plugin, /dict_popup\.results\[1\]\.dict == _\("AI Dictionary"\)/);
  assert.match(plugin, /table\.insert\(buttons, 2/);
  assert.match(plugin, /showDict/);
  assert.match(plugin, /is_html = true/);
  assert.match(plugin, /type\(result\.label\) == "string"/);
  assert.match(plugin, /type\(result\.definitions\) == "table"/);
  assert.match(plugin, /<i>/);
  assert.doesNotMatch(plugin, /_books_ai_dictionary_handleEvent/);
  assert.doesNotMatch(plugin, /UIManager:scheduleIn\(0\.1, function\(\)\s*local answer/);
  for (const field of ["book", "chapter", "progress", "selection", "passage"]) {
    assert.match(plugin, new RegExp(`${field} =`));
  }
  assert.doesNotMatch(plugin, /alpha-bravo-charlie-delta-echo-foxtrot/);

  koreader.cleanup(androidBundle);
  koreader.cleanup(koboBundle);
});
