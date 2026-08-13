#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run as root" >&2
  exit 1
fi

state=${1:-}
if [[ ! $state =~ ^/srv/migration-staging/dev-final-[0-9]{8}T[0-9]{6}Z/QUIESCED_COMPONENTS.tsv$ || ! -f $state ]]; then
  echo "Usage: $0 /srv/migration-staging/dev-final-.../QUIESCED_COMPONENTS.tsv" >&2
  exit 2
fi

user_systemctl() {
  runuser -u ubuntu -- env \
    XDG_RUNTIME_DIR=/run/user/1000 \
    DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
    systemctl --user "$@"
}

mapfile -t entries <"$state"
for ((index=${#entries[@]} - 1; index >= 0; index--)); do
  IFS=$'\t' read -r kind target <<<"${entries[$index]}"
  case "$kind" in
    system) systemctl start "$target" ;;
    user) user_systemctl start "$target" ;;
    docker) docker start "$target" ;;
    *) echo "Unknown component kind: $kind" >&2; exit 3 ;;
  esac
done

echo "Previously active components were restarted in reverse stop order."
