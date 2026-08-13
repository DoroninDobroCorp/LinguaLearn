# Vesper ↔ Universal Projecter task-read cutover

- Deployed at: 2026-08-07 01:33 Europe/Podgorica
- Production Core commit: `5acdf17`
- Pre-change bundle: `/srv/backups/ouroboros_pre_projecter_task_read_20260807_013117.bundle`
- Runtime config: `/etc/systemd/system/ouroboros.service.d/zzz-projecter-task-read.conf`

## Result

- `/api/chat/readiness` is `ready`, including `projecter_task_read=ok`.
- Explicit task/priority questions receive a bounded read-only Entity Graph v2 snapshot.
- Live snapshot: 267 open tasks found, 24 highest-priority/relevant tasks projected, graph revision present.
- Real `/api/chat` smoke completed through the production Gemini path; its answer referenced four exact live task titles and returned a non-empty graph revision.
- Completed/deleted tasks and task descriptions are excluded from the prompt projection.
- Projecter writes remain disabled for the iFriend/Ouroboros path.
- Universal Projecter frontend stale-build mismatch fixed by restarting `up-frontend`; current chunk returns HTTP 200.
- Browser validation found no `ChunkLoadError` or React hydration error.
- SQLite integrity checks passed for Core and iFriend databases.
- iFriend outbox has no pending deliveries.

## Restart note

The old Ouroboros process did not finish its worker shutdown within systemd's 90-second timeout and systemd killed the old process group before starting the new instance. The new instance restored its background state and reports healthy. Durable queues and all SQLite databases passed follow-up checks.
