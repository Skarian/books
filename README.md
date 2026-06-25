# Books Service

Reproducible setup for a personal Calibre EPUB/OPDS service on `books.exe.xyz`.

The repo is the source of truth. Runtime data and secrets live outside git:

- `/etc/books/books.env`: passwords, Anna's Archive API key, ports, paths
- `/srv/books/library`: Calibre library, not committed
- `/srv/books/downloads`: staged downloads, not committed
- `/srv/books/import`: temporary conversion/import files, not committed

## Architecture

- `nginx` listens on `BOOKS_PROXY_PORT` (`8000` by default) for the exe.dev HTTPS proxy.
- `calibre-server` listens only on `127.0.0.1:8080`.
- `/opds` and `/get/...` pass through to Calibre so Crosspoint can use Calibre Basic auth.
- All other Calibre browser UI routes require `X-ExeDev-Email: neil.skaria@gmail.com` from exe.dev before they reach Calibre.
- Calibre itself still uses username/password auth for both OPDS and UI.

This follows the documented exe.dev proxy behavior: the proxy forwards standard `X-Forwarded-*` headers and, for authenticated users, adds `X-ExeDev-Email`. Public/private access is controlled with documented `ssh exe.dev share ...` commands.

## Onboard A Fresh VM

```bash
cd /home/exedev/books
./scripts/onboard
```

The onboarding command installs:

- official Calibre for Linux pinned by `CALIBRE_VERSION`
- Anna's Archive MCP/CLI `v0.0.5`
- nginx config from `config/nginx/books.conf.template`
- systemd unit from `config/systemd/books-calibre.service`
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

## Operations

```bash
./scripts/books status
./scripts/books health
./scripts/books restart
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
- Anna's Archive MCP/CLI: https://github.com/iosifache/annas-mcp
