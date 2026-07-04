# Deployment

Books runs as a Docker Compose stack on a single host. This guide covers setup from scratch, day-to-day operations, and backup and restore.

## Prerequisites

- Docker and Docker Compose
- A public hostname or [exe.dev share](https://exe.dev/docs/cli-share) for external access
- An Anna's Archive API key (required only for Hardcover intake)

## Configure the environment

Clone the repo and create `.env` from the example:

```bash
cp .env.example .env
chmod 600 .env
$EDITOR .env
```

Available variables:

| Variable | Default | Description |
|---|---|---|
| `BOOKS_PUBLIC_HOST` | `books.example.com` | Hostname users will put into their reader apps |
| `BOOKS_BIND_ADDR` | `127.0.0.1` | Address the proxy binds on |
| `BOOKS_PROXY_PORT` | `8000` | Port the proxy listens on |
| `BOOKS_HOST_DATA_DIR` | `./data` | Host path for library, state, logs, and KOSync data |
| `HARDCOVER_DAILY_DOWNLOAD_CAP` | `10` | Max Anna's Archive downloads per UTC day across all users |

Set `BOOKS_PUBLIC_HOST` to the hostname users will put into their reader apps. The OPDS and KOSync URLs that the server prints for users are derived from this value.

## Add the Anna's Archive key

Create the secrets directory and write the key:

```bash
mkdir -p secrets
printf '%s' 'YOUR_ANNA_KEY_HERE' > secrets/annas_secret_key
chmod 600 secrets/annas_secret_key
```

The key is mounted into the worker and admin containers at `/run/secrets/annas_secret_key`. Keep it out of git. If you do not plan to use Hardcover intake, create the file anyway with a placeholder value — the worker will not download anything without a valid token configured for a user.

## Build and bootstrap

Build the container image:

```bash
docker compose build
```

Bootstrap creates the data directory structure and initializes the Calibre admin user:

```bash
docker compose run --rm admin bootstrap
```

Run `bootstrap` once on a fresh install. It is safe to run again after a restore.

## Start the stack

```bash
docker compose up -d
```

This starts `proxy`, `calibre`, `kosync`, `setup`, and `worker`. The `admin` container runs on demand and does not start here.

Verify everything is reachable:

```bash
docker compose run --rm admin health
```

`health` checks the nginx proxy, the OPDS endpoint, and KOSync in one pass.

## Create the first user

```bash
docker compose run --rm admin users create "Alice" --email alice@example.com
```

The command prints the user's credentials and URLs. See [docs/users.md](users.md) for user management and the handoff process.

## Expose the service

### exe.dev

Share the loopback proxy from your exe.dev VM:

```bash
ssh exe.dev share port books 8000
ssh exe.dev share set-public books
```

Return to private mode when not in use:

```bash
ssh exe.dev share set-private books
```

See the [exe.dev share CLI docs](https://exe.dev/docs/cli-share) for details.

### Homelab

Keep `BOOKS_BIND_ADDR=127.0.0.1` and point your reverse proxy at `127.0.0.1:8000`. Books expects `X-Forwarded-Proto` and `X-Forwarded-Host` headers from an upstream proxy. Set `BOOKS_PUBLIC_HOST` to match the hostname your reverse proxy serves.

To bind directly to a network interface without a reverse proxy, set `BOOKS_BIND_ADDR=0.0.0.0` deliberately.

## Day-to-day operations

```bash
docker compose ps
docker compose logs -f
docker compose restart
docker compose run --rm admin health
```

## Backup

Three paths need to be backed up:

| Path | Contents |
|---|---|
| `.env` | Environment configuration |
| `secrets/annas_secret_key` | Anna's Archive API key |
| `data/` (or `BOOKS_HOST_DATA_DIR`) | Library, account state, Calibre users, KOSync data, logs |

Everything under the data directory belongs together: `data/library` (EPUB files and metadata), `data/config/state.json` (Books accounts), `data/config/users.sqlite` (Calibre user database), `data/config/secrets.json` (Calibre admin credentials), and `data/kosync` (KOSync Redis state).

## Restore

1. Clone the repo.
2. Restore `.env`.
3. Restore `secrets/annas_secret_key`.
4. Restore the data directory to the path set in `BOOKS_HOST_DATA_DIR`.
5. Build: `docker compose build`
6. Bootstrap: `docker compose run --rm admin bootstrap`
7. Start: `docker compose up -d`
8. Reconcile users: `docker compose run --rm admin users reconcile`
9. Verify: `docker compose run --rm admin health`

`users reconcile` re-creates Calibre and KOSync accounts for every user in the restored state file. It does not change Books passwords.
