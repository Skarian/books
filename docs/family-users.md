# Family users

This repo supports a family bookshelf: shared books, private reading state.

Everyone can read from the same Calibre library. Each person gets one Books
login that works for the setup page, OPDS catalog, KOSync progress, and upload
permissions. They use their own Readest account with the official Readest apps
and web reader.

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
| Books username/password | setup page, book catalog, and private reading position |
| roles | reader, uploader, owner |
| status | active, disabled, deleted |

The account registry lives outside git, for example:

```text
/srv/books/config/accounts.sqlite
```

The helper creates the schema from git-tracked code. Generated service state is
rebuilt from the registry.

The registry stores service usernames, roles, status, and the generated Books
login for each reader. If Hardcover requests are enabled for a reader, the same
database stores that reader's Hardcover API token. The database lives under
`/srv/books/config`, not in git. Keep it with the runtime backup set and rotate a
reader if their login is exposed. KOSync also needs the derived userkey
that its server stores and compares during auth. Setup pages show the raw
password that people type into reader apps; service reconciliation writes the
same login into Calibre and the derived KOSync userkey into the KOSync data
store.

## User commands

The repo exposes the owner workflow through `scripts/books`:

```bash
./scripts/books users list
./scripts/books users create NAME --email EMAIL [--upload]
./scripts/books users disable USER
./scripts/books users purge USER
./scripts/books users rotate USER [login|all]
./scripts/books users show USER
./scripts/books users reconcile
./scripts/books hardcover set-token USER
./scripts/books hardcover clear-token USER
./scripts/books hardcover status
```

`disable` revokes access and keeps the user's state. `purge` removes the user's
state and requires confirmation plus a recent backup or an explicit backup skip.

`reconcile` is the rebuild command. It recreates Calibre OPDS access, KOSync
access, setup pages, and optional admin-panel views from the account
registry without rotating credentials unless the owner asks for rotation.
`rotate USER all` changes the one Books login everywhere.

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

1. Open Readest and sign in with their own Readest account.
2. Add the book catalog.
3. Sync my place with KOSync.
4. Upload a book, if uploads are enabled.
5. Advanced values.

The page can show that user's Books login. It must not show owner credentials,
another user's credentials, Anna's Archive tooling, local
ports, Redis paths, systemd units, `/srv/books`, or `/etc/books/books.env`.

The setup page should tell Readest users to configure OPDS Catalogs and
KOReader Sync as two separate app settings:

- Readest gets the official app or `https://web.readest.com/` and the user's own
  Readest account.
- OPDS Catalogs gets `/catalog` plus the user's Books username and password.
- KOReader Sync gets `/kosync` plus the same Books username and password.

The page should also say that Readest can copy OPDS and KOSync settings to other
signed-in Readest devices. Credentials only sync if the reader turns on
Credentials sync and sets a Readest sync passphrase.

The page should make clear that KOSync syncs reading position only. Readest
highlights, notes, bookmarks, collections, and ratings are not part of the core
family sync path.

## Hardcover intake

Hardcover Want to Read can be used as a per-user request list. When a user's
token is configured, the sync timer checks their Want to Read shelf every five
minutes. Fulfilled items are downloaded through Anna's Archive, imported into the
shared Calibre library, and moved to Currently Reading in Hardcover.

The Anna daily cap is global across all users. A family member's Hardcover token
only grants access to that person's shelves; it is not reused for other readers.

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

- Do not share a Books login between people.
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
