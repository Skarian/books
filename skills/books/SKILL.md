---
name: books
description: Find, stage, import, and operate books for Neil's personal Calibre EPUB/OPDS service on books.exe.xyz. Use when the user asks to search for books, procure legally authorized EPUB files, import books into Calibre, manage Crosspoint/OPDS access, inspect or restart the book service, update its reproducible setup, or troubleshoot calibre/nginx/exe.dev proxy behavior for this repo.
---

# Books

## Core Workflow

Use the repo helpers from `/home/exedev/books` rather than ad hoc commands:

- Inspect health with `./scripts/books health` and status with `./scripts/books status`.
- Import EPUBs with `./scripts/books import /path/to/book.epub`.
- Convert only when needed with `./scripts/books import --convert /path/to/file`.
- Use Anna's Archive MCP/CLI through `./scripts/books anna ...` after the user's API key is configured.
- Show Crosspoint setup values with `./scripts/books opds-url`.
- Show documented exe.dev proxy commands with `./scripts/books proxy-commands`.

Only use acquisition/download tooling for material the user is legally permitted to access, such as public domain, Creative Commons, owned, or otherwise authorized works. When unclear, ask for confirmation before downloading.

## Service Rules

Treat git as the source of truth for installs and config. Do not manually change `/etc/nginx/conf.d/books.conf`, `/etc/systemd/system/books-calibre.service`, `/opt/books/bin/*`, or `/etc/books/books.env` without also updating the repo script/template that recreates it.

Runtime books and secrets are intentionally outside git:

- `/etc/books/books.env`
- `/srv/books/library`
- `/srv/books/downloads`
- `/srv/books/import`

Read `references/service.md` before changing deployment, nginx, systemd, OPDS, Anna's Archive, or import behavior.
