const fs = require("fs");
const os = require("os");
const path = require("path");
const config = require("./config");
const state = require("./state");
const system = require("./system");

function generate(row) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "books-readest-"));
  const zipPath = path.join(tempDir, "readest.zip");
  const catalogUrl = `https://${config.publicHost}/catalog`;
  try {
    fs.writeFileSync(path.join(tempDir, "library.json"), "[]\n", { mode: 0o600 });
    fs.writeFileSync(path.join(tempDir, "settings.json"), `${JSON.stringify({
      opdsCatalogs: [{
        id: "books",
        name: "Books",
        url: catalogUrl,
        username: row.slug,
        password: row.books_password,
        autoDownload: true,
        contentId: state.md5(`opds:${catalogUrl.toLowerCase()}`),
        addedAt: Date.now()
      }],
      kosync: {
        enabled: true,
        serverUrl: `https://${config.publicHost}/kosync`,
        username: row.slug,
        userkey: state.md5(row.books_password),
        password: row.books_password,
        checksumMethod: "binary",
        strategy: "prompt"
      },
      syncCategories: {
        book: false,
        progress: false,
        note: true,
        dictionary: false,
        font: true,
        texture: true,
        opds_catalog: true,
        settings: true,
        credentials: true
      }
    }, null, 2)}\n`, { mode: 0o600 });
    system.run("zip", ["-qr", zipPath, "library.json", "settings.json"], { cwd: tempDir });
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
