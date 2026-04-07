#!/bin/sh
set -e

# Resolve _FILE env vars into their base names (e.g. JWT_SECRET_FILE -> JWT_SECRET)
# Supports Docker Secrets and file-based secret management.
for var in DATABASE_URL REDIS_URL JWT_SECRET COOKIE_SECRET ENCRYPTION_KEY; do
  file_var="${var}_FILE"
  file_path=$(printenv "$file_var" 2>/dev/null) || file_path=''
  current_val=$(printenv "$var" 2>/dev/null) || current_val=''

  [ -z "$file_path" ] && continue

  if [ -n "$current_val" ]; then
    echo "[Tracearr] WARNING: Both $var and ${file_var} are set; using $var" >&2
  elif [ ! -f "$file_path" ]; then
    echo "[Tracearr] ERROR: ${file_var}=${file_path} but file not found" >&2
    exit 1
  elif [ ! -r "$file_path" ]; then
    echo "[Tracearr] ERROR: ${file_var}=${file_path} exists but is not readable" >&2
    exit 1
  else
    val=$(tr -d '\r' < "$file_path")
    if [ -z "$val" ]; then
      echo "[Tracearr] ERROR: ${file_var} file is empty: ${file_path}" >&2
      exit 1
    fi
    export "$var=$val"
  fi
done

exec "$@"
