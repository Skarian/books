# Users

## Library model

The Calibre database is shared for storage and metadata, but catalog visibility is per user. Each book is granted to one or more user slugs, and each login only sees matching books. Reading progress is private: each user has one Books login, and KOSync tracks their position under that login separately from everyone else's.

Each user account has:

- a **slug** (e.g. `alice`) used as their Books username
- a **six-word diceware passphrase** generated at account creation
- an optional **email** stored for owner reference only
- an optional **Hardcover token** if intake is configured for that user

The same username and passphrase work for the OPDS catalog and for KOSync.

## Create a user

```bash
docker compose run --rm admin users create "Alice" --email alice@example.com
```

The slug is derived from the display name automatically. To set a custom slug:

```bash
docker compose run --rm admin users create "Alice" --slug ali
```

After creation, the command reconciles the new account into Calibre and KOSync, then prints the full handoff.

## List users

```bash
docker compose run --rm admin users list
```

Prints slug, display name, and email for every account.

## Show credentials

```bash
docker compose run --rm admin users show alice
```

Prints the full handoff: Books username, passphrase, Readest Web link, OPDS URL, and KOSync URL. Send these values to the user out-of-band and point them at [docs/reader-setup.md](reader-setup.md).

Keep `.env`, `secrets/annas_secret_key`, `data/config/secrets.json` (Calibre admin credentials), and Hardcover tokens owner-only.

## Reader setup links

KOReader setup ZIPs are generated on demand when a user opens the setup page and signs in with their Books username and password. The bundle downloads pinned SimpleUI `2.1` into `data/config/simpleui-2.1.koplugin` the first time it is needed; later requests reuse that cached copy. On unmodified SimpleUI layouts, its Books plugin arranges **Home · Library · Apps**, with **Settings · History · Sync Books · Requests · Power** inside Apps, without replacing unrelated OPDS settings. The Books plugin also exposes native **Requests** and **Sync Books** menu entries; the request workflow itself uses only native KOReader widgets and remains available if SimpleUI is removed. Requests searches Hardcover through the server using the same Books login; the reader never receives the user's Hardcover token. On first Books setup it selects KOReader's **Mosaic with cover images** Library mode when CoverBrowser is still at its fresh or untouched stock layout; customized layouts and later user changes are preserved.

Readest and CrossPoint setup ZIPs are also generated on demand and contain that user's catalog and KOSync settings. For Readest, send the user to `https://books.example.com/readest`; they enter their Books username and password there, then follow the setup steps on the page.

Send users the setup page for their app:

```text
https://books.example.com/koreader
https://books.example.com/readest
https://books.example.com/crosspoint
```

After login, the page shows downloads for that account. The links are not secret; the ZIPs contain credentials and should be treated like the passphrase itself.

## Reconcile

```bash
docker compose run --rm admin users reconcile
docker compose run --rm admin users reconcile alice
```

`reconcile` pushes account state from `data/config/state.json` into Calibre, applies per-user catalog restrictions, creates missing KOSync users, and verifies that KOSync accepts each user's Books login. Run it after restoring from backup, after manual edits to the state file, or to confirm that Calibre and KOSync are in sync with Books state.

## Import an EPUB manually

Place the EPUB in a location the admin container can reach. The `data/import` directory is mounted at `/srv/books/import` inside the container:

Imports must name the user who should see the book:

```bash
docker compose run --rm admin import --user alice /srv/books/import/book.epub
```

Repeat `--user` to grant the same import to more than one user. Pass multiple paths to import several files in one command. Only EPUB format is supported.

## Hardcover intake

Hardcover Want to Read is the intake queue. When a Hardcover API token is configured for a user, the worker checks their Want to Read list every minute and imports or grants a matching English EPUB to that user when one is found.

### Connect a Hardcover account

Pipe the bearer token to `set-token`:

```bash
printf '%s\n' 'Bearer YOUR_TOKEN_HERE' | docker compose run --rm -T admin hardcover set-token alice
```

The token is verified against the Hardcover API on save. To read from a file, the path must be readable inside the container. Place the file in the data directory on the host and reference it under the container mount at `/srv/books/`:

```bash
docker compose run --rm admin hardcover set-token alice --token-file /srv/books/token.txt
```

### Check status

```bash
docker compose run --rm admin hardcover status
docker compose run --rm admin hardcover status alice
```

Shows token status, linked Hardcover username, and the VM-wide daily download count against the cap.

### Run a manual sync

```bash
docker compose run --rm admin hardcover sync --user alice
docker compose run --rm admin hardcover sync --user alice --dry-run --limit 1
```

`--dry-run` logs what the sync would do without downloading or importing anything. `--limit N` caps the number of items processed in one run. Omitting `--user` syncs all users who have a token configured.

### Remove a token

```bash
docker compose run --rm admin hardcover clear-token alice
```

### How each Want to Read item is handled

1. The worker reads the user's Want to Read list from the Hardcover GraphQL API.
2. It searches Anna's Archive for candidates matching the title and author.
3. It keeps only English EPUB candidates whose normalized title and author match the request.
4. It ranks eligible candidates by Anna download count, great-quality votes, list count, report count, and original search order; the winner is granted if the Hardcover book is already present, otherwise downloaded as `<title>.epub` and imported.
5. The Calibre book records the Hardcover `book_id` as a `hardcover` identifier for future progress matching.
6. The Hardcover item moves from Want to Read to Currently Reading after the book is visible in the user's catalog.
7. New downloads increment the VM-wide daily download count.

The same worker pass also pushes reading progress from KOSync back to Hardcover. For books fulfilled from Hardcover, progress is matched by the stored `hardcover` identifier. Manual imports can still match an existing Hardcover row by exact title/author, or create a row from an exact ISBN lookup. Progress only moves forward; the worker does not pull Hardcover progress into KOSync.

## Optional AI dictionary

AI dictionary lookup is disabled unless `BOOKS_AI_PROVIDER` is set to `codex` or `openai`. `codex` mode uses a logged-in Codex home mounted with `BOOKS_HOST_CODEX_HOME`. `openai` mode uses `OPENAI_API_KEY`. Requests use the same Books login as OPDS/setup.

Items with no match, a download error, or an import error are logged and stay on Want to Read. The worker retries on the next five-minute cycle.

The download cap (`HARDCOVER_DAILY_DOWNLOAD_CAP` in `.env`, default 10) applies across all users and resets at UTC midnight.
