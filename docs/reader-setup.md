# Reader Setup

Ask the server operator for:

```text
Books username: USER
Books password: PASSWORD
Server host: SERVER_HOST
```

Use the Books login for the catalog and for progress sync. Your Readest account
is separate.

```text
Catalog URL: https://SERVER_HOST/catalog
KOSync URL:  https://SERVER_HOST/kosync
```

## Readest

Use the Readest app or `https://web.readest.com/`.

1. Sign in to your Readest account.
2. Open Import Menu, then Online Library.
3. Add `https://SERVER_HOST/catalog` as an OPDS catalog.
4. Sign in to the catalog with your Books username and password.
5. Download a book from the catalog.
6. Open the book.
7. Open Book Menu, then KOReader Sync.
8. Set the server to `https://SERVER_HOST/kosync`.
9. Sign in with the same Books username and password.
10. Set Checksum Method to File Content.

Repeat this on each Readest device. Readest may sync catalog settings between
devices. Password sync depends on Readest's optional Credentials sync and the
same Readest sync passphrase on every device.

## KOReader and CrossPoint

1. Add the OPDS catalog at `https://SERVER_HOST/catalog`.
2. Sign in with your Books username and password.
3. Download the EPUB from that catalog.
4. Set the sync server to `https://SERVER_HOST/kosync`.
5. Sign in with the same Books username and password.

Use binary or file-content document matching if the app exposes that setting.

## Requests

If the operator connected your Hardcover account, add books to Want to Read in
Hardcover. The server checks that list every five minutes and imports a matching
English EPUB when one is available.

## What Syncs

KOSync syncs reading position only. Book files, bookmarks, highlights, notes,
ratings, and collections stay in the reader app.

Download the book from the catalog on each device. Progress should then follow
through KOSync.

## Quick Fixes

- OPDS returns 401 or 403: check the Books username and password.
- Catalog fails to load: use `https://SERVER_HOST/catalog`.
- KOSync fails to connect: use `https://SERVER_HOST/kosync`.
- Progress does not move: confirm both devices downloaded the same catalog copy
  and use the same Books login.
- Another reader's progress appears: ask the operator for separate Books
  accounts.
