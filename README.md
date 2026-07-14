# Books

Books is a self-hosted EPUB reading stack. One Calibre library serves per-user OPDS catalogs. A KOReader-compatible sync server tracks reading progress per user. Users pick up where they left off across any supported reader app or device.

The stack runs on Docker Compose. It targets Readest, KOReader, and CrossPoint on XTEink e-ink devices.

## Reading experience

A user reads a few chapters on their phone, puts it down, and picks up an XTEink device later. They open the same book in CrossPoint and land close to where they left off. Each user sees only the books granted to their Books login. The position is private to each user.

Books come from the OPDS catalog at `https://books.example.com/catalog`. Any OPDS-capable reader app can browse and download the books visible to that login. Reading position is tracked through KOSync at `https://books.example.com/kosync`. Apps that support KOReader sync update position automatically after each reading session.

For position sync to work across devices, every device must download the same EPUB from the catalog. KOSync uses the file's content hash to match sessions across apps and platforms.

## Supported apps and devices

| App | Platform | OPDS | KOSync |
|---|---|---|---|
| [Readest](https://github.com/readest/readest) | Web, Android, iPad, macOS, Windows | ✓ | ✓ |
| [KOReader](https://github.com/koreader/koreader) | Android, Kobo, PocketBook, and others | ✓ | ✓ |
| CrossPoint | XTEink e-ink devices | ✓ | ✓ |

See [docs/device-setup.md](docs/device-setup.md) for per-app configuration steps.

## Library model

The Calibre database is shared for storage and metadata, but catalog visibility is per user. Each book has one or more owning user slugs; Calibre exposes only matching books to each login. Reading progress is private: each user gets one Books login, and their sync state is stored separately under that login. KOSync is last-write-wins per login, so each user must use their own credentials.

Hardcover Want to Read works as a request queue when a Hardcover API token is configured for a user. A background worker checks the list every minute and imports or grants a matching English EPUB to that user when one is found.

## Get started

See [docs/deployment.md](docs/deployment.md) to set up the stack from scratch.

Once the stack is running, see [docs/users.md](docs/users.md) to create users, hand off credentials, and enable Hardcover intake.

## Docs

- [Deployment](docs/deployment.md) — configure the environment, build and start, expose the service, backup and restore
- [Users](docs/users.md) — create users, hand off credentials, import EPUBs manually, enable Hardcover intake
- [Reader app setup](docs/reader-setup.md) — short setup guide to send to a new user
- [Device setup](docs/device-setup.md) — step-by-step setup for each supported app and device
- [Architecture](docs/architecture.md) — containers, routes, auth, state, sync, and worker internals

## References

- [Calibre content server](https://manual.calibre-ebook.com/server.html) · [`calibre-server` CLI](https://manual.calibre-ebook.com/generated/en/calibre-server.html)
- [Readest](https://github.com/readest/readest) · [Readest docs](https://readest.com/docs)
- [KOReader Sync Server](https://github.com/koreader/koreader-sync-server)
- [Anna's Archive CLI](https://github.com/iosifache/annas-mcp)
- [exe.dev proxy docs](https://exe.dev/docs/proxy) · [exe.dev share CLI](https://exe.dev/docs/cli-share)
