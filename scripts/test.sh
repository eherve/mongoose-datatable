#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_OUT_DIR="$REPO_ROOT/dist-test"
CONTAINER_NAME="${MONGOOSE_DATATABLE_TEST_CONTAINER:-mongoose-datatable-test}"
MONGO_IMAGE="${MONGOOSE_DATATABLE_TEST_IMAGE:-mongo:8.0}"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  rm -rf "$TEST_OUT_DIR"
}

trap cleanup EXIT
cleanup
cd "$REPO_ROOT"

echo "[mongoose-datatable] starting MongoDB test container"
docker run --name "$CONTAINER_NAME" --rm -d -p 27017:27017 "$MONGO_IMAGE" >/dev/null

ready=false
for ((attempt = 1; attempt <= 30; attempt++)); do
  if docker exec "$CONTAINER_NAME" mongosh --quiet --eval 'db.adminCommand({ ping: 1 }).ok' 2>/dev/null | grep -q '^1$'; then
    ready=true
    break
  fi
  sleep 1
done

if [ "$ready" != true ]; then
  echo "[mongoose-datatable] MongoDB did not become ready within 30 seconds" >&2
  docker logs "$CONTAINER_NAME" >&2 || true
  exit 1
fi

echo "[mongoose-datatable] compiling tests"
tsc -p ./tsconfig.test.json

echo "[mongoose-datatable] running tests"
c8 mocha -R spec "dist-test/**/*.spec.js"
