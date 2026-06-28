# Family Users

The family model is shared books with private reading position.

Each person gets one Books login. They use it for the setup page, the OPDS
catalog, and KOSync. They still use their own Readest account in the Readest app.

## Account Shape

Each user has:

- display name
- slug, such as `neil` or `alice`
- optional email, for owner reference
- status: active or disabled
- Books username
- Books passphrase
- optional Hardcover token

The account database is:

```text
/srv/books/config/accounts.sqlite
```

That database is runtime state. Back it up with `/srv/books`.

## Owner Commands

```bash
./scripts/books users list
./scripts/books users create "Alice" --email alice@example.com
./scripts/books users show alice
./scripts/books users rotate alice all
./scripts/books users disable alice
./scripts/books users purge alice --yes
./scripts/books users reconcile
```

`disable` revokes Calibre and KOSync access but keeps the row. `purge` removes
the account row and KOSync state for that user.

`reconcile` rebuilds Calibre and KOSync users from SQLite. It is safe to run
after onboarding, service restarts, or manual investigation.

## Setup Pages

Each setup page is protected by that user's Books login:

```text
https://books.exe.xyz/setup/alice
```

The page shows:

- the one Books username and password
- Readest Web link
- OPDS catalog URL
- KOSync URL
- Hardcover request note
- the sync fixture test

It must not show owner credentials, Anna API keys, local ports, Redis paths,
systemd details, `/srv/books`, or `/etc/books/books.env`.

## Reader Instructions

In Readest:

1. Sign in with the reader's own Readest account.
2. Add OPDS Catalogs with `https://books.exe.xyz/catalog`.
3. Use the Books username and password.
4. Add KOReader Sync with `https://books.exe.xyz/kosync`.
5. Use the same Books username and password.
6. Keep the checksum method set to File Content.

Readest's own cloud sync is not the source of truth for this repo. If it copies
settings across devices, that is convenient. If it does not, set up OPDS and
KOSync on each device.

## Hardcover

Hardcover Want to Read is the intake list. Configure it per user:

```bash
printf '%s\n' 'Bearer ...' | ./scripts/books hardcover set-token alice
./scripts/books hardcover status alice
```

After that, the five-minute timer processes the user's Want to Read backlog. A
fulfilled book is imported into Calibre and moved to Currently Reading in
Hardcover.

Hardcover tokens are user-scoped. Neil's token cannot read Alice's shelves, and
Alice's token cannot read Neil's shelves.

## Rules

- Do not share a Books login between people.
- Do not edit Calibre users or KOSync Redis by hand unless you also update the
  repo helper that recreates them.
- Do not put secrets in git.
- Do not expose a local reader UI. Hosted Readest is the reader.
