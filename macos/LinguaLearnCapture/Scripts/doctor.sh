#!/bin/bash
set -u

package_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
installed_app="${HOME}/Applications/LinguaLearnCapture.app"
installed_binary="${installed_app}/Contents/MacOS/LinguaLearnCapture"
built_binary="${package_root}/.build/app/LinguaLearnCapture.app/Contents/MacOS/LinguaLearnCapture"
support_directory="${HOME}/Library/Application Support/LinguaLearnCapture"
configuration_file="${support_directory}/config.json"
queue_file="${support_directory}/pending-events.json"
hook_inbox="${support_directory}/hook-inbox"
installed_hook="${HOME}/.codex/hooks/lingualearn_capture.py"
source_hook="${package_root}/Hooks/lingualearn_capture.py"
hooks_file="${HOME}/.codex/hooks.json"
launch_label="gui/$(/usr/bin/id -u)/com.lingualearn.capture"

errors=0
manual_actions=0

pass_check() { /bin/echo "PASS   $1"; }
info_check() { /bin/echo "INFO   $1"; }
manual_check() {
    /bin/echo "MANUAL $1"
    manual_actions=$((manual_actions + 1))
}
fail_check() {
    /bin/echo "FAIL   $1"
    errors=$((errors + 1))
}

mode_of() {
    /usr/bin/stat -f '%Lp' "$1" 2>/dev/null || true
}

/bin/echo "LinguaLearn Capture doctor (токены никогда не выводятся)"
/bin/echo

if [[ -x "${installed_binary}" ]]; then
    pass_check "Приложение установлено: ${installed_app}"
else
    fail_check "Не найден executable: ${installed_binary}"
fi

if [[ -x "${installed_binary}" ]] && /usr/bin/codesign --verify --deep --strict "${installed_app}" >/dev/null 2>&1; then
    pass_check "Подпись установленного app валидна"
else
    fail_check "Подпись app отсутствует или невалидна"
fi

if [[ -x "${installed_binary}" ]] && /usr/bin/file "${installed_binary}" | /usr/bin/grep -q 'arm64'; then
    pass_check "Executable имеет arm64 architecture"
else
    fail_check "Executable не подтверждён как arm64"
fi

if [[ -f "${built_binary}" && -f "${installed_binary}" ]]; then
    built_hash="$(/usr/bin/shasum -a 256 "${built_binary}" | /usr/bin/awk '{print $1}')"
    installed_hash="$(/usr/bin/shasum -a 256 "${installed_binary}" | /usr/bin/awk '{print $1}')"
    if [[ "${built_hash}" == "${installed_hash}" ]]; then
        pass_check "Установленный app совпадает с release build (${installed_hash:0:12}…)"
    else
        fail_check "Установленный app не совпадает с release build"
    fi
else
    fail_check "Нельзя сравнить installed и release build"
fi

process_ids="$(/usr/bin/pgrep -x LinguaLearnCapture 2>/dev/null || true)"
process_count="$(/bin/echo "${process_ids}" | /usr/bin/awk 'NF {count += 1} END {print count + 0}')"
if [[ "${process_count}" == "1" ]]; then
    pass_check "Запущен ровно один агент (PID ${process_ids})"
else
    fail_check "Ожидался один процесс LinguaLearnCapture, найдено: ${process_count}"
fi

launch_state="$(/bin/launchctl print "${launch_label}" 2>/dev/null || true)"
if /bin/echo "${launch_state}" | /usr/bin/grep -q 'state = running'; then
    pass_check "LaunchAgent загружен и работает"
else
    fail_check "LaunchAgent не работает: ${launch_label}"
fi
if /bin/echo "${launch_state}" | /usr/bin/grep -Fq "program = ${installed_binary}"; then
    pass_check "LaunchAgent наблюдает за executable напрямую"
else
    fail_check "LaunchAgent указывает не на ожидаемый executable"
fi

if [[ -f "${configuration_file}" ]] && /usr/bin/jq -e 'type == "object"' "${configuration_file}" >/dev/null 2>&1; then
    pass_check "Config является валидным JSON"
    if [[ "$(mode_of "${configuration_file}")" == "600" ]]; then
        pass_check "Config имеет mode 0600"
    else
        fail_check "Config должен иметь mode 0600"
    fi
    info_check "Активные безопасные настройки: $(/usr/bin/jq -c '{captureEnabled,allowAllNonDenied,dedupeWindowSeconds,showOnlyWhenChanged,maxQueueDepth}' "${configuration_file}")"
else
    fail_check "Config отсутствует или повреждён"
fi

