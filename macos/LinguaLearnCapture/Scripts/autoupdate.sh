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

target_app="${HOME}/Applications/LinguaLearnCapture.app"
log_dir="${HOME}/Library/Logs/LinguaLearnCapture"
/bin/mkdir -p "${log_dir}"
log_file="${log_dir}/autoupdate.log"

log() {
    local stamp
    stamp="$(/bin/date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo "[${stamp}] $*" | /usr/bin/tee -a "${log_file}"
}

if [[ ! -d "${target_app}" ]]; then
    log "Installed app not found at ${target_app}. Skipping auto-update."
    exit 0
fi

info_plist="${target_app}/Contents/Info.plist"
if [[ ! -f "${info_plist}" ]]; then
    log "Info.plist not found in ${target_app}. Skipping auto-update."
    exit 0
fi

local_version="$(/usr/bin/plutil -extract CFBundleShortVersionString raw "${info_plist}" 2>/dev/null || echo "0.0.0")"
local_build="$(/usr/bin/plutil -extract CFBundleVersion raw "${info_plist}" 2>/dev/null || echo "0")"
appcast_url="$(/usr/bin/plutil -extract SUFeedURL raw "${info_plist}" 2>/dev/null || echo "https://145.239.82.124.sslip.io/english/mac-appcast.xml")"
public_ed_key="$(/usr/bin/plutil -extract SUPublicEDKey raw "${info_plist}" 2>/dev/null || echo "")"

log "Checking for updates at ${appcast_url} (installed: v${local_version} build ${local_build})..."

tmp_dir="$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/lingualearn-autoupdate.XXXXXX")"
trap '/bin/rm -rf -- "${tmp_dir}"' EXIT

appcast_xml="${tmp_dir}/appcast.xml"
if ! /usr/bin/curl -sSfL --connect-timeout 10 --max-time 30 "${appcast_url}" -o "${appcast_xml}" 2>/dev/null; then
    log "Could not reach update server. Will check again in 3 hours."
    exit 0
fi

# Parse remote version and enclosure from appcast
parsed_data="$(/usr/bin/python3 - "${appcast_xml}" <<'PY'
import sys
import xml.etree.ElementTree as ET

try:
    tree = ET.parse(sys.argv[1])
    root = tree.getroot()
    channel = root.find("channel")
    if channel is None:
        sys.exit(1)
    item = channel.find("item")
    if item is None:
        sys.exit(1)

    ns = {"sparkle": "http://www.sparkle-project.org/Sparkle/1.0"}
    version_elem = item.find("sparkle:shortVersionString", ns)
    if version_elem is None:
        version_elem = item.find("sparkle:version", ns)
    remote_version = version_elem.text.strip() if version_elem is not None and version_elem.text else "0.0.0"

    build_elem = item.find("sparkle:version", ns)
    remote_build = build_elem.text.strip() if build_elem is not None and build_elem.text else "0"

    enclosure = item.find("enclosure")
    url = enclosure.get("url", "") if enclosure is not None else ""
    length = enclosure.get("length", "0") if enclosure is not None else "0"
    sig = enclosure.get("{http://www.sparkle-project.org/Sparkle/1.0}edSignature", "") if enclosure is not None else ""

    print(f"{remote_version}\t{remote_build}\t{url}\t{length}\t{sig}")
except Exception as e:
    sys.exit(1)
PY
)" || {
    log "Failed to parse appcast XML. Will retry in 3 hours."
    exit 0
}

IFS=$'\t' read -r remote_version remote_build enclosure_url enclosure_length enclosure_sig <<< "${parsed_data}"

if [[ -z "${remote_version}" || -z "${enclosure_url}" ]]; then
    log "Invalid update metadata in appcast. Skipping."
    exit 0
fi

# Version comparison in python
needs_update="$(/usr/bin/python3 - "${local_version}" "${local_build}" "${remote_version}" "${remote_build}" <<'PY'
import sys

def parse_v(v):
    parts = []
    for part in v.replace("-", ".").split("."):
        try:
            parts.append(int(part))
        except ValueError:
            parts.append(0)
    return tuple(parts)

local_v_str, local_b_str, remote_v_str, remote_b_str = sys.argv[1:]
local_v = parse_v(local_v_str)
remote_v = parse_v(remote_v_str)

try:
    local_b = int(local_b_str)
except ValueError:
    local_b = 0

try:
    remote_b = int(remote_b_str)
except ValueError:
    remote_b = 0

if remote_v > local_v:
    print("yes")
elif remote_v == local_v and remote_b > local_b:
    print("yes")
else:
    print("no")
PY
)"

if [[ "${needs_update}" != "yes" ]]; then
    log "LinguaLearn Capture is up to date (current: v${local_version} (${local_build}), server: v${remote_version} (${remote_build}))."
    exit 0
fi

log "New version available: v${remote_version} (build ${remote_build})! Downloading ${enclosure_url}..."

zip_file="${tmp_dir}/update.zip"
if ! /usr/bin/curl -sSfL --connect-timeout 15 --max-time 120 "${enclosure_url}" -o "${zip_file}"; then
    log "ERROR: Download failed for ${enclosure_url}."
    exit 1
fi

# Verify signature if public key is present
if [[ -n "${public_ed_key}" && -n "${enclosure_sig}" ]]; then
    log "Verifying Ed25519 signature of downloaded update package..."
    sig_ok="$(/usr/bin/swift - "${zip_file}" "${public_ed_key}" "${enclosure_sig}" <<'SWIFT'
import CryptoKit
import Foundation

guard CommandLine.arguments.count > 3 else { exit(1) }
let zipPath = CommandLine.arguments[1]
let pubKeyB64 = CommandLine.arguments[2]
let sigB64 = CommandLine.arguments[3]

guard let pubKeyData = Data(base64Encoded: pubKeyB64),
      let sigData = Data(base64Encoded: sigB64),
      let publicKey = try? Curve25519.Signing.PublicKey(rawRepresentation: pubKeyData),
      let signature = try? Curve25519.Signing.PublicKey.Signature(rawRepresentation: sigData),
      let archiveData = try? Data(contentsOf: URL(fileURLWithPath: zipPath)) else {
    exit(1)
}

if publicKey.isValidSignature(signature, for: archiveData) {
    print("valid")
} else {
    print("invalid")
}
SWIFT
)"
    if [[ "${sig_ok}" != "valid" ]]; then
        log "ERROR: Signature verification failed for update package. Aborting update."
        exit 1
    fi
    log "Signature verified successfully."
fi

# Unpack downloaded update
extract_dir="${tmp_dir}/extracted"
/bin/mkdir -p "${extract_dir}"
/usr/bin/unzip -q "${zip_file}" -d "${extract_dir}"

new_app="${extract_dir}/LinguaLearnCapture.app"
if [[ ! -d "${new_app}" ]]; then
    # Search for .app inside subdirectories
    found_app="$(/usr/bin/find "${extract_dir}" -maxdepth 2 -name "LinguaLearnCapture.app" -type d | /usr/bin/head -n 1)"
    if [[ -n "${found_app}" && -d "${found_app}" ]]; then
        new_app="${found_app}"
    else
        log "ERROR: LinguaLearnCapture.app not found in update archive."
        exit 1
    fi
fi

log "Applying update using update-installed.sh..."
"${package_root}/Scripts/update-installed.sh" "${new_app}"

log "Auto-update succeeded: LinguaLearn Capture updated to v${remote_version} (build ${remote_build})!"
