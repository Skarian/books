#!/usr/bin/env sh
set -eu

uid="${BOOKS_UID:-1000}"
gid="${BOOKS_GID:-1000}"

if [ "$(id -u)" = "0" ]; then
  for dir in /srv/books /srv/books/config /srv/books/library /srv/books/downloads /srv/books/import /srv/books/log; do
    mkdir -p "$dir"
    chown "$uid:$gid" "$dir" 2>/dev/null || true
  done
  exec gosu "$uid:$gid" env HOME=/srv/books XDG_CONFIG_HOME=/srv/books/config/xdg CALIBRE_CONFIG_DIRECTORY=/srv/books/config/calibre "$@"
fi

exec "$@"
