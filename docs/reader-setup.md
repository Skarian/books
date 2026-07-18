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

### Original device

1. Create a Readest account and sign in.
2. Disable Readest Cloud: **Settings → Integrations → Cloud Sync → Readest Cloud off**.
3. Open `https://books.example.com/readest`, enter your Books username and password, and download the personal **Readest restore ZIP**.
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

## KOReader

If the owner sent the KOReader setup page, open it, sign in with your Books username and password, download the right ZIP for your device, extract it at the device storage root, and restart KOReader. Android users should use KOReader's GitHub release APK. Progress sync is enabled by default for books downloaded from the catalog. A fresh or untouched stock Library starts in **Mosaic with cover images** mode; existing customized Library layouts are preserved.

Manual setup:

1. Add an OPDS catalog at `https://books.example.com/catalog`.
2. Sign in with your Books username and password.
3. Download the EPUB from the catalog.
4. Set the sync server to `https://books.example.com/kosync`.
5. Sign in with the same Books username and password.
6. Use **binary** document matching.

---

## CrossPoint (XTEink)

If the owner sent the CrossPoint setup page, open it, sign in with your Books username and password, download the ZIP, extract it at the SD card root, and restart CrossPoint.

Manual setup:

1. Add an OPDS catalog at `https://books.example.com/catalog`.
2. Sign in with your Books username and password.
3. Download the EPUB from the catalog.
4. Set the sync server to `https://books.example.com/kosync`.
5. Sign in with the same Books username and password.
6. Set document matching to **binary**.

---

## What syncs

KOSync tracks reading position only. Book files, bookmarks, highlights, notes, ratings, and collections stay in the reader app. Download the same EPUB from the catalog on every device so KOSync can match the file across apps.

---

## Requesting books

If your owner connected your Hardcover account, open **Apps → Requests** in the bundled SimpleUI layout, or use KOReader's native **Books → Requests** plugin menu. Search by title or author, choose the matching cover, and tap **Request**. Results show the release year beside the title and a star with the number of Hardcover users at the right to help distinguish editions. Up to 50 ranked results are available. The request dialogs use native KOReader widgets and continue to work without SimpleUI. You can also add books to **Want to Read** directly in Hardcover.

The server checks Want to Read every minute. Use **Apps → Sync Books**, or native **Books → Sync Books**, later to download a matched English EPUB into KOReader.

---

## Quick fixes

**OPDS returns 401 or 403.** Check the Books username and password.

**Catalog fails to load.** Use `https://books.example.com/catalog`, not `/opds`.

**KOSync fails to connect.** Use exactly `https://books.example.com/kosync` with no trailing slash.

**Progress is stuck or wrong.** Confirm both devices downloaded the EPUB from the catalog. Check that Readest uses File Content as the Checksum Method and KOReader uses binary matching. Both devices must use the same Books login.

**Seeing someone else's progress.** You are sharing a Books login. Ask the owner for a separate account.
