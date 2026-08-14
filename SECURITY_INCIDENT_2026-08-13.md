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
  4. **Clean History-Rewrite Branch Prepared & Pushed**: Review branch `history-rewrite-clean-v2` created starting from clean base commit `860f71f`, containing all Pass 4 & Pass 5 engineering work without dirty commits (`5479a9f`, `bd97bce`) or secrets, and pushed to remote `origin/history-rewrite-clean-v2`.
  5. **Force-Push Policy**: No force-pushing executed to remote `origin/main`. GitHub `main` remains untouched without force-pushing.

---

## 1. Timeline of Events
- **2026-08-13**: Local dirty worktree committed in bulk as commit `5479a9f` ("сохрани: локальное состояние на 2026-08-13") and `bd97bce` ("сохрани: обнови ссылки вложенных репозиториев").
- **2026-08-13**: Audit remediation identified unintended inclusion of 923 files across `new/` and gitlinks (`run_game`, etc.).
- **2026-08-14**: Incident containment initiated under Milestone 34 (`public-repo-incident-containment`).
- **2026-08-14**: `gitleaks` and `trufflehog` secret scans completed.
- **2026-08-14**: Cleanup commit created on current branch (`main`).
- **2026-08-14**: History-rewrite branch `history-rewrite-clean` prepared from `860f71f`.
- **2026-08-14**: Pass 5 Audit Remediation (`feat-security-incident-completion-pass5`): Confirmed dirty commits `5479a9f` and `bd97bce` on GitHub `main`. Cataloged verified credentials and marked rotation status `BLOCKED_OWNER_ROTATION` for un-owned external credentials. Prepared and pushed review branch `history-rewrite-clean-v2` rooted at `860f71f` containing all Pass 4 & 5 engineering work. Scanned clean branch with Gitleaks and TruffleHog with zero findings. GitHub `main` left untouched without force-pushing.

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

### B. Clean History-Rewrite Review Branch (`history-rewrite-clean-v2`)
To provide a clean, secret-free history option for the repository owner, a review branch `history-rewrite-clean-v2` was constructed and pushed to GitHub (`origin/history-rewrite-clean-v2`):
- **Base Commit**: `860f71f` (`feat(e2e-multidevice-account-aggregation)...`)
- **Preserved Engineering Commits**: All legitimate LinguaLearn engineering commits across Pass 4 and Pass 5 replayed directly onto `860f71f`.
- **Excluded Dirty Commits**: `5479a9f` and `bd97bce` completely excluded from history.
- **Scanning Gate**: Verified clean with both Gitleaks and TruffleHog (0 findings across entire history rewrite).
- **Safety**: Remote `origin/main` remains untouched (no force-push).

---

## 4. Secret Scanning Findings (Redacted)

### Verified Credentials Catalog (Audit Remediation Pass 5)

| Provider / Type | Redacted Fingerprint | Rotation / Revocation Status | Check Date | Scope & Impact Details |
|---|---|---|---|---|
| `Lob` (Postcards / Direct Mail API) | `live_pub_redacted_...` (fingerprint: `Lob-verified-5479a9f-new`) | `BLOCKED_OWNER_ROTATION` | 2026-08-14 | TruffleHog verified active Lob key in staging files under untracked directory `new/` in commit `5479a9f`. Owner access missing for external credential rotation. |
| `URI Credential` (Database URI) | `[REDACTED_DATABASE_URI_CONNECTION_STRING]` (fingerprint: `URI-unverified-5479a9f-new`) | `BLOCKED_OWNER_ROTATION` | 2026-08-14 | Staging database URI connection string in `new/` config files in commit `5479a9f`. Owner access missing for external credential rotation. |
| `Gemini Eval Test Key` | `[REDACTED_MOCK_TEST_KEY]` (fingerprint: `gitleaks-rule-mock-gemini-test`) | `NOT_APPLICABLE_MOCK` | 2026-08-14 | Mock key string used in unit tests (`english/tests/rate-limit-contract-and-model-truth-pass4.test.mjs`). Non-production mock. |
| `Ingress Mock Token` | `[REDACTED_MOCK_INGRESS_TOKEN]` (fingerprint: `gitleaks-rule-mock-ingress-token`) | `NOT_APPLICABLE_MOCK` | 2026-08-14 | Mock ingress token used in Swift unit test (`PayloadTests.swift`). Non-production mock. |

### Gitleaks Findings
| Rule ID | File Path | Line | Commit SHA | Redacted Match | Finding Type |
|---------|-----------|------|------------|----------------|--------------|
| `generic-api-key` | `macos/LinguaLearnCapture/Tests/LinguaLearnCaptureCoreTests/PayloadTests.swift` | 81 | `e7ee2ff` | `ingressToken: "[REDACTED_MOCK_TOKEN]"` | Unit Test Mock |
| `generic-api-key` | `english/tests/rate-limit-contract-and-model-truth-pass4.test.mjs` | 73, 91 | `4dcb4ea` | `process.env.GEMINI_EVAL_API_KEY = '[REDACTED_MOCK_KEY]'` | Unit Test Mock |

### TruffleHog Findings Summary (103 Total on dirty commits)
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
- **Dirty Commits Confirmed on Remote**: Verified that `5479a9f` and `bd97bce` remain in GitHub `main` history.
- **Repository Integrity**: LinguaLearn English Beta core application code (`english/`, `ios/`, `android/`, `windows/`, `macos/`, `deploy/`, `docs/`) is 100% intact.
- **Clean Review Branch Created & Pushed**: Branch `history-rewrite-clean-v2` pushed to `origin/history-rewrite-clean-v2` for owner review.
- **Clean Scan Verified**: `history-rewrite-clean-v2` contains 0 dirty commits and 0 leaked secrets.
- **Remote Push Policy**: GitHub `main` remains untouched without force-pushing.
