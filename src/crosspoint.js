const fs = require("fs");
const os = require("os");
const path = require("path");
const config = require("./config");
const state = require("./state");
const system = require("./system");

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function generate(row) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "books-crosspoint-"));
  const root = path.join(tempDir, ".crosspoint");
  const zipPath = path.join(tempDir, "crosspoint.zip");
  try {
    writeJson(path.join(root, "opds.json"), {
      servers: [{
        name: "Books",
        url: `https://${config.publicHost}/catalog`,
        username: row.slug,
        password: row.books_password
      }]
    });
    writeJson(path.join(root, "koreader.json"), {
      username: row.slug,
      password: row.books_password,
      serverUrl: `https://${config.publicHost}/kosync`,
      matchMethod: 1
    });
    system.run("zip", ["-qr", zipPath, ".crosspoint"], { cwd: tempDir });
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
  cleanup,
  generate
};
