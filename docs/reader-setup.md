# Reader app setup

Your server owner will give you three things:

```text
Books username: alice
Books password: river-window-beacon-maple-forest-stone
Server host:    books.example.com
```

Your Readest account is separate from your Books login. Use the Books username and password for the catalog and for reading sync.

Your two server URLs are:

```text
Catalog:  https://books.example.com/catalog
KOSync:   https://books.example.com/kosync
```

---

## Readest

Use the [Readest app](https://github.com/readest/readest) or [web.readest.com](https://web.readest.com/).

1. Sign in to your Readest account.
2. From the library page, open **Import Menu → Online Library**.
3. Add an OPDS catalog at `https://books.example.com/catalog`.
4. Sign in with your Books username and password.
5. Browse the catalog and download a book.
6. Open the book.
7. Open **Book Menu → KOReader Sync**.
8. Set the server to `https://books.example.com/kosync`.
9. Sign in with the same Books username and password.
10. Set **Checksum Method** to **File Content**.

Repeat on each Readest device. Readest may copy catalog settings across signed-in devices. Credentials sync is optional and requires a Readest sync passphrase on every device — if you skip that, configure the Books login by hand on each device.

---

## KOReader

1. Add an OPDS catalog at `https://books.example.com/catalog`.
2. Sign in with your Books username and password.
3. Download the EPUB from the catalog.
4. Set the sync server to `https://books.example.com/kosync`.
5. Sign in with the same Books username and password.
6. Use **binary** document matching.

---

## CrossPoint (XTEink)

1. Add an OPDS catalog at `https://books.example.com/catalog`.
2. Sign in with your Books username and password.
3. Download the EPUB from the catalog.
4. Set the sync server to `https://books.example.com/kosync`.
5. Sign in with the same Books username and password.
6. Use binary or file-content document matching if the option is visible.

---

## What syncs

KOSync tracks reading position only. Book files, bookmarks, highlights, notes, ratings, and collections stay in the reader app. Download the same EPUB from the catalog on every device so KOSync can match the file across apps.

---

## Requesting books

If your owner connected your Hardcover account, add books to **Want to Read** in Hardcover. The server checks that list every five minutes and imports a matching English EPUB when it finds one.

---

## Quick fixes

**OPDS returns 401 or 403.** Check the Books username and password.

**Catalog fails to load.** Use `https://books.example.com/catalog`, not `/opds`.

**KOSync fails to connect.** Use exactly `https://books.example.com/kosync` with no trailing slash.

**Progress is stuck or wrong.** Confirm both devices downloaded the EPUB from the catalog. Check that Readest uses File Content as the Checksum Method and KOReader uses binary matching. Both devices must use the same Books login.

**Seeing someone else's progress.** You are sharing a Books login. Ask the owner for a separate account.
