# Multiple Users

Readers share the same book library and keep separate reading progress. Give
each reader a separate Books login.

## Account Fields

Each account has:

- display name
- slug, such as `alex` or `alice`
- optional email for operator reference
- Books username
- Books passphrase
- optional Hardcover token

The account registry is runtime state:

```text
data/config/state.json
```

Back it up with the data directory.

## Commands

```bash
docker compose run --rm admin users list
docker compose run --rm admin users create "Alice" --email alice@example.com
docker compose run --rm admin users show alice
docker compose run --rm admin users reconcile
```

`users create` writes the account, then reconciles it into Calibre and KOSync.
`users show USER` prints the reader handoff. `users reconcile` pushes current
accounts into Calibre and KOSync without changing Books passwords.

## Reader Handoff

Print the setup values:

```bash
docker compose run --rm admin users show alice
```

Send the output with `docs/reader-setup.md`. The reader needs:

- Books username
- Books password
- OPDS catalog URL
- KOSync URL

Keep `.env`, `secrets/annas_secret_key`, Hardcover tokens, Calibre admin
credentials, and `data/config/secrets.json` operator-only.

## Hardcover

Hardcover Want to Read is the intake list. Configure it per user:

```bash
printf '%s\n' 'Bearer ...' | docker compose run --rm -T admin hardcover set-token alice
docker compose run --rm admin hardcover status alice
```

The worker processes that user's Want to Read backlog. A fulfilled book is
imported into Calibre and moved to Currently Reading in Hardcover.

Hardcover tokens are user-scoped. Each reader connects their own Hardcover
account.
