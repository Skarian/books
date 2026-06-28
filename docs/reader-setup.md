# Reader setup

Ask the server owner for these three values:

```text
Books username: USER
Books password: PASSWORD
Server host: SERVER_HOST
```

Your Readest account is separate from your Books login. Use the Books username
and password for the catalog and for reading sync.

The two server URLs are:

```text
Catalog: https://SERVER_HOST/catalog
KOSync:  https://SERVER_HOST/kosync
```

Do not add `/api`, `/v1`, or `/healthcheck` to the KOSync URL.

## Readest

Use the official Readest apps or `https://web.readest.com/`.

1. Sign in to your Readest account.
2. On the library page, open Import Menu, then Online Library.
3. Add a new OPDS catalog with `https://SERVER_HOST/catalog`.
4. Enter your Books username and password if Readest asks for them.
5. Browse the catalog and download a book.
6. Open that book.
7. Open Book Menu, then KOReader Sync.
8. Use `https://SERVER_HOST/kosync`.
9. Enter the same Books username and password.
10. Set Checksum Method to File Content.

Repeat the setup on each Readest device. Readest can sync saved catalog URLs
between signed-in devices. Passwords only sync if you turn on Readest's optional
Credentials sync and use the same sync passphrase on every device. If that feels
fussy, set up each device by hand.

Do not enable Readest WebDAV for this library. Books come from OPDS, and
progress comes from KOSync.

## KOReader and CrossPoint

1. Add the OPDS catalog at `https://SERVER_HOST/catalog`.
2. Sign in with your Books username and password.
3. Download the EPUB from that catalog.
4. Set the sync server to `https://SERVER_HOST/kosync`.
5. Sign in with the same Books username and password.

Use binary or file-content document matching if the app exposes that setting.

## What syncs

KOSync syncs reading position. It does not sync bookmarks, highlights, notes,
ratings, collections, or the book files themselves. Download the book from the
catalog on each device, then let KOSync handle position.

## Requests

If the owner connected your Hardcover account, add books to Want to Read in
Hardcover. The server checks that list every five minutes and imports a matching
English EPUB when it can.

## Quick fixes

- OPDS returns 401 or 403: check the Books username and password.
- Catalog does not load: use `/catalog`, not `/library` or `/kosync`.
- KOSync will not connect: use exactly `https://SERVER_HOST/kosync`.
- Progress does not move: confirm both devices downloaded the same book from the
  catalog and use the same Books login.
- Someone else's progress appears: you are sharing a Books login. Ask the owner
  for separate accounts.
