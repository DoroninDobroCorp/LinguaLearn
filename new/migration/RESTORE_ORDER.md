# `dev` reinstall — restore order

Migration ID: `dev-20260813T191053Z`

Source: `vps-600a189b.vps.ovh.net` / `54.38.65.155`  
Temporary backup and RustDesk host: `vps-f913b693.vps.ovh.net` / `145.239.82.124`  
Target OS: Ubuntu 26.04 LTS on the same OVH VPS and public IP.

## Recovery material

- Full preliminary archive: `dev-20260813T191053Z-preliminary.tar.age`.
- Preliminary SHA256: `93e94824771e0ab284f8496b6c8fd1083652274b0934ffc9e978a4ba05fea6d1`.
- PS38 Claude supplement: `dev-20260813T191053Z-ps38-supplement.tar.age` (76 MiB).
- PS38 supplement SHA256: `aff448386074f0877ac010d4758afab443cc394e4ab5bff0738cb7cb6b608edd`; matched on old `dev`, Mac and `serverforvovka`, then fully decrypted and read on Mac.
- A final archive/delta must be added after stopping writers and before OVH `Confirm`.
- Raw age identity is stored only in the protected Mac Library directory.
- `AGE_IDENTITY_RECOVERY.age` contains that identity encrypted to the owner's existing SSH Ed25519 public key. It can be opened with the matching SSH private key.
- Never upload the raw age identity to either VPS or place it inside the archive it decrypts.

## Mandatory stop-gates before wiping

1. Temporary RustDesk on `145.239.82.124` is running with the preserved identity and database.
2. Both endpoints are configured for the temporary ID/relay server and a brand-new session succeeds.
3. Old RustDesk on `54.38.65.155` is stopped briefly and that new session remains usable.
4. A second independent route exists: OVH web console and/or Tailscale/SSH.
5. All writers are stopped in a recorded order; final PostgreSQL/RustDesk/SQLite/data snapshots and Git status are captured.
6. Final encrypted archive exists on `serverforvovka` and Mac; size and SHA256 match.
7. Mac performs a full `age` decrypt plus tar read of the final archive.
8. OVH page is visibly for `vps-600a189b.vps.ovh.net`, not `vps-f913b693.vps.ovh.net`.
9. Ubuntu 26.04 LTS, full system-disk reinstall, and the intended public SSH key are selected.

## Clean restore sequence

1. Use OVH console and SSH to enter the fresh system. Confirm public IP, hostname and storage.
2. Install security updates; set UTC/NTP/locale; create 8 GiB swap.
3. Recreate selected users/groups with recorded UID/GID. Preserve behavior for `ubuntu` and `teamlead`; preserve the `robinarb` group/GID with `ubuntu` as its only selected member. Do not recreate the Linux users `evguslev`, `win20ps38`, `robinarb`, or the `lxd` group.
4. Restore the preserved SSH host keys and selected authorized keys. Keep public SSH temporarily until Tailscale and console access are verified.
5. Install Tailscale, stop it, restore `tailscaled.state` as `root:root 0600`, then start it. Do not run `tailscale up` with a new key first.
6. Configure IPv4+IPv6 default-deny firewall. Initially allow only SSH, HTTP/HTTPS and required RustDesk ports.
7. Install Docker with bounded logs. Load the saved `rustdesk-server:relayfix` image and restore RustDesk DB/identity.
8. Test a brand-new RustDesk session on `54.38.65.155`; only then retire temporary RustDesk.
9. Install PostgreSQL 17 plus `ltree` and `uuid-ossp`; restore globals and only `universal_projecter`.
10. Install required Python, Node and Rust versions. Rebuild `.venv`, `node_modules`, Rust target and browser/model caches from lock files.
11. Restore app data, code, secrets and units one service at a time: BIA Gateway/RobinArb, Universal Projecter, Forted, Ouroboros/iFriend/contact-relations, Qwen/VibeProxy, Factory/Codex.
12. Restore PS38 Claude from the verified supplement: exact current `2.1.226` release/custom code, wrapper, managed policy, consistent proxy DB, OAuth/user state and required SSH material. Canonical owner remains `ubuntu`; `teamlead` uses `sudo -u ubuntu -H` and receives no token copy.
13. Start `pin888-tcp-unix-proxy.service`, verify loopback `19013/19100`, then start bridge `19011`, then OAuth gateway `19012`. Use the required provider headers for gateway health and run a real Opus smoke-test. Keep `ps38-claude-autoupdate.timer` disabled until its validation bug is fixed; proxy binding expiry is `2026-09-05` and needs a planned post-cutover renewal.
14. Restore Qwen and VibeProxy tunnels with restricted users/listen addresses. Do not restore broken `tunnel-19012-*`, retired PS3838 or feed-bridge timers.
15. Install Nginx/Certbot and only the selected routes/certificates.
16. Reboot, run all acceptance checks, then configure restic and hygiene policies.

## Do not restore

Logs, caches, Docker cache/legacy stacks, `.venv`, `node_modules`, Rust/Go build output, old releases/backups, Terra, SofaScore, seven inactive PS38 releases and its broken five-minute updater/tunnel health timers, old PS3838 runtime, Kiro/OpenCode/Copilot/Windsurf, test databases, CUPS/Avahi/LXD and dead ports `7777`, `8090`, `8100/8101`, `631`, `46439`.
