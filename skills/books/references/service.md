# Books service reference

## Layout

- Repo: `/home/exedev/books`
- Env/secrets: `/etc/books/books.env`
- Calibre library: `/srv/books/library`
- Downloads: `/srv/books/downloads`
- Import staging: `/srv/books/import`
- Logs: `/srv/books/log`
- Accounts: `/srv/books/config/state.json`
- Calibre users: `/srv/books/config/users.sqlite`
- KOSync state: `/srv/books/kosync`
- Default public host: `books.exe.xyz`

Compose services:

- `proxy`
- `app`
- `calibre`
- `kosync`
- `worker`
- `admin`

## Routing

The proxy container listens on `BOOKS_PROXY_PORT`.

- `/catalog`, `/opds`, and `/get/...` go to Calibre.
- `/kosync` goes to KOSync with the prefix stripped.
- `/kosync/users/create` is blocked publicly.
- `/setup/<user>` goes to the Node app and uses that user's Books login.
- `/library` redirects to `https://web.readest.com/`.
- `/healthz` goes to the Node app.
- `/` returns 404.

The VM cannot call its own public `books.exe.xyz` endpoint. Use local checks:

```bash
./scripts/books health
./scripts/books verify USER
```

Use only documented exe.dev commands:

```bash
ssh exe.dev share port books 8000
ssh exe.dev share set-public books
ssh exe.dev share set-private books
```

For homelab deployment, set `BOOKS_PUBLIC_HOST` and point your normal reverse
proxy at `127.0.0.1:8000` unless you deliberately change `BOOKS_BIND_ADDR`.

## Users

Each reader gets one Books login. It works for setup, OPDS, and KOSync.

```bash
./scripts/books users list
./scripts/books users create "Name" --email person@example.com
./scripts/books users show USER
./scripts/books users reconcile
```

Run `users reconcile` after onboarding or account changes if Calibre/KOSync state
looks stale.

## Reader setup

Tell readers to use hosted Readest:

```text
https://web.readest.com/
```

Then configure:

```text
OPDS catalog: https://books.exe.xyz/catalog
KOSync server: https://books.exe.xyz/kosync
```

Use the same Books username and password for both.

## Imports

Prefer English EPUBs.

```bash
./scripts/books import /path/to/book.epub
./scripts/books sync-fixture
```

The sync fixture writes `/srv/books/downloads/books-sync-fixture.epub` and
imports `Books Sync Fixture` into Calibre.

## Anna's Archive MCP

The installed binary is `/opt/books/bin/annas-mcp` inside the runtime image.

Use it through the repo helper so env vars come from `/etc/books/books.env`:

```bash
./scripts/books anna book-search "query"
./scripts/books anna book-download MD5_HASH filename.epub
```

Respect copyright and terms. Ask before downloading when authorization is not
clear.

## Hardcover intake

Configure a token per user:

```bash
printf '%s\n' 'Bearer ...' | ./scripts/books hardcover set-token USER
./scripts/books hardcover status USER
./scripts/books hardcover sync --dry-run --user USER --limit 1
```

The worker checks Want to Read every five minutes, imports fulfilled EPUBs into
Calibre, and moves fulfilled Hardcover items to Currently Reading. The automatic
download cap is global for the VM and defaults to 10 files per UTC day.
