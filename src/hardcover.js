const fs = require("fs");
const path = require("path");
const config = require("./config");
const state = require("./state");
const system = require("./system");

const GRAPHQL_URL = "https://api.hardcover.app/v1/graphql";
const CURRENTLY_READING_STATUS = 2;

function normalizeToken(token) {
  const trimmed = String(token || "").trim();
  if (!trimmed) throw new Error("No Hardcover token provided.");
  return trimmed.startsWith("Bearer ") ? trimmed : `Bearer ${trimmed}`;
}

async function graphql(token, query, variables = {}) {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: normalizeToken(token),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query, variables })
  });
  const payload = await response.json();
  if (!response.ok || payload.errors) {
    throw new Error(JSON.stringify(payload.errors || payload, null, 2));
  }
  return payload.data;
}

async function verifyToken(token) {
  const data = await graphql(token, "query { me { id username } }");
  if (!data.me || !data.me[0]) throw new Error("Hardcover token did not return a user.");
  return data.me[0];
}

async function wantToRead(token) {
  const data = await graphql(token, `
    query WantToRead {
      me {
        user_books(where: {status_id: {_eq: 1}}, order_by: {created_at: asc}, limit: 100) {
          id
          book_id
          book {
            title
            contributions { author { name } }
          }
        }
      }
    }
  `);
  return data.me && data.me[0] ? data.me[0].user_books : [];
}

async function moveToCurrentlyReading(token, userBookId) {
  return graphql(token, `
    mutation MoveUserBook($id: Int!, $object: UserBookUpdateInput!) {
      update_user_book(id: $id, object: $object) { id }
    }
  `, { id: Number(userBookId), object: { status_id: CURRENTLY_READING_STATUS } });
}

function authors(book) {
  const names = [];
  for (const contribution of book.contributions || []) {
    const name = contribution.author && contribution.author.name;
    if (name && !names.includes(name)) names.push(name);
  }
  return names.join(", ");
}

function safeFilename(value) {
  return (String(value).replace(/[^A-Za-z0-9._ -]+/g, "").replace(/\s+/g, " ").trim().slice(0, 120) || "book") + ".epub";
}

function parseAnnaBlocks(output) {
  const blocks = [];
  let current = null;
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^Book \d+:$/.test(line)) {
      if (current) blocks.push(current);
      current = {};
      continue;
    }
    if (!current || !line.includes(":")) continue;
    const index = line.indexOf(":");
    current[line.slice(0, index).toLowerCase()] = line.slice(index + 1).trim();
  }
  if (current) blocks.push(current);
  return blocks;
}

function scoreCandidate(item, title, author) {
  const format = (item.format || "").toLowerCase();
  const language = (item.language || "").toLowerCase();
  const candidateTitle = (item.title || "").toLowerCase();
  const candidateAuthors = (item.authors || "").toLowerCase();
  let score = 0;
  if (format === "epub") score += 100;
  else score -= 100;
  if (["english", "eng", "en"].includes(language)) score += 50;
  else if (language) score -= 50;
  for (const token of `${title} ${author}`.toLowerCase().match(/[a-z0-9]+/g) || []) {
    if (token.length > 3 && (candidateTitle.includes(token) || candidateAuthors.includes(token))) score += 3;
  }
  if (item.hash) score += 1;
  return score;
}

function findCandidate(title, author) {
  const query = `${title} ${author} epub english`.trim();
  const result = system.annas(["book-search", query], { check: false });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Anna search failed for ${title}`);
  const candidates = parseAnnaBlocks(result.stdout).filter((item) => item.hash);
  candidates.sort((a, b) => scoreCandidate(b, title, author) - scoreCandidate(a, title, author));
  if (!candidates.length || scoreCandidate(candidates[0], title, author) < 50) {
    throw new Error(`No English EPUB candidate found for ${title}`);
  }
  return candidates[0];
}

function downloadAndImport(candidate, filename) {
  fs.mkdirSync(config.downloadDir, { recursive: true });
  const downloadPath = path.join(config.downloadDir, filename);
  let downloaded = false;
  if (!fs.existsSync(downloadPath)) {
    const result = system.annas(["book-download", candidate.hash, filename], { check: false });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Anna download failed for ${candidate.hash}`);
    downloaded = true;
  }
  if (!fs.existsSync(downloadPath)) throw new Error(`Anna download completed but ${downloadPath} was not found.`);
  if (downloaded) state.incrementDaily();
  system.importFiles([downloadPath]);
  return downloadPath;
}

async function syncUser(row, options = {}) {
  const items = await wantToRead(row.hardcover_token);
  console.log(`${row.slug}: ${items.length} Want to Read item(s)`);
  let processedCount = 0;
  for (const userBook of items) {
    if (options.limit && processedCount >= options.limit) break;
    const book = userBook.book || {};
    const title = (book.title || "").trim();
    const author = authors(book);
    if (!title) continue;
    if (config.hardcoverDailyDownloadCap > 0 && state.dailyCount() >= config.hardcoverDailyDownloadCap) {
      console.log(`Daily Anna download cap reached: ${state.dailyCount()}/${config.hardcoverDailyDownloadCap}`);
      break;
    }
    try {
      console.log(`${row.slug}: searching ${title}${author ? ` by ${author}` : ""}`);
      const candidate = findCandidate(title, author);
      if (options.dryRun) {
        console.log(`dry-run candidate: ${candidate.hash} ${candidate.format} ${candidate.language} ${candidate.title}`);
        processedCount += 1;
        continue;
      }
      const filename = safeFilename(`${title} - ${author || "Unknown"} - hardcover-${userBook.id}`);
      downloadAndImport(candidate, filename);
      await moveToCurrentlyReading(row.hardcover_token, userBook.id);
      console.log(`fulfilled: ${title}`);
      processedCount += 1;
    } catch (error) {
      console.error(`error: ${title}: ${error.message}`);
      processedCount += 1;
    }
  }
  return processedCount;
}

async function sync(options = {}) {
  const rows = options.user ? [state.getAccount(options.user)] : state.activeAccountsWithHardcover();
  let total = 0;
  for (const row of rows) {
    if (!row.hardcover_token) {
      console.log(`${row.slug}: no Hardcover token configured`);
      continue;
    }
    total += await syncUser(row, options);
  }
  console.log(`processed ${total} item(s)`);
}

module.exports = {
  normalizeToken,
  verifyToken,
  sync
};
