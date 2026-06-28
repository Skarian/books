# Books service reference

## Layout

- Repo: `/home/exedev/books`
- Env: `.env`
- Generated secrets: `data/config/secrets.json`
- Calibre library: `data/library`
- Downloads: `data/downloads`
- Import staging: `data/import`
- Logs: `data/log`
- Accounts: `data/config/state.json`
- Calibre users: `data/config/users.sqlite`
- KOSync state: `data/kosync`
- Example public host: `books.example.com`

Compose services:

- `proxy`
- `calibre`
- `kosync`
- `worker`
- `admin`

## Routing

The proxy container listens on `BOOKS_PROXY_PORT`.

- `/catalog`, `/opds`, and `/get/...` go to Calibre.
- `/kosync` goes to KOSync with the prefix stripped.
- `/kosync/users/create` is blocked publicly.
- `/library` redirects to `https://web.readest.com/`.
- `/healthz` is served by nginx.
- `/` returns 404.

The VM may not be able to call its own public HTTPS endpoint. Use local checks:

```bash
docker compose run --rm admin health
docker compose run --rm admin verify USER
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

Each reader gets one Books login. It works for OPDS and KOSync.

```bash
docker compose run --rm admin users list
docker compose run --rm admin users create "Name" --email person@example.com
docker compose run --rm admin users show USER
docker compose run --rm admin users reconcile
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
OPDS catalog: https://books.example.com/catalog
KOSync server: https://books.example.com/kosync
```

Use the same Books username and password for both.
In Readest, OPDS is under Library -> Import Menu -> Online Library. KOSync is
under Book Menu -> KOReader Sync after opening a book. Use File Content as the
Readest checksum method.

## Imports

Prefer English EPUBs.

```bash
docker compose run --rm admin import /srv/books/import/book.epub
docker compose run --rm admin import /app/fixtures/books-sync-fixture.epub
```

The fixture command imports `Books Sync Fixture` into Calibre.

## Anna's Archive MCP

The installed binary is `/opt/books/bin/annas-mcp` inside the runtime image.
Hardcover intake uses it internally.

Respect copyright and terms. Ask before downloading when authorization is not
clear.

## Hardcover intake

Configure a token per user:

```bash
printf '%s\n' 'Bearer ...' | docker compose run --rm -T admin hardcover set-token USER
docker compose run --rm admin hardcover status USER
docker compose run --rm admin hardcover sync --dry-run --user USER --limit 1
```

The worker checks Want to Read every five minutes, imports fulfilled EPUBs into
Calibre, and moves fulfilled Hardcover items to Currently Reading. The automatic
download cap is global for the VM and defaults to 10 files per UTC day.
