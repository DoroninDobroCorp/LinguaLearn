#!/bin/sh
set -eu

fail() {
    echo "no_api_runtime_guard=fail reason=$1" >&2
    exit 1
}

for unit in pncl.service pncl-live-fallback.service pncl-line-watchdog.timer; do
    if systemctl is-active --quiet "$unit"; then
        fail "legacy_unit_active:$unit"
    fi
    if systemctl is-enabled --quiet "$unit"; then
        fail "legacy_unit_enabled:$unit"
    fi
done

if pgrep -f '/srv/sharpbook/app/pncl-api|aggregator-pinnacle-api|pinnacle_api_(client|source)' >/dev/null 2>&1; then
    fail "legacy_api_process_detected"
fi

if grep -Eiq '^[[:space:]]*MSP_PINNACLE_API_[A-Z0-9_]*[[:space:]]*=[[:space:]]*(1|true|yes)[[:space:]]*$' \
    /srv/ps38-aggregator/env/ps38-aggregator.env \
    /home/admin805/.secrets/pin888_fleet.env 2>/dev/null; then
    fail "api_environment_enabled"
fi

if grep -Eiq 'pinnacle_api|PINNACLE_API|PinnacleApi' \
    /srv/ps38-aggregator/current/aggregator/main.py; then
    fail "api_startup_code_present"
fi

echo "no_api_runtime_guard=ok"
