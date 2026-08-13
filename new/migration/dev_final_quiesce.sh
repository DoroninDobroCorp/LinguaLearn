#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run as root" >&2
  exit 1
fi

if [[ ${TEMP_RUSTDESK_CONFIRMED:-} != YES ]]; then
  echo "Refusing to stop writers: set TEMP_RUSTDESK_CONFIRMED=YES only after a brand-new client session through serverforvovka was tested." >&2
  exit 2
fi

final_id=${1:-}
if [[ ! $final_id =~ ^dev-final-[0-9]{8}T[0-9]{6}Z$ ]]; then
  echo "Usage: TEMP_RUSTDESK_CONFIRMED=YES $0 dev-final-YYYYMMDDTHHMMSSZ" >&2
  exit 3
fi

stage="/srv/migration-staging/$final_id"
state="$stage/QUIESCED_COMPONENTS.tsv"
install -d -m 0700 "$stage"
: >"$state"

user_systemctl() {
  runuser -u ubuntu -- env \
    XDG_RUNTIME_DIR=/run/user/1000 \
    DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
    systemctl --user "$@"
}

record_and_stop_system() {
  local unit=$1
  if systemctl is-active --quiet "$unit"; then
    printf 'system\t%s\n' "$unit" >>"$state"
    systemctl stop "$unit"
  fi
}

record_and_stop_user() {
  local unit=$1
  if user_systemctl is-active --quiet "$unit"; then
    printf 'user\t%s\n' "$unit" >>"$state"
    user_systemctl stop "$unit"
  fi
}

record_and_stop_container() {
  local container=$1
  if [[ $(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null || true) == true ]]; then
    printf 'docker\t%s\n' "$container" >>"$state"
    docker stop --time 30 "$container"
  fi
}

echo "Verifying temporary RustDesk on serverforvovka"
runuser -u ubuntu -- ssh -o BatchMode=yes -o ConnectTimeout=10 serverforvovka \
  "test \"\$(docker inspect -f '{{.State.Running}}' dev-migration-hbbs)\" = true && test \"\$(docker inspect -f '{{.State.Running}}' dev-migration-hbbr)\" = true"

{
  printf 'captured_at=%s\n' "$(date -u --iso-8601=seconds)"
  systemctl --failed --no-pager
  systemctl list-units --type=service --state=running --no-pager
  systemctl list-timers --all --no-pager
  ss -lntup
  docker ps --no-trunc
} >"$stage/PRE_QUIESCE_STATE.txt" 2>&1

echo "Stopping restart/watchdog timers"
for unit in \
  rustdesk-watchdog.timer \
  up-health-watchdog.timer \
  ps38-claude-autoupdate.timer; do
  record_and_stop_system "$unit"
done

for unit in \
  tunnel-19012-healthcheck.timer \
  tunnel-19012-notifier.timer; do
  record_and_stop_user "$unit"
done

echo "Stopping public ingress and application writers"
record_and_stop_system nginx.service

for unit in \
  ifriend-telegram.service \
  vesper-contact-relations.service \
  ouroboros.service \
  robinarb-betfair-sportsbook.service \
  robinarb.service \
  robinarb-bia-gateway.service \
  up-frontend.service \
  up-backend.service \
  forted-rust.service \
  forted-source.service \
  sofascore-results.service \
  ps38-claude-egress-bridge.service \
  ps38-claude-oauth-proxy.service \
  qwen-ollama-tunnel.service \
  xvfb.service; do
  record_and_stop_system "$unit"
done

for unit in \
  factory-droid-remote.service \
  pin888-tcp-unix-proxy.service; do
  record_and_stop_user "$unit"
done

echo "Stopping old RustDesk only after temporary RustDesk confirmation"
record_and_stop_container hbbs
record_and_stop_container hbbr

echo "Stopping Tailscale last so its identity file is stable"
record_and_stop_system tailscaled.service

{
  printf 'captured_at=%s\n' "$(date -u --iso-8601=seconds)"
  printf '\n--- deliberately left running ---\n'
  systemctl is-active ssh.service docker.service postgresql@17-main.service || true
  printf '\n--- stopped-state verification ---\n'
  while IFS=$'\t' read -r kind target; do
    case "$kind" in
      system) printf '%s\t%s\t' "$kind" "$target"; systemctl is-active "$target" || true ;;
      user) printf '%s\t%s\t' "$kind" "$target"; user_systemctl is-active "$target" || true ;;
      docker) printf '%s\t%s\t' "$kind" "$target"; docker inspect -f '{{.State.Running}}' "$target" || true ;;
    esac
  done <"$state"
  printf '\n--- remaining listeners ---\n'
  ss -lntup
} >"$stage/POST_QUIESCE_STATE.txt" 2>&1

echo "quiesced_at=$(date -u --iso-8601=seconds)" >"$stage/QUIESCED"
echo "Writers quiesced. PostgreSQL, Docker daemon and SSH deliberately remain available for final backup."
echo "State file: $state"
