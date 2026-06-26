# Device Sync Test Matrix

Use this matrix to validate the recommendation in `docs/research/self-hosted-reading-sync-research.md`.

Test date:
Tester:

## Pass/Fail Standard

The core architecture passes only if CrossPoint, KOReader, and Readest can all
use the same self-hosted KOSync endpoint for progress on the same EPUB identity.
Readest Web and the Readest apps should get books from OPDS and progress from
KOSync. WebDAV is outside the core pass/fail standard.

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
| Calibre |  | `/srv/books/library` | `/catalog` and `/opds` | Source of truth for EPUB bytes |
| Readest Web |  | `/srv/books/readest` | `/library` | Browser reader; progress still goes through KOSync |
| Official KOSync |  | `/srv/books/kosync` | `/kosync` | Core progress lane |
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
| CrossPoint | `https://books.exe.xyz/catalog` | Basic |  |  |  |  |
| KOReader | `https://books.exe.xyz/catalog` | Basic |  |  |  |  |
| Readest Web | `https://books.exe.xyz/catalog` | Basic |  |  |  |  |
| Readest Android | `https://books.exe.xyz/catalog` | Basic |  |  |  |  |
| Readest iPad | `https://books.exe.xyz/catalog` | Basic |  |  |  |  |
| Readest macOS | `https://books.exe.xyz/catalog` | Basic |  |  |  |  |
| Readest Windows | `https://books.exe.xyz/catalog` | Basic |  |  |  |  |

## OPDS Failure Cases

| Test | Expected | Pass | Notes |
|---|---|---|---|
| Password-protected Calibre OPDS | Readest can browse and download, not only browse |  |  |
| iOS download | Readest iPad downloads a protected Calibre EPUB into local library |  |  |
| macOS download | Readest macOS downloads a protected Calibre EPUB into local library |  |  |
| Auto-download disabled | User can manually choose books without auto-importing the whole library |  |  |
| OPDS streaming avoided | Readest imports the EPUB file, not an OPDS-PSE stream identity |  |  |

## KOSync Service

| Test | Expected | Pass | Notes |
|---|---|---|---|
| Public healthcheck | `https://books.exe.xyz/kosync/healthcheck` returns healthy JSON |  |  |
| Prefix-strip healthcheck | `/kosync/healthcheck` reaches upstream `/healthcheck` |  |  |
| Prefix-strip auth | `/kosync/users/auth` reaches upstream `/users/auth` |  |  |
| Readest bridge auth | `/api/kosync` can authenticate against `/users/auth` for this service only |  |  |
| Readest bridge progress | `/api/kosync` can PUT and GET progress for a hex document id |  |  |
| Client base URL | Clients use `https://books.exe.xyz/kosync`, not `/api`, `/v1`, or `/healthcheck` |  |  |
| Registration bootstrap | Sync-only user can be created during onboarding |  |  |
| Registration locked | New public registration fails after bootstrap |  |  |
| Auth | Existing per-reader user authenticates |  |  |
| PUT progress | Fixture progress can be uploaded |  |  |
| GET progress | Same fixture progress can be fetched |  |  |
| Later lower progress | Later lower progress overwrites earlier higher progress, proving last-write-wins behavior |  |  |
| Official server only | Endpoint is official `koreader/kosync`, not a partial server implementation |  |  |
| Restart service | Existing progress remains |  |  |
| Reboot VM | KOSync returns healthy and state remains |  |  |

## KOSync Client Configuration

| Client | Server URL | Username | Matching setting | Expected |
|---|---|---|---|---|
| CrossPoint | `https://books.exe.xyz/kosync` | per-reader user | Binary/file content if available | Auth works |
| KOReader | `https://books.exe.xyz/kosync` | per-reader user | Binary | Auth works |
| Readest | `https://books.exe.xyz/kosync` | per-reader user | File Content | Auth works |
| Readest Web | `https://books.exe.xyz/kosync` | per-reader user | File Content | Auth works through `/api/kosync` bridge |

