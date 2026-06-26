# Notes for June 26, 2026

- Evaluate progress-sync alternatives to the current Calibre/nginx setup.
- Keep the target self-hosted and unpaid; reject cloud-custody sync services.
- Start from `docs/self-hosted-reading-sync-research.md`.
- Do not migrate production from Calibre yet.
- Build the core pilot around one official KOSync progress lane shared by CrossPoint, KOReader, and Readest.
- Add Readest WebDAV after KOSync works; WebDAV is for Readest state, not the CrossPoint/KOReader bridge.
- Use Readest on Android, iPad, macOS, and Windows; use KOReader anywhere it is the better device app.
- Treat stock Kobo as optional. Evaluate BookOrbit, Komga, and Grimmory as copied-library sidecars only after the core lane passes.
- Check OPDS, EPUB import, auth, metadata, and library-storage requirements before changing the running service.
- Preserve reproducibility: any install/config should be represented by repo scripts/templates, not manual VM state.
