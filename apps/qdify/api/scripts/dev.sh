#!/usr/bin/env bash
# `moon run qdify-api:dev`: make sure MiniStack is up, then run the API in a container with
# the source mounted and hot reload on. Ctrl-C stops the API; MiniStack keeps running.
set -euo pipefail

qdify_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$qdify_dir"

# Docker Desktop without WSL integration only offers docker.exe on WSL.
if command -v docker >/dev/null 2>&1; then
  docker=(docker)
elif [[ -x '/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe' ]]; then
  docker=('/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe')
  # Windows programs only see the WSL variables listed in WSLENV.
  export WSLENV="QDIFY_PUBLISH_PORT:MINISTACK_PUBLISH_PORT${WSLENV:+:$WSLENV}"
else
  echo 'dev: Docker not found. Install Docker or turn on Docker Desktop WSL integration.' >&2
  exit 1
fi

container=qdify-ministack-1
state="$("${docker[@]}" inspect --format '{{.State.Status}} {{.State.Health.Status}}' "$container" 2>/dev/null || true)"
state="${state//$'\r'/}" # docker.exe ends lines with CRLF.
if [[ "$state" == 'running healthy' ]]; then
  echo "dev: MiniStack is already running"
else
  # A stopped container still reports its last health check, so show only the state.
  status="${state%% *}"
  echo "dev: starting MiniStack (${status:-not created})"
  "${docker[@]}" compose -f ministack.yaml up -d --wait
fi

# Stop the container ourselves on Ctrl-C: docker.exe exits on the signal but leaves it running.
up_pid=''
stop_api() {
  trap - INT TERM
  [[ -n "$up_pid" ]] && kill "$up_pid" 2>/dev/null
  "${docker[@]}" compose -f dev.yaml stop api-dev >/dev/null 2>&1 || true
}
trap 'stop_api; exit 130' INT TERM

# In the background so the trap runs at once; its logs still stream to moon.
"${docker[@]}" compose -f dev.yaml up --build --abort-on-container-exit api-dev &
up_pid=$!
wait "$up_pid"
