#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run as root" >&2
  exit 1
fi

migration_id=${1:-}
if [[ ! $migration_id =~ ^dev-[0-9]{8}T[0-9]{6}Z$ ]]; then
  echo "Usage: $0 dev-YYYYMMDDTHHMMSSZ" >&2
  exit 2
fi

stage="/srv/migration-staging/${migration_id}-ps38-supplement"
payload_root="$stage/payload"
manifest_dir="$stage/manifests"
archive_zst="/srv/migration-staging/${migration_id}-ps38-supplement.tar.zst"
archive_age="/srv/migration-staging/${migration_id}-ps38-supplement.tar.age"

recipient_file=/srv/migration-staging/AGE_RECIPIENT.txt
if [[ ! -s $recipient_file ]]; then
  recipient_file="/srv/migration-staging/$migration_id/AGE_RECIPIENT.txt"
fi
if [[ ! -s $recipient_file ]]; then
  echo "age recipient file is missing" >&2
  exit 3
fi
age_recipient=$(tr -d '\r\n' <"$recipient_file")
if [[ $age_recipient != age1* ]]; then
  echo "invalid age recipient" >&2
  exit 4
fi

current_release=$(readlink -f /srv/ps38-claude/current)
case "$current_release" in
  /srv/ps38-claude/releases/*) ;;
  *) echo "unsafe PS38 current release: $current_release" >&2; exit 5 ;;
esac
current_release_rel=${current_release#/}

install -d -m 0700 "$stage" "$payload_root/var/lib/ps38-claude" "$manifest_dir"
exec > >(tee -a "$stage/backup.log") 2>&1

echo "PS38 supplement started: $(date -u --iso-8601=seconds)"
echo "migration id: $migration_id"
echo "current release: $current_release"

echo "creating a transactionally consistent proxy DB copy"
python3 - "$payload_root/var/lib/ps38-claude/ai-queue.db" <<'PY'
import sqlite3
import sys

source = sqlite3.connect("file:/var/lib/ps38-claude/ai-queue.db?mode=ro", uri=True)
target = sqlite3.connect(sys.argv[1])
with target:
    source.backup(target)
result = target.execute("PRAGMA integrity_check").fetchone()[0]
if result != "ok":
    raise SystemExit(f"SQLite integrity check failed: {result}")
target.close()
source.close()
PY
chown ubuntu:ubuntu "$payload_root/var/lib/ps38-claude/ai-queue.db"
chmod 0600 "$payload_root/var/lib/ps38-claude/ai-queue.db"

{
  printf 'captured_at=%s\n' "$(date -u --iso-8601=seconds)"
  printf 'current_release=%s\n' "$current_release"
  printf '\n--- services ---\n'
  systemctl show \
    ps38-claude-oauth-proxy.service \
    ps38-claude-egress-bridge.service \
    ps38-claude-autoupdate.service \
    ps38-claude-autoupdate.timer \
    -p Id -p ActiveState -p SubState -p UnitFileState -p ExecMainStatus --no-pager
  printf '\n--- user tunnel ---\n'
  runuser -u ubuntu -- env \
    XDG_RUNTIME_DIR=/run/user/1000 \
    DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
    systemctl --user show pin888-tcp-unix-proxy.service \
    -p ActiveState -p SubState -p UnitFileState -p FragmentPath --no-pager
  printf '\n--- listeners ---\n'
  ss -lnt | grep -E '127\.0\.0\.1:(19011|19012|19013|19100)' || true
  printf '\n--- Claude version as canonical owner ---\n'
  runuser -u ubuntu -- /usr/local/bin/claude --version
  printf '\n--- Claude version through teamlead allowed path ---\n'
  runuser -u teamlead -- sudo -n -u ubuntu -H /usr/local/bin/claude --version
  printf '\n--- bridge health ---\n'
  curl -fsS http://127.0.0.1:19011/health
  printf '\n--- gateway health with required provider contract ---\n'
  curl -fsS \
    -H 'X-AI-Provider: subscription@ps38-dev' \
    -H 'anthropic-api-key: oauth-proxy' \
    http://127.0.0.1:19012/health
  printf '\n'
} >"$manifest_dir/RUNTIME_AND_HEALTH.txt" 2>&1

{
  printf '%s\n' 'Proxy DB report (credentials and endpoint deliberately omitted)'
  python3 - "$payload_root/var/lib/ps38-claude/ai-queue.db" <<'PY'
import sqlite3
import sys

db = sqlite3.connect(sys.argv[1])
print("integrity=" + db.execute("PRAGMA integrity_check").fetchone()[0])
print("proxy_rows=" + str(db.execute("SELECT count(*) FROM proxy_pool").fetchone()[0]))
print("binding_rows=" + str(db.execute("SELECT count(*) FROM account_proxy").fetchone()[0]))
for row in db.execute(
    "SELECT ap.login, ap.backend, p.protocol, p.status, p.health_status, p.expires_at "
    "FROM account_proxy ap JOIN proxy_pool p ON p.id = ap.proxy_id ORDER BY ap.login, ap.backend"
):
    print("binding=" + " | ".join("" if value is None else str(value) for value in row))
db.close()
PY
} >"$manifest_dir/PROXY_DB_NON_SECRET.txt" 2>&1

systemctl cat \
  ps38-claude-oauth-proxy.service \
  ps38-claude-egress-bridge.service \
  ps38-claude-autoupdate.service \
  ps38-claude-autoupdate.timer \
  >"$manifest_dir/SYSTEM_UNITS.txt" 2>&1 || true
runuser -u ubuntu -- env \
  XDG_RUNTIME_DIR=/run/user/1000 \
  DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
  systemctl --user cat pin888-tcp-unix-proxy.service \
  >"$manifest_dir/USER_TUNNEL_UNIT.txt" 2>&1 || true

{
  printf '%s\n' '--- selected path metadata ---'
  stat -c '%A %U:%G %s %n' \
    /usr/local/bin/claude \
    /home/ubuntu/.config/ps38-claude/oauth-token \
    /etc/claude-code/managed-settings.json \
    "$payload_root/var/lib/ps38-claude/ai-queue.db"
  printf '%s\n' '--- release manifest and executable hashes ---'
  find "$current_release" -maxdepth 2 -type f \
    \( -name 'manifest*' -o -name 'claude' -o -path '*/bin/*' \) \
    -print0 | sort -z | xargs -0 sha256sum
  printf '%s\n' '--- account decision evidence ---'
  getent passwd ubuntu teamlead evguslev
  getent group robinarb
  printf 'evguslev_home_bytes='; du -sb /home/evguslev | awk '{print $1}'
  printf 'evguslev_active_processes='; (ps -u evguslev --no-headers || true) | wc -l
  printf 'evguslev_owned_selected_paths='; (find /srv /etc /var/lib /usr/local -xdev -user evguslev -print 2>/dev/null || true) | wc -l
} >"$manifest_dir/METADATA_AND_HASHES.txt" 2>&1

paths=(
  "$current_release_rel"
  srv/ps38-claude/bin
  srv/ps38-claude/current
  opt/ps38-claude
  home/ubuntu/.config/ps38-claude
  home/ubuntu/.claude
  home/ubuntu/.ssh
  home/ubuntu/.config/systemd/user/pin888-tcp-unix-proxy.service
  home/evguslev/.gitconfig
  home/evguslev/.ssh
  usr/local/bin/claude
  usr/local/libexec/ps38_claude_autoupdate.py
  usr/local/libexec/ps38_claude_probe.py
  etc/claude-code
  etc/systemd/system/ps38-claude-oauth-proxy.service
  etc/systemd/system/ps38-claude-egress-bridge.service
  etc/systemd/system/ps38-claude-autoupdate.service
  etc/systemd/system/ps38-claude-autoupdate.timer
  etc/sudoers.d/teamlead
  etc/sudoers.d/evguslev-robinarb
)

existing=()
for path in "${paths[@]}"; do
  [[ -e "/$path" || -L "/$path" ]] && existing+=("$path")
done

echo "building compressed supplement"
set +e
tar --acls --xattrs --numeric-owner --one-file-system \
  -C / -cf - "${existing[@]}" \
  -C "$payload_root" var/lib/ps38-claude/ai-queue.db \
  -C "$stage" manifests backup.log \
  | zstd -T0 -9 -f -o "$archive_zst"
pipe_status=("${PIPESTATUS[@]}")
set -e
if ((pipe_status[1] != 0 || pipe_status[0] > 1)); then
  echo "archive failed: tar=${pipe_status[0]} zstd=${pipe_status[1]}" >&2
  exit 6
fi
chmod 0600 "$archive_zst"
zstd -t "$archive_zst"

echo "encrypting supplement"
age -r "$age_recipient" -o "$archive_age" "$archive_zst"
chmod 0600 "$archive_age"
sha256sum "$archive_age" | tee "$archive_age.sha256"
chmod 0600 "$archive_age.sha256"

echo "PS38 supplement complete: $(date -u --iso-8601=seconds)"
ls -lh "$archive_zst" "$archive_age" "$archive_age.sha256"
