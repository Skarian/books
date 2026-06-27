# Architecture

Books is a small service bundle for `books.exe.xyz`.

The design is intentionally plain:

- Calibre owns book files, metadata, OPDS, and downloads.
- KOSync owns reading position.
- Hosted Readest owns the reader UI and Readest accounts.
- The Node app owns setup pages and the owner CLI.
- Hardcover Want to Read is the automatic intake list.

No local web reader, dashboard, or Calibre-Web instance is part of the default
build.

## Routes

```text
https://books.exe.xyz
  /catalog       -> Calibre OPDS, rewritten to /opds
  /opds          -> Calibre OPDS
  /get/...       -> Calibre downloads
  /kosync        -> KOReader Sync Server, prefix stripped by nginx
  /setup/<user>  -> Node setup page for that user
  /library       -> redirect to https://web.readest.com/
  /healthz       -> local service health
  /              -> 404
```

Reader routes must work without an exe.dev browser session. OPDS uses Calibre
Basic auth. KOSync uses KOSync auth. Setup pages use the same Books login as the
reader apps.

Do not configure clients with `/api`, `/v1`, or `/healthcheck` appended to the
KOSync URL. The client base URL is exactly:

```text
https://books.exe.xyz/kosync
```

Nginx strips `/kosync` before proxying. For example,
`/kosync/users/auth` reaches upstream `/users/auth`.

## Accounts

`/srv/books/config/accounts.sqlite` is the source of truth for readers. Each
active reader has one public login:

```text
username: neil
password: river-window-beacon-maple
```

That login works for:

- `/setup/<user>`
- `/catalog`
- `/kosync`

The same SQLite database also stores Hardcover tokens and fulfillment history.
Secrets stay out of git.

`./scripts/books users reconcile` pushes account state into Calibre and KOSync.
It does not rotate passwords. Rotation happens only through
`./scripts/books users rotate USER all`.

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

## Hardcover Intake

For a configured user, the timer runs every five minutes:

1. Read that user's Hardcover Want to Read list.
2. Search Anna's Archive for an English EPUB.
3. Download and import the match into Calibre.
4. Move the Hardcover item to Currently Reading.
5. Record the result in SQLite.

The Anna download cap is global for the VM. It is not per user.

## Runtime State

Git contains scripts, schemas, templates, systemd units, nginx config, and docs.

Runtime state lives here:

- `/etc/books/books.env`
- `/srv/books/library`
- `/srv/books/downloads`
- `/srv/books/import`
- `/srv/books/log`
- `/srv/books/config`
- `/srv/books/kosync`

Restore flow:

1. Clone the repo.
2. Restore `/etc/books/books.env`.
3. Restore `/srv/books`.
4. Run `./scripts/onboard`.
5. Run `./scripts/books users reconcile`.
6. Run `./scripts/books health`.
7. Run `./scripts/books verify USER`.

No required restore step should live only in shell history or a manual edit under
`/etc`.

## Services

- `books-calibre.service`
- `books-kosync.service`
- `books-node.service`
- `books-hardcover-sync.service`
- `books-hardcover-sync.timer`
- `nginx`

The old `books-calibre-web.service` and `books-portal.service` are retired by
onboarding.
