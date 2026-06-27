# Books service

This repo runs Neil's self-hosted book backend on `books.exe.xyz`.

It is deliberately small. Calibre stores the books and serves OPDS. KOSync stores
reading position. Readers use the official Readest apps or
`https://web.readest.com/`. Hardcover Want to Read can act as the request list.

The repo is the source of truth for installs and config. Books, passwords, API
keys, and sync state stay outside git.

## What Runs Here

- `nginx` listens on `BOOKS_PROXY_PORT` for the documented exe.dev HTTPS proxy.
- `books-calibre` runs `calibre-server` on localhost.
- `books-kosync` runs the pinned official KOReader Sync Server container.
- `books-node` serves `/healthz` and per-user setup pages.
- `books-hardcover-sync.timer` checks configured Hardcover accounts every five minutes.

Public routes:

- `/catalog`: OPDS catalog for Readest, CrossPoint, KOReader, and other readers.
- `/opds`: the same catalog, kept for clients that expect the Calibre path.
- `/get/...`: Calibre downloads.
- `/kosync`: KOReader-compatible progress sync.
- `/setup/<user>`: setup instructions for one reader, protected by that reader's Books login.
- `/library`: redirect to hosted Readest Web.

Everything else returns 404. There is no Calibre-Web service and no local reader
UI exposed by this VM.

## Runtime State

These paths are created by onboarding and are not committed:

- `/etc/books/books.env`: secrets, API keys, paths, ports.
- `/srv/books/library`: Calibre library.
- `/srv/books/downloads`: Anna downloads and generated fixtures.
- `/srv/books/import`: temporary conversion/import files.
- `/srv/books/log`: service logs.
- `/srv/books/config/accounts.sqlite`: family users, credentials, Hardcover tokens, request history.
- `/srv/books/config/users.sqlite`: Calibre user database.
- `/srv/books/kosync`: KOSync Redis state.

Back up `/etc/books/books.env` and `/srv/books` if you care about the live
library and user state. Git recreates the machine shape, not the books.

## Fresh VM Setup

```bash
cd /home/exedev/books
./scripts/onboard
```

For a rebuild with generated passwords and no prompts:

```bash
./scripts/onboard --non-interactive
```

Onboarding installs Calibre, Node dependencies, Anna's Archive MCP, Docker,
KOSync, nginx config, systemd units, and the repo-local `$books` Codex skill.
It also removes the old Calibre-Web and portal units if they exist.

## exe.dev Proxy

Run these from your local machine, not inside the VM:

```bash
ssh exe.dev share port books 8000
ssh exe.dev share set-public books
```

Return to private mode:

```bash
ssh exe.dev share set-private books
```

The VM cannot call its own public `books.exe.xyz` endpoint. Local checks use
`127.0.0.1:${BOOKS_PROXY_PORT}` through nginx.

## Owner Commands

```bash
./scripts/books status
./scripts/books health
./scripts/books verify neil
./scripts/books restart
./scripts/books proxy-commands
```

Users:

```bash
./scripts/books users list
./scripts/books users create "Alice" --email alice@example.com
./scripts/books users show alice
./scripts/books users rotate alice all
./scripts/books users disable alice
./scripts/books users reconcile
```

Each reader gets one Books username and one dice-roll-style passphrase. That
same login works for their setup page, OPDS catalog, and KOSync progress.

Books:

```bash
./scripts/books import /path/to/book.epub
./scripts/books import --convert /path/to/book.pdf
./scripts/books sync-fixture
./scripts/books anna book-search "title author epub english"
./scripts/books anna book-download MD5_HASH filename.epub
```

Only use acquisition tools for books you are allowed to access.

Hardcover intake:

```bash
printf '%s\n' 'Bearer ...' | ./scripts/books hardcover set-token neil
./scripts/books hardcover status
./scripts/books hardcover sync --dry-run --user neil --limit 1
./scripts/books hardcover sync --user neil
```

The sync loop reads Want to Read, looks for an English EPUB through Anna's
Archive, imports a match into Calibre, then moves the Hardcover item to
Currently Reading. Anna's member download cap is global for the VM and defaults
to 15 downloads per UTC day.

## Reader Setup

Give each reader their setup page:

```bash
./scripts/books users show neil
```

They should use:

- Readest app or `https://web.readest.com/`.
- Catalog URL: `https://books.exe.xyz/catalog`.
- KOSync URL: `https://books.exe.xyz/kosync`.
- The same Books username and password for both integrations.

Readest account sync is not part of the backend contract. Set up OPDS and
KOSync on each device unless Readest clearly syncs those settings for that user.

## Docs

- `docs/architecture.md`: how the services fit together.
- `docs/device-setup.md`: reader app setup.
- `docs/real-device-sync-test.md`: physical-device sync check.
- `docs/family-users.md`: user lifecycle and per-user credentials.
- `docs/device-sync-test-matrix.md`: device test checklist.

Research notes live under `docs/research/`. They are history, not the current
implementation contract.

## References

- exe.dev HTTP proxy: https://exe.dev/docs/proxy
- exe.dev share CLI: https://exe.dev/docs/cli-share
- Calibre content server: https://manual.calibre-ebook.com/server.html
- `calibre-server` CLI: https://manual.calibre-ebook.com/generated/en/calibre-server.html
- Readest: https://github.com/readest/readest
- KOReader Sync Server: https://github.com/koreader/koreader-sync-server
- Anna's Archive MCP/CLI: https://github.com/iosifache/annas-mcp
