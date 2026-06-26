# Notes for June 26, 2026

- Evaluate progress-sync alternatives to the current Calibre/nginx setup.
- Keep the target self-hosted and unpaid; reject cloud-custody sync services.
- Start from the repo-contract docs: `docs/architecture.md`, `docs/device-setup.md`, and `docs/family-users.md`.
- Use `docs/research/self-hosted-reading-sync-research.md` and `docs/research/family-multi-user-admin-plan.md` as background only.
- Do not migrate production from Calibre yet.
- Build the core pilot around one official KOSync progress lane shared by CrossPoint, KOReader, and Readest.
- Use Calibre OPDS as the Readest book source. Do not add WebDAV unless OPDS plus KOSync fails a device test or Readest-only notes/backups become a hard requirement.
- Use Readest on Android, iPad, macOS, and Windows; use KOReader anywhere it is the better device app.
- Treat stock Kobo as optional. Evaluate BookOrbit, Komga, and Grimmory as copied-library sidecars only after the core lane passes.
- For family support, implement the contract in `docs/family-users.md`.
- Family mode means shared books but per-user OPDS, KOSync, setup page, and upload permissions.
- Do not enable family uploads directly into `/srv/books/library`; stage uploads for owner review.
- Build `scripts/books users ...` and reconcile before any optional owner admin
  panel.
- KOSync, setup pages, and the basic request queue are now wired; next work is
  request fulfillment polish, upload staging, and richer owner UI.
- Check OPDS, EPUB import, auth, metadata, and library-storage requirements before changing the running service.
- Preserve reproducibility: any install/config should be represented by repo scripts/templates, not manual VM state.
