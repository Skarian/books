# Books service

A self-hosted EPUB library built from a small Docker Compose stack.

- Calibre stores the books and serves OPDS.
- KOSync stores reading position.
- Readest, KOReader, CrossPoint, and other OPDS readers connect to the same
  catalog.
- Hardcover Want to Read can feed automatic imports through Anna's Archive.

The repo recreates the service. The library, passwords, API keys, and reading
state live outside git.

## Services

`compose.yaml` defines five services:

- `proxy`: nginx on `BOOKS_BIND_ADDR:BOOKS_PROXY_PORT`.
- `calibre`: Calibre content server with OPDS and downloads.
- `kosync`: KOReader Sync Server.
- `worker`: Hardcover intake loop, every five minutes by default.
- `admin`: one-shot CLI container for setup and operator commands.

Public routes:

- `/catalog`: OPDS catalog for Readest, CrossPoint, KOReader, and other readers.
- `/opds`: Calibre's OPDS path.
- `/get/...`: book downloads from Calibre.
- `/kosync`: KOReader-compatible progress sync.
- `/library`: redirect to hosted Readest Web.
- `/healthz`: nginx health check.

## Runtime State

`bootstrap` creates the runtime files and directories:

- `.env`: host and operator settings.
- `secrets/annas_secret_key`: Anna's Archive API key.
- `data/config/secrets.json`: generated Calibre admin secret.
- `data/config/state.json`: reader accounts, Books passwords, Hardcover tokens,
  and daily intake counters.
- `data/config/users.sqlite`: Calibre user database.
- `data/library`: Calibre library.
- `data/downloads`: Anna downloads before import.
- `data/import`: manual import drop folder.
- `data/kosync`: KOSync Redis state.
- `data/log`: container logs.

Back up `.env`, `secrets/annas_secret_key`, and the data directory.

## Fresh Setup

Install Docker with the Compose plugin first.

```bash
cd /home/exedev/books
cp .env.example .env
chmod 600 .env
$EDITOR .env
mkdir -p data/import secrets
printf '%s' 'ANNA_SECRET_KEY_HERE' > secrets/annas_secret_key
chmod 600 secrets/annas_secret_key
docker compose build
docker compose run --rm admin bootstrap
docker compose up -d
docker compose run --rm admin health
docker compose run --rm admin users create "Alice" --email alice@example.com
```

Set `BOOKS_PUBLIC_HOST` in `.env` to the host readers will use.

## Deployment

For exe.dev, expose the loopback proxy from your local machine:

```bash
ssh exe.dev share port books 8000
ssh exe.dev share set-public books
```

Return to private mode:

```bash
ssh exe.dev share set-private books
```

For a homelab, leave `BOOKS_BIND_ADDR=127.0.0.1` and point your reverse proxy
at `127.0.0.1:8000`, or change the bind address deliberately.

Use the internal Compose proxy for checks from the VM:

```bash
docker compose run --rm admin health
```

## Operator Commands

Stack:

```bash
docker compose ps
docker compose logs -f
docker compose restart
docker compose run --rm admin health
```

Users:

```bash
docker compose run --rm admin users list
docker compose run --rm admin users create "Alice" --email alice@example.com
docker compose run --rm admin users show alice
docker compose run --rm admin users reconcile
```

Each reader gets one Books username and one Diceware-style passphrase. That
same login works for OPDS and KOSync.

Manual import:

```bash
docker compose run --rm admin import /srv/books/import/book.epub
```

Only import books you are allowed to access.

Hardcover intake:

```bash
printf '%s\n' 'Bearer ...' | docker compose run --rm -T admin hardcover set-token alice
docker compose run --rm admin hardcover status
docker compose run --rm admin hardcover sync --dry-run --user alice --limit 1
docker compose run --rm admin hardcover sync --user alice
```

The worker reads Want to Read, searches Anna's Archive for an English EPUB,
imports a match into Calibre, then moves the Hardcover item to Currently
Reading. The automatic intake cap defaults to 10 downloaded files per UTC day
for the whole VM.

## Reader Handoff

Print a reader's setup values:

```bash
docker compose run --rm admin users show alice
```

Send that output with `docs/reader-setup.md`. A reader needs:

- Readest app or `https://web.readest.com/`.
- Catalog URL: `https://books.example.com/catalog`.
- KOSync URL: `https://books.example.com/kosync`.
- Their Books username and password.

See `docs/device-setup.md` for device notes and `docs/multiple-users.md` for
multi-user operation.

## References

- exe.dev HTTP proxy: https://exe.dev/docs/proxy
- exe.dev share CLI: https://exe.dev/docs/cli-share
- Calibre content server: https://manual.calibre-ebook.com/server.html
- `calibre-server` CLI: https://manual.calibre-ebook.com/generated/en/calibre-server.html
- Readest: https://github.com/readest/readest
- Readest docs: https://readest.com/docs
- Readest sync docs: https://readest.com/docs/sync
- KOReader Sync Server: https://github.com/koreader/koreader-sync-server
- Anna's Archive MCP/CLI: https://github.com/iosifache/annas-mcp
