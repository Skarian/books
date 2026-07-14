# Architecture

Books is a Docker Compose stack combining Calibre, a KOReader sync server, an nginx proxy, and small Node.js services into a single reading backend.

## Design

- **Calibre** owns book files, metadata, OPDS discovery, and downloads.
- **KOSync** owns reading position.
- **Hosted Readest** owns the reading UI and Readest accounts.
- **The setup service** serves per-user reader config bundles.
- **The Node CLI** owns setup, imports, account reconciliation, and Hardcover intake commands.
- **Hardcover Want to Read** is the automatic intake queue.

Users read through hosted Readest, OPDS-capable apps, KOReader, or CrossPoint. They do not interact with Calibre directly.

## Containers

`compose.yaml` defines six services:

| Service | Image | Role |
|---|---|---|
| `proxy` | `nginx:alpine` | Reverse proxy on `BOOKS_BIND_ADDR:BOOKS_PROXY_PORT` |
| `calibre` | `books-runtime` | `calibre-server` with Basic auth, OPDS, and downloads |
| `kosync` | `koreader/kosync` (pinned by digest) | KOReader Sync Server backed by Redis |
| `setup` | `books-runtime` | Credential-gated KOReader setup ZIP downloads |
| `worker` | `books-runtime` | Runs `hardcover sync` every minute |
| `admin` | `books-runtime` | One-shot CLI container for owner commands |

`calibre`, `setup`, `worker`, and `admin` all use the `books-runtime` image built from the repo. The `setup` service and `worker` restart continuously. The `admin` container uses the `admin` Compose profile and only runs via `docker compose run` — it does not start with `docker compose up`.

All four `books-runtime` services mount the data directory at `/srv/books`. The `kosync` container mounts its Redis data under `/srv/books/kosync`.

## Routes

nginx on port 8000 handles all public traffic:

```
https://books.example.com
  /catalog              → Calibre OPDS (nginx rewrites /catalog → /opds before proxying)
  /opds                 → Calibre OPDS (Calibre's native path, kept for compatibility)
  /get/...              → Calibre book downloads
  /kosync/...           → KOSync (nginx strips the /kosync prefix before proxying)
  /koreader             → Books setup service page
  /readest              → Books setup service page
  /crosspoint           → Books setup service page
  /setup/<zip>          → Books setup service ZIP downloads
  /ai-dictionary/lookup → Optional AI dictionary lookup proxy
  /requests/search      → Search Hardcover using the authenticated user's stored token
  /requests/submit      → Add a Hardcover book to the user's Want to Read queue
  /library              → 302 redirect to https://web.readest.com/
  /healthz              → nginx returns "ok" directly, no upstream
  /kosync/users/create  → 404 (registration disabled; accounts are managed by the CLI)
```

nginx uses Docker's internal DNS resolver (`127.0.0.11`) with `valid=30s` so it resolves upstream container names dynamically and starts cleanly even if `calibre` or `kosync` are still initializing.

## Auth

**OPDS and downloads (`/catalog`, `/opds`, `/get/...`):** Calibre HTTP Basic auth. nginx passes the `Authorization` header through unchanged. Calibre validates credentials against `data/config/users.sqlite`.

**KOSync (`/kosync/...`):** KOSync's own credential scheme. Clients send `x-auth-user` (username) and `x-auth-key` (MD5 hash of the password) as request headers. KOSync stores passwords as MD5 hashes in Redis.

**Reader setup (`/koreader`, `/readest`, `/crosspoint`, `/setup/...`):** HTTP Basic auth against `state.json`. Setup pages and ZIP downloads use the authenticated user, and only known setup ZIP filenames are served.

**AI dictionary (`/ai-dictionary/lookup`):** Disabled unless `BOOKS_AI_PROVIDER` is set to `codex` or `openai`. Requests use the existing Books account Basic auth; provider credentials stay on the server.

**Book requests (`/requests/search`, `/requests/submit`):** Requests use the existing Books account Basic auth. The setup service resolves the account and calls Hardcover with the token stored in `state.json`; the token is never sent to the reader.

Both request routes accept JSON and return JSON with `Cache-Control: private, no-store`:

```text
POST /requests/search  { "query": "Dune" }
  200 { "results": [{ "id": 312460, "title": "Dune", "author": "Frank Herbert", "year": 1965, "users_count": 13290 }] }

POST /requests/submit  { "book_id": 312460 }
  200 { "status": "queued", "existing": false, "book": { "id": 312460, "title": "Dune", "author": "Frank Herbert" } }
```

Errors have a stable `error` code. The request API returns `401 unauthorized`, `400 invalid_request`, `409 hardcover_not_configured`, `409 already_in_library`, or `502 hardcover_unavailable`. An `already_in_library` response also includes Hardcover's numeric `status_id` and a `book_status` name.

Each user gets one Books login — username and diceware passphrase — that works for both systems. The `reconcile` command writes that login into Calibre and KOSync whenever an account is created, restored, or pushed.

Reader self-registration at `/kosync/users/create` is blocked at the proxy with a 404. All accounts are created and managed by the owner through the admin CLI.

