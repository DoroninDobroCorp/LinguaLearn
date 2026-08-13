# Sansabet prematch date-window audit

Audit time: 2026-08-10 UTC

Scope: read-only inspection of `serverforvovka`, its existing container logs,
source tree, and the local Analyzer endpoint. No provider endpoint was called;
no remote file, container, service, or process was changed.

## Confirmed fault

`isWithin24Hours` receives `cutoff = time.Now().Add(24h)` and only checks
`matchTime.Before(cutoff)`. Every parseable timestamp in the past therefore
passes. The active parser consequently fetched and sent stale listings every
20 seconds, while Analyzer independently removed prematch records whose
non-zero `matchDate` was before `now`.

Runtime evidence:

- 51,240 of 51,240 `DP field sample` log records in the inspected ~30-hour
  container-log window used the date-only `DD.MM.YYYY` format.
- Observed values were only `08.08.2026` (15,860 samples) and `09.08.2026`
  (35,380 samples).
- `08.08.2026` remained in samples through `2026-08-09T06:00:00Z`;
  `09.08.2026` remained present through the audit at
  `2026-08-10T02:05:40Z`.
- Recent cycles contained 378–379 total matches and reported
  `skipped_beyond_24h=0`; 372–373 full-odds records were repeatedly fetched.
- Analyzer's `shouldEvictMatchData` rejects a non-live record immediately when
  its non-zero `MatchDate` is before `now`.

## Time formats and timezone conclusion

The code supports four forms:

1. `DD.MM.YYYY` — the only form proven in current runtime logs. It has neither
   a start time nor a timezone. The existing dirty worktree change maps it to
   end-of-day UTC (`23:59:59.999999999Z`).
2. `DD.MM.YYYY HH:mm` — documented in code but not observed in the inspected
   runtime window. Go's current `time.Parse` interpretation is UTC.
3. `/Date(<unix-ms>[+|-HHMM])/` — documented .NET form. Unix milliseconds are
   an absolute instant; the optional suffix is display-offset metadata and
   must not be applied a second time.
4. RFC3339 — contains `Z` or an explicit offset and is unambiguous.

Both the host and application logs use UTC. `DP` itself provides no evidence
that permits assigning `Europe/Skopje` (or any event-local zone) to the
date-only/current European values. The runtime image also lacks
`/usr/share/zoneinfo/Europe/Skopje`. The staged patch therefore does not invent
a timezone or introduce a DST-sensitive fixed offset.

## Minimal staged fix

The staged source does the following:

- preserves the helper's existing upper-cutoff argument and derives the lower
  boundary from the same stable per-cycle cutoff;
- reuses `parseMatchDate` for every supported representation, eliminating the
  duplicated parser in `isWithin24Hours`;
- accepts parseable records only in `[now - 5m, now + 24h]`;
- keeps the existing fail-open behavior only for empty/unknown date formats;
- makes malformed `.NET` values non-panicking and verifies that their optional
  offset does not shift epoch milliseconds;
- retains the current uncommitted date-only end-of-day behavior and its tests.

Five minutes is a conservative ingestion tolerance: the parser polls every 20
seconds and observed complete cycles take roughly 8–15 seconds. It is far
shorter than the multi-hour stale-date persistence seen in logs. Analyzer's
own stricter scheduled-start guard remains authoritative, so the tolerance
cannot expose a started prematch pair there.

## Verification

Run locally from the staged module:

```text
go test ./internal/service
ok livebets/parse_sansabet/internal/service

go test ./...
all packages passed

go vet ./...
passed with no findings
```

New tests cover:

- the exact stale date-only reproduction (`09.08.2026` at
  `2026-08-10T02:10:00Z`);
- current date-only and future timestamps;
- inclusive lower and upper boundaries plus one-second violations;
- date-only, European date-time, RFC3339, and all documented .NET variants;
- .NET positive/negative display offsets without epoch shifting;
- malformed .NET values without panic;
- preserved behavior for empty and unknown values.

## Deployment caution

The remote worktree was already dirty before this audit:

- `internal/service/prematch_service.go` was modified;
- `internal/service/prematch_match_date_test.go` was untracked.

The staging baseline is an exact copy of those current remote files, so the
patch must be reviewed/applied against that dirty state rather than replacing
files from Git `HEAD`. No deployment or restart was performed here.

The existing log field is still named `skipped_beyond_24h`; after this fix it
also counts records below the new lower bound. It was deliberately left intact
to keep the hotfix backward-compatible with any log consumers. A later
observability change can split `skipped_past` and `skipped_future` counters.
