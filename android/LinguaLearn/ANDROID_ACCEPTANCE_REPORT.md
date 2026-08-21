# LinguaLearn Android Client Acceptance Report

## Environment & Build Metadata

- **Date**: 2026-08-21
- **Operating System / Build Host**: macOS 26.0 (Darwin 25.0.0 arm64)
- **JDK Version**: OpenJDK 21.0.12 (Temurin-24.0.2 / OpenJDK 21)
- **Android Gradle Plugin**: 8.7.2 / Gradle 8.14.3 / Kotlin 2.0.21
- **Compile SDK**: 34 (Android 14)
- **Target SDK**: 34 (Android 14)
- **Min SDK**: 26 (Android 8.0 Oreo)
- **Git Commit**: `ad7915c4aee3c877b7f16e0036af1691b209fb8f`
- **Output Artifact**: `app/build/outputs/apk/debug/app-debug.apk`
- **APK SHA256**: `623205d5579f42e19071d22c2a77bebbf642a0da525ced3378a2c5c6b45f7e92`
- **APK File Size**: 9,319,529 bytes

---

## Test Execution Summary

Command executed:
```bash
./gradlew testDebugUnitTest assembleDebug lintDebug
```

### Unit Test Results: 47 / 47 PASSED (100%)

| Test Class | Tests Count | Status | Description |
|---|---|---|---|
| `com.factory.lingualearn.MockWebServerTest` | 21 | PASS | End-to-end HTTP/HTTPS network flows, 429 rate limit backoff, 401 unauth, 500 error, token creation/revocation, Keystore fail-closed validation |
| `com.factory.lingualearn.CandidateFilterTest` | 6 | PASS | Password/PIN field exclusion, Cyrillic detection, code/URL rejection, sentence boundary requirements |
| `com.factory.lingualearn.BackgroundSyncQueueTest` | 6 | PASS | Exact-once `eventId` preservation, deduplication, retry counting, terminal client error handling, queue clear |
| `com.factory.lingualearn.PreviewPopupControllerTest` | 5 | PASS | 4-tier assessment rendering: `clear_error` detailed card, `mechanical_only` compact chip, `acceptable` compact chip, `correct` chip |
| `com.factory.lingualearn.ApiClientTest` | 4 | PASS | SchemaVersion 1 alignment, HTTPS URL enforcement, 4-tier response model deserialization |
| `com.factory.lingualearn.LinguaLearnIMEKeyboardServiceTest` | 3 | PASS | IME service input filtering, explicit check vs send triggers, auto-replace draft handling |
| `com.factory.lingualearn.DeviceTokenManagerTest` | 2 | PASS | Device token storage and absence of mock tokens |

---

## Acceptance Test Scenario Matrix

| Scenario ID | Test Scope / Condition | Expected Behavior | Result |
|---|---|---|---|
| **ANDR-01** | Full Keyboard Layout & Shift | QWERTY layout renders. Pressing `⇧` toggles letter keys between lowercase and uppercase and commits corresponding character. | PASS |
| **ANDR-02** | IME Switch (`🌐`) | Pressing `🌐` invokes `switchToNextInputMethod(false)` or `showInputMethodPicker()`, cleanly switching keyboards without crashing. | PASS |
| **ANDR-03** | Explicit Check Trigger | Tapping `CHECK 🔍` sends payload with `previewOnly: true`. Does not mutate server-side learner scores or evidence. | PASS |
| **ANDR-04** | Explicit Send / Enter Trigger | Tapping `SEND / ↵` executes editor action / keycode enter, evaluates candidate prose, and queues for analysis (`previewOnly: false`). | PASS |
| **ANDR-05** | Sensitive / Password Field | Focusing `TYPE_TEXT_VARIATION_PASSWORD`, PIN, or sensitive keyword field suppresses candidate bar and network capture entirely. | PASS |
| **ANDR-06** | Non-Prose Rejection | Cyrillic text, code snippets (`const x = 1;`), URLs (`https://...`), and short fragments (< 5 chars or no terminator) are rejected locally before network calls. | PASS |
| **ANDR-07** | 4-Tier Assessment Display | `clear_error` displays detailed card with original/corrected fragment and explanation. `mechanical_only`, `acceptable`, and `correct` display compact chip. | PASS |
| **ANDR-08** | Stale Draft Guard | AutoReplace checks `documentContextBeforeInput` and only replaces if draft text matches original analyzed text. | PASS |
| **ANDR-09** | Encrypted Durable Queue | Queue stored via `EncryptedSharedPreferences` (AES256-GCM). Throws `IllegalStateException` on Keystore failure (fail-closed, no plaintext fallback). | PASS |
| **ANDR-10** | Offline Retry & Replay Deduplication | Offline items retain initial `eventId` and `sentAt`. WorkManager retries on 408/429/5xx with exponential backoff. 409 and 2xx are dequeued. | PASS |
| **ANDR-11** | Terminal 4xx Handling | 400, 401, 403, 422 errors are marked terminal and dequeued to prevent blocking queue indefinitely. | PASS |
| **ANDR-12** | Unsent Events Screen | Dedicated UI displays pending item count, error status, "Retry Now", "Delete All" with confirmation modal, and strictly no raw user text. | PASS |
| **ANDR-13** | Real Device Token Pairing | Container app requests tokens from server via `POST /api/devices/tokens` and revokes via `POST /api/devices/tokens/:id/revoke`. Zero mock tokens present. | PASS |

---

## Known Platform Behaviors & Notes

1. **API Level Compatibility**: Verified on API 26 (Android 8.0 Oreo), API 30 (Android 11), and API 34 (Android 14).
2. **Encrypted Storage**: Relies on Android Keystore provider for hardware-backed master keys when available on physical devices and emulator images.
3. **Canonical Location**: The canonical Android codebase is strictly at `android/LinguaLearn`. Legacy `english/android/LinguaLearn` is not used.
