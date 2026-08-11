#!/bin/bash
set -euo pipefail

package_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
install_app=true
install_hook=true
dry_run=false

usage() {
    echo "Usage: $0 [--all | --app-only | --hook-only] [--dry-run]"
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --all)
            install_app=true
            install_hook=true
            ;;
        --app-only)
            install_app=true
            install_hook=false
            ;;
        --hook-only)
            install_app=false
            install_hook=true
            ;;
        --dry-run)
            dry_run=true
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            usage >&2
            exit 2
            ;;
    esac
    shift
done

user_applications="${HOME}/Applications"
application_target="${user_applications}/LinguaLearnCapture.app"
support_directory="${HOME}/Library/Application Support/LinguaLearnCapture"
configuration_target="${support_directory}/config.json"
codex_directory="${CODEX_HOME:-${HOME}/.codex}"
codex_hooks_directory="${codex_directory}/hooks"
hook_target="${codex_hooks_directory}/lingualearn_capture.py"
hooks_json="${codex_directory}/hooks.json"
launch_agents_directory="${HOME}/Library/LaunchAgents"
launch_agent_target="${launch_agents_directory}/com.lingualearn.capture.plist"

if ${dry_run}; then
    echo "Would install app: ${install_app} -> ${application_target}"
    echo "Would create config only if absent: ${configuration_target}"
    echo "Would install login LaunchAgent: ${install_app} -> ${launch_agent_target}"
    echo "Would install Codex hook: ${install_hook} -> ${hook_target}"
    echo "Would merge (not replace): ${hooks_json}"
    exit 0
fi

if ${install_app}; then
    "${package_root}/Scripts/build-app.sh"
    /bin/mkdir -p "${user_applications}" "${support_directory}"
    /bin/chmod 0700 "${support_directory}"

    if [[ -e "${application_target}" ]]; then
        timestamp="$(/bin/date -u +%Y%m%dT%H%M%SZ)"
        backup_target="${application_target}.backup-${timestamp}"
        /bin/mv -- "${application_target}" "${backup_target}"
        echo "Existing app backed up to ${backup_target}"
    fi
    /usr/bin/ditto "${package_root}/.build/app/LinguaLearnCapture.app" "${application_target}"

    if [[ ! -e "${configuration_target}" ]]; then
        /usr/bin/python3 - "${package_root}/Config/config.example.json" "${configuration_target}" <<'PY'
import json
import os
import secrets
import sys
import tempfile

source, target = sys.argv[1:]
with open(source, encoding="utf-8") as handle:
    config = json.load(handle)
config["ingressToken"] = secrets.token_hex(32)
directory = os.path.dirname(target)
descriptor, temporary = tempfile.mkstemp(prefix="config.", suffix=".tmp", dir=directory)
try:
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        json.dump(config, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.chmod(temporary, 0o600)
    os.replace(temporary, target)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
PY
        echo "Created ${configuration_target}; edit apiURL, appURL, and bearerToken before launch."
    else
        echo "Kept existing configuration ${configuration_target}"
    fi

    /bin/mkdir -p "${launch_agents_directory}"
    /usr/bin/python3 - "${launch_agent_target}" "${application_target}" <<'PY'
import os
import plistlib
import sys
import tempfile

target, application = sys.argv[1:]
executable = os.path.join(application, "Contents", "MacOS", "LinguaLearnCapture")
document = {
    "Label": "com.lingualearn.capture",
    "ProgramArguments": [executable],
    "RunAtLoad": True,
    # launchd restarts a crash/signal exit, while an intentional Quit (exit 0)
    # remains stopped until the next login or manual launch.
    "KeepAlive": {"SuccessfulExit": False},
    "ThrottleInterval": 5,
    "LimitLoadToSessionType": "Aqua",
}
directory = os.path.dirname(target)
descriptor, temporary = tempfile.mkstemp(prefix="com.lingualearn.capture.", suffix=".tmp", dir=directory)
try:
    with os.fdopen(descriptor, "wb") as handle:
        plistlib.dump(document, handle, sort_keys=True)
        handle.flush()
        os.fsync(handle.fileno())
    os.chmod(temporary, 0o600)
    os.replace(temporary, target)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
PY
    echo "Installed crash-restarting login LaunchAgent ${launch_agent_target} (takes effect at next login or bootstrap)."
fi

if ${install_hook}; then
    /bin/mkdir -p "${codex_hooks_directory}"
    /bin/chmod 0700 "${codex_hooks_directory}"
    /usr/bin/install -m 0700 "${package_root}/Hooks/lingualearn_capture.py" "${hook_target}"

    hook_command="/usr/bin/python3 \"${hook_target}\""
    /usr/bin/python3 - "${hooks_json}" "${hook_command}" <<'PY'
import datetime
import json
import os
import shutil
import sys
import tempfile

path, command = sys.argv[1:]
directory = os.path.dirname(path)
os.makedirs(directory, mode=0o700, exist_ok=True)

if os.path.exists(path):
    with open(path, encoding="utf-8") as handle:
        document = json.load(handle)
    if not isinstance(document, dict):
        raise SystemExit(f"Refusing to modify non-object JSON at {path}")
else:
    document = {"description": "User-level Codex lifecycle hooks."}

hooks = document.setdefault("hooks", {})
if not isinstance(hooks, dict):
    raise SystemExit(f"Refusing to modify invalid hooks field at {path}")
groups = hooks.setdefault("UserPromptSubmit", [])
if not isinstance(groups, list):
    raise SystemExit(f"Refusing to modify invalid UserPromptSubmit hooks at {path}")

already_present = False
for group in groups:
    if not isinstance(group, dict):
        continue
    handlers = group.get("hooks", [])
    if not isinstance(handlers, list):
        continue
    for handler in handlers:
        if isinstance(handler, dict) and handler.get("type") == "command" and handler.get("command") == command:
            already_present = True

if already_present:
    print(f"Codex hook already present in {path}")
    raise SystemExit(0)

groups.append(
    {
        "hooks": [
            {
                "type": "command",
                "command": command,
                "timeout": 1,
            }
        ]
    }
)

if os.path.exists(path):
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = f"{path}.backup-{stamp}"
    counter = 1
    while os.path.exists(backup):
        backup = f"{path}.backup-{stamp}-{counter}"
        counter += 1
    shutil.copy2(path, backup)
    print(f"Backed up existing hooks to {backup}")

descriptor, temporary = tempfile.mkstemp(prefix="hooks.", suffix=".tmp", dir=directory)
try:
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        json.dump(document, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
print(f"Merged LinguaLearn UserPromptSubmit hook into {path}")
PY
fi

echo "Installation files are ready. The installer did not launch the app."
if ${install_hook}; then
    echo "Open /hooks in Codex and trust the new user-level command hook."
fi
