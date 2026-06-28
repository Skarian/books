# Architecture

Books is a small Compose stack for a shared EPUB library with per-reader
progress sync.

The design is plain:

- Calibre owns book files, metadata, OPDS, and downloads.
- KOSync owns reading position.
- Hosted Readest owns the reader UI and Readest accounts.
- The Node CLI owns setup, imports, account reconciliation, and intake commands.
- Hardcover Want to Read is the automatic intake list.

Readers use hosted Readest, OPDS-capable apps, KOReader, or CrossPoint.

## Containers

`compose.yaml` defines the stack:

- `proxy`: nginx, bound to `BOOKS_BIND_ADDR:BOOKS_PROXY_PORT`.
- `calibre`: `calibre-server` with Basic auth and OPDS.
- `kosync`: official KOReader Sync Server image pinned by digest.
- `worker`: periodic `hardcover sync`.
- `admin`: one-shot CLI container for owner commands.

Calibre, worker, and admin containers mount `/srv/books`. The KOSync container
mounts its Redis data under `/srv/books/kosync`.

## Routes

```text
https://books.example.com
  /catalog       -> Calibre OPDS, rewritten to /opds
  /opds          -> Calibre OPDS
  /get/...       -> Calibre downloads
  /kosync        -> KOReader Sync Server, prefix stripped by nginx
  /library       -> redirect to https://web.readest.com/
  /healthz       -> nginx health
```

Reader routes work directly from reading apps. OPDS uses Calibre Basic auth.
KOSync uses KOSync auth.

The KOSync client base URL is:

```text
https://books.example.com/kosync
```

Nginx strips `/kosync` before proxying. For example,
`/kosync/users/auth` reaches upstream `/users/auth`.

`docker compose run --rm admin users create` creates the matching KOSync account
inside the Compose network.

## Accounts

`/srv/books/config/state.json` is the account registry. Each reader has one
public login:

```text
username: alice
password: river-window-beacon-maple
```

That login works for:

- `/catalog`
- `/kosync`

`docker compose run --rm admin users show USER` prints the handoff the owner can
send to the reader. The same JSON file stores Hardcover tokens and the VM-wide
daily download count. Secrets stay out of git.

`docker compose run --rm admin users reconcile` pushes account state into
Calibre and KOSync while keeping existing Books passwords.

## Progress

KOSync is the progress authority. Readest, KOReader, and CrossPoint should all
use KOSync when the app supports it.

KOSync syncs reading position only. Highlights, notes, bookmarks, ratings,
collections, and book files stay in the reader app. The book file comes from
OPDS.

Progress identity depends on the reader app's KOReader-compatible file content
hash. The practical rule is simple: download the same EPUB from `/catalog` on
each device.

KOSync is last-write-wins. Give family members separate Books logins so their
progress stays separate.

## Hardcover intake

For each configured user, the worker runs every five minutes:

1. Read that user's Hardcover Want to Read list.
2. Search Anna's Archive for an English EPUB.
3. Download and import a match into Calibre.
4. Move the Hardcover item to Currently Reading.
5. Increment the VM-wide daily download count.

The automatic intake cap defaults to 10 downloaded files per UTC day for the
whole VM.

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

Every required restore step is captured in the repo or the restored data
directory.
