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

stage="/srv/migration-staging/$migration_id"
manifest_dir="$stage/manifests"
dump_dir="$stage/postgresql"
git_dir="$stage/git"
rustdesk_dir="$stage/rustdesk"
rescue_dir="$stage/cold-rescue"
sqlite_dir="$stage/sqlite-consistent"

install -d -m 0700 "$stage" "$manifest_dir" "$dump_dir" "$git_dir" "$rustdesk_dir" "$rescue_dir" "$sqlite_dir"
exec > >(tee -a "$stage/preliminary-backup.log") 2>&1

echo "preliminary backup started: $(date -u --iso-8601=seconds)"
echo "migration id: $migration_id"
echo "stage: $stage"

run_capture() {
  local output=$1
  shift
  "$@" >"$output" 2>&1 || {
    local rc=$?
    printf 'command failed rc=%s: ' "$rc" >>"$output"
    printf '%q ' "$@" >>"$output"
    printf '\n' >>"$output"
    return 0
  }
}

archive_existing() {
  local output=$1
  shift
  local -a existing=()
  local path
  for path in "$@"; do
    [[ -e "/$path" || -L "/$path" ]] && existing+=("$path")
  done
  if ((${#existing[@]} == 0)); then
    echo "No requested paths exist for $output" >&2
    return 1
  fi
  set +e
  tar --acls --xattrs --numeric-owner --one-file-system -C / -cf - "${existing[@]}" | zstd -T0 -6 -f -o "$output"
  local -a archive_pipe_status=("${PIPESTATUS[@]}")
  set -e
  if ((archive_pipe_status[1] != 0 || archive_pipe_status[0] > 1)); then
    echo "archive failed for $output: tar=${archive_pipe_status[0]} zstd=${archive_pipe_status[1]}" >&2
    return 1
  fi
  zstd -t "$output"
  chmod 0600 "$output"
}

snapshot_git_repo() {
  local label=$1
  local repo=$2
  local out="$git_dir/$label"
  if ! git -C "$repo" rev-parse --git-dir >/dev/null 2>&1; then
    printf '%s\t%s\t%s\n' "$label" "$repo" "not-a-git-repo" >>"$git_dir/SKIPPED.tsv"
    return 0
  fi

  install -d -m 0700 "$out"
  printf '%s\n' "$repo" >"$out/SOURCE_PATH.txt"
  git -C "$repo" rev-parse HEAD >"$out/HEAD.txt" 2>&1 || true
  git -C "$repo" symbolic-ref --short -q HEAD >"$out/BRANCH.txt" 2>&1 || true
  git -C "$repo" remote -v >"$out/REMOTES.txt" 2>&1 || true
  git -C "$repo" status --porcelain=v2 --branch >"$out/STATUS.txt" 2>&1 || true
  git -C "$repo" diff --binary >"$out/WORKTREE.patch" 2>&1 || true
  git -C "$repo" diff --cached --binary >"$out/INDEX.patch" 2>&1 || true
  git -C "$repo" submodule status --recursive >"$out/SUBMODULES.txt" 2>&1 || true
  git -C "$repo" ls-files --others --exclude-standard -z >"$out/UNTRACKED.zlist" 2>/dev/null || true
  rm -f "$out/repository.bundle"
  if ! git -C "$repo" bundle create "$out/repository.bundle" --all >"$out/BUNDLE.log" 2>&1; then
    rm -f "$out/repository.bundle"
  else
    git bundle verify "$out/repository.bundle" >>"$out/BUNDLE.log" 2>&1 || true
  fi
}

echo "capturing host and service manifests"
{
  printf 'captured_at=%s\n' "$(date -u --iso-8601=seconds)"
  hostnamectl
  printf '\n--- os-release ---\n'
  cat /etc/os-release
  printf '\n--- uname ---\n'
  uname -a
  printf '\n--- uptime ---\n'
  uptime
  printf '\n--- filesystems ---\n'
  df -hT
  df -ih
  printf '\n--- memory ---\n'
  free -h
  swapon --show
  printf '\n--- block devices ---\n'
  lsblk -o NAME,TYPE,SIZE,FSTYPE,FSVER,MOUNTPOINTS,UUID
  printf '\n--- mounts ---\n'
  findmnt
} >"$manifest_dir/HOST.txt" 2>&1

run_capture "$manifest_dir/APT_MANUAL.txt" apt-mark showmanual
run_capture "$manifest_dir/DPKG.txt" dpkg-query -W '-f=${binary:Package}\t${Version}\t${Architecture}\n'
run_capture "$manifest_dir/SNAPS.txt" snap list --all
run_capture "$manifest_dir/SYSTEMD_UNITS.txt" systemctl list-units --all --no-pager
run_capture "$manifest_dir/SYSTEMD_UNIT_FILES.txt" systemctl list-unit-files --no-pager
run_capture "$manifest_dir/SYSTEMD_FAILED.txt" systemctl --failed --no-pager
run_capture "$manifest_dir/SYSTEMD_TIMERS.txt" systemctl list-timers --all --no-pager

if [[ -S /run/user/1000/bus ]]; then
  run_capture "$manifest_dir/USER_SYSTEMD_UNITS.txt" runuser -u ubuntu -- env XDG_RUNTIME_DIR=/run/user/1000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus systemctl --user list-units --all --no-pager
  run_capture "$manifest_dir/USER_SYSTEMD_UNIT_FILES.txt" runuser -u ubuntu -- env XDG_RUNTIME_DIR=/run/user/1000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus systemctl --user list-unit-files --no-pager
  run_capture "$manifest_dir/USER_SYSTEMD_TIMERS.txt" runuser -u ubuntu -- env XDG_RUNTIME_DIR=/run/user/1000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus systemctl --user list-timers --all --no-pager
fi

run_capture "$manifest_dir/LISTENERS.txt" ss -lntup
run_capture "$manifest_dir/CONNECTIONS.txt" ss -ntup
run_capture "$manifest_dir/PROCESSES.txt" ps -eo user:20,pid,ppid,lstart,etime,%cpu,%mem,rss,vsz,args --sort=-rss
run_capture "$manifest_dir/NFTABLES.txt" nft list ruleset
run_capture "$manifest_dir/IPTABLES_V4.txt" iptables-save
run_capture "$manifest_dir/IPTABLES_V6.txt" ip6tables-save
run_capture "$manifest_dir/UFW.txt" ufw status verbose
run_capture "$manifest_dir/NGINX.txt" nginx -T
run_capture "$manifest_dir/CERTIFICATES.txt" certbot certificates
run_capture "$manifest_dir/TAILSCALE_STATUS.json" tailscale status --json
run_capture "$manifest_dir/TAILSCALE_PREFS.txt" tailscale debug prefs

getent passwd >"$manifest_dir/PASSWD.txt"
getent group >"$manifest_dir/GROUP.txt"
cp -a /etc/subuid /etc/subgid "$manifest_dir/" 2>/dev/null || true

{
  for file in /home/ubuntu/.ssh/authorized_keys /home/teamlead/.ssh/authorized_keys /home/evguslev/.ssh/authorized_keys; do
    [[ -r $file ]] || continue
    echo "--- $file ---"
    ssh-keygen -lf "$file" || true
  done
} >"$manifest_dir/AUTHORIZED_KEY_FINGERPRINTS.txt" 2>&1

{
  for file in /etc/ssh/ssh_host_*_key.pub; do
    [[ -r $file ]] || continue
    ssh-keygen -lf "$file"
  done
} >"$manifest_dir/SSH_HOST_KEY_FINGERPRINTS.txt" 2>&1

echo "capturing Docker manifests"
run_capture "$manifest_dir/DOCKER_PS.txt" docker ps -a --no-trunc
run_capture "$manifest_dir/DOCKER_IMAGES.txt" docker image ls --digests --no-trunc
run_capture "$manifest_dir/DOCKER_VOLUMES.txt" docker volume ls
run_capture "$manifest_dir/DOCKER_NETWORKS.txt" docker network ls
run_capture "$manifest_dir/DOCKER_DF.txt" docker system df -v
run_capture "$manifest_dir/DOCKER_INSPECT_CONTAINERS.json" docker inspect hbbs hbbr bmadgram-hub nostalgic_keller
run_capture "$manifest_dir/DOCKER_INSPECT_RUSTDESK_IMAGE.json" docker image inspect rustdesk-server:relayfix
run_capture "$manifest_dir/DOCKER_INSPECT_BIG_VALUE_VOLUME.json" docker volume inspect big_value_postgres_data

echo "capturing lightweight health probes"
{
  for url in \
    http://127.0.0.1:8899/health \
    http://127.0.0.1:8770/health \
    http://127.0.0.1:8001/health \
    http://127.0.0.1:8765/health \
    http://127.0.0.1:3055/health \
    http://127.0.0.1:9015/health; do
    printf '%s\t' "$url"
    curl -sS -o /dev/null --max-time 10 -w '%{http_code}\t%{time_total}\n' "$url" || echo 'probe-failed'
  done
} >"$manifest_dir/HEALTH_BEFORE.txt" 2>&1

echo "creating preliminary PostgreSQL dumps"
runuser -u postgres -- pg_dumpall --globals-only >"$dump_dir/globals.sql"
runuser -u postgres -- pg_dump --format=custom --compress=9 universal_projecter >"$dump_dir/universal_projecter.dump"
runuser -u postgres -- pg_dump --schema-only --no-owner universal_projecter >"$dump_dir/universal_projecter.schema.sql"
pg_restore --list "$dump_dir/universal_projecter.dump" >"$dump_dir/universal_projecter.pg_restore_list.txt"

restore_test_db="migration_restore_test_${migration_id//[-TZ]/_}"
runuser -u postgres -- dropdb --if-exists "$restore_test_db"
runuser -u postgres -- createdb "$restore_test_db"
runuser -u postgres -- pg_restore --exit-on-error --no-owner --dbname="$restore_test_db" <"$dump_dir/universal_projecter.dump"
runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -d "$restore_test_db" -Atc \
  "select current_database(), count(*) from pg_catalog.pg_class where relkind in ('r','p');" \
  >"$dump_dir/RESTORE_TEST.txt"
runuser -u postgres -- dropdb "$restore_test_db"

echo "creating a consistent online RustDesk SQLite backup"
python3 - "$rustdesk_dir/db_v2.sqlite3" <<'PY'
import sqlite3
import sys
from pathlib import Path

Path(sys.argv[1]).unlink(missing_ok=True)
source = sqlite3.connect("file:/srv/RustDesk/data/db_v2.sqlite3?mode=ro", uri=True)
target = sqlite3.connect(sys.argv[1])
with target:
    source.backup(target)
result = target.execute("PRAGMA integrity_check").fetchone()[0]
target.close()
source.close()
if result != "ok":
    raise SystemExit(f"RustDesk SQLite integrity check failed: {result}")
PY
cp -a /srv/RustDesk/data/id_ed25519 /srv/RustDesk/data/id_ed25519.pub /srv/RustDesk/compose.yml "$rustdesk_dir/"
chmod 0600 "$rustdesk_dir/id_ed25519" "$rustdesk_dir/db_v2.sqlite3"
sha256sum "$rustdesk_dir"/* >"$rustdesk_dir/SHA256SUMS"

echo "exporting the custom RustDesk image"
docker image save rustdesk-server:relayfix | zstd -T0 -6 -f -o "$rustdesk_dir/rustdesk-server-relayfix.image.tar.zst"
zstd -t "$rustdesk_dir/rustdesk-server-relayfix.image.tar.zst"

echo "capturing Git bundles, patches, and untracked manifests"
snapshot_git_repo robinarb-current /srv/robinarb/current
snapshot_git_repo robinarb-ui-v2 /home/ubuntu/robinarb-ui-v2
snapshot_git_repo universal-projecter-backend /srv/universal-projecter/backend
snapshot_git_repo universal-projecter-frontend /srv/universal-projecter/frontend
snapshot_git_repo vesper-current /srv/releases/vesper-platform-current
snapshot_git_repo ouroboros-repo /srv/ouroboros/repo
snapshot_git_repo ouroboros-live-staging /srv/staging/ouroboros-unified-v1
snapshot_git_repo ifriend-live-staging /srv/staging/ifriend-unified-v1
snapshot_git_repo forted-source /srv/forted-source
snapshot_git_repo robinarb-bia-gateway /srv/robinarb-bia-gateway
snapshot_git_repo antigravity-cold /home/ubuntu/antigravity

echo "archiving selected application payload"
payload_paths=(
  srv/robinarb/current
  home/ubuntu/robinarb-ui-v2
  srv/universal-projecter/backend
  srv/universal-projecter/frontend
  srv/universal-projecter/backups_canvas.sh
  srv/releases/vesper-platform-f13f45b-wt
  srv/releases/vesper-platform-cb9519f-wt
  srv/ouroboros/repo
  srv/ouroboros/data
  srv/staging/ouroboros-unified-v1
  srv/staging/ifriend-unified-v1
  srv/staging-data/ifriend-unified-v1
  var/lib/vesper-contact-relations
  srv/forted-source
  srv/robinarb-bia-gateway
  srv/RustDesk/compose.yml
)
existing_payload=()
for path in "${payload_paths[@]}"; do
  [[ -e "/$path" || -L "/$path" ]] && existing_payload+=("$path")
done
set +e
set +e
tar --acls --xattrs --numeric-owner --one-file-system \
  --exclude='*/.git' \
  --exclude='*/.venv' \
  --exclude='*/node_modules' \
  --exclude='*/__pycache__' \
  --exclude='*/.pytest_cache' \
  --exclude='*/.mypy_cache' \
  --exclude='*/.ruff_cache' \
  --exclude='*/target' \
  --exclude='*/backups' \
  --exclude='*/.next' \
  --exclude='*/screenshots' \
  --exclude='*/report' \
  -C / -cf - "${existing_payload[@]}" | zstd -T0 -6 -f -o "$stage/selected-payload.tar.zst"
payload_pipe_status=("${PIPESTATUS[@]}")
set -e
if ((payload_pipe_status[1] != 0 || payload_pipe_status[0] > 1)); then
  echo "selected payload archive failed: tar=${payload_pipe_status[0]} zstd=${payload_pipe_status[1]}" >&2
  exit 1
fi
zstd -t "$stage/selected-payload.tar.zst"

echo "archiving selected system and secret reference"
archive_existing "$stage/system-reference-and-secrets.tar.zst" \
  etc/systemd/system \
  home/ubuntu/.config/systemd/user \
  etc/nginx \
  etc/letsencrypt \
  etc/ssh \
  etc/sudoers \
  etc/sudoers.d \
  etc/cron.d \
  etc/cron.daily \
  etc/cron.weekly \
  etc/cron.monthly \
  etc/crontab \
  var/spool/cron/crontabs \
  etc/docker \
  etc/logrotate.d \
  etc/systemd/journald.conf \
  etc/systemd/journald.conf.d \
  etc/sysctl.d \
  etc/security/limits.d \
  etc/hosts \
  etc/hostname \
  etc/robinarb \
  etc/ouroboros \
  etc/ifriend-unified \
  etc/vesper-contact-relations \
  var/lib/tailscale/tailscaled.state \
  home/ubuntu/.ssh \
  home/teamlead/.ssh \
  home/evguslev/.ssh \
  usr/local/bin/rustdesk-watchdog.sh \
  usr/local/lib/vibeproxy \
  usr/local/sbin/robinarb-push

echo "archiving selected ubuntu home state"
home_paths=(
  home/ubuntu/.codex
  home/ubuntu/.factory
  home/ubuntu/.gitconfig
  home/ubuntu/.config/gh
  home/ubuntu/.npmrc
  home/ubuntu/.bashrc
  home/ubuntu/.profile
  home/ubuntu/.tmux.conf
  home/ubuntu/paddy_real_profile
  home/ubuntu/betfair_sport_profile
)
existing_home=()
for path in "${home_paths[@]}"; do
  [[ -e "/$path" || -L "/$path" ]] && existing_home+=("$path")
done
tar --acls --xattrs --numeric-owner --one-file-system \
  --exclude='home/ubuntu/.codex/packages' \
  --exclude='home/ubuntu/.codex/.tmp' \
  --exclude='home/ubuntu/.codex/cache' \
  --exclude='home/ubuntu/.codex/app-server-daemon/*.log' \
  --exclude='home/ubuntu/.factory/logs' \
  --exclude='home/ubuntu/.factory/cache' \
  --exclude='home/ubuntu/.factory/.tmp' \
  --exclude='home/ubuntu/.factory/tmp' \
  --exclude='home/ubuntu/.factory/backup-clean-start*' \
  -C / -cf - "${existing_home[@]}" | zstd -T0 -6 -f -o "$stage/selected-home.tar.zst"
home_pipe_status=("${PIPESTATUS[@]}")
set -e
if ((home_pipe_status[1] != 0 || home_pipe_status[0] > 1)); then
  echo "selected home archive failed: tar=${home_pipe_status[0]} zstd=${home_pipe_status[1]}" >&2
  exit 1
fi
zstd -t "$stage/selected-home.tar.zst"

echo "creating consistent online backups of selected Codex SQLite databases"
python3 - "$sqlite_dir" <<'PY'
import hashlib
import pathlib
import sqlite3
import sys

output = pathlib.Path(sys.argv[1])
sources = []
for root in (pathlib.Path("/home/ubuntu/.codex"), pathlib.Path("/home/ubuntu/.factory")):
    if not root.exists():
        continue
    for pattern in ("*.db", "*.sqlite", "*.sqlite3"):
        sources.extend(root.rglob(pattern))

for source_path in sorted(set(sources)):
    digest = hashlib.sha256(str(source_path).encode()).hexdigest()[:12]
    target_path = output / f"{source_path.name}.{digest}.backup.sqlite"
    target_path.unlink(missing_ok=True)
    source = sqlite3.connect(f"file:{source_path}?mode=ro", uri=True)
    target = sqlite3.connect(target_path)
    with target:
        source.backup(target)
    result = target.execute("PRAGMA integrity_check").fetchone()[0]
    target.close()
    source.close()
    if result != "ok":
        raise SystemExit(f"SQLite integrity check failed for {source_path}: {result}")
    (output / f"{target_path.name}.source.txt").write_text(str(source_path) + "\n")
PY

echo "creating compact runtime fallback archive"
archive_existing "$stage/runtime-fallbacks.tar.zst" \
  srv/forted-source/rust-client/target/release/forted-client \
  srv/universal-projecter/frontend/.next

echo "creating Antigravity cold rescue archive"
tar --acls --xattrs --numeric-owner --one-file-system \
  --exclude='home/ubuntu/antigravity/.git' \
  --exclude='home/ubuntu/antigravity/.env' \
  --exclude='home/ubuntu/antigravity/node_modules' \
  --exclude='home/ubuntu/antigravity/logs' \
  --exclude='home/ubuntu/antigravity/*.log' \
  --exclude='home/ubuntu/antigravity/*.tar' \
  --exclude='home/ubuntu/antigravity/*.tar.gz' \
  --exclude='home/ubuntu/antigravity/*backup*' \
  --exclude='home/ubuntu/antigravity/._*' \
  -C / -cf - home/ubuntu/antigravity | zstd -T0 -6 -f -o "$rescue_dir/antigravity-source.tar.zst"
zstd -t "$rescue_dir/antigravity-source.tar.zst"

echo "creating cold rescue of the unmounted Big Value PostgreSQL volume"
big_value_mount=$(docker volume inspect big_value_postgres_data --format '{{.Mountpoint}}')
if docker ps -aq --filter volume=big_value_postgres_data | grep -q .; then
  echo "big_value_postgres_data is attached to a container; refusing online filesystem archive" >&2
  exit 1
fi
tar --acls --xattrs --numeric-owner --one-file-system -C "$big_value_mount" -cf - . | zstd -T0 -6 -f -o "$rescue_dir/big_value_postgres_data.tar.zst"
zstd -t "$rescue_dir/big_value_postgres_data.tar.zst"

echo "capturing owners, modes, sizes, and file lists"
find \
  /srv/robinarb/current \
  /srv/universal-projecter \
  /srv/releases/vesper-platform-current \
  /srv/ouroboros \
  /srv/staging/ouroboros-unified-v1 \
  /srv/staging/ifriend-unified-v1 \
  /srv/staging-data/ifriend-unified-v1 \
  /srv/forted-source \
  /srv/robinarb-bia-gateway \
  /srv/RustDesk \
  /var/lib/vesper-contact-relations \
  /home/ubuntu/.codex \
  /home/ubuntu/.factory \
  -xdev -printf '%y\t%U\t%G\t%m\t%s\t%TY-%Tm-%TdT%TH:%TM:%TS\t%p\n' \
  >"$manifest_dir/FILE_METADATA.tsv" 2>"$manifest_dir/FILE_METADATA_ERRORS.txt" || true

du -x -B1 --max-depth=3 \
  /srv /home/ubuntu /var/lib/docker /var/log \
  >"$manifest_dir/DISK_USAGE_BYTES.txt" 2>&1 || true

echo "writing checksums"
find "$stage" -type f ! -name SHA256SUMS ! -name preliminary-backup.log -print0 \
  | sort -z \
  | xargs -0 sha256sum \
  | sed "s#  $stage/#  #" \
  >"$stage/SHA256SUMS"

find "$stage" -type f -exec chmod 0600 {} +
find "$stage" -type d -exec chmod 0700 {} +

echo "preliminary backup completed: $(date -u --iso-8601=seconds)"
du -sh "$stage"
(cd "$stage" && sha256sum -c SHA256SUMS --ignore-missing)
