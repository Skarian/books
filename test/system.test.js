const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

function resetModules() {
  for (const mod of ["../src/system", "../src/state", "../src/config"]) {
    delete require.cache[require.resolve(mod)];
  }
}

function ok(stdout = "") {
  return { status: 0, stdout, stderr: "" };
}

function load(dir, spawnSync) {
  resetModules();
  const original = childProcess.spawnSync;
  childProcess.spawnSync = spawnSync;
  process.env.BOOKS_DATA_DIR = dir;
  process.env.BOOKS_PUBLIC_HOST = "books.test";
  return {
    config: require("../src/config"),
    state: require("../src/state"),
    system: require("../src/system"),
    restore: () => {
      childProcess.spawnSync = original;
      resetModules();
    }
  };
}

function inputFile(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "Power.epub");
  fs.writeFileSync(file, "epub");
  return file;
}

function normalizedCover(args, source) {
  const target = `${args.at(-1)}.jpg`;
  fs.copyFileSync(source, target);
  return ok(`${target}\n`);
}

test("ISBN imports use Calibre metadata directly and keep operational identifiers", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "books-system-test-"));
  const calls = [];
  const { system, restore } = load(dir, (command, args) => {
    calls.push({ command, args: args.slice() });
    if (command === "ebook-meta" && args.includes("--get-cover")) {
      fs.writeFileSync(args[args.indexOf("--get-cover") + 1], "source cover");
      return ok();
    }
    if (command === "fetch-ebook-metadata") {
      if (calls.filter((call) => call.command === "fetch-ebook-metadata").length === 1) return { status: 1, stdout: "", stderr: "timeout" };
      return ok("<package><metadata /></package>\n");
    }
    if (command === "ebook-meta" && args.includes("--to-opf")) {
      fs.writeFileSync(args[args.indexOf("--to-opf") + 1], "<package />\n");
      return ok();
    }
    if (command === "calibre-debug") return normalizedCover(args, args.at(-2));
    if (command === "ebook-polish") {
      fs.writeFileSync(args.at(-1), "polished");
      return ok();
    }
    return ok();
  });

  try {
    const finalized = system._test.finalizedImportCopy(inputFile(dir), {
      title: "Power",
      authors: ["Jeffrey Pfeffer"],
      isbn: "9780062010612",
      annaMd5: "abc123"
    });
    try {
      assert.equal(fs.readFileSync(finalized.path, "utf8"), "polished");
    } finally {
      finalized.cleanup();
    }
  } finally {
    restore();
  }

  const extract = calls.findIndex((call) => call.command === "ebook-meta" && call.args.includes("--get-cover"));
  const fetched = calls.findIndex((call) => call.command === "fetch-ebook-metadata");
  const clearTags = calls.findIndex((call) => call.command === "ebook-meta" && call.args.includes("--tags"));
  const apply = calls.findIndex((call) => call.command === "ebook-meta" && call.args.includes("--from-opf"));
  const toOpf = calls.findIndex((call) => call.command === "ebook-meta" && call.args.includes("--to-opf"));
  const polish = calls.findIndex((call) => call.command === "ebook-polish");
  assert.deepEqual([extract, fetched, clearTags, apply, toOpf, polish].map((i) => i >= 0), [true, true, true, true, true, true]);
  assert.ok(extract < fetched && fetched < clearTags && clearTags < apply && apply < toOpf && toOpf < polish);
  assert.ok(calls[extract].args.includes("--disallow-rendered-cover"));
  assert.equal(calls[fetched].args.includes("--cover"), false);
  assert.ok(calls[polish].args[calls[polish].args.indexOf("--cover") + 1].endsWith("normalized-cover.jpg"));
  assert.ok(calls[fetched].args.includes("--isbn"));
  assert.ok(calls[fetched].args.includes("9780062010612"));
  assert.ok(calls[apply].args.includes("--isbn"));
  assert.ok(calls[apply].args.includes("9780062010612"));
  assert.ok(calls[apply].args.includes("--identifier"));
  assert.ok(calls[apply].args.includes("anna:abc123"));
  assert.equal(calls[apply].args.includes("--title"), false);
  assert.equal(calls[apply].args.includes("--authors"), false);
  assert.equal(calls[apply].args.includes("--language"), false);
});

