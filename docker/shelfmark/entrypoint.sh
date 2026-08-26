#!/bin/sh
set -eu

key_file=/run/secrets/annas_secret_key
if [ -s "$key_file" ]; then
  AA_DONATOR_KEY=$(cat "$key_file")
  export AA_DONATOR_KEY
fi

exec /app/entrypoint.sh
