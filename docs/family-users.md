# Family users

The family model is simple: shared books, private reading position.

Each person gets one Books login. They use it for the OPDS catalog and KOSync.
They still use their own Readest account in the Readest app.

## Account shape

Each user has:

- display name
- slug, such as `alex` or `alice`
- optional email, for owner reference
- Books username
- Books passphrase
- optional Hardcover token

The account file is under the configured data directory:

```text
data/config/state.json
```

That file is runtime state. Back it up with the data directory.

## Owner commands

```bash
docker compose run --rm admin users list
docker compose run --rm admin users create "Alice" --email alice@example.com
docker compose run --rm admin users show alice
docker compose run --rm admin users reconcile
```

`users create` creates the state row, then reconciles that user into Calibre and
KOSync. `users reconcile` is safe after onboarding, service restarts, or manual
investigation.

During early development, fix account mistakes deliberately in state and rerun
`users reconcile`.

## Reader handoff

The owner prints a reader's setup values with:

```bash
docker compose run --rm admin users show alice
```

The output shows:

- the one Books username and password
- Readest Web link
- OPDS catalog URL
- KOSync URL
- Hardcover request note

Send those values out-of-band and point the reader at `docs/reader-setup.md`.
Keep `.env`, Anna keys, Hardcover tokens, Calibre admin credentials, and
`data/config/secrets.json` owner-only.

## Reader instructions

In Readest:

1. Sign in with the reader's own Readest account.
2. Add an OPDS catalog with `https://books.example.com/catalog`.
3. Use the Books username and password.
4. Open a downloaded book and add KOReader Sync with `https://books.example.com/kosync`.
5. Use the same Books username and password.
6. Keep the checksum method set to File Content.

Readest cloud sync may copy settings across devices. Credentials sync in Readest
uses the same sync passphrase on every device. Set up OPDS and KOSync again on
any device that needs them.

## Hardcover

Hardcover Want to Read is the intake list. Configure it per user:

```bash
printf '%s\n' 'Bearer ...' | docker compose run --rm -T admin hardcover set-token alice
docker compose run --rm admin hardcover status alice
```

After that, the worker processes the user's Want to Read backlog. A fulfilled
book is imported into Calibre and moved to Currently Reading in Hardcover.

Hardcover tokens are user-scoped. Each reader connects their own Hardcover
account.

## Rules

- Give each person a separate Books login.
- Use `users reconcile` to update Calibre and KOSync users.
- Keep secrets out of git.
- Use hosted Readest as the reader.
