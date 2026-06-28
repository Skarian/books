# Architecture

Books is a small Compose stack for a shared EPUB library with per-reader
progress sync.

The design is plain:

- Calibre owns book files, metadata, OPDS, and downloads.
- KOSync owns reading position.
- Hosted Readest owns the reader UI and Readest accounts.
- The Node app owns setup pages and the owner CLI.
- Hardcover Want to Read is the automatic intake list.

No local web reader, dashboard, or Calibre-Web instance is part of the default
build.

## Containers

`compose.yaml` defines the stack:

- `proxy`: nginx, bound to `BOOKS_BIND_ADDR:BOOKS_PROXY_PORT`.
- `app`: Node HTTP service for `/setup/<user>` and `/healthz`.
- `calibre`: `calibre-server` with Basic auth and OPDS.
- `kosync`: official KOReader Sync Server image pinned by digest.
- `worker`: periodic `hardcover sync`.
- `admin`: one-shot CLI container for owner commands.

The app, Calibre, worker, and admin containers mount `/srv/books`. The KOSync
container mounts its Redis data under `/srv/books/kosync`.

## Routes

```text
https://books.example.com
  /catalog       -> Calibre OPDS, rewritten to /opds
  /opds          -> Calibre OPDS
  /get/...       -> Calibre downloads
  /kosync        -> KOReader Sync Server, prefix stripped by nginx
  /setup/<user>  -> Node setup page for that user
  /library       -> redirect to https://web.readest.com/
  /healthz       -> app health
  /              -> 404
```

Reader routes must work without an exe.dev browser session. OPDS uses Calibre
Basic auth. KOSync uses KOSync auth. Setup pages use the same Books login as the
reader apps.

Do not configure clients with `/api`, `/v1`, or `/healthcheck` appended to the
KOSync URL. The client base URL is exactly:

```text
https://books.example.com/kosync
```

Nginx strips `/kosync` before proxying. For example,
`/kosync/users/auth` reaches upstream `/users/auth`.

Public `/kosync/users/create` is blocked. The KOSync container keeps
registration enabled internally so `docker compose run --rm admin users create`
can create the matching sync account.

## Accounts

`/srv/books/config/state.json` is the source of truth for readers. Each reader
has one public login:

```text
username: alice
password: river-window-beacon-maple
```

That login works for:

- `/setup/<user>`
- `/catalog`
- `/kosync`

The same JSON file stores Hardcover tokens and the VM-wide daily download count.
Secrets stay out of git.

`docker compose run --rm admin users reconcile` pushes account state into
Calibre and KOSync. It does not change existing Books passwords.

## Progress

KOSync is the progress authority. Readest, KOReader, and CrossPoint should all
use KOSync when the app supports it.

KOSync is progress-only. It does not sync highlights, notes, bookmarks, ratings,
collections, or the book files themselves. The book file comes from OPDS.

Progress identity depends on the reader app's KOReader-compatible file content
hash. The practical rule is simple: download the same EPUB from `/catalog` on
each device.

KOSync is last-write-wins. One stale device can move progress backward, so family
members must not share a Books login.

## Hardcover intake

For each configured user, the worker runs every five minutes:

1. Read that user's Hardcover Want to Read list.
2. Search Anna's Archive for an English EPUB.
3. Download and import a match into Calibre.
4. Move the Hardcover item to Currently Reading.
5. Increment the VM-wide daily download count.

The automatic intake cap defaults to 10 downloaded files per UTC day for the
whole VM. It is not per user.

## Runtime state

Git contains the Compose file, Dockerfile, runtime source, proxy config, and
docs.

Runtime state lives here:

- `.env`
- `data/config/secrets.json`
- `data/library`
- `data/downloads`
- `data/import`
- `data/log`
- `data/config/state.json`
- `data/config/users.sqlite`
- `data/kosync`

Restore flow:

1. Clone the repo.
2. Restore `.env`.
3. Restore the configured data directory.
4. Run `docker compose build`.
5. Run `docker compose run --rm admin bootstrap`.
6. Run `docker compose up -d`.
7. Run `docker compose run --rm admin users reconcile`.
8. Run `docker compose run --rm admin health`.
9. Run `docker compose run --rm admin verify USER`.

No required restore step should live only in shell history or a manual edit under
`/etc`.
