# Family users

This repo will support a family bookshelf: shared books, private reading state.

Everyone can read from the same Calibre library. Each person gets their own OPDS,
KOSync, setup page, and upload permissions.

The owner workflow is chat/CLI-first. Neil can ask Codex to add, disable, rotate,
or inspect a family reader, and Codex should use the repo helper rather than
manual service edits. A small dashboard can still exist later, but it is not a
requirement for the first family version.

## Account model

Each family member has:

| Piece | Purpose |
|---|---|
| display name | shown in owner commands, setup pages, and optional admin UI |
| slug | stable internal id, such as `alice` |
| email | optional exe.dev identity for web routes |
| OPDS user | downloads from the shared Calibre bookshelf |
| KOSync user | private reading position |
| roles | reader, uploader, owner |
| status | active, disabled, deleted |

The account registry lives outside git, for example:

```text
/srv/books/config/accounts.sqlite
```

The helper creates the schema from git-tracked code. Generated service state is
rebuilt from the registry.

The registry stores service usernames, roles, status, generated passwords, and
the setup-page password for each reader. The database lives under
`/srv/books/config`, not in git. Keep it with the runtime backup set and rotate a
reader if their credentials are exposed. KOSync also needs the derived userkey
that its server stores and compares during auth. Setup pages show the raw
password that people type into reader apps; service reconciliation writes the
derived KOSync userkey to the KOSync data store.

## User commands

The repo will expose the owner workflow through `scripts/books`:

```bash
./scripts/books users list
./scripts/books users create NAME --email EMAIL [--upload]
./scripts/books users disable USER
./scripts/books users purge USER
./scripts/books users rotate USER [opds|kosync|setup|all]
./scripts/books users show USER
./scripts/books users reconcile
```

`disable` revokes access and keeps the user's state. `purge` removes the user's
state and requires confirmation plus a recent backup or an explicit backup skip.

`reconcile` is the rebuild command. It recreates Calibre users, KOSync users,
nginx maps, setup pages, and optional admin-panel views from the account
registry without rotating credentials unless the owner asks for rotation.
`rotate USER all` changes OPDS, KOSync, and setup-page passwords together.

Official KOSync has no admin API for disable, rotate, or purge. The repo helper
therefore owns those lifecycle actions against the pinned KOSync data store. It
stores the KOSync userkey expected by the server, while setup pages show the raw
password that reader apps ask humans to type. Readest hashes the typed password
before authenticating, and the KOSync server compares that userkey.

KOSync progress is last-write-wins. A later stale device can move progress
backward, so shared family credentials are never allowed.

## Owner admin panel

The admin panel is optional. The required owner interface is
`scripts/books users ...`, which Codex can operate through the `books` skill.

If built, the admin panel gives Neil a small web UI for family accounts.

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
SQLite, Calibre, Redis, htpasswd files, nginx maps, or any derived service files
through a separate code path.

Credential pages use `Cache-Control: no-store`. Secrets stay out of URLs, query
strings, QR codes, and access logs where possible.

## User setup pages

Each user gets one setup page written around devices:

1. Choose your device.
2. Download books.
3. Sync my place.
4. Upload a book, if uploads are enabled.
5. Advanced values.

The page can show that user's OPDS and KOSync credentials. It must not show
owner credentials, another user's credentials, Anna's Archive tooling, local
ports, Redis paths, systemd units, `/srv/books`, or `/etc/books/books.env`.

The setup page should tell Readest users to configure OPDS Catalogs and
KOReader Sync as two separate app settings:

- OPDS Catalogs gets the user's `/opds` URL, OPDS username, and OPDS password.
- KOReader Sync gets the user's `/kosync` URL, KOSync username, and KOSync
  password.

The page should make clear that KOSync syncs reading position only. Readest
highlights, notes, bookmarks, collections, and ratings are not part of the core
family sync path.

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
- Do not let family uploads mutate the Calibre library directly.
- Do not make Calibre-Web the account source of truth.
- Do not expose the owner admin surface without the exe.dev owner email gate.
- Do not rely on manual VM changes that onboarding cannot recreate.

## Status

Implemented now:

- one Calibre admin user
- one OPDS device user
- one Calibre-Web admin user for Neil
- family account registry
- KOSync user reconciliation
- user commands
- setup pages
- book request queue

Not wired yet:

- uploads
- optional owner admin panel
