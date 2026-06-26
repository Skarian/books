# Books service

Reproducible setup for Neil's self-hosted reading system on `books.exe.xyz`.
The repo will stand up the shared Calibre bookshelf, cross-device progress sync,
Readest WebDAV state, family users, and an owner-only admin panel.

The repo is the source of truth. Runtime data and secrets live outside git:

- `/etc/books/books.env`: passwords, Anna's Archive API key, ports, paths
- `/srv/books/library`: Calibre library, not committed
- `/srv/books/downloads`: staged downloads, not committed
- `/srv/books/import`: temporary conversion/import files, not committed
- `/srv/books/log`: service logs, not committed
- `/srv/books/calibre-web`: Calibre-Web settings DB, not committed
- `/srv/books/kosync`: KOSync state, not committed
- `/srv/books/readest-webdav`: Readest WebDAV state, not committed
- `/srv/books/inbox`: staged family uploads, not committed

## Current implementation

- `nginx` listens on `BOOKS_PROXY_PORT` (`8000` by default) for the exe.dev HTTPS proxy.
- `calibre-server` listens only on `127.0.0.1:8080`.
- `calibre-web` listens only on `127.0.0.1:8083` and provides the owner-only web UI/reader.
- `/opds` and `/get/...` pass through to Calibre so Crosspoint can use Calibre Basic auth.
- All other browser UI routes require `X-ExeDev-Email: neil.skaria@gmail.com` from exe.dev before they reach Calibre-Web.
- Calibre-Web still uses its own username/password login.
- Calibre-Web Kobo routes are blocked at nginx because Crosspoint uses native Calibre OPDS and Kobo sync is not needed.

This follows the documented exe.dev proxy behavior: the proxy forwards standard `X-Forwarded-*` headers and, for authenticated users, adds `X-ExeDev-Email`. Public/private access is controlled with documented `ssh exe.dev share ...` commands.

## Docs to read first

- `docs/architecture.md`: the repo contract and service shape
- `docs/device-setup.md`: how CrossPoint, Readest, KOReader, and Kobo connect
- `docs/family-users.md`: family accounts, setup pages, uploads, and the owner admin panel
- `docs/device-sync-test-matrix.md`: the checklist before trusting progress sync

These are background research notes:

- `docs/self-hosted-reading-sync-research.md`
- `docs/family-multi-user-admin-plan.md`

## Onboard A Fresh VM

```bash
cd /home/exedev/books
./scripts/onboard
```

The onboarding command installs:

- official Calibre for Linux pinned by `CALIBRE_VERSION`
- Calibre-Web pinned by `CALIBRE_WEB_VERSION`
- Anna's Archive MCP/CLI `v0.0.5`
- nginx config from `config/nginx/books.conf.template`
- systemd unit from `config/systemd/books-calibre.service`
- systemd unit from `config/systemd/books-calibre-web.service`
- wrappers in `/opt/books/bin`
- the repo-local Codex `$books` skill symlink

For a non-interactive rebuild with generated passwords:

```bash
./scripts/onboard --non-interactive
```

## exe.dev Proxy

Run from your local machine, not from inside the VM:

```bash
ssh exe.dev share port books 8000
ssh exe.dev share set-public books
```

Return to private mode with:

```bash
ssh exe.dev share set-private books
```

The public OPDS URL for Crosspoint is:

```text
https://books.exe.xyz/opds
```

Use the `CALIBRE_OPDS_USER` and `CALIBRE_OPDS_PASSWORD` stored in `/etc/books/books.env`.

The owner-only web reader is:

```text
https://books.exe.xyz/
```

Use the `CALIBRE_WEB_ADMIN_USER` and `CALIBRE_WEB_ADMIN_PASSWORD` stored in `/etc/books/books.env`.

## Operations

```bash
./scripts/books status
./scripts/books health
./scripts/books restart
./scripts/books web-url
./scripts/books opds-url
./scripts/books proxy-commands
```

Import EPUBs:

```bash
./scripts/books import /path/to/book.epub
```

Convert a non-EPUB first, then import:

```bash
./scripts/books import --convert /path/to/book.pdf
```

Use Anna's Archive MCP/CLI after entering your member API key in onboarding:

```bash
./scripts/books anna book-search "public domain book title epub english"
./scripts/books anna book-download MD5_HASH filename.epub
./scripts/books import /srv/books/downloads/filename.epub
```

Only use acquisition tools for books you are legally permitted to access, such as public domain, Creative Commons, owned, or otherwise authorized works.

## References

- exe.dev HTTP proxy: https://exe.dev/docs/proxy
- exe.dev Login with exe headers: https://exe.dev/docs/login-with-exe
- exe.dev share CLI: https://exe.dev/docs/cli-share
- Calibre content server: https://manual.calibre-ebook.com/server.html
- `calibre-server` CLI: https://manual.calibre-ebook.com/generated/en/calibre-server.html
- Calibre-Web: https://github.com/janeczku/calibre-web
- Anna's Archive MCP/CLI: https://github.com/iosifache/annas-mcp
