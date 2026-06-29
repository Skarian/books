# Architecture

Books is a Docker Compose stack combining Calibre, a KOReader sync server, an nginx proxy, and a Node.js CLI into a single reading backend.

## Design

- **Calibre** owns book files, metadata, OPDS discovery, and downloads.
- **KOSync** owns reading position.
- **Hosted Readest** owns the reading UI and Readest accounts.
- **The Node CLI** owns setup, imports, account reconciliation, and Hardcover intake commands.
- **Hardcover Want to Read** is the automatic intake queue.

Users read through hosted Readest, OPDS-capable apps, KOReader, or CrossPoint. They do not interact with Calibre directly.

## Containers

`compose.yaml` defines five services:

| Service | Image | Role |
|---|---|---|
| `proxy` | `nginx:alpine` | Reverse proxy on `BOOKS_BIND_ADDR:BOOKS_PROXY_PORT` |
| `calibre` | `books-runtime` | `calibre-server` with Basic auth, OPDS, and downloads |
| `kosync` | `koreader/kosync` (pinned by digest) | KOReader Sync Server backed by Redis |
| `worker` | `books-runtime` | Runs `hardcover sync` every five minutes |
| `admin` | `books-runtime` | One-shot CLI container for owner commands |

`calibre`, `worker`, and `admin` all use the `books-runtime` image built from the repo. The `worker` restarts continuously. The `admin` container uses the `admin` Compose profile and only runs via `docker compose run` — it does not start with `docker compose up`.

All three `books-runtime` containers mount the data directory at `/srv/books`. The `kosync` container mounts its Redis data under `/srv/books/kosync`.

## Routes

nginx on port 8000 handles all public traffic:

```
https://books.example.com
  /catalog              → Calibre OPDS (nginx rewrites /catalog → /opds before proxying)
  /opds                 → Calibre OPDS (Calibre's native path, kept for compatibility)
  /get/...              → Calibre book downloads
  /kosync/...           → KOSync (nginx strips the /kosync prefix before proxying)
  /library              → 302 redirect to https://web.readest.com/
  /healthz              → nginx returns "ok" directly, no upstream
  /kosync/users/create  → 404 (registration disabled; accounts are managed by the CLI)
```

nginx uses Docker's internal DNS resolver (`127.0.0.11`) with `valid=30s` so it resolves upstream container names dynamically and starts cleanly even if `calibre` or `kosync` are still initializing.

## Auth

**OPDS and downloads (`/catalog`, `/opds`, `/get/...`):** Calibre HTTP Basic auth. nginx passes the `Authorization` header through unchanged. Calibre validates credentials against `data/config/users.sqlite`.

**KOSync (`/kosync/...`):** KOSync's own credential scheme. Clients send `x-auth-user` (username) and `x-auth-key` (MD5 hash of the password) as request headers. KOSync stores passwords as MD5 hashes in Redis.

Each user gets one Books login — username and diceware passphrase — that works for both systems. The `reconcile` command writes that login into Calibre and KOSync whenever an account is created, restored, or pushed.

Reader self-registration at `/kosync/users/create` is blocked at the proxy with a 404. All accounts are created and managed by the owner through the admin CLI.

## State

Runtime state lives under the data directory (`BOOKS_HOST_DATA_DIR`, default `./data`):

| Path | Contents |
|---|---|
| `data/config/state.json` | Account registry: slugs, display names, Books passwords, Hardcover tokens, daily download counts |
| `data/config/secrets.json` | Calibre admin password (generated on bootstrap, not rotated) |
| `data/config/users.sqlite` | Calibre user database |
| `data/library/` | Calibre book library — EPUB files and metadata |
| `data/downloads/` | Anna's Archive download cache |
| `data/import/` | Drop zone for manual EPUB imports |
| `data/log/` | Container logs written by calibre-server, KOSync, and Redis |
| `data/kosync/` | KOSync Redis data |

`state.json` is the source of truth for Books accounts. Calibre and KOSync are downstream; `reconcile` pushes state into them. Writes to `state.json` use a lock directory and an atomic rename (`writeFileSync` to a `.tmp` path, then `renameSync`) to avoid partial writes under concurrent access.

Neither `state.json` nor `secrets.json` belong in git.

## Progress sync

KOSync is the progress authority. After a reading session, the reader app sends a progress update containing a document hash and a position percentage. KOSync stores the latest update per `(username, document_hash)` pair. When a second device opens the same book, it sends the hash and KOSync returns the stored position.

KOSync is last-write-wins. A stale device that syncs after a more recent session will overwrite the newer position. Each user must use their own Books login so their progress is stored independently.

Readest uses file-content checksum matching. KOReader uses binary matching. Both produce a stable hash from the same EPUB file, which is why every device needs to download the book from OPDS rather than sideloading a different copy.

## Hardcover worker

The `worker` container runs a loop:

```bash
while true; do node src/cli.js hardcover sync; sleep 300; done
```

Each `hardcover sync` pass:

1. Reads the Want to Read list from the Hardcover GraphQL API for each user with a configured token.
2. Searches Anna's Archive for candidates via the `annas-mcp` CLI binary.
3. Scores each candidate: EPUB format (+100), English language (+50), title/author token overlap (+3 per matching token with length > 3), has a download hash (+1). Non-EPUB and non-English candidates are penalized.
4. Skips the item if the best candidate scores below 50 — meaning no sufficiently confident English EPUB match was found.
5. Downloads the winning file to `data/downloads/` and imports it into Calibre using `calibredb add`.
6. Moves the Hardcover item from Want to Read to Currently Reading via the Hardcover GraphQL mutation.
7. Increments the VM-wide daily download counter in `state.json`.

Items that fail (no match, download error, import error) are logged and stay on Want to Read. The worker picks them up again on the next five-minute cycle.

The download cap (`HARDCOVER_DAILY_DOWNLOAD_CAP`, default 10) is checked before each download and applies across all users. It resets at UTC midnight based on the date in `state.json`.

## Admin CLI

`src/cli.js` runs inside the `admin` container. Every owner command goes through `docker compose run --rm admin`.

| Command | What it does |
|---|---|
| `bootstrap` | Creates data directory structure, generates and stores the Calibre admin password, initializes the Calibre user database |
| `health` | Checks proxy `/healthz`, OPDS `/opds`, and KOSync `/kosync/healthcheck` in sequence |
| `import FILE...` | Imports one or more EPUBs into Calibre via `calibredb add` |
| `users list` | Lists all accounts (slug, display name, email) |
| `users create NAME` | Creates an account with a generated passphrase, reconciles into Calibre and KOSync, prints handoff |
| `users show USER` | Prints handoff credentials and URLs for a user |
| `users reconcile [USER]` | Pushes state into Calibre and KOSync for one or all users |
| `hardcover set-token USER` | Connects a verified Hardcover API token to an account |
| `hardcover clear-token USER` | Removes the Hardcover token from an account |
| `hardcover status [USER]` | Shows token status, Hardcover username, and daily download count |
| `hardcover sync` | Runs one sync pass; accepts `--user`, `--dry-run`, `--limit` |
