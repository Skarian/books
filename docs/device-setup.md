# Device setup

Books come from the shared OPDS catalog. Reading position syncs through KOSync. The two URLs are:

```text
Catalog:  https://books.example.com/catalog
KOSync:   https://books.example.com/kosync
```

Replace `books.example.com` with your server's `BOOKS_PUBLIC_HOST` value.

Each user uses one Books username and password for both the catalog and sync. The owner prints credentials with:

```bash
docker compose run --rm admin users show alice
```

Download each book from the catalog on every device before opening it. KOSync matches progress by the file's content hash, so all devices need the same file from the same OPDS source.

---

## Readest — Web, Android, iPad, macOS, Windows

Readest is the primary reader app for non-e-ink devices. Set up OPDS and KOReader Sync on each Readest installation.

1. Install [Readest](https://github.com/readest/readest) or open [web.readest.com](https://web.readest.com/).
2. Sign in to a Readest account.
3. From the library page, open **Import Menu → Online Library**.
4. Add an OPDS catalog at `https://books.example.com/catalog`.
5. Sign in with the user's Books username and password.
6. Browse the catalog and download a book.
7. Open the book.
8. Open **Book Menu → KOReader Sync**.
9. Set the server to `https://books.example.com/kosync`.
10. Sign in with the same Books username and password.
11. Set **Checksum Method** to **File Content**.

Repeat on each Readest device. Readest may sync catalog URLs across signed-in devices. Password sync uses Readest's optional Credentials sync with a shared passphrase — re-enter the Books login on any device that needs the catalog or KOSync settings.

After setup, test with a short book from the catalog. Open it on one device and advance to a clear chapter, then open the same catalog download on another device. If the second device lands near the same spot, the sync path is working.

---

## CrossPoint — XTEink devices

Use CrossPoint on XTEink e-ink devices.

1. Add an OPDS catalog at `https://books.example.com/catalog`.
2. Sign in with the user's Books username and password.
3. Download the EPUB from the catalog.
4. Set the sync server to `https://books.example.com/kosync`.
5. Sign in with the same Books username and password.
6. Use binary or file-content document matching if the setting is visible.

If CrossPoint does not expose a document matching option, test sync against another device before relying on it.

---

## KOReader

KOReader works on Android and is the standard path for Kobo when shared progress matters more than the stock Kobo reading interface.

1. Add an OPDS catalog at `https://books.example.com/catalog`.
2. Sign in with the user's Books username and password.
3. Download the EPUB from the catalog.
4. Set the sync server to `https://books.example.com/kosync`.
5. Sign in with the same Books username and password.
6. Set document matching to **binary**.

---

## Kobo

Install KOReader on the Kobo and follow the KOReader steps above to use shared progress.

---

## Progress troubleshooting

If a book opens in the wrong place on a second device, check these first:

- Both devices downloaded the EPUB from `https://books.example.com/catalog`.
- Readest is set to **File Content** as the Checksum Method.
- KOReader is set to **binary** document matching.
- Each user is using their own Books login, not a shared one.
- KOSync is last-write-wins. A stale device that syncs after a more recent session will overwrite the newer position.
- KOSync tracks position only. Bookmarks, highlights, and notes stay in the reader app.

If two users are seeing each other's position, they are sharing a Books login. Issue separate accounts and stop using the shared one.
