# Notes for June 26, 2026

- Evaluate progress-sync alternatives to the current Calibre/nginx setup.
- Keep the target self-hosted and unpaid; reject cloud-custody sync services.
- Start from the repo-contract docs: `docs/architecture.md`, `docs/device-setup.md`, and `docs/family-users.md`.
- Use `docs/research/self-hosted-reading-sync-research.md` and `docs/research/family-multi-user-admin-plan.md` as background only.
- Keep Calibre as the canonical book store.
- Use official Readest Web at `https://web.readest.com/` and Readest apps on Android, iPad, macOS, and Windows.
- Keep one official KOSync progress lane shared by CrossPoint, KOReader, Readest Web, and Readest apps.
- Use Calibre OPDS at `/catalog` as the Readest book source. Do not add WebDAV unless OPDS plus KOSync fails a device test or Readest-only notes/backups become a hard requirement.
- Use KOReader anywhere it is the better device app.
- Treat stock Kobo as optional. Evaluate BookOrbit, Komga, and Grimmory as copied-library sidecars only after the core lane passes.
- For family support, implement the contract in `docs/family-users.md`.
- Family mode means shared books but per-user OPDS, KOSync, setup page, and upload permissions. Readest accounts are owned by Readest users.
- Do not enable family uploads directly into `/srv/books/library`; stage uploads for owner review.
- `scripts/books users ...` is the owner workflow. It reconciles Calibre OPDS, KOSync, and setup pages.
- KOSync, setup pages, and the basic request queue are now wired; next work is real-device sync testing, request fulfillment polish, upload staging, and richer owner UI.
- Check OPDS, EPUB import, auth, metadata, and library-storage requirements before changing the running service.
- Preserve reproducibility: any install/config should be represented by repo scripts/templates, not manual VM state.
