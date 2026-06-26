# Device Sync Test Matrix

Use this matrix for the self-hosted sync pilots in `docs/self-hosted-reading-sync-research.md`.

Test date:
Tester:

## Fixture Books

| Fixture | Source | Legal basis | Raw SHA256 | Normalized EPUB hash | Notes |
|---|---|---|---|---|---|
| 1 |  |  |  |  |  |
| 2 |  |  |  |  |  |
| 3 |  |  |  |  |  |

## Server Versions

| Component | Version/tag/digest | Data path | Public path | Notes |
|---|---|---|---|---|
| Calibre |  | `/srv/books/library` | `/opds` | Source of truth |
| KOSync |  |  | `/kosync` | Binary matching only |
| Readest WebDAV |  | `/srv/books/readest-webdav` | `/dav/readest` | No Readest cloud account |
| BookOrbit pilot |  |  |  | Copied books only |
| Komga pilot |  |  |  | Copied books only |
| Grimmory pilot |  |  |  | Copied books only |

## Client Versions

| Device | App/firmware | Version | Network | Notes |
|---|---|---|---|---|
| XTEink X4 | CrossPoint |  |  |  |
| Kobo | Stock reader |  |  |  |
| Kobo | KOReader |  |  |  |
| Android | Readest |  |  |  |
| Android | KOReader |  |  |  |
| iPad | Readest |  |  |  |
| MacBook | Readest |  |  |  |
| Windows PC | Readest |  |  |  |
| Desktop | KOReader |  |  |  |

## OPDS Download Identity

Pass only if the downloaded EPUB bytes match the canonical fixture, or the difference is deterministic and documented.

| Device/app | Catalog URL | Auth type | Download works | Raw SHA256 matches | Notes |
|---|---|---|---|---|---|
| CrossPoint | `https://books.exe.xyz/opds` | Basic |  |  |  |
| KOReader | `https://books.exe.xyz/opds` | Basic |  |  |  |
| Readest | `https://books.exe.xyz/opds` | Basic |  |  |  |
| BookOrbit OPDS |  | Basic |  |  |  |
| Komga OPDS |  | API/basic |  |  |  |
| Grimmory OPDS |  | Basic |  |  |  |

## KOSync Round Trips

Target: same semantic location, ideally same paragraph. CrossPoint may be approximate; record the observed drift.

| From | To | Fixture | Matching method | Push works | Pull works | Landing precision | Notes |
|---|---|---|---|---|---|---|---|
| CrossPoint | Android KOReader |  | Binary |  |  |  |  |
| Android KOReader | CrossPoint |  | Binary |  |  |  |  |
| Kobo KOReader | Android KOReader |  | Binary |  |  |  |  |
| Desktop KOReader | Kobo KOReader |  | Binary |  |  |  |  |
| Readest KOSync | KOReader |  | File Content/Binary |  |  |  | Progress only |
| KOReader | Readest KOSync |  | Binary/File Content |  |  |  | Progress only |

## Readest WebDAV

Target: no Readest cloud account; progress, location, highlights, and notes sync both ways.

| From | To | Fixture | Progress | Highlights | Notes | Duplicate books | Notes |
|---|---|---|---|---|---|---|---|
| iPad Readest | Android Readest |  |  |  |  |  |  |
| Android Readest | Mac Readest |  |  |  |  |  |  |
| Mac Readest | Windows Readest |  |  |  |  |  |  |
| Windows Readest | iPad Readest |  |  |  |  |  |  |

## Stock Kobo Sidecar

Target: KEPUB lands within a few pages. Regular EPUB chapter-boundary sync is a limited pass only if acceptable.

| Server | Format delivered | From | To | Fixture | Push works | Pull works | Landing precision | Notes |
|---|---|---|---|---|---|---|---|---|
| BookOrbit | EPUB/KEPUB | Kobo | Web reader |  |  |  |  |  |
| BookOrbit | EPUB/KEPUB | Web reader | Kobo |  |  |  |  |  |
| BookOrbit | EPUB/KEPUB | KOReader | Kobo |  |  |  |  |  |
| Komga | EPUB/KEPUB | Kobo | Web reader |  |  |  |  |  |
| Komga | EPUB/KEPUB | Web reader | Kobo |  |  |  |  |  |
| Komga | EPUB/KEPUB | KOReader | Kobo |  |  |  |  |  |
| Grimmory | EPUB/KEPUB | Kobo | Web reader |  |  |  |  |  |
| Grimmory | EPUB/KEPUB | Web reader | Kobo |  |  |  |  |  |
| Grimmory | EPUB/KEPUB | KOReader | Kobo |  |  |  |  |  |

## Reliability

| Test | Expected | Pass | Notes |
|---|---|---|---|
| Restart KOSync service | Existing progress remains |  |  |
| Reboot VM | KOSync, WebDAV, Calibre return healthy |  |  |
| Restore WebDAV data | Readest state returns |  |  |
| Restore KOSync data | KOReader/CrossPoint progress returns |  |  |
| Restore sidecar DB and copied library | Kobo/KOReader/web state returns |  |  |
| Disable registration after KOSync user creation | Existing user works, new public registration fails |  |  |
