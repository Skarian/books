# Device Sync Test Matrix

Use this matrix to validate the recommendation in `docs/research/self-hosted-reading-sync-research.md`.

Test date:
Tester:

## Pass/Fail Standard

The core architecture passes only if CrossPoint, KOReader, and Readest can all use the same self-hosted KOSync endpoint for progress on the same EPUB identity. Readest WebDAV is tested separately because it is not a CrossPoint/KOReader bridge.

## Fixture Books

Use legally owned, public-domain, Creative Commons, or otherwise authorized EPUBs.

| Fixture | Source | Legal basis | Raw SHA256 | KOReader partial MD5 | Notes |
|---|---|---|---|---|---|
| 1 |  |  |  |  |  |
| 2 |  |  |  |  |  |
| 3 |  |  |  |  |  |

## Server Versions

| Component | Version/tag/digest | Data path | Public path | Notes |
|---|---|---|---|---|
| Calibre |  | `/srv/books/library` | `/opds` | Source of truth for EPUB bytes |
| Official KOSync |  | `/srv/books/kosync` | `/kosync` | Core progress lane |
| Readest WebDAV |  | `/srv/books/readest-webdav` | `/dav/readest` | Readest-only state lane |
| BookOrbit pilot |  |  |  | Copied fixtures only |
| Komga pilot |  |  |  | Copied fixtures only |
| Grimmory pilot |  |  |  | Copied fixtures only |

## Client Versions

| Device | App/firmware | Version | Network | Notes |
|---|---|---|---|---|
| XTEink X4 | CrossPoint |  |  |  |
| Android | Readest |  |  |  |
| iPad | Readest |  |  |  |
| MacBook | Readest |  |  |  |
| Windows PC | Readest |  |  |  |
| Android | KOReader |  |  |  |
| Desktop | KOReader |  |  |  |
| Kobo | KOReader |  |  | Optional |
| Kobo | Stock reader |  |  | Optional sidecar only |

## OPDS Download Identity

Pass only if downloaded EPUB bytes match the canonical fixture. If a client rewrites the file, record whether the KOReader partial MD5 still matches; if it does not, that client cannot join the binary-matched KOSync lane for that copy.

| Device/app | Catalog URL | Auth type | Download works | Raw SHA256 matches | Partial MD5 matches | Notes |
|---|---|---|---|---|---|---|
| CrossPoint | `https://books.exe.xyz/opds` | Basic |  |  |  |  |
| KOReader | `https://books.exe.xyz/opds` | Basic |  |  |  |  |
| Readest Android | `https://books.exe.xyz/opds` | Basic |  |  |  |  |
| Readest iPad | `https://books.exe.xyz/opds` | Basic |  |  |  |  |
| Readest macOS | `https://books.exe.xyz/opds` | Basic |  |  |  |  |
| Readest Windows | `https://books.exe.xyz/opds` | Basic |  |  |  |  |

## KOSync Service

| Test | Expected | Pass | Notes |
|---|---|---|---|
| Public healthcheck | `https://books.exe.xyz/kosync/healthcheck` returns healthy JSON |  |  |
| Registration bootstrap | Sync-only user can be created during onboarding |  |  |
| Registration locked | New public registration fails after bootstrap |  |  |
| Auth | Existing per-reader user authenticates |  |  |
| PUT progress | Fixture progress can be uploaded |  |  |
| GET progress | Same fixture progress can be fetched |  |  |
| Restart service | Existing progress remains |  |  |
| Reboot VM | KOSync returns healthy and state remains |  |  |

## KOSync Client Configuration

| Client | Server URL | Username | Matching setting | Expected |
|---|---|---|---|---|
| CrossPoint | `https://books.exe.xyz/kosync` | per-reader user | Binary/file content if available | Auth works |
| KOReader | `https://books.exe.xyz/kosync` | per-reader user | Binary | Auth works |
| Readest | `https://books.exe.xyz/kosync` | per-reader user | File Content | Auth works |

## Family Account Lifecycle

Use this section before enabling family access. It validates `docs/research/family-multi-user-admin-plan.md`.

| Test | Expected | Pass | Notes |
|---|---|---|---|
| Create user | OPDS, KOSync, and WebDAV credentials are created for only that user |  |  |
| Reconcile users | Derived Calibre/nginx/WebDAV/KOSync/setup state is rebuilt without rotating passwords |  |  |
| Rotate one user's KOSync password | New password works, old password fails, other users unaffected |  |  |
| Disable user | OPDS, KOSync, WebDAV, setup page, and upload access fail for that user |  |  |
| Purge user | User state is removed or archived without touching shared Calibre books |  |  |
| Setup page privacy | User sees only their own credentials; owner/admin credentials never appear |  |  |
| Setup page caching | Credential pages send no-store/no-referrer headers and no secrets in URLs |  |  |
| Owner admin panel | Owner can add/disable/rotate users; non-owner cannot access admin actions |  |  |
| Audit log | User mutations are recorded with actor, action, target, and timestamp |  |  |

