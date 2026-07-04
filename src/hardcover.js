const fs = require("fs");
const path = require("path");
const config = require("./config");
const state = require("./state");
const system = require("./system");

const GRAPHQL_URL = "https://api.hardcover.app/v1/graphql";
const WANT_TO_READ_STATUS = 1;
const CURRENTLY_READING_STATUS = 2;
const PROGRESS_THRESHOLD = 0.01;
const TITLE_STOPWORDS = new Set(["a", "an", "and", "are", "as", "at", "by", "for", "from", "has", "have", "in", "into", "it", "of", "on", "or", "the", "to", "with"]);
const AUTHOR_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

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

function meaningfulTokens(value) {
  return (String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/['\u2019]/g, "").toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter((token) => !TITLE_STOPWORDS.has(token) && (/^\d+$/.test(token) || token.length >= 3));
}

function tokenSet(value) {
  return new Set(meaningfulTokens(value));
}

function hasAsciiLeadingTitle(value) {
  return /^[A-Za-z0-9]/.test(String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/^[\s"'([{<]+/, ""));
}

function authorSurnames(author) {
  return String(author || "").split(/\s*(?:,|&|\band\b)\s*/i).map((name) => {
    const tokens = meaningfulTokens(name).filter((token) => !AUTHOR_SUFFIXES.has(token));
    return tokens[tokens.length - 1];
  }).filter(Boolean);
}

function isEligibleCandidate(item, title, author) {
  if (!item.hash || String(item.format || "").trim().toLowerCase() !== "epub") return false;
  if (!["english", "eng", "en"].includes(String(item.language || "").trim().toLowerCase())) return false;
  if (hasAsciiLeadingTitle(title) && !hasAsciiLeadingTitle(item.title)) return false;

  const titleTokens = meaningfulTokens(title);
  const candidateTitleTokens = tokenSet(item.title);
  if (!titleTokens.length || candidateTitleTokens.values().next().value !== titleTokens[0]) return false;
  if (!titleTokens.every((token) => candidateTitleTokens.has(token))) return false;

  if (String(author || "").trim()) {
    const surnames = authorSurnames(author);
    const candidateAuthorTokens = tokenSet(item.authors);
    if (!surnames.length || !surnames.some((token) => candidateAuthorTokens.has(token))) return false;
  }
  return true;
}

function scoreCandidate(item, title, author) {
  const candidateTitleTokens = tokenSet(item.title);
  const candidateAuthorTokens = tokenSet(item.authors);
  let score = 0;
  for (const token of meaningfulTokens(title)) if (candidateTitleTokens.has(token)) score += 3;
  for (const token of authorSurnames(author)) if (candidateAuthorTokens.has(token)) score += 2;
  return score;
}

function findCandidate(title, author) {
  const query = `${title} ${author} epub english`.trim();
  const result = system.annas(["book-search", query], { check: false });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Anna search failed for ${title}`);
  const candidates = parseAnnaBlocks(result.stdout).filter((item) => isEligibleCandidate(item, title, author));
  candidates.sort((a, b) => scoreCandidate(b, title, author) - scoreCandidate(a, title, author));
  if (!candidates.length) {
    throw new Error(`No English EPUB candidate found for ${title}`);
  }
  return candidates[0];
}

function downloadCandidate(candidate, filename) {
  fs.mkdirSync(config.downloadDir, { recursive: true });
  const downloadPath = path.join(config.downloadDir, filename);
  if (fs.existsSync(downloadPath)) return downloadPath;
  if (config.hardcoverDailyDownloadCap > 0 && state.dailyCount() >= config.hardcoverDailyDownloadCap) {
    throw new Error(`Daily Anna download cap reached: ${state.dailyCount()}/${config.hardcoverDailyDownloadCap}`);
  }
  const result = system.annas(["book-download", candidate.hash, filename], { check: false });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Anna download failed for ${candidate.hash}`);
  if (!fs.existsSync(downloadPath)) throw new Error(`Anna download completed but ${downloadPath} was not found.`);
  state.incrementDaily();
  return downloadPath;
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function bookKey(title, author) {
  return `${normalizeText(title)}|${normalizeText(author)}`;
}

function isbnValues(identifiers = {}) {
  return Array.from(new Set(String(identifiers.isbn || "").split(/[,\s;]+/)
    .map((value) => value.replace(/[^0-9Xx]/g, "").toUpperCase())
    .filter((value) => value.length === 10 || value.length === 13)));
}

function progressPages(percentage, pages) {
  const percent = Number(percentage);
  const total = Number(pages);
  if (!Number.isFinite(percent) || percent <= 0 || percent > 1 || !Number.isSafeInteger(total) || total < 1) return null;
  const page = Math.floor(percent * total);
  if (percent < PROGRESS_THRESHOLD && page < 1) return null;
  return Math.max(1, Math.min(total, page));
}

function progressTime(progress) {
  const timestamp = Number(progress.timestamp);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  const iso = new Date(timestamp * 1000).toISOString();
  return Number.isNaN(Date.parse(iso)) ? null : { iso, date: iso.slice(0, 10) };
}

function activeRead(userBook) {
  return (userBook.user_book_reads || []).slice().sort((a, b) => Number(b.id || 0) - Number(a.id || 0)).find((read) => !read.finished_at)
    || null;
}

async function hardcoverUserBooks(token) {
  const data = await graphql(token, `
    query UserBooks {
      me {
        user_books(limit: 500) {
          id
          book_id
          status_id
          edition_id
          edition { id pages }
          book {
            title
            contributions { author { name } }
          }
          user_book_reads {
            id
            edition_id
            started_at
            finished_at
            progress_pages
          }
        }
      }
    }
  `);
  return data.me && data.me[0] ? data.me[0].user_books : [];
}

async function editionByIsbn(token, isbn) {
  const data = await graphql(token, `
    query EditionByIsbn($isbn: String!) {
      editions(where: {_or: [{isbn_10: {_eq: $isbn}}, {isbn_13: {_eq: $isbn}}]}, limit: 2) {
        id
        book_id
        pages
      }
    }
  `, { isbn });
  const editions = data.editions || [];
  return editions.length === 1 ? editions[0] : null;
}

async function resolveExactEdition(token, book) {
  for (const isbn of isbnValues(book.identifiers)) {
    const edition = await editionByIsbn(token, isbn);
    if (edition && Number.isSafeInteger(Number(edition.pages)) && Number(edition.pages) > 0) return edition;
  }
  return null;
}

async function createCurrentlyReading(token, edition, when) {
  const data = await graphql(token, `
    mutation InsertUserBook($object: UserBookCreateInput!) {
      insert_user_book(object: $object) {
        error
        user_book {
          id
        }
      }
    }
  `, {
    object: {
      book_id: Number(edition.book_id),
      edition_id: Number(edition.id),
      status_id: CURRENTLY_READING_STATUS,
      date_added: when.date,
      first_started_reading_date: when.date,
      action_at: when.iso
    }
  });
  if (data.insert_user_book.error) throw new Error(data.insert_user_book.error);
  return data.insert_user_book.user_book;
}

async function upsertUserBookRead(token, userBook, read) {
  const data = await graphql(token, `
    mutation UpsertUserBookRead($userBookId: Int!, $datesRead: [DatesReadInput]!) {
      upsert_user_book_reads(user_book_id: $userBookId, datesRead: $datesRead) {
        error
        user_book_id
      }
    }
  `, { userBookId: Number(userBook.id), datesRead: [read] });
  if (data.upsert_user_book_reads.error) throw new Error(data.upsert_user_book_reads.error);
}

async function progressTarget(row, book, userBooks, options = {}) {
  const hardcoverBookId = Number(book.identifiers?.hardcover);
  if (Number.isSafeInteger(hardcoverBookId) && hardcoverBookId > 0) {
    const matches = userBooks.filter((userBook) => Number(userBook.book_id) === hardcoverBookId);
    if (matches.length !== 1) return { error: matches.length ? "ambiguous stored Hardcover match" : "no stored Hardcover row for user" };
    return { userBook: matches[0] };
  }
  const titleMatches = userBooks.filter((userBook) => bookKey(userBook.book?.title, authors(userBook.book || {})) === bookKey(book.title, book.authors));
  if (titleMatches.length > 1) return { error: "ambiguous Hardcover title match" };
  if (titleMatches[0]) return { userBook: titleMatches[0] };
  const edition = await (options.resolveEdition || resolveExactEdition)(row.hardcover_token, book);
  if (!edition) return { error: "no exact Hardcover identifier match" };
  const bookMatches = userBooks.filter((userBook) => Number(userBook.book_id) === Number(edition.book_id));
  if (bookMatches.length > 1) return { error: "ambiguous Hardcover book match" };
  return bookMatches[0] ? { userBook: bookMatches[0] } : { edition };
}

async function pushBookProgress(row, book, progress, userBooks, options = {}) {
  const log = options.log || console.log;
  const when = progressTime(progress);
  if (!when) return log(`${row.slug}: skipped ${book.title}: invalid KOSync timestamp`), 0;

  const target = await progressTarget(row, book, userBooks, options);
  if (target.error) return log(`${row.slug}: skipped ${book.title}: ${target.error}`), 0;

  let userBook = target.userBook;
  const edition = target.edition || userBook.edition;
  const pages = progressPages(progress.percentage, Number(edition?.pages));
  if (!pages) return log(`${row.slug}: skipped ${book.title}: progress below threshold or missing page count`), 0;
  if (userBook && ![WANT_TO_READ_STATUS, CURRENTLY_READING_STATUS].includes(Number(userBook.status_id))) {
    return log(`${row.slug}: skipped ${book.title}: Hardcover status ${userBook.status_id} is not writable`), 0;
  }

  const read = userBook ? activeRead(userBook) : null;
  if (Number(read?.progress_pages || 0) >= pages) return log(`${row.slug}: skipped ${book.title}: Hardcover progress is already at page ${read.progress_pages}`), 0;
  const payload = {
    edition_id: Number((userBook?.edition_id || edition.id)),
    progress_pages: pages,
    started_at: read?.started_at || when.date,
    action_at: when.iso
  };
  if (read?.id) payload.id = Number(read.id);

  if (options.dryRun) {
    log(`${row.slug}: dry-run progress ${book.title}: ${userBook ? "update" : "create"} Hardcover page ${pages}`);
    return 1;
  }
  if (!userBook) userBook = await (options.createUserBook || createCurrentlyReading)(row.hardcover_token, edition, when);
  else if (Number(userBook.status_id) === WANT_TO_READ_STATUS) await (options.moveToCurrentlyReading || moveToCurrentlyReading)(row.hardcover_token, userBook.id);
  await (options.upsertRead || upsertUserBookRead)(row.hardcover_token, userBook, payload);
  log(`${row.slug}: pushed progress ${book.title}: page ${pages}`);
  return 1;
}

async function pushReadingProgress(row, options = {}) {
  const books = options.books || system.listUserEpubBooks(row.slug);
  const userBooks = options.userBooks || await hardcoverUserBooks(row.hardcover_token);
  let pushed = 0;
  for (const book of books) {
    try {
      const hash = options.hash ? options.hash(book) : system.koreaderDocumentHash(book.epubPath);
      const progress = options.progress ? await options.progress(hash, book) : await system.kosyncProgress(row, hash);
      if (!progress) continue;
      pushed += await pushBookProgress(row, book, progress, userBooks, options);
    } catch (error) {
      (options.log || console.error)(`${row.slug}: error pushing ${book.title}: ${error.message}`);
    }
  }
  if (pushed || options.dryRun) (options.log || console.log)(`${row.slug}: ${options.dryRun ? "would push" : "pushed"} ${pushed} progress update(s)`);
  return pushed;
}

async function fulfillRequest(row, userBook, title, author, candidate) {
  const existingId = system.findBookByAnna(candidate.hash);
  if (existingId) {
    const users = system.grantBookVisibility(existingId, [row.slug]);
    system.addIdentifier(existingId, "hardcover", userBook.book_id);
    await moveToCurrentlyReading(row.hardcover_token, userBook.id);
    return { calibre_book_id: existingId, users };
  }

  const filename = safeFilename(`${title} - ${author || "Unknown"} - anna-${candidate.hash.slice(0, 12)}`);
  const downloadPath = downloadCandidate(candidate, filename);
  const [book] = system.importFiles([downloadPath], {
    users: [row.slug],
    annaMd5: candidate.hash,
    title,
    authors: author ? [author] : []
  });
  system.addIdentifier(book.calibre_book_id, "hardcover", userBook.book_id);
  await moveToCurrentlyReading(row.hardcover_token, userBook.id);
  return book;
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
    try {
      console.log(`${row.slug}: searching ${title}${author ? ` by ${author}` : ""}`);
      const candidate = findCandidate(title, author);
      if (options.dryRun) {
        console.log(`dry-run candidate: ${candidate.hash} ${candidate.format} ${candidate.language} ${candidate.title}`);
        processedCount += 1;
        continue;
      }
      await fulfillRequest(row, userBook, title, author, candidate);
      console.log(`fulfilled: ${title}`);
      processedCount += 1;
    } catch (error) {
      console.error(`error: ${title}: ${error.message}`);
      processedCount += 1;
    }
  }
  try {
    await pushReadingProgress(row, options);
  } catch (error) {
    console.error(`error: ${row.slug} progress push: ${error.message}`);
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
    try {
      total += await syncUser(row, options);
    } catch (error) {
      console.error(`error: ${row.slug}: ${error.message}`);
      if (options.user) throw error;
    }
  }
  console.log(`processed ${total} item(s)`);
}

module.exports = {
  normalizeToken,
  verifyToken,
  sync,
  _test: {
    findCandidate,
    isEligibleCandidate,
    isbnValues,
    progressPages,
    progressTime,
    pushReadingProgress
  }
};
