#!/usr/bin/env bash
set -euo pipefail

ADAPTER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd "$ADAPTER_DIR/../.." && pwd)"

python3 "$REPOSITORY_ROOT/scripts/sync_workflow.py" --check
exec python3 "$ADAPTER_DIR/scripts/install_codex.py" "$@"