test("import finalization fetches a cover only when the source has none", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "books-system-test-"));
  const calls = [];
  const { system, restore } = load(dir, (command, args) => {
    calls.push({ command, args: args.slice() });
    if (command === "ebook-meta" && args.includes("--get-cover")) return { status: 1, stdout: "", stderr: "no cover" };
    if (command === "fetch-ebook-metadata") {
      fs.writeFileSync(args[args.indexOf("--cover") + 1], "fetched cover");
      return ok("<package><metadata /></package>\n");
    }
    if (command === "ebook-meta" && args.includes("--to-opf")) {
      fs.writeFileSync(args[args.indexOf("--to-opf") + 1], "<package />\n");
      return ok();
    }
    if (command === "calibre-debug") return normalizedCover(args, args.at(-2));
    if (command === "ebook-polish") {
      fs.writeFileSync(args.at(-1), "polished");
      return ok();
    }
    return ok();
  });

  try {
    const finalized = system._test.finalizedImportCopy(inputFile(dir), { title: "Power", authors: ["Jeffrey Pfeffer"] });
    finalized.cleanup();
  } finally {
    restore();
  }

  const fetched = calls.find((call) => call.command === "fetch-ebook-metadata");
  const polish = calls.find((call) => call.command === "ebook-polish");
  assert.ok(fetched.args.includes("--cover"));
  assert.ok(polish.args[polish.args.indexOf("--cover") + 1].endsWith("normalized-cover.jpg"));
});

test("ISBN import finalization falls back to local metadata when fetch has no result", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "books-system-test-"));
  const calls = [];
  const { system, restore } = load(dir, (command, args) => {
    calls.push({ command, args: args.slice() });
    if (command === "ebook-meta" && args.includes("--get-cover")) {
      fs.writeFileSync(args[args.indexOf("--get-cover") + 1], "");
      return ok();
    }
    return command === "fetch-ebook-metadata" ? { status: 1, stdout: "", stderr: "not found" } : ok();
  });

  try {
    const finalized = system._test.finalizedImportCopy(inputFile(dir), {
      title: "Power",
      authors: ["Jeffrey Pfeffer"],
      isbn: "9780062010612"
    });
    finalized.cleanup();
  } finally {
    restore();
  }

  assert.ok(calls.some((call) => call.command === "fetch-ebook-metadata"));
  assert.equal(calls.filter((call) => call.command === "fetch-ebook-metadata").length, 3);
  const local = calls.find((call) => call.command === "ebook-meta" && call.args.includes("--title"));
  assert.ok(local);
  assert.ok(local.args.includes("--authors"));
  assert.ok(local.args.includes("--language"));
  assert.ok(local.args.includes("9780062010612"));
  assert.equal(local.args.includes("--tags"), false);
  assert.equal(calls.some((call) => call.command === "ebook-polish"), false);
});

test("import finalization polishes a source cover when metadata fetch fails", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "books-system-test-"));
  const calls = [];
  const { system, restore } = load(dir, (command, args) => {
    calls.push({ command, args: args.slice() });
    if (command === "ebook-meta" && args.includes("--get-cover")) {
      fs.writeFileSync(args[args.indexOf("--get-cover") + 1], "source cover");
      return ok();
    }
    if (command === "fetch-ebook-metadata") return { status: 1, stdout: "", stderr: "not found" };
    if (command === "ebook-meta" && args.includes("--to-opf")) {
      fs.writeFileSync(args[args.indexOf("--to-opf") + 1], "<package />\n");
      return ok();
    }
    if (command === "calibre-debug") return normalizedCover(args, args.at(-2));
    if (command === "ebook-polish") {
      fs.writeFileSync(args.at(-1), "polished");
      return ok();
    }
    return ok();
  });

  try {
    const finalized = system._test.finalizedImportCopy(inputFile(dir), { title: "Power", authors: ["Jeffrey Pfeffer"] });
    finalized.cleanup();
  } finally {
    restore();
  }

  assert.equal(calls.filter((call) => call.command === "fetch-ebook-metadata").length, 3);
  assert.equal(calls.some((call) => call.command === "fetch-ebook-metadata" && call.args.includes("--cover")), false);
  assert.ok(calls.some((call) => call.command === "ebook-polish"));
});

