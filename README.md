# Books service

Reproducible setup for Neil's self-hosted reading system on `books.exe.xyz`.
The repo stands up the shared Calibre bookshelf, cross-device KOSync progress,
family setup pages, book requests, and the owner admin surfaces needed to run
it. Readers use the official Readest apps and `https://web.readest.com/`; this
VM gives Readest the private OPDS catalog and KOSync endpoint.

The repo is the source of truth. Runtime data and secrets live outside git:

- `/etc/books/books.env`: passwords, Anna's Archive API key, ports, paths
- `/srv/books/library`: Calibre library, not committed
- `/srv/books/downloads`: staged downloads, not committed
- `/srv/books/import`: temporary conversion/import files, not committed
- `/srv/books/log`: service logs, not committed
- `/srv/books/calibre-web`: Calibre-Web settings DB, not committed
- `/srv/books/kosync`: KOSync state, not committed
- `/srv/books/config/accounts.sqlite`: family users, generated service credentials, and per-user Hardcover tokens, not committed
- `/srv/books/requests`: per-user book request queue, not committed
- `/srv/books/inbox`: staged family uploads, not committed

## Current implementation

- `nginx` listens on `BOOKS_PROXY_PORT` (`8000` by default) for the exe.dev HTTPS proxy.
- `calibre-server` listens only on `127.0.0.1:8080`.
- `calibre-web` listens only on `127.0.0.1:8083` and provides the owner-only web UI/reader.
- `books-portal` listens only on `127.0.0.1:8090` and provides the owner home page, user setup pages, and request queue.
- `books-kosync` runs the pinned official KOReader Sync Server image and listens only on `127.0.0.1:7200`.
- `books-hardcover-sync.timer` checks each configured user's Hardcover Want to Read shelf every five minutes.
- `/catalog`, `/opds`, and `/get/...` pass through to Calibre so CrossPoint, Readest, and KOReader can use Calibre Basic auth.
- `/kosync` passes through to KOSync with prefix stripping.
- `/library` redirects old links to `https://web.readest.com/`.
- `/setup/<user>` reaches the portal and uses per-user Basic auth.
- `/` is the owner portal and `/calibre/` is the owner Calibre-Web reader. Both require `X-ExeDev-Email: neil.skaria@gmail.com` from exe.dev.
- Calibre-Web still uses its own username/password login.
- Calibre-Web Kobo routes are blocked at nginx because Crosspoint uses native Calibre OPDS and Kobo sync is not needed.

This follows the documented exe.dev proxy behavior: the proxy forwards standard `X-Forwarded-*` headers and, for authenticated users, adds `X-ExeDev-Email`. Public/private access is controlled with documented `ssh exe.dev share ...` commands.

## Docs to read first

- `docs/architecture.md`: the repo contract and service shape
- `docs/device-setup.md`: how CrossPoint, Readest, KOReader, and Kobo connect
- `docs/real-device-sync-test.md`: the physical-device test using a generated EPUB
- `docs/family-users.md`: family accounts, setup pages, uploads, and optional owner admin UI
- `docs/device-sync-test-matrix.md`: the checklist before trusting progress sync

These are background research notes:

- `docs/research/self-hosted-reading-sync-research.md`
- `docs/research/family-multi-user-admin-plan.md`

## Onboard A Fresh VM

```bash
cd /home/exedev/books
./scripts/onboard
```

The onboarding command installs:

- official Calibre for Linux pinned by `CALIBRE_VERSION`
- Calibre-Web pinned by `CALIBRE_WEB_VERSION`
- official KOReader Sync Server pinned by `KOSYNC_IMAGE`
- Anna's Archive MCP/CLI `v0.0.5`
- nginx config from `config/nginx/books.conf.template`
- systemd unit from `config/systemd/books-calibre.service`
- systemd unit from `config/systemd/books-calibre-web.service`
- systemd unit from `config/systemd/books-portal.service`
- systemd unit from `config/systemd/books-kosync.service`
- systemd unit and timer from `config/systemd/books-hardcover-sync.*`
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

The public catalog URL for setup pages and normal app setup is:

```text
https://books.exe.xyz/catalog
```

The legacy OPDS route still exists at `https://books.exe.xyz/opds` for apps that
expect it. User-specific OPDS credentials come from
`./scripts/books users show USER`.

Readest Web is hosted by Readest:

```text
https://web.readest.com/
```

In Readest, add this catalog and sync server:

```text
https://books.exe.xyz/catalog
https://books.exe.xyz/kosync
```

Readest can sync the catalog, KOSync settings, and optionally credentials across
signed-in devices. Credentials require turning on Readest's Credentials sync and
setting a sync passphrase.

The owner-only web reader is:

```text
https://books.exe.xyz/calibre/
```

Use the `CALIBRE_WEB_ADMIN_USER` and `CALIBRE_WEB_ADMIN_PASSWORD` stored in `/etc/books/books.env`.

## Operations

```bash
./scripts/books status
./scripts/books health
./scripts/books verify neil
./scripts/books restart
./scripts/books sync-fixture
./scripts/books web-url
./scripts/books opds-url
./scripts/books kosync-url
./scripts/books proxy-commands
./scripts/books users list
./scripts/books users rotate neil all
./scripts/books requests list
./scripts/books hardcover status
```

Import EPUBs:

```bash
./scripts/books import /path/to/book.epub
```

Generate and import the test EPUB used for real-device progress checks:

```bash
./scripts/books sync-fixture
```

That creates `Books Sync Fixture` under `/srv/books/downloads` and imports it
into Calibre. Use it with `docs/real-device-sync-test.md`.

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

## Hardcover Requests

Hardcover can be the intake list. For each reader who wants automatic requests,
store their Hardcover API token in the runtime accounts database:

```bash
printf '%s\n' 'Bearer ...' | ./scripts/books hardcover set-token neil
./scripts/books hardcover status
```

The token is not written to git. The sync loop reads that user's Want to Read
books, searches Anna's Archive for an English EPUB, imports the first strong
match into Calibre, then moves the Hardcover item to Currently Reading. Anna's
download cap is shared across the whole VM and defaults to 15 downloads per UTC
day:

```bash
./scripts/books hardcover sync --dry-run --user neil --limit 1
./scripts/books hardcover sync --user neil
```

The systemd timer runs the same sync every five minutes. Request and fulfillment
records are kept under `/srv/books/requests/<user>/` and in
`/srv/books/config/accounts.sqlite`.

## References

- exe.dev HTTP proxy: https://exe.dev/docs/proxy
- exe.dev Login with exe headers: https://exe.dev/docs/login-with-exe
- exe.dev share CLI: https://exe.dev/docs/cli-share
- Calibre content server: https://manual.calibre-ebook.com/server.html
- `calibre-server` CLI: https://manual.calibre-ebook.com/generated/en/calibre-server.html
- Calibre-Web: https://github.com/janeczku/calibre-web
- Readest: https://github.com/readest/readest
- KOReader Sync Server: https://github.com/koreader/koreader-sync-server
- Anna's Archive MCP/CLI: https://github.com/iosifache/annas-mcp
