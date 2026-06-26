# Books repo contract

Books is the repo for Neil's self-hosted reading system on `books.exe.xyz`.

Its job is to make the VM disposable. Clone the repo, restore the runtime data,
run onboarding, and the service comes back with the same routes, users, and
reader behavior.

## Service shape

The repo will stand up this public shape:

```text
https://books.exe.xyz
  /opds             -> shared Calibre bookshelf
  /get/...          -> canonical EPUB downloads
  /kosync           -> progress sync
  /dav/readest/...  -> Readest state sync
  /admin            -> owner family admin
  /                 -> owner Calibre-Web
```

The split matters:

- Calibre owns the books.
- KOSync owns reading position.
- Readest WebDAV owns Readest notes, highlights, covers, backups, and optional
  file sync.
- The admin panel owns the family workflow, not the library data itself.

No service should take over another service's job. That keeps restore and
debugging sane.

## Route rules

Reader apps need routes they can reach without an exe.dev browser session:

- `/opds`
- `/get/...`
- `/kosync`
- `/dav/readest/...`

Those routes authenticate with service credentials. OPDS uses Calibre Basic auth.
KOSync uses KOSync credentials. WebDAV uses WebDAV credentials.

Owner routes stay behind exe.dev login for `neil.skaria@gmail.com`:

- `/`
- `/admin`
- any page that can list users or reveal setup links
- Calibre-Web

Per-user setup pages get their own access control and no-store caching. They can
show that user's credentials, but never owner credentials or another user's
credentials.

## Service ownership

| Service | Owns | Does not own |
|---|---|---|
| Calibre | EPUB files, metadata, OPDS catalog, downloads | progress, highlights, family admin |
| Calibre-Web | owner browser reader and owner library UI | public family admin, cross-device progress |
| KOSync | per-user reading position for canonical EPUBs | book files, notes, highlights |
| Readest WebDAV | per-user Readest state | CrossPoint or KOReader state |
| Admin panel | owner workflow for users and setup pages | direct service state outside the shared helper |

The admin panel is a UI over the same account helper used by
`scripts/books users ...`. The panel does not get a private data path.

## Runtime state

The repo contains installs, scripts, templates, schemas, migrations, systemd
units, nginx config, and docs.

Runtime state stays outside git:

- `/etc/books/books.env`
- `/srv/books/library`
- `/srv/books/downloads`
- `/srv/books/import`
- `/srv/books/log`
- `/srv/books/config`
- `/srv/books/calibre-web`
- `/srv/books/kosync`
- `/srv/books/readest-webdav`
- `/srv/books/inbox`

Backups need the runtime paths. Git recreates the service, not the books or
personal state.

## Restore contract

A fresh VM restore works like this:

1. Clone the repo.
2. Restore `/etc/books/books.env`.
3. Restore `/srv/books`.
4. Run `./scripts/onboard`.
5. Run `./scripts/books users reconcile`.
6. Run `./scripts/books health`.
7. Run the device sync matrix before trusting cross-device progress.

No required restore step should live only in shell history, Calibre-Web clicks, or
manual edits under `/etc`.

## Status

Implemented now:

- Calibre
- Calibre-Web
- nginx
- Anna's Archive MCP/CLI
- OPDS and `/get/...`
- owner-only Calibre-Web
- import helpers
- onboarding

Not wired yet:

- KOSync
- Readest WebDAV
- family account registry
- `scripts/books users ...`
- setup pages
- owner admin panel