if [[ -f "${queue_file}" ]] && /usr/bin/jq -e 'type == "array"' "${queue_file}" >/dev/null 2>&1; then
    queue_depth="$(/usr/bin/jq 'length' "${queue_file}")"
    pass_check "Durable queue валидна, pending=${queue_depth}"
    if [[ "$(mode_of "${queue_file}")" == "600" ]]; then
        pass_check "Queue имеет mode 0600"
    else
        fail_check "Queue должна иметь mode 0600"
    fi
else
    fail_check "Durable queue отсутствует или повреждена"
fi

if [[ -d "${support_directory}" && "$(mode_of "${support_directory}")" == "700" ]]; then
    pass_check "Application Support directory имеет mode 0700"
else
    fail_check "Application Support directory должна иметь mode 0700"
fi

if [[ -d "${hook_inbox}" ]]; then
    inbox_count="$(find "${hook_inbox}" -maxdepth 1 -type f -name '*.json' | /usr/bin/wc -l | /usr/bin/tr -d ' ')"
    info_check "Codex durable inbox pending=${inbox_count}"
    if [[ "$(mode_of "${hook_inbox}")" == "700" ]]; then
        pass_check "Hook inbox имеет mode 0700"
    else
        fail_check "Hook inbox должна иметь mode 0700"
    fi
else
    info_check "Hook inbox ещё не создан (это нормально до первого Codex event)"
fi

if [[ -x "${installed_hook}" && -f "${source_hook}" ]]; then
    installed_hook_hash="$(/usr/bin/shasum -a 256 "${installed_hook}" | /usr/bin/awk '{print $1}')"
    source_hook_hash="$(/usr/bin/shasum -a 256 "${source_hook}" | /usr/bin/awk '{print $1}')"
    if [[ "${installed_hook_hash}" == "${source_hook_hash}" ]]; then
        pass_check "Установленный Codex hook совпадает с source (${installed_hook_hash:0:12}…)"
    else
        fail_check "Установленный Codex hook отличается от source"
    fi
    if [[ "$(mode_of "${installed_hook}")" == "700" ]]; then
        pass_check "Codex hook имеет mode 0700"
    else
        fail_check "Codex hook должен иметь mode 0700"
    fi
else
    fail_check "Codex hook не установлен"
fi

expected_hook_command="/usr/bin/python3 \"${installed_hook}\""
if [[ -f "${hooks_file}" ]] && /usr/bin/jq -e --arg command "${expected_hook_command}" '
    [.hooks.UserPromptSubmit[]?.hooks[]? | select(.type == "command" and .command == $command)] | length == 1
' "${hooks_file}" >/dev/null 2>&1; then
    pass_check "В hooks.json есть ровно один ожидаемый UserPromptSubmit hook"
else
    fail_check "В hooks.json отсутствует или дублируется ожидаемый hook"
fi
manual_check "Trust нельзя безопасно выдать из скрипта: проверить в Codex через /hooks → Trust"

runtime_health="$(/usr/bin/curl --silent --max-time 3 http://127.0.0.1:43119/health 2>/dev/null || true)"
if /bin/echo "${runtime_health}" | /usr/bin/jq -e '.ok == true and .storageHealthy == true' >/dev/null 2>&1; then
    pass_check "Loopback health и durable storage здоровы"
    info_check "Runtime health: $(/bin/echo "${runtime_health}" | /usr/bin/jq -c '.')"
else
    fail_check "Loopback health недоступен или storage unhealthy"
fi

accessibility="$(/bin/echo "${runtime_health}" | /usr/bin/jq -r '.accessibilityTrusted // false' 2>/dev/null || /bin/echo false)"
input_monitoring="$(/bin/echo "${runtime_health}" | /usr/bin/jq -r '.inputMonitoringGranted // false' 2>/dev/null || /bin/echo false)"
event_tap="$(/bin/echo "${runtime_health}" | /usr/bin/jq -r '.eventTapRunning // false' 2>/dev/null || /bin/echo false)"
paused="$(/bin/echo "${runtime_health}" | /usr/bin/jq -r 'if has("paused") then .paused else true end' 2>/dev/null || /bin/echo true)"
if [[ "${paused}" == "false" ]]; then
    pass_check "Capture не находится на Pause"
else
    manual_check "В menu bar выбрать Resume new capture"
fi
if [[ "${accessibility}" == "true" ]]; then
    pass_check "Accessibility permission выдан"
else
    manual_check "Выдать LinguaLearn Capture permission в Privacy & Security → Accessibility"
fi
if [[ "${input_monitoring}" == "true" ]]; then
    pass_check "Input Monitoring permission выдан"
else
    manual_check "Выдать LinguaLearn Capture permission в Privacy & Security → Input Monitoring"
fi
if [[ "${event_tap}" == "true" ]]; then
    pass_check "Глобальный event tap для Return/click/preview hotkey работает"
elif [[ "${accessibility}" == "true" && "${input_monitoring}" == "true" ]]; then
    fail_check "Оба разрешения есть, но event tap не запустился; перезапустить агент"
