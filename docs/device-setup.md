# Device setup

Books come from the user's OPDS catalog. Reading position syncs through KOSync. The two URLs are:

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

Readest is the primary reader app for non-e-ink devices.

### Original device

1. Create a Readest account and sign in.
2. Disable Readest Cloud: **Settings → Integrations → Cloud Sync → Readest Cloud off**.
3. Open `https://books.example.com/readest`, enter the user's Books username and password, and download the personal **Readest restore ZIP**.
4. Restore the ZIP: **Advanced Settings → Backup & Restore → Restore Library**. Select the downloaded ZIP and wait for the restore to finish.
5. Reload Readest. On macOS, press `Cmd+Shift+R`; on Windows or Linux, press `Ctrl+Shift+R`; on mobile, force-close Readest and reopen it.
6. Open **Advanced Settings → Data Sync** and confirm **OPDS catalogs**, **App settings**, and **Credentials** are on.
7. Create the sync passphrase: **Advanced Settings → Data Sync → Sync passphrase → Set passphrase**. Enter and confirm a new phrase, then save it somewhere safe.
8. Re-enable Readest Cloud: **Settings → Integrations → Cloud Sync → Readest Cloud on**.

### Other device

9. Sign in to the same Readest account.
10. Open **Advanced Settings → Data Sync**. Confirm **OPDS catalogs** and **App settings** are on, then turn **Credentials** on.
11. Under **Sync passphrase**, select **Enter passphrase** and enter the passphrase created on the original device.
12. Open **Settings → Integrations → Cloud Sync** and confirm **Readest Cloud** is on.

### Upload the restored setup

Return to the original device. Restoring writes the setup locally, but Readest does not automatically upload those restored values. The next actions trigger the missing uploads.

13. Open **Settings → Integrations → OPDS Catalogs**. Open the **⋮** menu on **Books** and select **Edit**.
14. Readest Web shows a web-proxy consent box; check it. Native apps do not show this box. Select **Save Changes** without changing any values.
15. Open **Settings → Integrations → KOReader**. Turn **Sync Server Connected** off and wait 10 seconds. This settings action makes Readest upload the restored KOReader server and credentials. Turn **Sync Server Connected** back on, then wait another 10 seconds.

### Finish on the other device

16. Reload Readest. On macOS, press `Cmd+Shift+R`; on Windows or Linux, press `Ctrl+Shift+R`; on mobile, force-close Readest and reopen it.
17. Open **Settings → Integrations → KOReader** and turn **Sync Server Connected** on. This switch is device-specific.
18. On the original device, delete the restore ZIP because it contains the Books password.

---

## CrossPoint — XTEink devices

Use CrossPoint on XTEink e-ink devices.

The setup path is `https://books.example.com/crosspoint`. Sign in with the Books username and password, download the fresh-device preset, extract it at the SD card root, then restart CrossPoint. The preset replaces existing CrossPoint preferences, OPDS servers, and KOSync credentials. It configures Books with binary document matching, Literata Medium/14, left alignment with hyphenation, the KOSync shortcut, the three-cover home, and cover sleep. Delete the credential-bearing ZIP after extraction.

Manual setup remains:

1. Add an OPDS catalog at `https://books.example.com/catalog`.
2. Sign in with the user's Books username and password.
3. Download the EPUB from the catalog.
4. Set the sync server to `https://books.example.com/kosync`.
5. Sign in with the same Books username and password.
6. Set document matching to **binary**.

If CrossPoint does not expose a document matching option, test sync against another device before relying on it.

---

## KOReader

KOReader works on Android using the GitHub release APK and is the standard path for Kobo when shared progress matters more than the stock Kobo reading interface.

The easiest setup path is `https://books.example.com/koreader`. Sign in with the Books username and password, download the matching ZIP, then extract it at the device storage root:

- Android GitHub APK or Kindle: the ZIP creates or merges a `koreader/` folder.
- Kobo: the ZIP creates or merges `.adds/koreader/`.

Back up the existing KOReader folder before installing the SimpleUI starter bundle on a customized device. Restart KOReader after extracting. Progress sync is enabled by default and newer saved positions are applied automatically. SimpleUI collections are local to KOReader and may be empty until collections are created on the device.

Manual setup remains:

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
