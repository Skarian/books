# Family Multi-User Admin Plan

Research date: June 26, 2026 UTC.

This is the planning record behind the family-user docs. For the shorter working
version, read `../family-users.md`.

## Verdict

Family mode is viable, but the naive version is unsafe.

Reviewer consensus was `revise`: keep one shared family bookshelf, but make every personal stateful lane per-user. Do not let family-facing routes write directly to the canonical Calibre library. Do not use shared KOSync credentials. Do not make the admin panel a separate source of truth.

## Product Model

Use this user-facing model:

- Read books: connect to the shared bookshelf and download the canonical EPUB from Calibre OPDS.
- Sync my place: KOSync, progress only, one account per person.
- Sync Readest notes and backup: WebDAV, Readest-only, one private root per person.
- Upload a book: optional staged workflow, not direct library mutation.

Books can be shared. Progress, highlights, notes, WebDAV files, setup secrets, and credentials must be per-user.

## Account Source Of Truth

Add one runtime account registry outside git, for example:

```text
/srv/books/config/accounts.sqlite
```

The schema/migrations live in git. The data does not.

The registry should track:

- display name
- slug
- exe.dev email
- status: active, disabled, deleted
- roles: reader, uploader, owner
- OPDS username
- KOSync username
- WebDAV username and private root
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
./scripts/books users rotate USER [opds|kosync|webdav|all]
./scripts/books users reconcile
./scripts/books users show USER
```

Rules:

- `create` generates per-user OPDS, KOSync, and WebDAV credentials.
- `disable` revokes access but preserves state.
- `purge` is explicit and destructive, after backup confirmation.
- `rotate` changes credentials without deleting user state.
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
   - "Neil's Books for Alice"
   - "Everyone shares the same books. Your reading place and Readest notes are yours."
   - one visible username
2. Choose your device
   - XTEink X4: CrossPoint
   - Android/iPad/macOS/Windows: Readest
   - Kobo: KOReader if shared progress matters
   - Stock Kobo: experimental
3. Read books
   - OPDS URL: `https://books.exe.xyz/opds`
   - the user's OPDS username
   - the user's OPDS password or a rotate/reset action
   - instruction to download from the shared bookshelf so EPUB identity stays stable
4. Sync my place
   - KOSync URL: `https://books.exe.xyz/kosync`
   - the user's KOSync username
   - the user's KOSync password or a rotate/reset action
   - Readest matching: File Content
   - KOReader matching: Binary
   - CrossPoint matching: binary/file-content if the device UI exposes it
5. Readest notes and backup
   - WebDAV URL: per-user path under `https://books.exe.xyz/dav/readest/...`
   - the user's WebDAV username
   - the user's WebDAV password or a rotate/reset action
   - note that this works only between Readest apps
6. Upload a book
   - hidden unless enabled
   - staged upload only
   - legal/source reminder
   - uploaded books appear after owner review/import
7. Advanced
   - raw OPDS/KOSync/WebDAV values
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

### WebDAV

WebDAV must have private per-user roots, for example:

```text
/srv/books/readest-webdav/alice
/srv/books/readest-webdav/neil
```

Do not use one shared WebDAV bucket.

Do not rely on basic rclone WebDAV alone unless it is paired with an auth/root-mapping layer. A conservative implementation should use a free self-hosted WebDAV server that can enforce per-user roots and permissions. Apache `mod_dav` behind nginx is acceptable; another free self-hosted server is acceptable if it has first-class per-user home directories and can be reproduced from the repo.

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
- revoke WebDAV credentials
- disable setup page
- disable optional family web/upload route
- preserve KOSync progress and WebDAV state

Purge:

- require owner confirmation
- require a recent backup or explicit backup skip
- delete or archive WebDAV state
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
- restore `/srv/books/readest-webdav`
- run `./scripts/onboard`
- run `./scripts/books users reconcile`
- run credential probes

## Blocked Variants

- Shared KOSync credentials for a family.
- Shared Readest WebDAV root.
- Calibre-Web DB as the account source of truth.
- Per-user WebDAV systemd units as the default.
- Family upload directly into `/srv/books/library`.
- Family users with Calibre-Web admin, edit, or delete roles.
- Admin panel shelling out arbitrary commands.
- Setup pages that expose owner credentials or secrets in URLs.
- A restore story that depends on remembered manual steps.

## Acceptance Criteria

- Creating a family user provisions OPDS, KOSync, and WebDAV credentials for that user only.
- Two users can read the same canonical EPUB without progress collisions.
- Readest notes/highlights sync only within that user's WebDAV root.
- Family users cannot see owner credentials or other users' credentials.
- Family users cannot mutate `/srv/books/library` directly.
- Disabling a user makes old OPDS, KOSync, WebDAV, and setup-page credentials fail.
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
