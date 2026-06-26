# Self-Hosted Reading Sync Research

Research date: June 26, 2026 UTC.

## Hard Constraint

No paid service and no non-self-hosted service can be part of the target architecture. Commercial/cloud readers are useful comparators only. They are rejected here because they move the library or progress sync into someone else's custody.

The repo remains the source of truth for installs, service definitions, proxy config, docs, and operational commands. Runtime books, secrets, databases, WebDAV state, and sync state remain outside git and must be backed up separately.

## User Need

Primary need: a book setup that makes reading pleasant across:

- XTEink X4 with CrossPoint
- Kobo reader
- Android
- iPad
- MacBook
- Windows PC
- KOReader

Most important criterion: progress sync across devices. OPDS alone is catalog/download. A system that serves books but cannot keep position synced is not enough.

## Current Baseline

Current repo runs:

- Calibre content server for canonical OPDS and downloads.
- Calibre-Web for owner-only web UI/reader.
- nginx gate for exe.dev auth on browser UI.
- CrossPoint-friendly `/opds` and `/get/...` paths.

This is a solid delivery baseline. It is not a complete progress-sync architecture yet.

## Consensus Architecture

Do not migrate production away from Calibre yet. Keep Calibre as the canonical library and add two small, reversible sync sidecars first:

1. `books-kosync`: self-hosted KOReader-compatible sync endpoint at `https://books.exe.xyz/kosync`.
2. `books-webdav`: self-hosted WebDAV endpoint for Readest state at `https://books.exe.xyz/dav/readest`.

Then run isolated sidecar pilots, on copied EPUBs only, for stock Kobo/native-server workflows:

1. BookOrbit first.
2. Komga second.
3. Grimmory third if the BookLore-lineage path still looks useful.

Do not point any pilot at `/srv/books/library` with write access. Calibre owns that tree until a replacement proves itself with real devices and backup/restore.

## Key Findings

### OPDS Is Not Progress Sync

OPDS is useful for browsing and acquiring books. It does not make arbitrary readers share progress. Any architecture must choose a sync layer separately.

### KOReader Sync Is The Main Open Progress Primitive

KOReader sync is real, self-hostable, and CrossPoint exposes KOReader-compatible sync settings.

The safe strategy is:

- Use a pinned self-hosted KOReader sync server.
- Use binary/file-content document matching, not filename matching.
- Preserve one canonical EPUB byte stream per book.
- Add import and proxy probes before calling the lane reliable.

Filename matching is too fragile because it can collide across editions and can break when a downloader changes names. Binary matching is stricter, but it forces us to control EPUB bytes. That is the right tradeoff for reproducible sync.

### CrossPoint Sync Will Be Approximate

CrossPoint can use KOReader-compatible sync servers, but its internal reader model is not identical to KOReader. KOReader stores an XPath-like progress string plus percentage. CrossPoint stores a more constrained page/chapter model and maps between them.

Realistic target:

- KOReader-to-KOReader: paragraph/semantic-location quality if EPUB bytes match.
- CrossPoint-to-KOReader or KOReader-to-CrossPoint: usually near the right paragraph or chapter, with documented outliers.

This is still worth testing because it is the best self-hosted path for the XTEink X4.

### Readest Is A Mainstream Client Lane, Not The Server

Readest is attractive for Android, iPad, macOS, Windows, Linux, and web. The self-hosted path that currently fits this project is WebDAV sync:

- No Readest account required.
- Syncs reading progress, location, highlights, and notes.
- Can optionally sync book files.
- Can import from our existing Calibre OPDS catalog.

Do not run the full self-hosted Readest/Supabase stack first. It is heavier operationally, and Readest's desktop/mobile apps still have an open issue for choosing a custom backend endpoint. Use WebDAV first.

### Stock Kobo Is A Separate Lane

Plain sideloaded EPUBs or OPDS downloads on stock Kobo do not create a general self-hosted progress sync story. Stock Kobo sync requires Kobo API emulation from a server such as BookOrbit, Komga, Grimmory, BookLore, or Calibre-Web variants.

Even then, progress precision can be limited:

