# Books Service Reference

## Layout

- Repo: `/home/exedev/books`
- Secrets/env: `/etc/books/books.env`
- Calibre library: `/srv/books/library`
- Staged downloads: `/srv/books/downloads`
- Import/conversion staging: `/srv/books/import`
- Service logs: `/srv/books/log`
- Calibre service: `books-calibre`
- Public host: `books.exe.xyz`

## Routing

Nginx listens on `BOOKS_PROXY_PORT` and proxies Calibre on `127.0.0.1:${CALIBRE_PORT}`.

- `/opds` and `/get/...` are open at nginx and protected by Calibre Basic auth for Crosspoint.
- Other routes require `X-ExeDev-Email` to match `BOOKS_ALLOWED_EMAIL`, then Calibre auth.
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

## Anna's Archive MCP/CLI

The installed binary is `/opt/books/bin/annas-mcp`, wrapped by `/opt/books/bin/books-annas` and exposed as:

```bash
./scripts/books anna book-search "query"
./scripts/books anna book-download MD5_HASH filename.epub
```

The wrapper sources `/etc/books/books.env` and runs the binary with `ANNAS_SECRET_KEY`, `ANNAS_DOWNLOAD_PATH`, and `ANNAS_BASE_URL`.

Respect copyright and terms. If a requested title is not clearly public domain, Creative Commons, owned, or otherwise authorized, ask for confirmation before download.