## KOSync Account Lifecycle

The helper stores the KOSync userkey in the server data store and shows the raw
password to people. Clients such as Readest hash the typed password before
calling KOSync.

| Test | Expected | Pass | Notes |
|---|---|---|---|
| Create KOSync user | Userkey is written for the generated raw password |  |  |
| Readest auth | Raw password entered in Readest authenticates |  |  |
| Rotate KOSync password | New raw password works; old raw password fails |  |  |
| Disable KOSync user | Auth fails but progress keys are preserved for restore |  |  |
| Purge KOSync user | Auth and per-user progress keys are removed after confirmation |  |  |

## Readest Integration Configuration

Readest passes only if a normal user can configure these without owner access.

| Integration | In-app form | Per-user credential | Required setting | Pass | Notes |
|---|---|---|---|---|---|
| Readest login | Sign in | Readest email/pass | User can reach `/library` and sign in |  |  |
| OPDS Catalogs | OPDS Catalogs | OPDS user/pass | Calibre catalog opens and downloads EPUB from `/catalog` |  |  |
| KOReader Sync | KOReader Sync | KOSync user/pass | Strategy chosen for progress lane; checksum File Content |  |  |
| Readest Web progress | KOReader Sync | KOSync user/pass | Browser app can push and pull progress through `/api/kosync` |  |  |

## Family Account Lifecycle

Use this section before enabling family access. It validates `docs/research/family-multi-user-admin-plan.md`.

| Test | Expected | Pass | Notes |
|---|---|---|---|
| Create user | Readest, OPDS, and KOSync credentials are created for only that user |  |  |
| Reconcile users | Derived Calibre/Readest/KOSync/setup state is rebuilt without rotating passwords |  |  |
| Rotate one user's KOSync password | New password works, old password fails, other users unaffected |  |  |
| Disable user | Readest, OPDS, KOSync, setup page, and upload access fail for that user |  |  |
| Purge user | User state is removed or archived without touching shared Calibre books |  |  |
| Setup page privacy | User sees only their own credentials; owner/admin credentials never appear |  |  |
| Setup page caching | Credential pages send no-store/no-referrer headers and no secrets in URLs |  |  |
| Secret restore | Encrypted raw passwords and KOSync userkeys restore without forced rotation |  |  |
| Owner helper | Owner can add/disable/rotate users through `scripts/books users ...`; non-owner cannot access setup/admin actions |  |  |
| Owner admin panel, if built | Panel uses the same helper and stays behind owner auth |  |  |
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
| Readest Web | Readest iPad via KOSync |  |  |  |  | Progress only |
| Readest Web | KOReader Desktop |  |  |  |  | Progress only |
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

## Deferred WebDAV Investigation

Run this only if the core OPDS plus KOSync path fails, or if Readest-only
notes/backups become a hard requirement. A WebDAV pilot must prove that it does
not overwrite KOSync progress before it becomes part of the setup docs.

| Test | Expected | Pass | Notes |
|---|---|---|---|
| Connect WebDAV | User can enter URL, username, password, and root in Readest |  | Deferred |
| KOSync still wins | WebDAV does not pull stale progress over KOSync |  | Deferred |
| Readest notes | Notes/highlights sync between Readest devices only |  | Deferred |
| User isolation | One user's WebDAV state is invisible to another user |  | Deferred |

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
| Restore sidecar DB and copied library | Optional Kobo/web state returns |  |  |
| Restore family account registry | Users, statuses, roles, and service usernames return |  |  |
| Restore family secrets | Setup pages can show existing raw passwords, or rotation is explicit |  |  |
| Re-run onboarding on fresh VM | Services and config are recreated from repo |  |  |
| Run users reconcile after restore | Derived auth/config/setup pages are rebuilt from runtime registry |  |  |