- Regular EPUB on Kobo may only sync at chapter boundaries.
- KEPUB can be better, but server mappings can still be off by a few pages.

Use KOReader on Kobo if exact self-hosted progress matters more than the stock Kobo reader UI.

### BookOrbit Is The Best New Sidecar Pilot

BookOrbit is the strongest new candidate for a Kobo/KOReader/web sidecar pilot because it directly targets:

- Self-hosted Docker deployment.
- No required cloud account.
- Private OPDS at `/api/v1/opds`.
- Kobo device sync.
- KOReader plugin-based sync.
- Per-user progress.
- Web reader.

However, it is still a pilot, not the new source of truth. An open BookOrbit issue from June 14, 2026 asks for seamless three-way progress, annotation, and session sync across KOReader, Kobo, and BookOrbit. That is a signal to test carefully before trusting it for the whole device matrix.

### Komga Is Mature, But Sidecar-Only For Now

Komga has strong documentation and a real self-hosted surface:

- OPDS v1/v2.
- Web reader.
- Kobo native sync.
- KOReader sync.
- Multi-user access and library management.

Risks:

- Regular EPUB progress can degrade to chapter-level for Kobo/KOReader transitions.
- Kobo sync uses API-key URLs and reverse-proxy details matter.
- CrossPoint OPDS compatibility must be tested on the actual device.
- Calibre metadata/progress does not migrate cleanly.

Komga is a serious sidecar pilot, not a replacement yet.

### BookLore Is Blocked; Grimmory Is Pilot-Only

BookLore technically matches much of the desired feature list, but it has too much recent governance risk for a new production deployment. Treat upstream BookLore as blocked.

Grimmory is the community successor/fork and appears more credible than BookLore now. It has active releases and clearer governance, but it still inherits the BookLore architecture and is still settling. Pilot it only after BookOrbit and Komga.

### Calibre-Web-Automated Is Incremental

Calibre-Web-Automated can improve ingest/conversion and has sync-adjacent features. It does not prove a complete self-hosted progress-sync story across CrossPoint, stock Kobo, KOReader, Readest, iPad, Android, Mac, and Windows.

Use it only if its automation helps the existing Calibre path. Do not treat it as the sync answer.

## Rejected

- BookFusion: good sync story, but paid/cloud.
- Google Play Books: cloud custody, no OPDS/Kobo/KOReader/CrossPoint path.
- Apple Books: Apple-only and cloud-dependent.
- Kindle/Send-to-Kindle: Amazon custody and not open/self-hosted.
- Readwise Reader: paid/cloud, not a self-hosted library server.
- OPDS-only clients: useful for download, insufficient for progress sync.
- Shelfmark/Shelfarr-style acquisition dashboards as primary reader servers: possible ingest adjuncts only, and only for legally authorized/public-domain/owned content.

## Pilot Order

Use the same canonical EPUB fixture set for every test.

1. Canonical EPUB fixture:
   - Choose three legally owned/public-domain EPUBs.
   - Record raw SHA256.
   - Record a normalized EPUB member hash.
   - Verify Calibre OPDS `/get/...` downloads match the canonical file or document any deterministic change.

2. KOSync pilot:
   - Add a pinned KOReader sync service.
   - Persist sync state outside git.
   - Create a sync-only user, then disable open registration.
   - Test health, auth, PUT/GET progress, restart persistence, and public nginx path routing.
   - Test CrossPoint, Kobo KOReader, Android KOReader, and desktop KOReader with binary matching.

3. Readest WebDAV pilot:
   - Add `rclone serve webdav` or another full WebDAV server on localhost.
   - Proxy it at `/dav/readest`.
   - Use it only for Readest sync state/covers/annotations and optional book files.
   - Test iPad, Android, MacBook, and Windows with no Readest cloud account.

4. BookOrbit sidecar:
   - Run pinned `ghcr.io/bookorbit/bookorbit:1.12.0` or exact digest.
   - Use a copied fixture library and separate PostgreSQL volume.
   - Test OPDS, web reader, KOReader plugin sync, and stock Kobo sync.
   - Keep only if three-way progress behavior is good enough in practice.