## State

Runtime state lives under the data directory (`BOOKS_HOST_DATA_DIR`, default `./data`):

| Path | Contents |
|---|---|
| `data/config/state.json` | Account registry, Hardcover tokens, daily download counts |
| `data/config/secrets.json` | Calibre admin password (generated on bootstrap, not rotated) |
| `data/config/users.sqlite` | Calibre user database |
| `data/config/simpleui-2.1.koplugin/` | Cached SimpleUI plugin source copied into KOReader starter bundles |
| `data/library/` | Calibre book library — EPUB files and metadata |
| `data/downloads/` | Anna's Archive download cache |
| `data/import/` | Drop zone for manual EPUB imports |
| `data/log/` | Container logs written by calibre-server, KOSync, and Redis |
| `data/kosync/` | KOSync Redis data |

`state.json` is the source of truth for Books accounts. Calibre stores book metadata and the hidden per-book `#books_users` grant field that drives catalog visibility. KOSync stores reading progress. Writes to `state.json` use a lock directory and an atomic rename (`writeFileSync` to a `.tmp` path, then `renameSync`) to avoid partial writes under concurrent access.

Neither `state.json` nor `secrets.json` belong in git.

## Progress sync

KOSync is the progress authority. After a reading session, the reader app sends a progress update containing a document hash and a position percentage. KOSync stores the latest update per `(username, document_hash)` pair. When a second device opens the same book, it sends the hash and KOSync returns the stored position.

KOSync is last-write-wins. A stale device that syncs after a more recent session will overwrite the newer position. Each user must use their own Books login so their progress is stored independently.

Readest uses file-content checksum matching. KOReader uses binary matching. Both produce a stable hash from the same EPUB file, which is why every device needs to download the book from OPDS rather than sideloading a different copy.

The stored EPUB in the Calibre library is the sync artifact. New imports are finalized with Calibre's `ebook-meta` before they enter the library, then Calibre serves stored file bytes for `/get/...` downloads instead of rewriting metadata at request time. OPDS/search metadata remains Calibre database driven. Replacing, converting, or rewriting a stored EPUB changes its KOSync identity.

## Hardcover worker

The `worker` container runs a loop:

```bash
while true; do node src/cli.js hardcover sync; sleep 60; done
```

Each `hardcover sync` pass:

1. Reads the Want to Read list from the Hardcover GraphQL API for each user with a configured token.
2. Searches Anna's Archive for candidates via the `annas-mcp` CLI binary.
3. Keeps only English EPUB candidates whose normalized title and author match the request.
4. Ranks eligible candidates by Anna download count, great-quality votes, list count, report count, and original search order.
5. Grants an existing `hardcover:<book_id>` match to the requesting user, or downloads the winning file to `data/downloads/` as `<title>.epub` and imports it into Calibre for that user.
6. Stores the Hardcover `book_id` in Calibre identifiers as `hardcover:<book_id>` so later progress pushes can match the same Hardcover book without relying on ISBN.
7. Moves the Hardcover item from Want to Read to Currently Reading after the catalog grant succeeds.
8. If a new file was downloaded, increments the VM-wide daily download counter in `state.json`.

After intake, the same sync pass scans the user's visible EPUBs for KOSync progress. If a book has a stored `hardcover` identifier, the worker pushes progress only when that id matches exactly one current Hardcover row for the user. Manual imports without a stored Hardcover id can still be matched to existing Hardcover rows by exact normalized title/author, or created from an exact ISBN lookup. The push is one-way from KOSync to Hardcover and never decreases Hardcover progress.

Items that fail (no match, download error, import error) are logged and stay on Want to Read. The worker picks them up again on the next five-minute cycle.

The download cap (`HARDCOVER_DAILY_DOWNLOAD_CAP`, default 10) is checked before each download and applies across all users. It resets at UTC midnight based on the date in `state.json`.

## Admin CLI

`src/cli.js` runs inside the `admin` container. Every owner command goes through `docker compose run --rm admin`.

| Command | What it does |
|---|---|
| `bootstrap` | Creates data directory structure, generates and stores the Calibre admin password, initializes the Calibre user database |
| `health` | Checks proxy `/healthz`, OPDS `/opds`, and KOSync `/kosync/healthcheck` in sequence |
| `import --user USER FILE...` | Imports one or more EPUBs into Calibre and grants them to the named user |
| `users list` | Lists all accounts (slug, display name, email) |
| `users create NAME` | Creates an account with a generated passphrase, reconciles into Calibre and KOSync, prints handoff |
| `users show USER` | Prints handoff credentials and URLs for a user |
| `users reconcile [USER]` | Pushes users, Calibre restrictions, and KOSync accounts downstream |
| `hardcover set-token USER` | Connects a verified Hardcover API token to an account |
| `hardcover clear-token USER` | Removes the Hardcover token from an account |
| `hardcover status [USER]` | Shows token status, Hardcover username, and daily download count |
| `hardcover sync` | Runs one sync pass; accepts `--user`, `--dry-run`, `--limit` |
