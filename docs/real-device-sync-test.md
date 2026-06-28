# Real-device sync test

Use this when the server is healthy and you are ready to test actual devices.
The VM can prove OPDS auth and KOSync progress writes locally, but it cannot
prove that CrossPoint, Readest apps, and KOReader land in the right place on
physical devices.

## 1. Add the test book

Run this on the VM:

```bash
docker compose run --rm admin import /app/fixtures/books-sync-fixture.epub
docker compose run --rm admin verify USER
```

This imports the repo's tiny `Books Sync Fixture` EPUB into the Calibre catalog.
No downloaded book is involved.

## 2. Set up the first reader app

Print the user's handoff and use `docs/reader-setup.md`:

```bash
docker compose run --rm admin users show USER
```

For Readest:

1. Sign in to your Readest account.
2. Add the OPDS catalog from Import Menu, then Online Library.
3. Download `Books Sync Fixture` from the catalog. If it is not visible right
   away, search for that exact title.
4. Open the fixture.
5. Open Book Menu, then KOReader Sync.
6. Set the server to `https://books.example.com/kosync`.
7. Use the same Books login and leave Checksum Method set to File Content.

For KOReader or CrossPoint, add the catalog, download the same fixture book,
and connect Progress Sync to `https://books.example.com/kosync`.

## 3. Push a position

On device one:

1. Open `Books Sync Fixture`.
2. Go to `Sync marker three`.
3. Wait a few seconds, then use the app's sync command if it has one.
4. Close the book.

The exact wording differs by app. In KOReader, use Progress Sync. In Readest,
use KOReader Sync. CrossPoint may hide the sync control behind its reading
menu.

## 4. Pull on another device

On device two:

1. Download `Books Sync Fixture` from the same catalog.
2. Make sure the same user's KOSync account is connected.
3. Open the book and pull progress if the app asks.
4. Check where it lands.

Pass:

- It opens at `Sync marker three`, or close enough that you can keep reading.

Limited pass:

- It opens at the start of the same chapter. This may be acceptable on the X4 if
  CrossPoint only stores a coarse location.

Fail:

- It opens at the beginning.
- It opens a different book.
- It asks for credentials again and cannot connect.
- It syncs to someone else's place.

## 5. Record the result

Write the result into `docs/device-sync-test-matrix.md`. Use plain notes:

```text
Readest Web -> KOReader Desktop: pass, landed at marker three.
Readest iPad -> CrossPoint: limited pass, landed at chapter start.
CrossPoint -> Readest Android: fail, opened at beginning.
```

If a test fails, check these before changing the architecture:

- Both devices downloaded `Books Sync Fixture` from `https://books.example.com/catalog`.
- Both devices used the same reader's Books username and password.
- Readest shows KOReader Sync as connected.
- Readest shows Checksum Method as File Content.
- KOReader uses binary matching if it exposes that setting.
- The device is outside the VM and can reach `https://books.example.com/kosync`.
