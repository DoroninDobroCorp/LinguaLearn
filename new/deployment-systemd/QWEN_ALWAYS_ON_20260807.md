# Qwen advisory review 24/7 rollout — 2026-08-07

- iFriend revision: `2beb9bb` (`27b0473` introduced always-on scheduling).
- Ouroboros revision: `c91feda`.
- Fresh iFriend backup: `/srv/backups/ifriend_memory_pre_qwen_always_on_20260806_230042.db`.
- Qwen is eligible at every hour; a successful cycle is due hourly and a failed
  cycle retries after one hour. Overlapping cycles remain prohibited.
- Each request contains at most two candidates, 450 characters each. A durable
  per-domain cursor rotates the batch so all candidates are eventually reviewed.
- Ollama uses native non-streaming `think=false`, no tools, one proposal maximum,
  and a two-hour request timeout suitable for the 27B CPU model.
- Qwen remains advisory-only and cannot write or auto-apply memory changes.
- Persistent tunnel: `qwen-ollama-tunnel.service` on dev.
- Ollama resource policy on serverforvovka: `Nice=15`, `CPUWeight=10`,
  `IOWeight=10`, idle I/O scheduling, one parallel request, one loaded model,
  ten-minute keep-alive, and `OOMScoreAdjust=500`.
- While the first Qwen cycle was running, a parallel Core/Gemini chat smoke test
  returned successfully. iFriend, Ouroboros, UP backend, UP frontend, and the
  Qwen tunnel were all active.
