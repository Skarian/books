# Device setup

Books come from the shared OPDS catalog. Reading position syncs through KOSync.
Use the official Readest apps or `https://web.readest.com/`.

Download each book from OPDS on every device so each app starts from the same
canonical file.

KOSync is the progress authority. Book downloads use OPDS; reading position uses
KOSync.

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

The KOSync URL is exactly `https://books.example.com/kosync`.

Readest account sync may copy catalog URLs across devices. Password sync uses
Readest's optional Credentials sync and the same sync passphrase on each device.
Enter the Books login again on any device that needs the catalog or KOSync
settings.

For this library, use OPDS for books and KOSync for progress.

After setup, test with any short book from the catalog. Open it on one device,
move to a clear section or chapter, then open the same catalog download on
another device. If the second device lands near that spot, the core sync path is
working.

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

For Kobo, use KOReader when shared progress matters. Stock Kobo can be tested
later with copied-library sidecars.

## Progress problems

If a book opens in the wrong place on another device, check these first:

- Both devices downloaded the book from `https://books.example.com/catalog`.
- Readest uses file-content matching.
- KOReader uses binary matching.
- Each person uses their own Books login.
- KOSync syncs reading position only. Notes, highlights, bookmarks, and book
  files stay in the reader app.
- Official KOSync is last-write-wins, so a stale device can move progress
  backward if it syncs later.
- The Calibre EPUB has the same file content as the version downloaded by the
  other devices.
- Public route tests run from a real external device.

If two people see each other's reading position, they are sharing a Books login.
Issue separate accounts and stop using the shared login.
