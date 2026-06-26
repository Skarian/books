# Self-Hosted Reading Sync Research

Research date: June 26, 2026 UTC.

This is background research. For the working service docs, start with
`../architecture.md`, `../device-setup.md`, and `../family-users.md`.

## Decision

The recommended architecture is viable enough to implement and test:

1. Keep Calibre as the canonical EPUB library, OPDS catalog, and download source.
2. Add official KOReader Sync Server (`koreader/kosync`) as the single cross-app progress lane at `https://books.exe.xyz/kosync`.
3. Use that same KOSync endpoint from CrossPoint, KOReader, and Readest.
4. Add a self-hosted WebDAV endpoint only for Readest-to-Readest richer state: progress backup, highlights, notes, covers, and optional book files.
5. Treat stock Kobo support as optional sidecar work. Use KOReader on Kobo if unified progress matters more than the stock Kobo UI.

This changes the earlier framing. Readest is not just a separate WebDAV lane: current Readest can directly talk to a KOReader-compatible sync server for progress. That makes a self-hosted, no-paid, no-cloud-custody progress plane plausible across XTEink CrossPoint, KOReader devices, Android, iPad, macOS, and Windows.

Family/multi-user support is viable only with the constraints in `family-multi-user-admin-plan.md`: shared books are fine, but OPDS credentials, KOSync progress, WebDAV roots, setup pages, and upload permissions must be per-user.

## Hard Constraints

- No paid service in the core path.
- No non-self-hosted progress service or hosted library custody.
- Runtime secrets, books, sync databases, and WebDAV state stay outside git.
- All install/config/proxy/service changes must be represented in this repo.
- Kobo stock reader is optional; Kobo with KOReader remains in scope.
- Multi-user mode must never share KOSync credentials or Readest WebDAV roots between people.
- Family upload must stage files for owner review; family users must not write directly into `/srv/books/library`.

## Target Devices

| Device | Primary app | Progress sync path | Status |
|---|---|---|---|
| XTEink X4 | CrossPoint | KOSync | Accept, device validation required |
| KOReader-capable devices | KOReader | KOSync | Accept |
| Android | Readest | KOSync for cross-app progress; WebDAV for Readest state | Accept |
| iPad | Readest | KOSync for cross-app progress; WebDAV for Readest state | Accept |
| MacBook | Readest | KOSync for cross-app progress; WebDAV for Readest state | Accept |
| Windows PC | Readest | KOSync for cross-app progress; WebDAV for Readest state | Accept |
| Kobo stock reader | Stock Kobo | Sidecar server only | Optional pilot |

## Architecture

```text
Calibre library
  -> OPDS/downloads at /opds and /get/...
  -> identical EPUB bytes on every client

Official KOReader Sync Server
  -> /kosync
  -> progress only
  -> CrossPoint, KOReader, Readest

Self-hosted WebDAV
  -> /dav/readest
  -> Readest progress backup, highlights, notes, covers, optional files
  -> Readest clients only
```

KOSync is the canonical cross-app progress lane. WebDAV is not the bridge to CrossPoint or KOReader; it is Readest's richer self-hosted state lane.

## Why This Works

Readest's current docs describe a direct Readest-to-KOReader Sync Server mode. It is progress-only, needs Readest 0.10.1+, and uses the same server URL, username, password, and file-content checksum approach as KOReader binary matching.

CrossPoint's user guide says it can sync reading progress with KOReader-compatible sync servers and interoperate with KOReader when the same server and credentials are used. CrossPoint's current source also implements the KOReader API endpoints, MD5-based auth headers, binary partial-MD5 document matching, and a progress payload containing both `progress` and `percentage`.

KOReader's own plugin uses the same progress shape: a document digest, a progress string, a percentage, device metadata, and a timestamp. For reflowable EPUBs, KOReader uses XPointer-like positions; for binary document matching, it uses a partial MD5 of the file.

The official KOReader Sync Server is the lowest-risk server because it is the protocol source. It persists Redis data, exposes the expected endpoints, has a current 2026 release, and supports the reverse-proxy port intended for TLS termination.

## What Does Not Sync

The shared KOSync lane only syncs reading position. It does not sync:

- highlights
- notes
- bookmarks
- book files
- collections
- ratings
- reading sessions

Readest WebDAV can cover Readest-to-Readest highlights, notes, covers, and optional book-file sync. It will not make those objects appear in CrossPoint or KOReader.

## Precision Expectations

| Path | Expected precision | Why |
|---|---|---|
| KOReader to KOReader | Best | Same app, same KOSync protocol, same XPointer model |
| Readest to KOReader | Good, test required | Readest converts between its local CFI/location model and KOReader-style XPointer/percentage |
| KOReader to Readest | Good, test required | Same conversion risk in the other direction |
| CrossPoint to KOReader/Readest | Practical but approximate | CrossPoint maps between its page/chapter state and KOReader-style progress |
| KOReader/Readest to CrossPoint | Practical but approximate | CrossPoint lands on its local page model after resolving remote progress |