test("import finalization fails closed when cover polishing fails", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "books-system-test-"));
  const { system, restore } = load(dir, (command, args) => {
    if (command === "ebook-meta" && args.includes("--get-cover")) {
      fs.writeFileSync(args[args.indexOf("--get-cover") + 1], "source cover");
      return ok();
    }
    if (command === "ebook-meta" && args.includes("--to-opf")) {
      fs.writeFileSync(args[args.indexOf("--to-opf") + 1], "<package />\n");
      return ok();
    }
    if (command === "calibre-debug") return normalizedCover(args, args.at(-2));
    if (command === "ebook-polish") return { status: 1, stdout: "", stderr: "failed" };
    return ok();
  });

  try {
    assert.throws(() => system._test.finalizedImportCopy(inputFile(dir)), /could not polish/);
  } finally {
    restore();
  }
});

test("cover normalization preserves PNG and converts progressive JPEG to baseline", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "books-system-cover-test-"));
  const { system, restore } = load(dir, childProcess.spawnSync);
  try {
    const png = path.join(dir, "cover-source");
    const progressive = path.join(dir, "progressive-source");
    system.run("calibre-debug", ["-c", "from PIL import Image; import sys; Image.new('RGB', (16, 24), 'red').save(sys.argv[1], 'PNG')", png]);
    system.run("calibre-debug", ["-c", "from PIL import Image; import sys; Image.new('RGB', (16, 24), 'blue').save(sys.argv[1], 'JPEG', progressive=True)", progressive]);

    const normalizedPng = system._test.normalizeCover(png, dir);
    const normalizedJpeg = system._test.normalizeCover(progressive, dir);
    assert.ok(normalizedPng.endsWith(".png"));
    assert.ok(normalizedJpeg.endsWith(".jpg"));
    const probe = system.run("calibre-debug", ["-c", "from PIL import Image; import sys; im=Image.open(sys.argv[1]); print(im.format, bool(im.info.get('progressive') or im.info.get('progression')))", normalizedJpeg]);
    assert.equal(probe.stdout.trim(), "JPEG False");
  } finally {
    restore();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Calibre imports use new records and ISBN metadata without title overrides", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "books-system-test-"));
  const calls = [];
  const { config, state, system, restore } = load(dir, (command, args) => {
    calls.push({ command, args: args.slice() });
    if (command === "fetch-ebook-metadata") return { status: 1, stdout: "", stderr: "" };
    if (command === "ebook-meta") return ok();
    if (command === "calibredb" && args.includes("custom_columns")) return ok("books_users\n");
    if (command === "calibredb" && args.includes("add")) return ok("Added book ids: 7\n");
    return ok();
  });

  try {
    fs.mkdirSync(config.configDir, { recursive: true });
    fs.writeFileSync(config.secretsFile, JSON.stringify({ calibre_admin_password: "secret" }));
    state.createAccount({ name: "Alice", slug: "alice" });
    assert.deepEqual(system.importFiles([inputFile(dir)], {
      users: ["alice"],
      title: "Power",
      authors: ["Jeffrey Pfeffer"],
      isbn: "9780062010612",
      annaMd5: "abc123"
    }), [{ calibre_book_id: 7, users: ["alice"], title: "Power" }]);
  } finally {
    restore();
  }

  const add = calls.find((call) => call.command === "calibredb" && call.args.includes("add"));
  assert.ok(add);
  assert.equal(add.args[add.args.indexOf("--automerge") + 1], "new_record");
  assert.ok(add.args.includes("--isbn"));
  assert.ok(add.args.includes("9780062010612"));
  assert.ok(add.args.includes("--identifier"));
  assert.ok(add.args.includes("anna:abc123"));
  assert.equal(add.args.includes("--title"), false);
  assert.equal(add.args.includes("--authors"), false);
  assert.equal(add.args.includes("--languages"), false);
  assert.equal(add.args.includes("--tags"), false);
});
