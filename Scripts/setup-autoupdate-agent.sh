#!/bin/bash
set -euo pipefail

workspace_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
exec "${workspace_root}/macos/LinguaLearnCapture/Scripts/setup-autoupdate-agent.sh" "$@"
