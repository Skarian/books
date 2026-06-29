# Architecture

Books is a Compose stack for a shared EPUB library with separate reading
progress per reader.

## Containers

`compose.yaml` defines the runtime:

- `proxy`: nginx, bound to `BOOKS_BIND_ADDR:BOOKS_PROXY_PORT`.
- `calibre`: Calibre content server with Basic auth and OPDS.
- `kosync`: KOReader Sync Server, pinned by digest.
- `worker`: periodic Hardcover intake.
- `admin`: one-shot CLI container for setup and operator commands.

Calibre, worker, and admin mount `/srv/books`. KOSync stores Redis data under
`/srv/books/kosync`.

## Routes

```text
https://books.example.com
  /catalog       -> Calibre OPDS, rewritten to /opds
  /opds          -> Calibre OPDS
  /get/...       -> Calibre downloads
  /kosync        -> KOReader Sync Server
  /library       -> redirect to https://web.readest.com/
  /healthz       -> nginx health
```

OPDS uses Calibre Basic auth. KOSync uses KOSync auth. The same Books username
and password work for both.

The KOSync client URL is:

```text
https://books.example.com/kosync
```

Nginx strips `/kosync` before proxying. `/kosync/users/auth` reaches upstream
`/users/auth`.

## Accounts

`/srv/books/config/state.json` is the account registry. A reader account has one
public login:

```text
username: alice
password: sample-river-window-beacon-maple-cinder
```

That login works for:

- `/catalog`
- `/kosync`

`users create` writes the account and reconciles it into Calibre and KOSync.
`users show USER` prints the handoff for the reader. `users reconcile` pushes
the account registry back into Calibre and KOSync without changing Books
passwords.

The same JSON file stores Hardcover tokens and the VM-wide daily download
counter.

## Progress

KOSync is the progress authority. Readest, KOReader, and CrossPoint should use
KOSync when the app supports it.

KOSync syncs reading position only. Highlights, notes, bookmarks, ratings,
collections, and book files stay in the reader app.

Progress identity depends on the app's KOReader-compatible file hash. Download
the EPUB from `/catalog` on each device so every reader app sees the same file.

KOSync is last-write-wins. Give each reader a separate Books login.

## Hardcover Intake

For each configured user, the worker runs every five minutes:

1. Read that user's Hardcover Want to Read list.
2. Search Anna's Archive for an English EPUB.
3. Download and import a match into Calibre.
4. Move the Hardcover item to Currently Reading.
5. Increment the VM-wide daily download count.

The automatic intake cap defaults to 10 downloaded files per UTC day for the
whole VM.

## Runtime State

Git contains the Compose file, Dockerfile, runtime source, proxy config, and
docs.

Runtime state lives here:

- `.env`
- `secrets/annas_secret_key`
- `data/config/secrets.json`
- `data/config/state.json`
- `data/config/users.sqlite`
- `data/library`
- `data/downloads`
- `data/import`
- `data/kosync`
- `data/log`

Restore flow:

1. Clone the repo.
2. Restore `.env`, `secrets/annas_secret_key`, and the configured data directory.
3. Run `docker compose build`.
4. Run `docker compose run --rm admin bootstrap`.
5. Run `docker compose up -d`.
6. Run `docker compose run --rm admin users reconcile`.
7. Run `docker compose run --rm admin health`.
