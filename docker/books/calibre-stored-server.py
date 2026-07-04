import sys

from calibre import __version__
import calibre.srv.content as content
from calibre.srv.standalone import main

if __version__ != "9.9.0":
    raise SystemExit(f"Unsupported Calibre version for stored-file downloads: {__version__}")
if not hasattr(content, "update_metadata_in_fmts"):
    raise SystemExit("Calibre content server metadata rewrite switch is missing.")

content.update_metadata_in_fmts = frozenset()
if content.update_metadata_in_fmts:
    raise SystemExit("Could not disable Calibre content server metadata rewriting.")

print("Books: Calibre stored-file download mode active", flush=True)
args = sys.argv[1:]
if args[:1] == ["--"]:
    args = args[1:]
main(["calibre-server", *args])