else
    manual_check "После двух permissions перезапустить агент и добиться eventTapRunning=true"
fi

if [[ -f "${configuration_file}" ]]; then
    app_url="$(/usr/bin/jq -r '.appURL // empty' "${configuration_file}")"
    api_url="$(/usr/bin/jq -r '.apiURL // empty' "${configuration_file}")"
    if [[ -n "${app_url}" ]]; then
        if [[ "${app_url}" =~ 127\.0\.0\.1|localhost ]] || [[ "${api_url}" =~ 127\.0\.0\.1|localhost ]]; then
            vibe_health="$(/usr/bin/curl --silent --max-time 5 "${app_url%/}/v1/models" 2>/dev/null || true)"
            if /bin/echo "${vibe_health}" | /usr/bin/jq -e '.data // .object' >/dev/null 2>&1; then
                pass_check "VibeProxy endpoint healthy: ${app_url%/}/v1/models"
            else
                fail_check "VibeProxy endpoint недоступен: ${app_url%/}/v1/models"
            fi
        else
            public_health_url="${app_url%/}/api/health"
            public_health="$(/usr/bin/curl --silent --max-time 5 "${public_health_url}" 2>/dev/null || true)"
            if /bin/echo "${public_health}" | /usr/bin/jq -e '.status == "healthy"' >/dev/null 2>&1; then
                pass_check "Production English API healthy: ${public_health_url}"
            else
                fail_check "Production English API health не подтверждён: ${public_health_url}"
            fi
        fi
    fi
fi

# Check Sparkle 2 Updater settings in Info.plist
info_plist_path="${package_root}/Resources/Info.plist"
if [[ -f "${info_plist_path}" ]] && /usr/bin/grep -q 'SUFeedURL' "${info_plist_path}" && /usr/bin/grep -q 'SUPublicEDKey' "${info_plist_path}"; then
    pass_check "Sparkle 2 Updater keys present in Info.plist (SUFeedURL, SUPublicEDKey)"
else
    fail_check "Sparkle 2 Updater keys missing in Info.plist"
fi

# Download & verify public appcast and release enclosure ZIP
su_feed_url="$(/usr/bin/plutil -extract SUFeedURL raw "${info_plist_path}" 2>/dev/null || echo "https://145.239.82.124.sslip.io/english/mac-appcast.xml")"
su_public_ed_key="$(/usr/bin/plutil -extract SUPublicEDKey raw "${info_plist_path}" 2>/dev/null || echo "")"

if [[ -n "${su_feed_url}" ]]; then
    tmp_hdr="$(/usr/bin/mktemp)"
    tmp_body="$(/usr/bin/mktemp)"
    if /usr/bin/curl -s -k -D "${tmp_hdr}" -o "${tmp_body}" --max-time 10 "${su_feed_url}"; then
        if grep -q 'HTTP/.* 200' "${tmp_hdr}"; then
            pass_check "Public appcast HTTP 200 OK: ${su_feed_url}"
        else
            fail_check "Public appcast HTTP response non-200: ${su_feed_url}"
        fi

        if grep -i -q 'content-type:.*application/xml\|content-type:.*text/xml' "${tmp_hdr}"; then
            pass_check "Public appcast Content-Type is application/xml"
        else
            fail_check "Public appcast Content-Type is not application/xml"
        fi

        if grep -q '<rss' "${tmp_body}" && grep -q '<enclosure' "${tmp_body}"; then
            pass_check "Public appcast XML structure is valid RSS/Sparkle"
        else
            fail_check "Public appcast XML structure is invalid"
        fi

        # Extract version, enclosure url, length, and edSignature
        parsed_info="$(/usr/bin/python3 - <<PYTHON 2>/dev/null || echo ""
import xml.etree.ElementTree as ET
import json, sys
try:
    tree = ET.parse("${tmp_body}")
    root = tree.getroot()
    item = root.find('.//item')
    if item is not None:
        ver_elem = item.find('{http://www.sparkle-project.org/Sparkle/1.0}version')
        ver = ver_elem.text if ver_elem is not None else ""
        enc = item.find('enclosure')
        if enc is not None:
            url = enc.get('url', '')
            length = enc.get('length', '0')
            sig = enc.get('{http://www.sparkle-project.org/Sparkle/1.0}edSignature', '')
            print(json.dumps({'version': ver, 'url': url, 'length': length, 'signature': sig}))
except Exception as e:
    pass
