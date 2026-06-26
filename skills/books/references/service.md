# Books Service Reference

## Layout

- Repo: `/home/exedev/books`
- Secrets/env: `/etc/books/books.env`
- Calibre library: `/srv/books/library`
- Staged downloads: `/srv/books/downloads`
- Import/conversion staging: `/srv/books/import`
- Service logs: `/srv/books/log`
- Family accounts: `/srv/books/config/accounts.sqlite`
- Book request queue: `/srv/books/requests`
- Calibre service: `books-calibre`
- Calibre-Web service: `books-calibre-web`
- Portal service: `books-portal`
- KOSync service: `books-kosync`
- Public host: `books.exe.xyz`

## Routing

Nginx listens on `BOOKS_PROXY_PORT`, proxies native Calibre on
`127.0.0.1:${CALIBRE_PORT}`, Calibre-Web on
`127.0.0.1:${CALIBRE_WEB_PORT}`, the portal on
`127.0.0.1:${BOOKS_PORTAL_PORT}`, and KOSync on
`127.0.0.1:${KOSYNC_PORT}`.

- `/library` redirects older local Readest links to `https://web.readest.com/`.
- `/catalog`, `/opds`, and `/get/...` are open at nginx and protected by Calibre Basic auth for CrossPoint and reader apps. Prefer `/catalog` in user-facing setup.
- `/kosync` is open at nginx and protected by KOSync credentials. Nginx strips the `/kosync` prefix before proxying to the KOSync container.
- `/setup/<user>` is open at nginx and protected by per-user setup Basic auth in the portal.
- `/` and owner portal routes require `X-ExeDev-Email` to match `BOOKS_ALLOWED_EMAIL`.
- `/calibre/` requires `X-ExeDev-Email` to match `BOOKS_ALLOWED_EMAIL`, then Calibre-Web auth.
- Calibre-Web Kobo routes are blocked at nginx unless intentionally enabled later.
- If the exe.dev proxy is public, unauthenticated browser UI requests redirect to `/__exe.dev/login`.

Do not add undocumented exe.dev endpoints. Use only documented commands such as:

```bash
ssh exe.dev share port books 8000
ssh exe.dev share set-public books
ssh exe.dev share set-private books
```

## Import

Prefer EPUB and English editions. Import with:

```bash
./scripts/books import /path/to/book.epub
```

For non-EPUB files, use conversion only when the user accepts possible quality loss:

```bash
./scripts/books import --convert /path/to/book.pdf
```

Generate the local real-device sync fixture with:

```bash
./scripts/books sync-fixture
```

That writes `/srv/books/downloads/books-sync-fixture.epub` and imports
`Books Sync Fixture` into Calibre. Use it before filling in
`docs/device-sync-test-matrix.md`.

## Anna's Archive MCP/CLI

The installed binary is `/opt/books/bin/annas-mcp`, wrapped by `/opt/books/bin/books-annas` and exposed as:

```bash
./scripts/books anna book-search "query"
./scripts/books anna book-download MD5_HASH filename.epub
```

The wrapper sources `/etc/books/books.env` and runs the binary with `ANNAS_SECRET_KEY`, `ANNAS_DOWNLOAD_PATH`, and `ANNAS_BASE_URL`.

Respect copyright and terms. If a requested title is not clearly public domain, Creative Commons, owned, or otherwise authorized, ask for confirmation before download.

## Family Users

Use the repo helper:

```bash
./scripts/books users list
./scripts/books users create "Name" --email person@example.com
./scripts/books users show USER
./scripts/books users rotate USER login
./scripts/books users rotate USER all
./scripts/books users disable USER
./scripts/books users purge USER --yes
./scripts/books users reconcile
```

The helper reconciles active users into Calibre OPDS users and KOSync Redis
keys using one Books login per reader. The setup page shows that login once.
Readest accounts are managed by Readest; this VM only provides the catalog and
progress endpoint.
Do not add WebDAV unless the device matrix proves OPDS plus KOSync is not enough.

Run `./scripts/books verify USER` after onboarding, account changes, or service
changes. It checks local nginx routes, owner gating, setup Basic auth, OPDS auth,
KOSync health/auth, systemd services, and the pinned KOSync image. It uses local
nginx because the VM cannot call its own public `books.exe.xyz` endpoint.

Book requests submitted from setup pages are stored as JSON under
`/srv/books/requests/<user>/`. Review them with:

```bash
./scripts/books requests list
./scripts/books requests process PATH
```
