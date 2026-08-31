#!/bin/bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${script_dir}/../Package.swift" ]]; then
    package_root="$(cd -- "${script_dir}/.." && pwd)"
elif [[ -f "${script_dir}/../macos/LinguaLearnCapture/Package.swift" ]]; then
    package_root="$(cd -- "${script_dir}/../macos/LinguaLearnCapture" && pwd)"
else
    package_root="${script_dir}"
fi

app_support_dir="${HOME}/Library/Application Support/LinguaLearnCapture"
scripts_target_dir="${app_support_dir}/Scripts"
autoupdate_script="${scripts_target_dir}/autoupdate.sh"
launch_agents_dir="${HOME}/Library/LaunchAgents"
agent_plist="${launch_agents_dir}/com.lingualearn.capture.autoupdate.plist"
log_dir="${HOME}/Library/Logs/LinguaLearnCapture"

/bin/mkdir -p "${launch_agents_dir}" "${log_dir}" "${scripts_target_dir}"
/bin/cp -f "${package_root}/Scripts/autoupdate.sh" "${scripts_target_dir}/"
/bin/cp -f "${package_root}/Scripts/update-installed.sh" "${scripts_target_dir}/"
/bin/cp -f "${package_root}/Scripts/build-app.sh" "${scripts_target_dir}/"
/bin/chmod 0755 "${scripts_target_dir}"/*

/usr/bin/python3 - "${agent_plist}" "${autoupdate_script}" "${log_dir}/autoupdate.log" <<'PY'
import os
import plistlib
import sys
import tempfile

target, script_path, log_file = sys.argv[1:]
document = {
    "Label": "com.lingualearn.capture.autoupdate",
    "ProgramArguments": ["/bin/bash", script_path],
    # Run once on load/login, and then every 3 hours (10800 seconds)
    "RunAtLoad": True,
    "StartInterval": 10800,
    "StandardOutPath": log_file,
    "StandardErrorPath": log_file,
}

directory = os.path.dirname(target)
descriptor, temporary = tempfile.mkstemp(prefix="com.lingualearn.capture.autoupdate.", suffix=".tmp", dir=directory)
try:
    with os.fdopen(descriptor, "wb") as handle:
        plistlib.dump(document, handle, sort_keys=True)
        handle.flush()
        os.fsync(handle.fileno())
    os.chmod(temporary, 0o644)
    os.replace(temporary, target)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
PY

# Bootstrap or reload the LaunchAgent
launch_label="gui/$(/usr/bin/id -u)/com.lingualearn.capture.autoupdate"
/bin/launchctl bootout "${launch_label}" 2>/dev/null || true
/bin/launchctl bootstrap "gui/$(/usr/bin/id -u)" "${agent_plist}" 2>/dev/null || /bin/launchctl load -w "${agent_plist}" 2>/dev/null || true

echo "Configured 3-hour automatic update LaunchAgent: ${agent_plist}"
echo "Schedule: Every 10,800 seconds (3 hours) + on login/boot."
echo "Log file: ${log_dir}/autoupdate.log"
