# Family Multi-User Admin Plan

Research date: June 26, 2026 UTC.

This is the planning record behind the family-user docs. For the shorter working
version, read `../family-users.md`.

Update after the Readest source review: WebDAV is no longer part of the default
family plan. The core path is OPDS for book downloads and KOSync for progress.
WebDAV can be revisited later only if OPDS plus KOSync fails device testing, or
if Readest-only notes/backups become a hard requirement.

## Verdict

Family mode is viable, but the naive version is unsafe.

Reviewer consensus was `revise`: keep one shared family bookshelf, but make every personal stateful lane per-user. Do not let family-facing routes write directly to the canonical Calibre library. Do not use shared KOSync credentials. Do not make the admin panel a separate source of truth.

## Product Model

Use this user-facing model:

- Read books: connect to the shared bookshelf and download the canonical EPUB from Calibre OPDS.
- Sync my place: KOSync, progress only, one account per person.
- Upload a book: optional staged workflow, not direct library mutation.

Books can be shared. Progress, setup secrets, and credentials must be per-user.
The first family version does not sync Readest highlights, notes, bookmarks,
collections, ratings, or app backups.

## Account Source Of Truth

This section was the first plan. The implemented app state now lives in
`/srv/books/config/state.json`; `users.sqlite` is only Calibre's user database.

The original proposal was one runtime account registry outside git.

The schema/migrations live in git. The data does not.

The registry should track:

- display name
- slug
- exe.dev email
- status: active, disabled, deleted
- roles: reader, uploader, owner
- OPDS username
- KOSync username
- optional Calibre-Web username
- credential version and last rotation time
- created, disabled, deleted, and purged timestamps

Do not make Calibre-Web's database, nginx generated maps, htpasswd files, or generated setup pages the source of truth. Those are derived artifacts rebuilt by reconcile.

## Required Commands

Extend `scripts/books` with a user namespace:

```bash
./scripts/books users list
./scripts/books users create NAME --email EMAIL [--upload]
./scripts/books users disable USER
./scripts/books users purge USER
./scripts/books users rotate USER [opds|kosync|setup|all]
./scripts/books users reconcile
./scripts/books users show USER
```

Rules:

- `create` generates per-user OPDS and KOSync credentials.
- `disable` revokes access but preserves state.
- `purge` is explicit and destructive, after backup confirmation.
- `rotate` changes OPDS, KOSync, or setup-page credentials without deleting user state.
- `reconcile` rebuilds all derived service state from the registry.
- Re-running onboarding must call `users reconcile` and must not rotate passwords unless explicitly requested.

## Admin Panel

Build a tiny owner-only admin panel only after the CLI exists.

The panel should:

- require exe.dev login
- require the owner email for admin actions
- list users and status
- create users
- disable users
- purge users only with an explicit confirmation
- rotate credentials
- show each user's setup page
- show audit history

The panel must be a thin UI over the same CLI/helper. It must not edit SQLite, Calibre-Web, Redis, htpasswd, nginx, or filesystem state through separate code paths.

Implementation requirements:

- call helpers with argv arrays, not shell strings
- validate usernames, emails, and roles strictly
- use `flock` around user mutations
- set timeouts
- write audit logs
- avoid secrets in URLs or query strings
- send `Cache-Control: no-store`
- send `Referrer-Policy: no-referrer`
- avoid credential-bearing QR codes
- redact setup/credential pages from access logs where possible

## User Setup Page

The setup page should be task-first, not service-first.

Suggested structure:

1. Header
   - "Owner's Books for Alice"
   - "Everyone shares the same books. Your reading place and Readest notes are yours."
   - one visible username
2. Choose your device
   - XTEink X4: CrossPoint
   - Android/iPad/macOS/Windows: Readest
   - Kobo: KOReader if shared progress matters
   - Stock Kobo: experimental
3. Read books
   - OPDS URL: `https://books.example.com/opds`
   - the user's OPDS username
   - the user's OPDS password or a rotate/reset action
   - instruction to download from the shared bookshelf so EPUB identity stays stable
4. Sync my place
   - KOSync URL: `https://books.example.com/kosync`
   - the user's KOSync username
   - the user's KOSync password or a rotate/reset action
   - Readest matching: File Content
   - KOReader matching: Binary
   - CrossPoint matching: binary/file-content if the device UI exposes it
5. Upload a book
   - hidden unless enabled
   - staged upload only
   - legal/source reminder
   - uploaded books appear after owner review/import