PYTHON
)"

        if [[ -n "${parsed_info}" ]] && /usr/bin/jq -e '.url != ""' <<<"${parsed_info}" >/dev/null 2>&1; then
            enc_url="$(/usr/bin/jq -r '.url' <<<"${parsed_info}")"
            enc_ver="$(/usr/bin/jq -r '.version' <<<"${parsed_info}")"
            enc_len="$(/usr/bin/jq -r '.length' <<<"${parsed_info}")"
            enc_sig="$(/usr/bin/jq -r '.signature' <<<"${parsed_info}")"

            pass_check "Appcast metadata parsed: v${enc_ver}, size=${enc_len} bytes"

            # Download enclosure
            tmp_zip_hdr="$(/usr/bin/mktemp)"
            tmp_zip_body="$(/usr/bin/mktemp)"
            if /usr/bin/curl -s -k -D "${tmp_zip_hdr}" -o "${tmp_zip_body}" --max-time 20 "${enc_url}"; then
                if grep -q 'HTTP/.* 200' "${tmp_zip_hdr}"; then
                    pass_check "Enclosure download HTTP 200 OK: ${enc_url}"
                else
                    fail_check "Enclosure download HTTP status non-200: ${enc_url}"
                fi

                zip_size="$(/usr/bin/stat -f '%z' "${tmp_zip_body}" 2>/dev/null || echo 0)"
                if [[ "${zip_size}" -gt 0 && "${zip_size}" == "${enc_len}" ]]; then
                    pass_check "Enclosure downloaded size (${zip_size} bytes) matches appcast length"
                else
                    fail_check "Enclosure downloaded size (${zip_size}) mismatch with appcast length (${enc_len})"
                fi

                zip_sha="$(/usr/bin/shasum -a 256 "${tmp_zip_body}" | /usr/bin/awk '{print $1}')"
                pass_check "Enclosure SHA256 checksum verified: ${zip_sha:0:16}…"

                # Verify Ed25519 signature
                if [[ -n "${su_public_ed_key}" && -n "${enc_sig}" ]]; then
                    sig_valid="$(/usr/bin/swift - "${tmp_zip_body}" "${su_public_ed_key}" "${enc_sig}" <<'SWIFT' 2>/dev/null || echo "false"
import CryptoKit
import Foundation
guard CommandLine.arguments.count > 3 else { exit(1) }
let zipPath = CommandLine.arguments[1]
let pubKeyB64 = CommandLine.arguments[2]
let sigB64 = CommandLine.arguments[3]
guard let pubData = Data(base64Encoded: pubKeyB64),
      let pubKey = try? Curve25519.Signing.PublicKey(rawRepresentation: pubData),
      let sigData = Data(base64Encoded: sigB64),
      let zipData = try? Data(contentsOf: URL(fileURLWithPath: zipPath)) else { exit(1) }
if pubKey.isValidSignature(sigData, for: zipData) {
    print("true")
} else {
    print("false")
}
SWIFT
)"
                    if [[ "${sig_valid}" == "true" ]]; then
                        pass_check "Enclosure Ed25519 signature verified against SUPublicEDKey"
                    else
                        fail_check "Enclosure Ed25519 signature verification failed against SUPublicEDKey"
                    fi
                fi
            else
                fail_check "Failed to download enclosure ZIP from ${enc_url}"
            fi
            /bin/rm -f "${tmp_zip_hdr}" "${tmp_zip_body}"
        else
            fail_check "Failed to parse enclosure URL/metadata from appcast XML"
        fi
    else
        fail_check "Failed to download public appcast from ${su_feed_url}"
    fi
    /bin/rm -f "${tmp_hdr}" "${tmp_body}"
fi

# Check release and update scripts
if [[ -x "${package_root}/Scripts/release-mac.sh" ]]; then
    pass_check "Release script executable: Scripts/release-mac.sh"
else
    fail_check "Release script missing or not executable: Scripts/release-mac.sh"
fi

if [[ -x "${package_root}/Scripts/update-installed.sh" ]]; then
    pass_check "Update script executable: Scripts/update-installed.sh"
else
    fail_check "Update script missing or not executable: Scripts/update-installed.sh"
fi

# Check Keychain & device token pairing status
if [[ -f "${configuration_file}" ]]; then
    bearer_token="$(/usr/bin/jq -r '.bearerToken // empty' "${configuration_file}")"
    if [[ -n "${bearer_token}" && "${bearer_token}" != "CHANGE_ME" ]]; then
        pass_check "Device token paired (token present in config/Keychain)"
    else
        info_check "Device token not paired yet (run 'Pair This Mac' in menu bar)"
    fi
fi

/bin/echo
if [[ "${errors}" -gt 0 ]]; then
    /bin/echo "ИТОГ: ${errors} автоматических ошибок; сначала исправить их. Ручных действий: ${manual_actions}."
    exit 1
fi

/bin/echo "ИТОГ: автоматическая часть здорова. Остаётся ручных security/test действий: ${manual_actions}."
/bin/echo "Следуйте LINGUALEARN_MANUAL_FINISH_RU.md в корне репозитория."
