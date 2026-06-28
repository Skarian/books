# Reader setup

Ask the server owner for three values:

```text
Books username: USER
Books password: PASSWORD
Server host: books.example.com
```

Use the Books username and password for both the catalog and reading sync.
Replace `books.example.com` below with your server host.

## Readest

Use the official Readest apps or `https://web.readest.com/`.

1. Sign in to your Readest account.
2. Open Settings, then Integrations.
3. Add an OPDS catalog at `https://books.example.com/catalog`.
4. Sign in to the catalog with your Books username and password.
5. Open Settings, then Integrations again.
6. Add KOReader Sync at `https://books.example.com/kosync`.
7. Sign in with the same Books username and password.
8. Leave the checksum method set to File Content.
9. Repeat this on each Readest device.

Do not enable Readest WebDAV for this library. Book downloads come from OPDS,
and progress comes from KOSync.

## KOReader and CrossPoint

1. Add the OPDS catalog at `https://books.example.com/catalog`.
2. Sign in with your Books username and password.
3. Download the EPUB from that catalog.
4. Set the sync server to `https://books.example.com/kosync`.
5. Sign in with the same Books username and password.

Do not add `/api`, `/v1`, or `/healthcheck` after the KOSync URL.

## Book requests

If the owner connected your Hardcover account, add books to Want to Read in
Hardcover. The server checks that list every five minutes and imports a matching
English EPUB when it can.
