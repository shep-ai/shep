#!/usr/bin/env bash
# Tests that shep works after npm pack + global install in a clean Docker container.
# Validates package structure, version command, and ui server startup.
#
# Requirements: Docker
# Timeout: 300

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"
source "$SCRIPT_DIR/_setup.sh"

log_section "Test: shep ui (Docker packaged install)"

# --- Preconditions ---
if ! docker_available; then
  log_warn "Docker is not available — skipping"
  exit 2
fi

# --- Setup ---
create_tarball

IMAGE_TAG="shep-e2e-test:$$"
CONTAINER_NAME="shep-e2e-$$"
cleanup_register "docker rm -f $CONTAINER_NAME 2>/dev/null || true"
cleanup_register "docker rmi $IMAGE_TAG 2>/dev/null || true"

# --- Build Docker image ---
log_section "Building Docker image"

DOCKER_CTX=$(mktemp -d)
cleanup_register "rm -rf $DOCKER_CTX"
cp "$TARBALL_PATH" "$DOCKER_CTX/"

docker build -q -t "$IMAGE_TAG" -f - "$DOCKER_CTX" <<'DOCKERFILE'
FROM node:22-slim
WORKDIR /app
# node-pty has no linux prebuilts on v1.1.x so its postinstall falls
# back to node-gyp which needs python3 + a C++ toolchain. Install just
# enough to let the native module compile during npm install -g. Same
# set real end users will need on a minimal Linux host.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        make \
        g++ \
    && rm -rf /var/lib/apt/lists/*
COPY shepai-cli-*.tgz /app/
RUN npm install -g /app/shepai-cli-*.tgz 2>&1 | tail -10
RUN mkdir -p /root/.shep
DOCKERFILE

log_info "Image built: $IMAGE_TAG"

# --- Test 1: Package structure ---
log_section "Package structure"

STRUCTURE=$(docker run --rm "$IMAGE_TAG" sh -c '
  PKG=$(npm root -g)/@shepai/cli
  echo "HAS_DIST=$([ -d "$PKG/dist" ] && echo yes || echo no)"
  echo "HAS_WEB=$([ -d "$PKG/web" ] && echo yes || echo no)"
  echo "HAS_WEB_NEXT=$([ -d "$PKG/web/.next" ] && echo yes || echo no)"
  echo "HAS_BIN=$(which shep >/dev/null 2>&1 && echo yes || echo no)"
')

assert_contains "$STRUCTURE" "HAS_DIST=yes" "dist/ directory present"
assert_contains "$STRUCTURE" "HAS_WEB=yes" "web/ directory present"
assert_contains "$STRUCTURE" "HAS_WEB_NEXT=yes" "web/.next/ directory present"
assert_contains "$STRUCTURE" "HAS_BIN=yes" "shep binary on PATH"

# --- Test 2: shep --version ---
log_section "shep --version"

VERSION_OUTPUT=""
VERSION_EXIT=0
VERSION_OUTPUT=$(docker run --rm "$IMAGE_TAG" shep version 2>&1) || VERSION_EXIT=$?

assert_exit_code "0" "$VERSION_EXIT" "shep version exits cleanly"
assert_contains "$VERSION_OUTPUT" "@shepai/cli" "version output contains package name"

# --- Test 3: shep ui server startup ---
log_section "shep ui server startup"

docker run -d --name "$CONTAINER_NAME" "$IMAGE_TAG" \
  sh -c 'shep ui --port 4050 2>&1' >/dev/null

# Poll container logs for "Server ready" or failure
WAIT_SECONDS=120
READY=false
LOGS=""
for i in $(seq 1 $WAIT_SECONDS); do
  LOGS=$(docker logs "$CONTAINER_NAME" 2>&1)

  if echo "$LOGS" | grep -q "Server ready"; then
    READY=true
    break
  fi

  # Check if container died
  if ! docker ps -q --filter "name=$CONTAINER_NAME" | grep -q .; then
    log_error "Container exited prematurely"
    break
  fi

  sleep 1
done

if [ "$READY" = true ]; then
  assert_contains "$LOGS" "Server ready" "server started successfully"
else
  _TEST_FAIL=$((_TEST_FAIL + 1))
  log_error "FAIL: server did not become ready within ${WAIT_SECONDS}s"
  log_error "Container logs (last 30 lines):"
  echo "$LOGS" | tail -30 >&2
fi

# --- Summary ---
test_summary