6. Advanced
   - raw OPDS/KOSync values
   - troubleshooting

Do not show family users:

- owner/admin credentials
- other users' credentials
- Anna's Archive tooling
- `/get/...` internals
- local ports
- Redis paths
- `/srv/books/...`
- `/etc/books/books.env`
- systemd service names
- proxy commands

## Service Design

### OPDS

Use Calibre's existing user database and `calibre-server --manage-users`.

- One read-only OPDS user per person.
- No family write access through native Calibre.
- The owner/admin import path remains separate.

### KOSync

Use one KOSync account per person.

Shared KOSync credentials are blocked because official KOSync stores progress by `user + document`. Two people reading the same canonical EPUB under one KOSync user would overwrite each other's progress.

Official `koreader/kosync` remains the primary server for the pilot, but the lack of a documented admin delete endpoint is an operational risk. The implementation must either:

- manage official KOSync user keys directly in Redis under a pinned version, with probes proving create/disable/purge/rotate behavior, or
- switch to a compatible KOSync server with a real admin API if direct Redis management proves brittle.

### Deferred WebDAV

Do not implement WebDAV in the first family version. If it comes back later, it
must have private per-user roots and a test proving it does not overwrite
KOSync progress.

### Calibre-Web

Keep Calibre-Web owner-only until a safe family route is designed.

Calibre-Web supports fine-grained roles, including upload, but direct upload writes into the shared Calibre library. That is too much blast radius for family onboarding.

If family web access is enabled later:

- route it separately from the owner admin surface
- require exe.dev authenticated user allowlisting
- create non-admin Calibre-Web users
- do not grant edit, delete, or admin roles
- prefer staged upload outside `/srv/books/library`

## Upload Policy

Default: family uploads are disabled.

When enabled, uploads go to quarantine:

```text
/srv/books/inbox/<user>/
```

The owner import flow reviews and imports approved EPUBs. The import should tag the book with uploader metadata such as:

```text
owner:wife
source:user-upload
```

Do not allow family uploads to:

- overwrite canonical EPUBs
- edit metadata directly
- delete books
- add non-EPUB formats without explicit conversion review
- run acquisition tooling

## Disable, Purge, And Restore

Disable:

- revoke OPDS credentials
- revoke KOSync credentials
- disable setup page
- disable optional family web/upload route
- preserve KOSync progress

Purge:

- require owner confirmation
- require a recent backup or explicit backup skip
- delete KOSync user/progress
- delete optional Calibre-Web user
- remove setup secrets
- keep the shared Calibre library intact

Restore:

- restore `/etc/books/books.env`
- restore `/srv/books/config`
- restore `/srv/books/library`
- restore `/srv/books/calibre-web`
- restore `/srv/books/kosync`
- run `./scripts/onboard`
- run `./scripts/books users reconcile`
- run credential probes

## Blocked Variants

- Shared KOSync credentials for a family.
- Calibre-Web DB as the account source of truth.
- Family upload directly into `/srv/books/library`.
- Family users with Calibre-Web admin, edit, or delete roles.
- Admin panel shelling out arbitrary commands.
- Setup pages that expose owner credentials or secrets in URLs.
- A restore story that depends on remembered manual steps.

## Acceptance Criteria

- Creating a family user provisions OPDS and KOSync credentials for that user only.
- Two users can read the same canonical EPUB without progress collisions.
- Family users cannot see owner credentials or other users' credentials.
- Family users cannot mutate `/srv/books/library` directly.
- Disabling a user makes old OPDS, KOSync, and setup-page credentials fail.
- Purging a user removes that user's sync/state data without touching shared books.
- A non-technical user can complete setup from the page alone.
- Re-running onboarding plus `users reconcile` recreates derived service config from the repo and runtime registry.

## Sources

- Calibre server docs: https://manual.calibre-ebook.com/server.html
- Calibre server CLI docs: https://manual.calibre-ebook.com/generated/en/calibre-server.html
- Calibre-Web repository: https://github.com/janeczku/calibre-web
- KOReader sync server: https://github.com/koreader/koreader-sync-server
- Readest sync docs: https://readest.com/docs/sync
- Readest library docs: https://readest.com/docs/library
- rclone WebDAV docs: https://rclone.org/commands/rclone_serve_webdav/
- Apache `mod_dav` docs: https://httpd.apache.org/docs/current/mod/mod_dav.html
- exe.dev proxy docs: https://exe.dev/docs/proxy
- exe.dev login headers: https://exe.dev/docs/login-with-exe