CrossPoint is the risk. Current CrossPoint source is better than a simple chapter-only mapper: it has ancestry-aware XPath parsing, visible-character progress mapping, paragraph/list-item/anchor refinement, and binary document matching. Still, the X4 must be tested with real EPUBs because layout, fonts, CSS, and page cache behavior can move the landing point.

## EPUB Identity Rule

KOSync binary matching only works if the clients compute the same document digest. The repo should enforce this as an operational rule:

- Calibre owns `/srv/books/library`.
- Devices download the same canonical EPUB bytes from Calibre OPDS where possible.
- Readest uses `File Content`.
- KOReader uses `Binary`.
- CrossPoint uses the same sync server and should be set to binary matching once available in the device UI.
- Do not convert, optimize, metadata-rewrite, or re-zip a book after it enters the canonical library without treating it as a new sync identity.
- In family mode, each person uses their own KOSync account so the same canonical EPUB can be read by multiple people without progress collisions.

This is the main failure mode. Filename matching is easier but too weak for editions, renamed downloads, and duplicate titles.

## Candidate Matrix

| Candidate | Verdict | Notes |
|---|---:|---|
| Calibre + official KOSync + Readest + WebDAV | Accept | Best match for all required non-stock-Kobo devices with no paid/cloud progress service. |
| Official `koreader/kosync` | Accept | Primary KOSync server. Pin the image/version and persist Redis outside git. |
| `kosync-dotnet` | Fallback | Good admin API and registration controls, but not the protocol source and has first-pull compatibility risk to test. |
| Readest | Accept | Best mainstream client across iPad, Android, macOS, Windows, Linux, and web; has OPDS/Calibre and direct KOSync support. |
| Readest WebDAV | Accept as Readest lane | Self-hosted and useful, but not a bridge to CrossPoint/KOReader. |
| KOReader | Accept where available | Strongest open progress primitive, but no iOS/iPadOS app. |
| CrossPoint | Accept with validation | It implements KOReader-compatible sync, but landing precision must be measured on the X4. |
| Everbound | Watch | Promising open mobile reader with KOSync and WebDAV, but not ready to cover desktop/web as the primary lane. |
| BookOrbit | Sidecar pilot | Strong self-hosted Kobo/web/KOReader candidate, but tied to its own library identity and plugin. Do not replace standalone KOSync yet. |
| Komga | Sidecar pilot | Mature OPDS/Kobo/KOReader server. Regular EPUB progress can degrade to chapter boundaries. |
| Grimmory | Late pilot | Interesting BookLore-lineage project; still young and should not become the core lane first. |
| BookLore | Block | Feature list is attractive, but project churn/governance risk is too high for production. |
| Calibre-Web-Automated | Revise | Useful ingest/conversion adjunct; not the universal progress plane. |
| Kavita | Revise | Useful web/OPDS server, but stock Kobo and KOReader progress behavior do not beat the recommended core. |
| Stump | Revise | Interesting, but current sync/migration risks make it a later pilot. |
| Moon+ Reader | Block for core | Android-only; WebDAV sync is not a CrossPoint/KOReader bridge. |
| Thorium/Foliate/Librera/Yomu/KyBook/PocketBook/FBReader | Block for core | Platform gaps, hosted sync, paid sync, or no KOSync-compatible progress path. |

## Implementation Plan

### Phase 1: Fixture Identity

- Pick three legally owned, public-domain, or otherwise authorized EPUBs.
- Record raw SHA256 and KOReader partial-MD5-style identity.
- Verify Calibre OPDS downloads preserve bytes.
- Add a repo probe that downloads `/get/...` and compares fixture hashes.

### Phase 2: Official KOSync

- Add a pinned official `koreader/kosync` service.
- Store Redis state under `/srv/books/kosync`.
- Expose it publicly at `/kosync` without exe.dev owner-header gating.
- Use KOSync credentials, not Calibre/exe.dev auth, for this path.
- Bootstrap with registration enabled, create one sync user per human reader, then restart with registration disabled.
- Add health/auth/progress probes to `scripts/books`.

### Phase 3: Readest

- Configure Readest on Android, iPad, macOS, and Windows.
- Add Calibre OPDS with Basic auth.
- Configure KOReader Sync in Readest against `https://books.exe.xyz/kosync` using that reader's own KOSync account.
- Set checksum/document matching to file content.
- Configure WebDAV only after KOSync progress is verified.
- Use WebDAV for Readest state and optional book files; do not rely on it for CrossPoint/KOReader.
- In family mode, every reader must get a separate WebDAV root.

### Phase 4: CrossPoint And KOReader

