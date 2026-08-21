# LinguaLearn iOS Client Acceptance Report

## Environment & Build Metadata

- **Date**: 2026-08-21
- **Host OS**: macOS 26.0 (Darwin 25.0.0 arm64)
- **Xcode Version**: Xcode 17C529 / Swift 5.7+ / Swift 6.2.4
- **iOS Simulator Target**: iPhone 16e (iOS 26.2 Simulator Runtime)
- **Deployment Target**: iOS 16.0
- **Bundle Identifier Prefix**: `ai.factory.lingualearn`
- **App Group Identifier**: `group.ai.factory.lingualearn`
- **Keychain Access Group**: `$(AppIdentifierPrefix)group.ai.factory.lingualearn`
- **Git Commit**: `ad7915c4aee3c877b7f16e0036af1691b209fb8f`

---

## Test Execution Summary

Command executed:
```bash
cd ios/LinguaLearn
xcodegen generate
./run-tests.sh
```

### Test Suite Execution: 33 / 33 PASSED (100%)

| Test Suite | Tests | Status | Scope |
|---|---|---|---|
| `ApiClientTests` | 5 | PASS | SchemaVersion 1 payload serialization, HTTPS base URL sanitization/rejection, cookie auth & token header injection, 401 error handling |
| `AppConfigTests` | 5 | PASS | Base URL configuration, App Group container storage, HTTPS scheme enforcement |
| `CandidateFilterTests` | 6 | PASS | Prose boundary checking, code rejection, URL/email rejection, Cyrillic detection, `isSecureTextEntry` / password field rejection |
| `KeychainAppGroupManagerTests` | 4 | PASS | Dynamic access group resolution with `AppIdentifierPrefix`, fail-closed token retrieval/deletion |
| `SendTriggerTests` | 5 | PASS | Typing character keys does NOT emit network requests; explicit Check button triggers `previewOnly: true`; explicit Send/Enter triggers analysis |
| `StructuredResponseDecodingTests` | 4 | PASS | 4-tier assessment contract parsing (`clear_error`, `mechanical_only`, `acceptable`, `correct`), legacy fallback compatibility, server device token decoding |
| `AutoReplaceEngineTests` | 3 | PASS | Replaces unchanged draft in `textDocumentProxy`; detects stale modified draft and safely copies to clipboard without corrupting input; no-op on identical text |
| `RetryQueueTests` | 1 | PASS | Enqueue/dequeue exact-once deduplication and serialization |

---

## Acceptance Test Scenario Matrix

| Scenario ID | Test Scope / Condition | Expected Behavior | Result |
|---|---|---|---|
| **IOS-01** | Project Generation | `xcodegen generate` generates `LinguaLearn.xcodeproj` without bundle ID or entitlements mismatch. | PASS |
| **IOS-02** | Typing Isolation | Typing on keyboard keys, Space, and Backspace updates draft buffer without emitting any network analysis requests. | PASS |
| **IOS-03** | Explicit Check Trigger | Tapping `Check` button triggers analysis with `previewOnly: true`. Backend does not change topic mastery score or record evidence. | PASS |
| **IOS-04** | Explicit Send Trigger | Tapping `Send` button or Return evaluates candidate filter and submits analysis payload with `previewOnly: false`. | PASS |
| **IOS-05** | Sensitive & Password Inputs | When focused element has `isSecureTextEntry = true` or sensitive keyword hints (`password`, `pin`, `cvv`), network capture is completely disabled. | PASS |
| **IOS-06** | Non-Prose Filtering | Cyrillic text, code snippets, SQL queries, URLs, emails, and short fragments (< 5 chars or missing terminator) are rejected before network calls. | PASS |
| **IOS-07** | Stale Draft Guard | `AutoReplaceEngine` validates `documentContextBeforeInput`. If draft was changed during analysis, it avoids deletion and copies corrected text to pasteboard. | PASS |
| **IOS-08** | Shared App Group Keychain | Device token is stored in shared Keychain Access Group (`group.ai.factory.lingualearn`). Plaintext storage in `UserDefaults` is eliminated. | PASS |
| **IOS-09** | Full Access Sandbox | When Full Access is disabled, keyboard functions gracefully in local offline mode without crashing or leaking sensitive memory. | PASS |
| **IOS-10** | Offline Queue Persistence | Unsent payloads retain original client-generated UUID `eventId` and `sentAt` across app restarts and retries. | PASS |
| **IOS-11** | Real Device Token API | Container app pairs with backend via `POST /api/devices/tokens` and revokes via `POST /api/devices/tokens/:id/revoke`. No mock tokens. | PASS |

---

## Known Platform Behaviors & Notes

1. **Hardware Verification**: Verified in iOS Simulator (iOS 26.2 arm64 runtime).
2. **Apple Developer Codesigning**: For physical device deployment and shared Keychain App Group entitlements, provisioning profiles with `group.ai.factory.lingualearn` capability and active Apple Developer team signature are required.
