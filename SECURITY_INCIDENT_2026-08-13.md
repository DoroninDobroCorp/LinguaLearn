# SECURITY INCIDENT REPORT: SECURITY_INCIDENT_2026-08-13

## Executive Summary
- **Incident ID**: INCIDENT-2026-08-13-CONTAINMENT
- **Date Discovered**: 2026-08-13
- **Severity**: High (Containment Complete)
- **Affected Repository**: `LinguaLearn` (`git@github.com:DoroninDobroCorp/LinguaLearn.git`)
- **Impact Summary**:
  During workspace consolidation on 2026-08-13, non-LinguaLearn source directories (`new/`), internal staging snapshots (`.codex-stage/`, `.remote_staging/`, `.remote_patch/`, `.remote_rebase/`, `.staging/`), external sportsbetting project code, secret config files, and repository gitlink objects (`run_game`, etc.) were inadvertently tracked and committed into git history in commits `5479a9f` and `bd97bce`.

- **Current Containment Status**:
  1. **Current Branch Cleanup**: All `new/`, `run_game`, staging snapshots, and gitlinks removed from git tracking on the primary development branch.
  2. **Gitignore Hardening**: Root `.gitignore` updated with explicit rules (`new/`, `.codex-stage/`, `.remote_staging/`, `.remote_patch/`, `.remote_rebase/`, `.staging/`, `*.secret*`).
  3. **Automated Secret Scanning**: Comprehensive scans executed using `gitleaks` (v8) and `trufflehog` (v3). All detected credentials cataloged and redacted below.
  4. **Clean History-Rewrite Branch Prepared**: Branch `history-rewrite-clean` created starting from clean base commit `860f71f`, cherry-picking all 7 legitimate LinguaLearn engineering commits (`1ee867a`, `00c57a7`, `0ebe54e`, `8dc89f4`, `2e11be4`, `6b3b80e`, `47042e1`) and omitting dirty commits (`5479a9f`, `bd97bce`).
  5. **Force-Push Policy**: No force-pushing executed to remote `origin/main` pending explicit repository owner authorization.

---

## 1. Timeline of Events
- **2026-08-13**: Local dirty worktree committed in bulk as commit `5479a9f` ("сохрани: локальное состояние на 2026-08-13") and `bd97bce` ("сохрани: обнови ссылки вложенных репозиториев").
- **2026-08-13**: Audit remediation identified unintended inclusion of 923 files across `new/` and gitlinks (`run_game`, etc.).
- **2026-08-14**: Incident containment initiated under Milestone 34 (`public-repo-incident-containment`).
- **2026-08-14**: `gitleaks` and `trufflehog` secret scans completed.
- **2026-08-14**: Cleanup commit created on current branch (`main`).
- **2026-08-14**: History-rewrite branch `history-rewrite-clean` prepared from `860f71f`.

---

## 2. Root Cause & Scope Analysis
- **Root Cause**: Unintentional bulk `git add` from a workspace root containing external project working directories (`new/`) and gitlinks (`run_game`).
- **Scope of Exposure**:
  - `new/`: 923 files comprising sportsbetting parser patches (`pin888`, `ps3838`, `sansabet`, `robinarb`, `vesper`, `bia`), staging dumps, and secret config files (`.env`, `pncl-live-fallback.jwt-secret.conf`, etc.).
  - `run_game`: 160000 gitlink mode entry pointing to an external sub-repository.
  - Secret scanning revealed 1 Gitleaks finding (mock ingress token in test file) and 103 TruffleHog findings (located exclusively inside `new/` dirty staging paths).

---

## 3. Containment & Remediation Actions

### A. Working Tree Cleanup & Root `.gitignore` Hardening
The following rules were added to the root `.gitignore`:
```gitignore
# Incident containment & Staging rules
new/
.codex-stage/
.remote_staging/
.remote_patch/
.remote_rebase/
.staging/
*.secret*
```
Tracked entries for `new/` and `run_game` were removed from git index via `git rm -rf new run_game`.

### B. Clean History-Rewrite Branch (`history-rewrite-clean`)
To provide a clean, secret-free history option for the repository owner, a parallel history branch was constructed:
- **Base Commit**: `860f71f` (`feat(e2e-multidevice-account-aggregation)...`)
- **Preserved Legitimate Commits**:
  - `1ee867a`: `feat(ios): remove lingualearn.ai fallback...`
  - `00c57a7`: `feat(android): fix base URL...`
  - `0ebe54e`: `feat(windows): fail-closed DPAPI...`
  - `8dc89f4`: `feat(mac): integrate Sparkle 2 updater...`
  - `2e11be4`: `fix(mac): copy Sparkle.framework...`
  - `6b3b80e`: `feat(ci): local verification script...`
  - `47042e1`: `feat(deploy): production server deployment...`
- **Excluded Dirty Commits**: `5479a9f` and `bd97bce`.

---

## 4. Secret Scanning Findings (Redacted)

### Gitleaks Finding (1 Total)
| Rule ID | File Path | Line | Commit SHA | Redacted Match |
|---------|-----------|------|------------|----------------|
| `generic-api-key` | `macos/LinguaLearnCapture/Tests/LinguaLearnCaptureCoreTests/PayloadTests.swift` | 81 | `e7ee2ff` | `ingressToken: "[REDACTED_MOCK_TOKEN]"` |

### TruffleHog Findings Summary (103 Total)
All 103 TruffleHog findings were located within files inside the `new/` directory introduced in commit `5479a9f`.

| Detector Name | File Category / Directory | Verified | Redacted Sample / Finding |
|---------------|---------------------------|----------|---------------------------|
| `Lob` | `new/.codex-stage/bia-fresh-proof/...` | True | `[REDACTED_LOB_KEY]` |
| `Lob` | `new/.codex-stage/bia/...` | True | `[REDACTED_LOB_KEY]` |
| `Lob` | `new/.codex-stage/forted-multileg/...` | True | `[REDACTED_LOB_KEY]` |
| `Lob` | `new/.codex-stage/betslip-error-propagation/...` | True | `[REDACTED_LOB_KEY]` |
| `Lob` | `new/.codex-stage/robin-roi-fix/...` | True | `[REDACTED_LOB_KEY]` |
| `Lob` | `new/.codex-stage/fleet/...` | True | `[REDACTED_LOB_KEY]` |
| `Lob` | `new/.codex-stage/pin888/...` | True | `[REDACTED_LOB_KEY]` |
| `Lob` | `new/.remote_patch/...` | True | `[REDACTED_LOB_KEY]` |
| `Lob` | `new/.remote_rebase/...` | True | `[REDACTED_LOB_KEY]` |
| `Lob` | `new/.remote_staging/...` | True | `[REDACTED_LOB_KEY]` |
| `Lob` | `new/parser_browser_only_mode_patch/...` | True | `[REDACTED_LOB_KEY]` |
| `Lob` | `new/secret_parser_patch/...` | True | `[REDACTED_LOB_KEY]` |
| `URI` | `new/parser_browser_only_mode_patch/...` | False | `[REDACTED_URI_STRING]` |

---

## 5. Verification & Compliance
- **Git Status**: Working tree clean after normal cleanup commit.
- **Repository Integrity**: LinguaLearn English Beta core application code (`english/`, `ios/`, `android/`, `windows/`, `macos/`, `deploy/`, `docs/`) is 100% intact.
- **Remote Push**: History rewrite branch remains local to avoid disrupting downstream clones until owner authorization is granted.
