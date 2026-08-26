const fs = require("fs");
const path = require("path");
const config = require("./config");

const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 1000;
const ACTIVE_STATUSES = ["queued", "resolving", "locating", "downloading"];

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  let payload = {};
  try {
    payload = await response.json();
  } catch {
  }
  if (!response.ok) {
    const detail = payload.error || payload.message || `${response.status}`;
    const error = new Error(`Shelfmark request failed: ${detail}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function searchReleases(query) {
  const text = String(query || "").trim();
  if (!text) throw new Error("Shelfmark search query is required.");
  const url = new URL("/api/releases", config.shelfmarkUrl);
  url.searchParams.set("source", "direct_download");
  url.searchParams.set("query", text);
  url.searchParams.set("format", "epub");
  url.searchParams.set("lang", "en");
  const payload = await jsonRequest(url);
  if (!Array.isArray(payload.releases)) throw new Error("Shelfmark search returned an invalid releases payload.");
  return payload.releases;
}

function statusTask(payload, status, md5) {
  const tasks = payload && payload[status];
  if (!tasks || typeof tasks !== "object") return null;
  return Object.entries(tasks).find(([id]) => id.toLowerCase() === md5)?.[1] || null;
}

function completedPath(remotePath) {
  const prefix = "/books/";
  if (typeof remotePath !== "string" || !remotePath.startsWith(prefix)) {
    throw new Error("Shelfmark completed without a valid staging path.");
  }
  const staging = fs.realpathSync(config.shelfmarkDownloadDir);
  const candidate = fs.realpathSync(path.resolve(staging, remotePath.slice(prefix.length)));
  const relative = path.relative(staging, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Shelfmark returned a path outside its staging directory: ${remotePath}`);
  }
  if (!fs.statSync(candidate).isFile() || path.extname(candidate).toLowerCase() !== ".epub") {
    throw new Error(`Shelfmark did not produce an EPUB file: ${remotePath}`);
  }
  return candidate;
}

async function downloadRelease(release, requestedTitle) {
  const md5 = String(release?.source_id || "").trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(md5)) throw new Error("Shelfmark release does not have a valid MD5 source_id.");
  const body = {
    source: "direct_download",
    source_id: md5,
    title: String(requestedTitle || release.title || "book").trim(),
    format: "epub",
    size: release.size,
    language: release.language,
    extra: release.extra || {}
  };

  try {
    await jsonRequest(new URL("/api/releases/download", config.shelfmarkUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (error) {
    if (!/already in the download queue/i.test(String(error.payload?.error || error.message))) throw error;
  }

  const deadline = Date.now() + DOWNLOAD_TIMEOUT_MS;
  while (Date.now() <= deadline) {
    const status = await jsonRequest(new URL("/api/status", config.shelfmarkUrl));
    const complete = statusTask(status, "complete", md5);
    if (complete) return completedPath(complete.download_path);
    for (const terminal of ["error", "cancelled"]) {
      const task = statusTask(status, terminal, md5);
      if (task) throw new Error(`Shelfmark download ${terminal}: ${task.status_message || md5}`);
    }
    if (!ACTIVE_STATUSES.some((active) => statusTask(status, active, md5))) {
      throw new Error(`Shelfmark lost download status for ${md5}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`Shelfmark download timed out for ${md5}.`);
}

module.exports = { searchReleases, downloadRelease };
