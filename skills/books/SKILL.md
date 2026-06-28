---
name: books
description: Operate Neil's self-hosted Books backend: Docker Compose, Calibre OPDS, KOSync progress, Readest setup, Hardcover intake, Anna's Archive MCP downloads, imports, user credentials, and reproducible onboarding.
---

# Books

## Use the repo helper

Work from `/home/exedev/books`.

Prefer `./scripts/books` over direct service edits:

- `./scripts/books status`
- `./scripts/books health`
- `./scripts/books verify USER`
- `./scripts/books restart`
- `./scripts/books logs`
- `./scripts/books users ...`
- `./scripts/books hardcover ...`
- `./scripts/books import /path/to/book.epub`
- `./scripts/books sync-fixture`
- `./scripts/books anna ...`
- `./scripts/books opds-url`
- `./scripts/books kosync-url`

Only use acquisition/download tooling for material the user is legally allowed
to access, such as public domain, Creative Commons, owned, or otherwise
authorized books. When that is unclear, ask before downloading.

## Service rules

Git is the source of truth for installs and config. Do not manually change these
without updating the repo file that recreates them:

- `compose.yaml`
- `docker/books/Dockerfile`
- `docker/books/entrypoint.sh`
- `config/nginx/compose.conf`
- `config/books.env.example`
- `scripts/onboard`
- `scripts/books`

Runtime books and secrets stay outside git:

- `/etc/books/books.env`
- `/srv/books/library`
- `/srv/books/downloads`
- `/srv/books/import`
- `/srv/books/config/state.json`
- `/srv/books/config/users.sqlite`
- `/srv/books/kosync`

Read `references/service.md` before changing deployment, Compose, nginx proxy,
Calibre, OPDS, KOSync, Hardcover, Anna's Archive, or import behavior.
