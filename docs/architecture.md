# Books repo contract

Books is the repo for Neil's self-hosted reading system on `books.exe.xyz`.

Its job is to make the VM disposable. Clone the repo, restore the runtime data,
run onboarding, and the service comes back with the same routes, users, and
reader behavior.

## Service shape

The repo stands up this public shape:

```text
https://books.exe.xyz
  /library          -> self-hosted Readest Web reader
  /catalog          -> shared Calibre bookshelf for setup and apps
  /opds             -> shared Calibre bookshelf
  /get/...          -> canonical EPUB downloads
  /kosync           -> progress sync
  /api/kosync       -> Readest Web bridge to local KOSync
  /auth/v1          -> Readest auth
  /rest/v1          -> Readest data API
  /setup/<user>     -> per-user setup and book requests
  /calibre/         -> owner Calibre-Web
  /                 -> owner portal
```

The split matters:

- Calibre owns the books.
- Readest owns the browser/app reading session.
- KOSync owns reading position.
- The account helper owns the family workflow, not the library data itself.

No service should take over another service's job. That keeps restore and
debugging sane.

## Route rules

Reader apps need routes they can reach without an exe.dev browser session:

- `/opds`
- `/catalog`
- `/get/...`
- `/kosync`

Those routes authenticate with service credentials. OPDS uses Calibre Basic auth.
KOSync uses KOSync credentials.

Use `/catalog` in setup docs and user pages. `/opds` remains available for apps
that expect that exact path, but Readest also owns a browser page at `/opds`.
Nginx handles the overlap, and `/catalog` keeps the human setup path obvious.

The public KOSync URL for clients is `https://books.exe.xyz/kosync`. Reader apps
append KOSync API paths such as `/users/auth` and `/syncs/progress`, so nginx
must strip the `/kosync` prefix before proxying to the KOSync upstream. For
example, `/kosync/users/auth` must reach upstream `/users/auth`, and
`/kosync/healthcheck` must reach upstream `/healthcheck`.

Do not configure clients with `/api`, `/v1`, or `/healthcheck` appended. The
client base URL is exactly `https://books.exe.xyz/kosync`.

Owner routes stay behind exe.dev login for `neil.skaria@gmail.com`:

- `/`
- `/calibre/`
- any page that can list users or reveal setup links
- any future `/admin` route

Per-user setup pages get their own access control and no-store caching. They can
show that user's credentials, but never owner credentials or another user's
credentials.

## Service ownership

| Service | Owns | Does not own |
|---|---|---|
| Calibre | EPUB files, metadata, OPDS catalog, downloads | progress, highlights, family admin |
| Calibre-Web | owner browser reader and owner library UI | public family admin, cross-device progress |
| Readest Web | browser/app reader account, app library state | progress authority, canonical book files |
| KOSync | per-user reading position for canonical EPUBs | book files, notes, highlights |
| Account helper | users, Readest credentials, OPDS credentials, KOSync credentials, setup pages, service reconciliation | direct service state outside the shared helper |

`scripts/books users ...` is the primary owner interface. Codex can use it
through the `books` skill when Neil wants to add, disable, rotate, or inspect a
reader account by chatting. A future admin panel is optional UI over the same
helper and does not get a private data path.

## Progress authority

KOSync is the only cross-app progress authority. CrossPoint, KOReader, and
Readest should all push and pull reading position through `/kosync` with a
separate account per reader.

Official KOSync is last-write-wins. A later update can move progress backward.
That is acceptable for one human moving between devices, but it is why each
person needs a separate KOSync account.

Readest gets books through OPDS and syncs position through KOReader Sync. That is
the default path. The web reader lives at `/library`, but progress still goes
through KOSync. The Readest Web app cannot call the public `books.exe.xyz`
address from inside this VM, so nginx sends `/api/kosync` to the portal bridge,
which forwards only this service's allowed KOSync calls to the local KOSync
container.

Current upstream Readest exposes these integrations separately:

- OPDS Catalogs: catalog URL, optional username, optional password, optional
  custom headers, browse/download action, and optional auto-download.
- KOReader Sync: server URL, username, password, enable switch, strategy, file
  content checksum, device name.

Do not add WebDAV to the default build. Readest's WebDAV support is a separate
sync channel that can move per-book config, including progress and location.
That makes it a second writer next to KOSync. If OPDS plus KOSync fails a real
device test, or if Readest-only notes/backups become a hard requirement, WebDAV
can be introduced later behind a new test matrix section.

The honest limitation: official KOSync is progress-only. It does not sync
Readest highlights, notes, bookmarks, collections, ratings, or book files. That
is acceptable for the core repo because the requirement that matters most is
continuing from the same place across devices.

Document identity is partial-MD5/file-content identity, not full-file MD5.
KOReader calls this binary matching. Readest labels it `File Content` and stores
the same style of partial MD5 as `book.hash`.

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
- `/srv/books/readest`
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
- owner portal
- nginx
- Anna's Archive MCP/CLI
- OPDS and `/get/...`
- KOSync
- Readest Web
- family account registry
- `scripts/books users ...`
- setup pages
- book request queue
- owner-only Calibre-Web
- owner and family Readest accounts
- import helpers
- onboarding

Not wired yet:

- optional owner admin panel
- family upload staging UI
