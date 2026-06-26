# Family users

This repo will support a family bookshelf: shared books, private reading state.

Everyone can read from the same Calibre library. Each person gets their own OPDS,
KOSync, WebDAV, setup page, and upload permissions.

## Account model

Each family member has:

| Piece | Purpose |
|---|---|
| display name | shown in the owner admin panel |
| slug | stable internal id, such as `alice` |
| email | optional exe.dev identity for web routes |
| OPDS user | downloads from the shared Calibre bookshelf |
| KOSync user | private reading position |
| WebDAV user | private Readest state |
| roles | reader, uploader, owner |
| status | active, disabled, deleted |

The account registry lives outside git, for example:

```text
/srv/books/config/accounts.sqlite
```

The schema and migrations live in git. Generated service state is rebuilt from
the registry.

## User commands

The repo will expose the owner workflow through `scripts/books`:

```bash
./scripts/books users list
./scripts/books users create NAME --email EMAIL [--upload]
./scripts/books users disable USER
./scripts/books users purge USER
./scripts/books users rotate USER [opds|kosync|webdav|all]
./scripts/books users show USER
./scripts/books users reconcile
```

`disable` revokes access and keeps the user's state. `purge` removes the user's
state and requires confirmation plus a recent backup or an explicit backup skip.

`reconcile` is the rebuild command. It recreates Calibre users, KOSync users,
WebDAV auth, nginx maps, setup pages, and admin-panel views from the account
registry without rotating credentials unless the owner asks for rotation.

## Owner admin panel

The admin panel gives Neil a small web UI for family accounts.

It can:

- list users
- create users
- disable users
- rotate credentials
- purge users after confirmation
- open a user's setup page
- show recent account actions

It sits behind exe.dev login and accepts admin actions only from
`neil.skaria@gmail.com`.

The panel calls the same helper as `scripts/books users ...`. It does not edit
SQLite, Calibre, Redis, WebDAV files, htpasswd files, or nginx maps through a
separate code path.

Credential pages use `Cache-Control: no-store`. Secrets stay out of URLs, query
strings, QR codes, and access logs where possible.

## User setup pages

Each user gets one setup page written around devices:

1. Choose your device.
2. Download books.
3. Sync my place.
4. Sync Readest notes and backup.
5. Upload a book, if uploads are enabled.
6. Advanced values.

The page can show that user's OPDS, KOSync, and WebDAV credentials. It must not
show owner credentials, another user's credentials, Anna's Archive tooling, local
ports, Redis paths, systemd units, `/srv/books`, or `/etc/books/books.env`.

## Uploads

Family uploads are staged, not imported directly.

```text
/srv/books/inbox/<user>/
```

The owner reviews staged EPUBs before import. Approved books go into Calibre and
can be tagged with uploader/source metadata.

Family users cannot write directly into `/srv/books/library`, delete books, edit
metadata, overwrite formats, or run acquisition tooling.

## Rules

- Do not share KOSync credentials between people.
- Do not share Readest WebDAV roots between people.
- Do not let family uploads mutate the Calibre library directly.
- Do not make Calibre-Web the account source of truth.
- Do not expose the owner admin surface without the exe.dev owner email gate.
- Do not rely on manual VM changes that onboarding cannot recreate.

## Status

Implemented now:

- one Calibre admin user
- one OPDS device user
- one Calibre-Web admin user for Neil

Not wired yet:

- family account registry
- KOSync
- Readest WebDAV
- user commands
- setup pages
- uploads
- owner admin panel