- Configure CrossPoint to the same KOSync endpoint and that reader's own KOSync user.
- Configure KOReader to the same endpoint and binary matching.
- Download the same fixture EPUBs from Calibre OPDS.
- Test push and pull in every direction that matters.

### Phase 4.5: Family Accounts And Admin Panel

- Add a runtime account registry outside git.
- Add `scripts/books users create/list/disable/purge/rotate/reconcile`.
- Make onboarding idempotently reconcile the registry into Calibre, KOSync, WebDAV, nginx maps, and setup pages.
- Keep the admin panel owner-only through exe.dev headers.
- Make the admin panel a thin UI over the same user CLI/helper.
- Generate task-first setup pages for each user.
- Keep family uploads staged outside `/srv/books/library` until owner approval.

### Phase 5: Optional Kobo/Server Sidecars

- Only after the core lane passes, run BookOrbit and Komga against copied fixture libraries.
- Do not grant sidecars write access to `/srv/books/library`.
- Keep a sidecar only if it proves backup/restore, file identity, Kobo precision, and CrossPoint/KOReader non-interference.

## Acceptance Criteria

The architecture passes only if:

- CrossPoint can authenticate to `https://books.exe.xyz/kosync`.
- CrossPoint can upload local progress for a fixture EPUB and another client can pull it.
- CrossPoint can apply remote progress from KOReader or Readest and land close enough to continue reading without hunting.
- KOReader on at least one non-X4 device can push and pull the same fixture through KOSync with binary matching.
- Readest on iPad, Android, macOS, and Windows can push and pull progress through KOSync using file-content matching.
- Readest WebDAV syncs highlights/notes/progress between Readest clients without a Readest cloud account.
- Two different users can read the same canonical EPUB without KOSync progress collisions.
- A disabled user can no longer access OPDS, KOSync, WebDAV, setup pages, or optional upload.
- KOSync survives service restart and VM reboot.
- Backup/restore covers `/srv/books/library`, `/srv/books/kosync`, `/srv/books/readest-webdav`, and any sidecar databases.
- A failed hash match is visible in probes or the test matrix before a user trusts the setup.

If CrossPoint lands only at chapter starts for normal EPUBs, the architecture is a limited pass only if that is acceptable for X4 reading. If Readest and KOReader cannot share a binary/file-content identity from Calibre OPDS downloads, the architecture is blocked until import/download identity is fixed.

## Repo Work Needed

- `config/systemd/books-kosync.service` or `config/compose/kosync.yml`
- `config/systemd/books-webdav.service`
- nginx route for `/kosync` with prefix stripping and no exe.dev owner gate
- nginx route for `/dav/readest` with WebDAV auth
- `config/books.env.example` additions for ports, image tags/digests, paths, and bootstrap-only credentials
- `scripts/onboard` KOSync bootstrap and WebDAV setup
- `scripts/books kosync-health`, `kosync-auth`, and fixture progress probes
- `scripts/books users ...` account lifecycle commands
- owner-only admin panel that wraps the user CLI/helper
- `bin/books-hash` or equivalent for raw SHA256 plus KOReader-style partial MD5 checks
- updated backup/restore docs for KOSync Redis and Readest WebDAV state

## Notes For Future Custom Utilities

Do not build a broad progress bridge yet. Readest already has a direct KOSync client, and a custom bridge would become a second writer with weak conflict semantics.

Safe future utilities:

- fixture hash verifier
- OPDS download identity checker
- KOSync progress inspector
- backup integrity checker
- dashboard/reporting from KOSync into Calibre custom columns

Avoid:

- bidirectional Readest WebDAV to KOSync sync
- KOSync to Calibre position synthesis
- automatic progress writes from multiple sources without explicit timestamps and conflict policy

## Sources

- Readest sync docs: https://readest.com/docs/sync
- Readest KOReader sync wiki: https://github.com/readest/readest/wiki/Sync-with-Koreader-devices
- Readest repository: https://github.com/readest/readest
- Readest library/OPDS docs: https://readest.com/docs/library
- CrossPoint user guide: https://github.com/crosspoint-reader/crosspoint-reader/blob/master/USER_GUIDE.md
- CrossPoint source reviewed locally at commit `7271c00`.
- KOReader source reviewed locally at commit `49caca9`.
- KOReader sync server: https://github.com/koreader/koreader-sync-server
- `kosync-dotnet`: https://github.com/jberlyn/kosync-dotnet
- BookOrbit overview: https://bookorbit.app/what-is-bookorbit
- BookOrbit KOReader docs: https://bookorbit.app/koreader.html
- Komga KOReader docs: https://komga.org/docs/guides/koreader/
- Everbound repository: https://github.com/Neighborhood-Nerd/everbound-ereader-app
- Family multi-user admin plan: family-multi-user-admin-plan.md
