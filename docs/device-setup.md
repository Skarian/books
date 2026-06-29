# Device Setup

Use `docs/reader-setup.md` for the handoff values. This page covers device and
app behavior after you have the Books username, Books password, and server host.

Books come from OPDS. Reading position comes from KOSync. Download each book
from the catalog on every device so the progress hash matches.

Examples use `books.example.com`. Replace it with your server host.

| Use | URL | Credential |
|---|---|---|
| Readest Web | `https://web.readest.com/` | Readest account |
| Download books | `https://books.example.com/catalog` | Books login |
| Sync position | `https://books.example.com/kosync` | Books login |

## XTEink X4 with CrossPoint

1. Add an OPDS catalog.
2. Use `https://books.example.com/catalog`.
3. Enter the reader's Books username and password.
4. Download the EPUB from that catalog.
5. Set the sync server to `https://books.example.com/kosync`.
6. Enter the same Books username and password.

If CrossPoint exposes document matching, choose binary or file-content matching.

## Readest Web, Android, iPad, macOS, and Windows

Menu labels vary by platform. Look for OPDS catalogs and KOReader Sync.

1. Install Readest or open `https://web.readest.com/`.
2. Sign in to a Readest account.
3. Open Import Menu, then Online Library.
4. Add `https://books.example.com/catalog` as an OPDS catalog.
5. Sign in with the reader's Books username and password.
6. Download a book from the catalog.
7. Open the book.
8. Open Book Menu, then KOReader Sync.
9. Set the server to `https://books.example.com/kosync`.
10. Sign in with the same Books username and password.
11. Set Checksum Method to File Content.
12. Repeat this on each Readest device.

Readest may sync catalog settings between devices. Password sync depends on
Readest's optional Credentials sync and the same Readest sync passphrase on each
device.

To test sync, open a short book on one device, move to a clear chapter, then
open the same catalog download on another device. If the second device lands
near that spot, the OPDS and KOSync path is working.

## KOReader

Use KOReader anywhere you want the reference KOSync behavior. It is also the
Kobo path when shared progress matters more than the stock Kobo interface.

1. Add the OPDS catalog at `https://books.example.com/catalog`.
2. Sign in with the reader's Books username and password.
3. Download the EPUB from OPDS.
4. Set the sync server to `https://books.example.com/kosync`.
5. Sign in with the same Books username and password.
6. Use binary document matching.

## Progress Problems

Check these first:

- Both devices downloaded the book from `https://books.example.com/catalog`.
- Readest uses File Content checksum.
- KOReader uses binary matching.
- Each person uses a separate Books login.
- The device has network access to `https://books.example.com/kosync`.

KOSync is last-write-wins, so a device with old progress can move the shared
position backward when it syncs later. KOSync does not sync notes, highlights,
bookmarks, ratings, collections, or book files.
