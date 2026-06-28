# Device Sync Test Matrix

Use this after `docker compose run --rm admin verify USER` passes locally. The VM can prove
that the proxy, OPDS auth, and KOSync auth work. Real devices prove whether the
reading apps agree on the same book identity and location.

Test date:
Tester:

## Pass Standard

The setup passes when CrossPoint, KOReader, and Readest can download the same
EPUB from `/catalog` and push/pull progress through `/kosync` with one Books
login per reader.

Kobo is optional. WebDAV is not part of the default build.

## Fixture

Create the test EPUB:

```bash
docker compose run --rm admin import /app/fixtures/books-sync-fixture.epub
docker compose run --rm admin verify USER
```

| Fixture | Source | Raw SHA256 | KOReader partial MD5 | Notes |
|---|---|---|---|---|
| Books Sync Fixture | repo fixture |  |  |  |

## Server Versions

| Component | Version/tag/digest | Local path | Public route | Notes |
|---|---|---|---|---|
| Calibre |  | `data/library` | `/catalog`, `/opds`, `/get/...` | EPUB source |
| KOSync |  | `data/kosync` | `/kosync` | Progress |
| Readest |  | hosted by Readest | `https://web.readest.com/` | Reader UI |

## Client Versions

| Device | App | Version | Network | Notes |
|---|---|---|---|---|
| XTEink X4 | CrossPoint |  |  |  |
| Android | Readest |  |  |  |
| iPad | Readest |  |  |  |
| MacBook | Readest |  |  |  |
| Windows PC | Readest |  |  |  |
| Android | KOReader |  |  |  |
| Desktop | KOReader |  |  |  |
| Kobo | KOReader |  |  | Optional |

## OPDS Download

Pass only if the device downloads from:

```text
https://books.example.com/catalog
```

| Device/app | Auth works | Fixture visible | Download works | Raw SHA256 matches | Partial MD5 matches | Notes |
|---|---|---|---|---|---|---|
| CrossPoint |  |  |  |  |  |  |
| KOReader |  |  |  |  |  |  |
| Readest Web |  |  |  |  |  |  |
| Readest Android |  |  |  |  |  |  |
| Readest iPad |  |  |  |  |  |  |
| Readest macOS |  |  |  |  |  |  |
| Readest Windows |  |  |  |  |  |  |

## KOSync Setup

The client base URL is exactly:

```text
https://books.example.com/kosync
```

Do not append `/api`, `/v1`, or `/healthcheck`.

| Client | Server URL accepted | Books login accepted | Matching setting | Notes |
|---|---|---|---|---|
| CrossPoint |  |  | Binary/file content if visible |  |
| KOReader |  |  | Binary |  |
| Readest Web |  |  | File Content |  |
| Readest Android |  |  | File Content |  |
| Readest iPad |  |  | File Content |  |
| Readest macOS |  |  | File Content |  |
| Readest Windows |  |  | File Content |  |

## Progress Round Trips

Landing precision choices: same paragraph, same page, within 1-3 pages, chapter
start, wrong, failed.

| From | To | Push works | Pull works | Landing precision | Notes |
|---|---|---|---|---|---|
| CrossPoint | Readest Android |  |  |  |  |
| Readest Android | CrossPoint |  |  |  |  |
| CrossPoint | Readest iPad |  |  |  |  |
| Readest iPad | CrossPoint |  |  |  |  |
| CrossPoint | KOReader Android |  |  |  |  |
| KOReader Android | CrossPoint |  |  |  |  |
| KOReader Android | Readest iPad |  |  |  |  |
| Readest iPad | KOReader Android |  |  |  |  |
| Readest Web | Readest iPad |  |  |  |  |
| Readest macOS | Readest Windows |  |  |  |  |
| Kobo KOReader | CrossPoint |  |  |  | Optional |

## Family Isolation

Use the same fixture with two different Books users.

| User A app | User B app | A progress preserved | B progress preserved | Notes |
|---|---|---|---|---|
| Readest iPad | Readest Android |  |  |  |
| Readest iPad | CrossPoint |  |  |  |
| KOReader Android | Readest Windows |  |  |  |

## Account Lifecycle

| Test | Expected | Pass | Notes |
|---|---|---|---|
| Create user | One Books login is created |  |  |
| Reconcile users | Calibre and KOSync users are rebuilt without rotating passwords |  |  |
| Show user | Owner can recover the one Books login |  |  |
| Public KOSync registration | `/kosync/users/create` returns 404 |  |  |
| Setup page privacy | User sees only their own credentials |  |  |
| Setup page caching | Page sends no-store headers |  |  |

## Failure Checks

If progress does not move:

- Confirm both devices downloaded `Books Sync Fixture` from `/catalog`.
- Confirm both devices use the same Books login for that test.
- Confirm Readest uses File Content.
- Confirm KOReader uses binary matching.
- Confirm the device can reach `https://books.example.com/kosync`.
- Try the same direction with KOReader, since it is the reference client.
