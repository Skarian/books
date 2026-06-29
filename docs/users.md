# Users

## Library model

The library is shared. Every user sees the same catalog and downloads from the same Calibre database. Reading progress is private: each user has one Books login, and KOSync tracks their position under that login separately from everyone else's.

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

## Reconcile

```bash
docker compose run --rm admin users reconcile
docker compose run --rm admin users reconcile alice
```

`reconcile` pushes account state from `data/config/state.json` into Calibre and KOSync. It creates accounts that are missing and updates passwords to match the state file. Run it after restoring from backup, after manual edits to the state file, or to confirm that Calibre and KOSync are in sync with Books state.

## Import an EPUB manually

Place the EPUB in a location the admin container can reach. The `data/import` directory is mounted at `/srv/books/import` inside the container:

```bash
docker compose run --rm admin import /srv/books/import/book.epub
```

Pass multiple paths to import several files in one command. Only EPUB format is supported.

## Hardcover intake

Hardcover Want to Read is the intake queue. When a Hardcover API token is configured for a user, the worker checks their Want to Read list every five minutes and imports a matching English EPUB into Calibre when one is found.

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
3. Candidates are scored: EPUB format preferred, English language preferred, title and author token overlap weighted.
4. If the best candidate scores above the threshold, the file is downloaded to `data/downloads/` and imported into Calibre.
5. The Hardcover item moves from Want to Read to Currently Reading.
6. The VM-wide daily download count increments.

Items with no match, a download error, or an import error are logged and stay on Want to Read. The worker retries on the next five-minute cycle.

The download cap (`HARDCOVER_DAILY_DOWNLOAD_CAP` in `.env`, default 10) applies across all users and resets at UTC midnight.
