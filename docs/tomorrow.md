# Notes for June 26, 2026

- Evaluate progress-sync alternatives to the current Calibre/nginx setup.
- Keep the target self-hosted and unpaid; reject cloud-custody sync services.
- Start from `docs/self-hosted-reading-sync-research.md`.
- Do not migrate production from Calibre yet.
- Prefer a small pilot first: self-hosted KOSync plus Readest WebDAV.
- Evaluate BookOrbit, Komga, and Grimmory as copied-library sidecars, not source-of-truth replacements.
- Check OPDS, EPUB import, auth, metadata, and library-storage requirements before changing the running service.
- Preserve reproducibility: any install/config should be represented by repo scripts/templates, not manual VM state.
