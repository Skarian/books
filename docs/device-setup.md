# Device setup

Books are downloaded from the shared OPDS catalog. Reading position syncs through
the reader's own KOSync account.

Do not copy random EPUB files between devices if progress matters. Use the OPDS
download so every app starts from the same canonical file.

KOSync is the progress authority. Do not configure Readest WebDAV for the core
pilot. It is a fallback only if OPDS plus KOSync fails a real device test.

## Credentials

Each reader has these credentials:

| Use | URL | Credential |
|---|---|---|
| Download books | `https://books.exe.xyz/opds` | OPDS username and password |
| Sync reading position | `https://books.exe.xyz/kosync` | KOSync username and password |

The setup page for each reader shows that reader's OPDS and KOSync credentials.
Neil can print the same values with `./scripts/books users show USER`.

## XTEink X4 with CrossPoint

Use CrossPoint on the X4.

1. Add an OPDS catalog.
2. Use `https://books.exe.xyz/opds`.
3. Enter the reader's OPDS username and password.
4. Download the EPUB from that catalog.
5. Set the sync server to `https://books.exe.xyz/kosync`.
6. Enter the reader's KOSync username and password.

If CrossPoint exposes document matching, choose binary or file-content matching.
If that option is hidden, validate the X4 with `docs/device-sync-test-matrix.md`
before relying on it.

## Readest on Android, iPad, macOS, and Windows

Use Readest on the general-purpose devices.

1. Add the Calibre/OPDS library at `https://books.exe.xyz/opds`.
2. Sign in with the reader's OPDS username and password.
3. Download the book from the OPDS catalog.
4. In sync settings, choose KOReader-compatible sync.
5. Use `https://books.exe.xyz/kosync`.
6. Sign in with the reader's KOSync username and password.
7. Set document matching to file content.

Do not enter `/api`, `/v1`, or `/healthcheck` after the KOSync URL. The URL is
exactly `https://books.exe.xyz/kosync`.

Readest exposes OPDS Catalogs and KOReader Sync as normal app settings. Each
person enters their own KOSync credentials in the KOReader Sync form. That is
user-accessible inside the app; it does not require an admin dashboard.

Do not turn on Readest WebDAV during the first pilot. It is not needed for book
downloads or progress sync, and it can introduce a second progress path.

## KOReader

Use KOReader anywhere it is available and pleasant to read on. It is also the
Kobo path when shared progress matters more than the stock Kobo interface.

1. Add the OPDS catalog at `https://books.exe.xyz/opds`.
2. Sign in with the reader's OPDS username and password.
3. Download the EPUB from OPDS.
4. Set the sync server to `https://books.exe.xyz/kosync`.
5. Sign in with the reader's KOSync username and password.
6. Use binary document matching.

KOReader is the reference client for the progress lane, so every sync test should
include it.

## Kobo

The core repo does not depend on stock Kobo sync.

For Kobo, use KOReader when shared progress matters. Stock Kobo can be tested
later with copied-library sidecars, but it is not allowed to block the core
CrossPoint, Readest, and KOReader setup.

## Progress problems

If a book opens in the wrong place on another device, check these first:

- Both devices downloaded the book from `https://books.exe.xyz/opds`.
- Readest uses file-content matching.
- KOReader uses binary matching.
- Each person uses a separate KOSync account.
- Official KOSync is last-write-wins, so a stale device can move progress
  backward if it syncs later.
- The Calibre EPUB was not re-converted, metadata-written, optimized, or re-zipped
  after import.
- The test is running from a real external device. The VM cannot reliably test
  `https://books.exe.xyz` from inside itself.

If two people see each other's reading position, they are sharing KOSync
credentials. Rotate the shared credential and issue separate accounts.
