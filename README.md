# Books service

This repo runs a small self-hosted book backend. Calibre stores the EPUBs and
serves OPDS. KOSync stores reading position. Readers use the official Readest
apps or `https://web.readest.com/`. Hardcover Want to Read can act as the
request list.

Git recreates the machine shape. Books, passwords, API keys, and sync state stay
outside git.

## What runs

The active deployment is Docker Compose:

- `proxy`: nginx on `BOOKS_BIND_ADDR:BOOKS_PROXY_PORT`.
- `app`: Node setup pages and health checks.
- `calibre`: `calibre-server` with OPDS and downloads.
- `kosync`: pinned official KOReader Sync Server image.
- `worker`: Hardcover intake loop, every five minutes by default.
- `admin`: one-shot CLI container for owner commands.

There is no Calibre-Web service and no local reader UI. Compose is the app stack.

Public routes:

- `/catalog`: OPDS catalog for Readest, CrossPoint, KOReader, and other readers.
- `/opds`: the same catalog, kept for clients that expect the Calibre path.
- `/get/...`: Calibre downloads.
- `/kosync`: KOReader-compatible progress sync.
- `/setup/<user>`: setup page for one reader, protected by that reader's Books login.
- `/library`: redirect to hosted Readest Web.

Everything else returns 404. Public KOSync account creation is blocked; user
creation goes through the owner CLI.

## Runtime state

These paths are created by `bootstrap` and are not committed:

- `.env`: operator config and API keys.
- `data/config/secrets.json`: generated internal Calibre admin secret.
- `data/library`: Calibre library.
- `data/downloads`: Anna downloads.
- `data/import`: temporary import files.
- `data/log`: container logs written by the services.
- `data/config/state.json`: readers, Books passwords, Hardcover tokens, daily counters.
- `data/config/users.sqlite`: Calibre user database.
- `data/kosync`: KOSync Redis state.

Back up `.env` and the configured data directory if you care about the live
library, API keys, and user state.

## Fresh setup

```bash
cd /home/exedev/books
cp .env.example .env
chmod 600 .env
$EDITOR .env
mkdir -p data/import
docker compose build
docker compose run --rm admin bootstrap
docker compose up -d
docker compose run --rm admin health
docker compose run --rm admin users create "Alice" --email alice@example.com
docker compose run --rm admin verify alice
```

Install Docker and Docker Compose before running the stack. This repo uses the
standard Compose flow instead of a custom VM installer. Keep `.env` private; it
can hold API keys.

## Deployment address

The public host is not hardcoded. Set `BOOKS_PUBLIC_HOST` in `.env` to the host
readers will use. The examples use `books.example.com`.

For exe.dev, expose the loopback proxy from your local machine:

```bash
ssh exe.dev share port books 8000
ssh exe.dev share set-public books
```

Return to private mode:

```bash
ssh exe.dev share set-private books
```

The VM may not be able to call its own public HTTPS endpoint. Local checks use
the internal Compose proxy.

For a homelab, keep `BOOKS_BIND_ADDR=127.0.0.1` and point your normal reverse
proxy at `127.0.0.1:8000`, or change the bind address deliberately.

## Owner commands

```bash
docker compose ps
docker compose run --rm admin health
docker compose run --rm admin verify alice
docker compose restart
docker compose logs -f
```

Users:

```bash
docker compose run --rm admin users list
docker compose run --rm admin users create "Alice" --email alice@example.com
docker compose run --rm admin users show alice
docker compose run --rm admin users reconcile
```

Each reader gets one Books username and one dice-roll-style passphrase. That
same login works for their setup page, OPDS catalog, and KOSync progress.

Books:

```bash
docker compose run --rm admin import /srv/books/import/book.epub
docker compose run --rm admin import /app/fixtures/books-sync-fixture.epub
```

Only use acquisition tools for books you are allowed to access.

Hardcover intake:

```bash
printf '%s\n' 'Bearer ...' | docker compose run --rm -T admin hardcover set-token alice
docker compose run --rm admin hardcover status
docker compose run --rm admin hardcover sync --dry-run --user alice --limit 1
docker compose run --rm admin hardcover sync --user alice
```

The sync loop reads Want to Read, looks for an English EPUB through Anna's
Archive, imports a match into Calibre, then moves the Hardcover item to
Currently Reading. The automatic intake cap is global for the VM and defaults to
10 downloaded files per UTC day.

## Reader setup

Give each reader their setup page:

```bash
docker compose run --rm admin users show alice
```

They should use:

- Readest app or `https://web.readest.com/`.
- Catalog URL: `https://books.example.com/catalog`.
- KOSync URL: `https://books.example.com/kosync`.
- The same Books username and password for both integrations.

Readest account sync is not part of the backend contract. Set up OPDS and
KOSync on each device unless Readest clearly syncs those settings for that user.

## Docs

- `docs/architecture.md`: how the containers fit together.
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
