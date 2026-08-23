#!/bin/bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${script_dir}/../Package.swift" ]]; then
    package_root="$(cd -- "${script_dir}/.." && pwd)"
elif [[ -f "${script_dir}/../macos/LinguaLearnCapture/Package.swift" ]]; then
    package_root="$(cd -- "${script_dir}/../macos/LinguaLearnCapture" && pwd)"
else
    echo "ERROR: Package.swift not found relative to script location" >&2
    exit 1
fi

target_app="${HOME}/Applications/LinguaLearnCapture.app"
source_app="${1:-${package_root}/.build/app/LinguaLearnCapture.app}"

if [[ ! -d "${source_app}" ]]; then
    echo "Source app not found at ${source_app}, building first..."
    "${package_root}/Scripts/build-app.sh"
    source_app="${package_root}/.build/app/LinguaLearnCapture.app"
fi

if [[ ! -d "${source_app}" ]]; then
    echo "ERROR: Source app bundle unavailable at ${source_app}" >&2
    exit 1
fi

echo "Updating installed app at ${target_app} from ${source_app}..."

/bin/mkdir -p "${HOME}/Applications"

if [[ -d "${target_app}" ]]; then
    /bin/rm -rf "${target_app}"
fi

/usr/bin/ditto "${source_app}" "${target_app}"
/bin/chmod 0755 "${target_app}/Contents/MacOS/LinguaLearnCapture"

if /usr/bin/codesign --verify --deep --strict "${target_app}" >/dev/null 2>&1; then
    echo "Code signature verified on updated app."
else
    echo "WARNING: Code signature verification failed on ${target_app}" >&2
fi

launch_label="gui/$(/usr/bin/id -u)/com.lingualearn.capture"
if /bin/launchctl print "${launch_label}" >/dev/null 2>&1; then
    echo "Restarting LaunchAgent ${launch_label}..."
    /bin/launchctl kickstart -k "${launch_label}" 2>/dev/null || true
else
    echo "LaunchAgent not currently active."
fi

echo "Update complete. LinguaLearn Capture installed at ${target_app}."
