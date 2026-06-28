# Device setup

Books come from the shared OPDS catalog. Reading position syncs through KOSync.
Readest itself is not hosted on this VM; use the official apps or
`https://web.readest.com/`.

Do not copy random EPUB files between devices if progress matters. Use the OPDS
download so every app starts from the same canonical file.

KOSync is the progress authority. Do not configure Readest WebDAV for this
library. It is a separate sync lane and this repo does not run it.

## Credentials

Examples use `books.example.com`. Replace it with the value of
`BOOKS_PUBLIC_HOST` from `.env`.

Each reader has one Books username and password. The owner prints it with:

```bash
docker compose run --rm admin users show USER
```

Use that login for OPDS and KOSync:

| Use | URL | Credential |
|---|---|---|
| Read in browser or Readest apps | `https://web.readest.com/` | Your own Readest account |
| Download books | `https://books.example.com/catalog` | Same Books username and password |
| Sync reading position | `https://books.example.com/kosync` | Same Books username and password |

Use `https://books.example.com/catalog` when the app accepts any OPDS URL. The
legacy `/opds` path remains available for clients that expect that name.

## XTEink X4 with CrossPoint

Use CrossPoint on the X4.

1. Add an OPDS catalog.
2. Use `https://books.example.com/catalog`.
3. Enter the reader's Books username and password.
4. Download the EPUB from that catalog.
5. Set the sync server to `https://books.example.com/kosync`.
6. Enter the same Books username and password.

If CrossPoint exposes document matching, choose binary or file-content matching.
If that option is hidden, validate the X4 with `docs/device-sync-test-matrix.md`
before relying on it.

## Readest Web, Android, iPad, macOS, and Windows

Use Readest on the general-purpose devices. Menu labels can vary a little by
platform, but the two things to find are OPDS catalogs and KOReader Sync.

1. Install Readest, or open `https://web.readest.com/`.
2. Sign in to a Readest account.
3. From the library page, open Import Menu, then Online Library.
4. Add a new OPDS catalog at `https://books.example.com/catalog`.
5. Sign in to the catalog with the reader's Books username and password.
6. Browse the catalog and download a book.
7. Open the downloaded book.
8. Open Book Menu, then KOReader Sync.
9. Use `https://books.example.com/kosync`.
10. Sign in with the same Books username and password.
11. Set Checksum Method to File Content.
12. Repeat this on each Readest device.

Do not enter `/api`, `/v1`, or `/healthcheck` after the KOSync URL. The URL is
exactly `https://books.example.com/kosync`.

Readest's account sync is convenient when it works, but this repo does not
depend on it. Catalog URLs may sync across devices. Catalog and KOSync passwords
only sync if the reader turns on Readest's optional Credentials sync and enters
the same sync passphrase on each device. If a device does not show the catalog
or KOSync settings, enter the Books login again from the owner handoff.

Do not turn on Readest WebDAV. It is not needed for book downloads or progress
sync, and it can introduce a second progress path.

After setup, test with `Books Sync Fixture`. The owner can add it with:

```bash
docker compose run --rm admin import /app/fixtures/books-sync-fixture.epub
```

Open the fixture on one device, go to `Sync marker three`, then open the same
fixture on another device. If the second device lands near that marker, the core
sync path is working.

## KOReader

Use KOReader anywhere it is available and pleasant to read on. It is also the
Kobo path when shared progress matters more than the stock Kobo interface.

1. Add the OPDS catalog at `https://books.example.com/catalog`.
2. Sign in with the reader's Books username and password.
3. Download the EPUB from OPDS.
4. Set the sync server to `https://books.example.com/kosync`.
5. Sign in with the same Books username and password.
6. Use binary document matching.

KOReader is the reference client for the progress lane, so include it in sync
tests when possible.

## Kobo

The core repo does not depend on stock Kobo sync.

For Kobo, use KOReader when shared progress matters. Stock Kobo can be tested
later with copied-library sidecars, but it is not allowed to block the core
CrossPoint, Readest, and KOReader setup.

## Progress problems

If a book opens in the wrong place on another device, check these first:

- Both devices downloaded the book from `https://books.example.com/catalog`.
- Readest uses file-content matching.
- KOReader uses binary matching.
- Each person uses their own Books login.
- KOSync only syncs reading position, not notes, highlights, bookmarks, or the
  book file.
- Official KOSync is last-write-wins, so a stale device can move progress
  backward if it syncs later.
- The Calibre EPUB was not re-converted, metadata-written, optimized, or re-zipped
  after import.
- The test is running from a real external device. The VM may not be able to
  call its own public HTTPS endpoint.

If two people see each other's reading position, they are sharing a Books login.
Issue separate accounts and stop using the shared login.
