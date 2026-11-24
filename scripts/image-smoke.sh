#!/usr/bin/env bash
# Starts the server image and waits until /api/health answers ok, asked from inside the container.
# Usage: scripts/image-smoke.sh <docker|podman> <image>
set -euo pipefail

engine="${1:?engine}"
image="${2:?image}"
name="h-board-smoke-$$"

"$engine" run --detach --rm --name "$name" "$image" >/dev/null
trap '"$engine" stop "$name" >/dev/null 2>&1 || true' EXIT

probe='fetch("http://127.0.0.1:8787/api/health").then(async (r) => { const b = await r.json(); console.log(JSON.stringify(b)); process.exit(r.ok && b.ok === true ? 0 : 1); }).catch(() => process.exit(1))'

for _ in $(seq 1 30); do
  if "$engine" exec "$name" node -e "$probe"; then
    echo "image-smoke: ok"
    exit 0
  fi
  sleep 1
done

echo "image-smoke: /api/health did not answer" >&2
"$engine" logs "$name" >&2 || true
exit 1