5. Komga sidecar:
   - Run a pinned Komga image or jar.
   - Use copied fixture books.
   - Test CrossPoint OPDS, KOReader sync, stock Kobo sync, and web reader.
   - Treat chapter-level EPUB progress as a limited pass only if acceptable.

6. Grimmory sidecar:
   - Run pinned `v3.2.2` or exact digest.
   - Use copied fixture books only.
   - Repeat OPDS, KOReader, Kobo, web reader, and backup/restore tests.

## Repo Work Needed

Likely files for the next implementation pass:

- `config/systemd/books-webdav.service`
- `config/systemd/books-kosync.service` or `config/compose/kosync.yml`
- optional `config/compose/bookorbit.yml`
- optional `config/compose/komga.yml`
- optional `config/compose/grimmory.yml`
- nginx routes for `/dav/readest`, `/kosync`, and optional sidecar paths
- env additions in `config/books.env.example` for ports, data dirs, credentials, and pinned versions
- `bin/books-hash` for raw SHA256 and normalized EPUB member hashes
- `bin/books-sync-probe` for health checks and fixture download/hash verification
- `docs/device-sync-test-matrix.md` for device/app/version/results

## Acceptance Criteria

Do not migrate until these pass:

- OPDS downloads from each test client produce the same canonical EPUB bytes or a known deterministic equivalent.
- KOSync survives service restart and VM reboot.
- CrossPoint can authenticate and sync through `https://books.exe.xyz/kosync`.
- KOReader clients on Kobo, Android, and desktop can push/pull progress through the same self-hosted server.
- Readest on iPad, Android, Mac, and Windows syncs progress and annotations through WebDAV without a Readest cloud account.
- Stock Kobo sidecar sync, if kept, lands within a few pages for KEPUB and has clearly documented limits for EPUB.
- Backup/restore covers `/srv/books/library`, `/srv/books/readest-webdav`, sync server state, and sidecar databases.

## Working Hypothesis

The best self-hosted architecture is not one app:

- Calibre remains the canonical import/library/OPDS layer.
- KOSync becomes the e-ink/CrossPoint/KOReader progress lane.
- Readest plus self-hosted WebDAV becomes the mainstream tablet/desktop lane.
- BookOrbit or Komga may become a Kobo sidecar if stock Kobo sync matters enough and passes real-device tests.

Do not build a broad custom progress bridge yet. CFI, KOReader XPointer, Kobo/KEPUB progress, Readest metadata matching, and CrossPoint page models are different enough that a bridge would be fragile without a large fixture suite.

## Sources

- CrossPoint user guide: https://github.com/crosspoint-reader/crosspoint-reader/blob/master/USER_GUIDE.md
- CrossPoint KOReader sync discussion: https://github.com/crosspoint-reader/crosspoint-reader/discussions/61
- KOReader sync server: https://github.com/koreader/koreader-sync-server
- Readest sync docs: https://readest.com/docs/sync
- Readest library/OPDS docs: https://readest.com/docs/library
- Readest custom backend issue: https://github.com/readest/readest/issues/1168
- Readest releases: https://github.com/readest/readest/releases
- Komga Kobo docs: https://komga.org/docs/guides/kobo/
- Komga KOReader docs: https://komga.org/docs/guides/koreader/
- Komga OPDS docs: https://komga.org/docs/guides/opds/
- BookOrbit overview: https://bookorbit.app/what-is-bookorbit
- BookOrbit OPDS docs: https://bookorbit.app/opds.html
- BookOrbit Kobo docs: https://bookorbit.app/kobo.html
- BookOrbit KOReader docs: https://bookorbit.app/koreader.html
- BookOrbit releases: https://github.com/bookorbit/bookorbit/releases
- BookOrbit three-way sync issue: https://github.com/bookorbit/bookorbit/issues/337
- Grimmory KOReader docs: https://grimmory.org/docs/integration/koreader
- Grimmory releases: https://github.com/grimmory-tools/grimmory/releases
- BookLore releases: https://github.com/booklore-app/booklore/releases