## Core Progress Round Trips

Landing precision choices: `same paragraph`, `same page`, `within 1-3 pages`, `chapter start`, `wrong`, `failed`.

| From | To | Fixture | Push works | Pull works | Landing precision | Notes |
|---|---|---|---|---|---|---|
| CrossPoint | KOReader Android |  |  |  |  |  |
| KOReader Android | CrossPoint |  |  |  |  |  |
| CrossPoint | Readest iPad |  |  |  |  |  |
| Readest iPad | CrossPoint |  |  |  |  |  |
| CrossPoint | Readest Android |  |  |  |  |  |
| Readest Android | CrossPoint |  |  |  |  |  |
| KOReader Android | Readest iPad |  |  |  |  |  |
| Readest iPad | KOReader Android |  |  |  |  |  |
| KOReader Desktop | Readest macOS |  |  |  |  |  |
| Readest macOS | KOReader Desktop |  |  |  |  |  |
| Readest Windows | Readest iPad via KOSync |  |  |  |  | Progress only |
| Readest Android | Readest Windows via KOSync |  |  |  |  | Progress only |
| Kobo KOReader | CrossPoint |  |  |  |  | Optional |
| CrossPoint | Kobo KOReader |  |  |  |  | Optional |

## Family Progress Isolation

Target: two people can read the same canonical EPUB without overwriting each other's progress.

| User A app | User B app | Fixture | Same EPUB identity | A progress preserved | B progress preserved | Notes |
|---|---|---|---|---|---|---|
| Readest iPad | Readest Android |  |  |  |  | Separate KOSync users |
| Readest iPad | CrossPoint |  |  |  |  | Separate KOSync users |
| KOReader Android | Readest Windows |  |  |  |  | Separate KOSync users |
| CrossPoint | KOReader Desktop |  |  |  |  | Separate KOSync users |

## CrossPoint Precision Detail

Record enough detail to decide whether the X4 experience is pleasant.

| Direction | Fixture | Source location | Target location | Drift | Acceptable | Notes |
|---|---|---|---|---|---|---|
| CrossPoint -> Readest |  |  |  |  |  |  |
| Readest -> CrossPoint |  |  |  |  |  |  |
| CrossPoint -> KOReader |  |  |  |  |  |  |
| KOReader -> CrossPoint |  |  |  |  |  |  |

## Readest WebDAV

Target: no Readest cloud account. Progress, location, highlights, notes, covers, and optional files sync between Readest clients. This is not evidence that CrossPoint or KOReader can see those highlights/notes.

| From | To | Fixture | Progress | Highlights | Notes | Duplicate books | Notes |
|---|---|---|---|---|---|---|---|
| iPad Readest | Android Readest |  |  |  |  |  |  |
| Android Readest | Mac Readest |  |  |  |  |  |  |
| Mac Readest | Windows Readest |  |  |  |  |  |  |
| Windows Readest | iPad Readest |  |  |  |  |  |  |

## Readest WebDAV User Isolation

Target: WebDAV state for one user is not visible to or modified by another user.

| Test | Expected | Pass | Notes |
|---|---|---|---|
| User A WebDAV auth | User A reaches only User A root |  |  |
| User B WebDAV auth | User B reaches only User B root |  |  |
| Cross-user path traversal | Parent-directory and symlink traversal fail |  |  |
| User A highlights | User B Readest does not receive User A highlights |  |  |
| Disable User A | User A old WebDAV credentials fail; User B unaffected |  |  |

## Family Upload Staging

Default: family uploads are disabled. If enabled, they go to quarantine and require owner import.

| Test | Expected | Pass | Notes |
|---|---|---|---|
| Upload disabled user | Upload UI/API is hidden or denied |  |  |
| Upload enabled user | EPUB lands in `/srv/books/inbox/<user>/`, not `/srv/books/library` |  |  |
| Non-EPUB upload | Rejected or marked for owner conversion review |  |  |
| Owner approval import | Approved EPUB imports with uploader/source tags |  |  |
| Direct library mutation | Family user cannot edit metadata, delete books, or overwrite formats |  |  |

## Optional Stock Kobo Sidecar

Target: KEPUB lands within a few pages. Regular EPUB chapter-boundary sync is a limited pass only if acceptable. These pilots must use copied fixture books, not `/srv/books/library` with write access.

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

## Restore Tests

| Test | Expected | Pass | Notes |
|---|---|---|---|
| Restore Calibre library | OPDS returns canonical fixtures |  |  |
| Restore KOSync state | KOReader/CrossPoint/Readest progress returns |  |  |
| Restore Readest WebDAV data | Readest state returns |  |  |
| Restore sidecar DB and copied library | Optional Kobo/web state returns |  |  |
| Restore family account registry | Users, statuses, roles, and service usernames return |  |  |
| Re-run onboarding on fresh VM | Services and config are recreated from repo |  |  |
| Run users reconcile after restore | Derived auth/config/setup pages are rebuilt from runtime registry |  |  |
