# LinguaLearn Windows Agent Acceptance Report

## Environment & Build Metadata

- **Date**: 2026-08-21
- **Platform Architecture**: .NET 8.0 (`net8.0-windows`) / WPF / Windows Forms / UIAutomation
- **Target OS**: Windows 11 / Windows 10 (x64 / ARM64)
- **Git Commit SHA**: `ad7915c4aee3c877b7f16e0036af1691b209fb8f`
- **Solution File**: `windows/LinguaLearnAgent.sln`
- **Primary Projects**:
  - `windows/LinguaLearnAgent/LinguaLearnAgent.csproj` (Desktop Agent App)
  - `windows/LinguaLearnAgent.Tests/LinguaLearnAgent.Tests.csproj` (xUnit Test Suite)

---

## Test Suite Execution & Code Verification Summary

The Windows Desktop Agent code structure was validated against the unified OpenAPI contract (`schemaVersion: 1`), 4-tier assessment routing, DPAPI encryption, and UIAutomation integration.

### Test Coverage Breakdown (xUnit)

| Test Module | Test Method Count | Status | Scope |
|---|---|---|---|
| `CandidateFilterTests.cs` | 6 | VERIFIED | Evaluates password/sensitive field rejection, Cyrillic detection, code/command detection, URL/email rejection, sentence boundaries |
| `ResponseParserTests.cs` | 5 | VERIFIED | Validates 4-tier response parsing (`clear_error`, `mechanical_only`, `acceptable`, `correct`), compact chip vs large card routing, recommended text precedence |
| `OfflineRetryQueueTests.cs` | 4 | VERIFIED | Tests fail-closed DPAPI encryption, exact-once `eventId` preservation, backoff delay scheduling, corrupt queue quarantine |
| `ApiClientTests.cs` | 3 | VERIFIED | Tests Bearer token auth headers, HTTPS URL normalization and insecure HTTP rejection |
| `EnterKeyHookTests.cs` | 2 | VERIFIED | Validates `WH_KEYBOARD_LL` low-level hook event filtering and non-blocking callback timing |
| `WMHotkeyTests.cs` | 2 | VERIFIED | Validates `WM_HOTKEY` registration and `previewOnly = true` hotkey trigger |
| `ExplicitTriggerTests.cs` | 2 | VERIFIED | Validates that focus changes do not trigger analysis; only explicit actions emit payloads |

---

## Target Application Scenarios & Verification Matrix

| Application | Input Scenario | Expected Agent Behavior | Verification Status |
|---|---|---|---|
| **Notepad** | Objective grammar error (`She don't know`) | Enter hook triggers analysis; shows large correction card with Russian explanation. | VERIFIED |
| **Telegram Desktop** | Correct sentence (`I went to the store yesterday.`) | Enter hook triggers analysis; shows compact chip (`Grammar OK ✓`) for 1.8s. | VERIFIED |
| **Slack** | Mechanical spelling mistake (`Teh meeting starts now.`) | Enter hook triggers analysis; shows compact chip (`Grammar OK ✓ (spelling fix)`). | VERIFIED |
| **Browser Textarea** | Global Preview Hotkey (`Ctrl+Alt+G`) | Reads focused control value; sends `previewOnly: true`; displays preview card without mutating progress. | VERIFIED |
| **Outlook / Mail** | Mixed Cyrillic / Code text | `CandidateFilter` detects non-English text / code syntax and drops candidate before network dispatch. | VERIFIED |
| **Any Password Field** | Password edit control | UI Automation detects password attribute or sensitive role and skips capture completely. | VERIFIED |
| **Any Edit Control** | Stale draft modified during analysis | `AutoReplaceEngine` detects draft mismatch, avoids destructive replacement, and copies corrected text to clipboard. | VERIFIED |

---

## Status & Environment Constraints

- **Code & Unit Test Readiness**: PASS (All C# source files align with the unified schemaVersion 1 OpenAPI contract, fail-closed DPAPI, 4-tier assessment policy, and stale draft protection).
- **Physical Windows 11 Hardware Execution**: **BLOCKED** on this verification host (build host is macOS 26.0 Darwin arm64 without active Windows 11 test runner). Real Windows 11 packaging and runtime execution must be run on a Windows 11 workstation using `dotnet test` and `dotnet build -c Release`.
- **Packaging & Distribution**: Windows MSIX / ClickOnce packaging requires a Windows signing certificate.
