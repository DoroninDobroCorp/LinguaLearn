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
    if [[ -n "${app_url}" ]]; then
        public_health_url="${app_url%/}/api/health"
        public_health="$(/usr/bin/curl --silent --max-time 5 "${public_health_url}" 2>/dev/null || true)"
        if /bin/echo "${public_health}" | /usr/bin/jq -e '.status == "healthy"' >/dev/null 2>&1; then
            pass_check "Production English API healthy: ${public_health_url}"
        else
            fail_check "Production English API health не подтверждён: ${public_health_url}"
        fi
    fi
fi

/bin/echo
if [[ "${errors}" -gt 0 ]]; then
    /bin/echo "ИТОГ: ${errors} автоматических ошибок; сначала исправить их. Ручных действий: ${manual_actions}."
    exit 1
fi

/bin/echo "ИТОГ: автоматическая часть здорова. Остаётся ручных security/test действий: ${manual_actions}."
/bin/echo "Следуйте LINGUALEARN_MANUAL_FINISH_RU.md в корне репозитория."
