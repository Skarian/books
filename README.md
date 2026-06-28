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
- `admin`: one-shot CLI container used by `./scripts/books`.

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

These paths are created by onboarding and are not committed:

- `/etc/books/books.env`: secrets, API keys, paths, ports.
- `/srv/books/library`: Calibre library.
- `/srv/books/downloads`: Anna downloads and sync fixture copies.
- `/srv/books/import`: temporary import files.
- `/srv/books/log`: container logs written by the services.
- `/srv/books/config/state.json`: readers, Books passwords, Hardcover tokens, daily counters.
- `/srv/books/config/users.sqlite`: Calibre user database.
- `/srv/books/kosync`: KOSync Redis state.

Back up `/etc/books/books.env` and `/srv/books` if you care about the live
library and user state.

## Fresh setup

```bash
cd /home/exedev/books
./scripts/onboard
```

For a rebuild without prompts:

```bash
./scripts/onboard --non-interactive
```

Onboarding writes `/etc/books/books.env`, creates `/srv/books`, installs Docker
if needed, builds the runtime image, performs the one-shot SQLite-to-JSON cutover
if this VM still has the old state file, starts Compose, reconciles users, and
runs a local health check.

You can also use the helper:

```bash
./scripts/books setup
```

## Deployment address

The public host is not hardcoded. Set `BOOKS_PUBLIC_HOST` in
`/etc/books/books.env` when this runs somewhere other than `books.exe.xyz`.

For exe.dev, expose the loopback proxy from your local machine:

```bash
ssh exe.dev share port books 8000
ssh exe.dev share set-public books
```

Return to private mode:

```bash
ssh exe.dev share set-private books
```

The VM cannot call its own public `books.exe.xyz` endpoint. Local checks use
`BOOKS_LOCAL_BASE_URL`, which defaults to the proxy container inside Compose.

For a homelab, keep `BOOKS_BIND_ADDR=127.0.0.1` and point your normal reverse
proxy at `127.0.0.1:8000`, or change the bind address deliberately.

## Owner commands

```bash
./scripts/books status
./scripts/books health
./scripts/books verify neil
./scripts/books restart
./scripts/books logs
```

Users:

```bash
./scripts/books users list
./scripts/books users create "Alice" --email alice@example.com
./scripts/books users show alice
./scripts/books users reconcile
```

Each reader gets one Books username and one dice-roll-style passphrase. That
same login works for their setup page, OPDS catalog, and KOSync progress.

Books:

```bash
./scripts/books import /path/to/book.epub
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
Currently Reading. The automatic intake cap is global for the VM and defaults to
10 downloaded files per UTC day.

## Reader setup

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
