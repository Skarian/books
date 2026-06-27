---
name: books
description: Operate Neil's self-hosted Books backend on books.exe.xyz: Calibre OPDS, KOSync progress, Readest setup, Hardcover intake, Anna's Archive MCP downloads, imports, user credentials, nginx, systemd, and reproducible onboarding.
---

# Books

## Use The Repo Helper

Work from `/home/exedev/books`.

Prefer `./scripts/books` over direct service edits:

- `./scripts/books status`
- `./scripts/books health`
- `./scripts/books verify USER`
- `./scripts/books restart`
- `./scripts/books users ...`
- `./scripts/books hardcover ...`
- `./scripts/books import /path/to/book.epub`
- `./scripts/books sync-fixture`
- `./scripts/books anna ...`
- `./scripts/books opds-url`
- `./scripts/books kosync-url`
- `./scripts/books proxy-commands`

Only use acquisition/download tooling for material the user is legally allowed
to access, such as public domain, Creative Commons, owned, or otherwise
authorized books. When that is unclear, ask before downloading.

## Service Rules

Git is the source of truth for installs and config. Do not manually change these
without updating the repo file that recreates them:

- `/etc/nginx/conf.d/books.conf`
- `/etc/systemd/system/books-calibre.service`
- `/etc/systemd/system/books-kosync.service`
- `/etc/systemd/system/books-node.service`
- `/etc/systemd/system/books-hardcover-sync.service`
- `/etc/systemd/system/books-hardcover-sync.timer`
- `/etc/books/books.env`

Runtime books and secrets stay outside git:

- `/etc/books/books.env`
- `/srv/books/library`
- `/srv/books/downloads`
- `/srv/books/import`
- `/srv/books/config/accounts.sqlite`
- `/srv/books/config/users.sqlite`
- `/srv/books/kosync`

Read `references/service.md` before changing deployment, nginx, systemd,
Calibre, OPDS, KOSync, Hardcover, Anna's Archive, or import behavior.
