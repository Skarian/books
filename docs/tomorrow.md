# Historical Notes

These notes record the research direction that led to the current repo shape.

- Keep Calibre as the canonical book store.
- Use official Readest Web at `https://web.readest.com/` and Readest apps on
  Android, iPad, macOS, and Windows.
- Keep one official KOSync progress lane shared by CrossPoint, KOReader, and
  Readest.
- Use Calibre OPDS at `/catalog` as the book source.
- Use KOReader anywhere it is the better device app.
- Treat stock Kobo as optional.
- Use `docker compose run --rm admin users ...` as the owner workflow for now.
- Preserve reproducibility: installs and config belong in repo files.
