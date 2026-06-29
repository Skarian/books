# Real-device sync test

Use this when the server is healthy and you are ready to test actual devices.
The VM can prove OPDS auth and KOSync progress writes locally. Real devices show
whether CrossPoint, Readest apps, and KOReader land in the right place.

## 1. Add the test book

Pick a short EPUB that is already in the Calibre catalog. Use the same title on
every device in the test.

## 2. Set up the first reader app

Print the user's handoff and use `docs/reader-setup.md`:

```bash
docker compose run --rm admin users show USER
```

For Readest:

1. Sign in to your Readest account.
2. Add the OPDS catalog from Import Menu, then Online Library.
3. Download the test book from the catalog.
4. Open the book.
5. Open Book Menu, then KOReader Sync.
6. Set the server to `https://books.example.com/kosync`.
7. Use the same Books login and leave Checksum Method set to File Content.

For KOReader or CrossPoint, add the catalog, download the same book, and connect
Progress Sync to `https://books.example.com/kosync`.

## 3. Push a position

On device one:

1. Open the test book.
2. Go to a section you can easily recognize later.
3. Wait a few seconds, then use the app's sync command if it has one.
4. Close the book.

The exact wording differs by app. In KOReader, use Progress Sync. In Readest,
use KOReader Sync. CrossPoint may hide the sync control behind its reading
menu.

## 4. Pull on another device

On device two:

1. Download the same book from the same catalog.
2. Make sure the same user's KOSync account is connected.
3. Open the book and pull progress if the app asks.
4. Check where it lands.

Pass:

- It opens at the same section, or close enough that you can keep reading.

Limited pass:

- It opens at the start of the same chapter. This may be acceptable on the X4 if
  CrossPoint only stores a coarse location.

Fail:

- It opens at the beginning.
- It opens a different book.
- It asks for credentials again or fails to connect.
- It syncs to someone else's place.

If a test fails, check these before changing the architecture:

- Both devices downloaded the same book from `https://books.example.com/catalog`.
- Both devices used the same reader's Books username and password.
- Readest shows KOReader Sync as connected.
- Readest shows Checksum Method as File Content.
- KOReader uses binary matching if it exposes that setting.
- The device is outside the VM and can reach `https://books.example.com/kosync`.
