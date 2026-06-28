---
name: books
description: Operate the self-hosted Books backend: Docker Compose, Calibre OPDS, KOSync progress, Readest setup, Hardcover intake, Anna's Archive MCP downloads, imports, user credentials, and reproducible onboarding.
---

# Books

## Use Docker Compose

Work from `/home/exedev/books`.

Use the standard Compose interface:

- `docker compose ps`
- `docker compose run --rm admin health`
- `docker compose run --rm admin verify USER`
- `docker compose restart`
- `docker compose logs -f`
- `docker compose run --rm admin users ...`
- `docker compose run --rm admin hardcover ...`
- `docker compose run --rm admin import /srv/books/import/book.epub`
- `docker compose run --rm admin import /app/fixtures/books-sync-fixture.epub`

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
- `.env.example`

Runtime books and secrets stay outside git:

- `.env`
- `data/config/secrets.json`
- `data/library`
- `data/downloads`
- `data/import`
- `data/config/state.json`
- `data/config/users.sqlite`
- `data/kosync`

Read `references/service.md` before changing deployment, Compose, nginx proxy,
Calibre, OPDS, KOSync, Hardcover, Anna's Archive, or import behavior.
