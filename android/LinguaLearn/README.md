# LinguaLearn Android App & Input Method Editor (IME Keyboard Service)

Canonical source directory: `android/LinguaLearn`  
*(Note: `english/android/LinguaLearn` is a deprecated legacy mirror and should not be used.)*

LinguaLearn Android client provides a native Container App (Jetpack Compose) and an Input Method Editor (IME Keyboard Service) for English writing analysis and personalized practice.

## System Architecture

### 1. Container App (`com.factory.lingualearn`)
- **Authentication (`AuthManager`, `LoginScreen`)**: Real API login/signup with session cookie handling and server-side invite code validation.
- **Device Pairing (`DeviceTokenManager`, `DeviceTokenScreen`)**: Requests real device tokens (`ll_dev_...`) via `POST /api/devices/tokens` and stores them strictly in `EncryptedTokenStorage`. All mock tokens and local fake token generators are eliminated.
- **Unsent Events Queue Screen (`UnsentEventsScreen`)**: Shows count of pending writing events, last error status, manual "Retry Now", and "Delete All" with confirmation modal. Raw text is never exposed in diagnostics or lists.
- **Settings & Privacy (`PrivacyConsentManager`, `SettingsScreen`)**: Allows setting HTTPS backend API URL, testing connection against `/health`, toggling writing analysis pause, and managing app-level privacy permissions.
- **Inbox & Practice (`InboxScreen`, `TodayPracticeScreen`, `RetentionStatusScreen`)**: Visualizes captured writing samples, daily personalized exercises targeting weak topics, and GDPR/data retention rights.

### 2. IME Keyboard Service (`com.factory.lingualearn.ime`)
- **Keyboard Layout**: Full QWERTY keyboard with `Shift (⇧)` uppercase/lowercase toggling, Backspace (`⌫`), Space, Send/Enter (`SEND / ↵`), Switch Keyboard (`🌐`), and manual `CHECK 🔍`.
- **Sensitive Field Shield (`CandidateFilter`)**: Detects `EditorInfo.inputType` variations (passwords, visible passwords, web passwords, numeric PINs) and field name/hint keywords (`password`, `passcode`, `pin`, `cvv`, `secret`). When a sensitive field is focused, the IME disables analysis and candidate bar display.
- **Prose Candidate Filter**: Filters non-prose text prior to transmission:
  - Rejects Cyrillic and mixed-script text.
  - Rejects code snippets, shell commands, HTML tags, and SQL queries.
  - Rejects URLs and email addresses.
  - Enforces minimum length (≥ 5 characters) and sentence terminators (`.`, `!`, `?`).
- **Explicit Trigger Model**: Typing does not transmit text. Analysis is triggered exclusively upon:
  1. Manual `CHECK 🔍` button tap (`previewOnly = true`, does not mutate user learning progress/scores).
  2. Send/Enter tap (`previewOnly = false`, queues analysis for scoring).
- **Candidate Bar & 4-Tier Assessment Policy (`PreviewPopupController`)**:
  - `clear_error`: Detailed error card with original fragment, corrected fragment, and Russian grammatical explanation.
  - `mechanical_only`: Compact chip (`Grammar OK ✓ (spelling fix)`) with auto-dismiss.
  - `acceptable`: Compact chip (`Grammar OK ✓ (acceptable)`) with auto-dismiss.
  - `correct`: Compact chip (`Grammar OK ✓`) with auto-dismiss.
- **Auto-Replace Engine (`AutoReplaceEngine`)**: Validates text before cursor in `InputConnection` and replaces draft only if draft has not changed.

### 3. Encrypted Durable Offline Queue (`BackgroundSyncQueue`, `SyncWorker`)
- **Fail-Closed Keystore Encryption**: Backed by `androidx.security.crypto.EncryptedSharedPreferences` with AES256-GCM / AES256-SIV via Android Keystore. Fails closed with `IllegalStateException` if Keystore is unavailable (no plaintext fallback).
- **Exact-Once eventId Deduplication**: Every event generated retains its original client-side UUID `eventId` across all retries, surviving app kills and device reboots.
- **WorkManager Sync (`SyncWorker`)**:
  - `2xx` HTTP response (including semantic rejections `accepted = false`): Dequeued as successfully processed.
  - `409 Conflict`: Dequeued as previously ingested.
  - `408`, `429 Rate Limit`, `5xx Server Error`: Kept in queue for exponential backoff retry.
  - `400`, `401`, `403`, `422`: Marked as terminal client error and dequeued to prevent blocking future events.

## Build and Test Instructions

### Prerequisites
- JDK 17 or JDK 21
- Android SDK Platform 34 & Build-Tools 34.0.0

### Run Tests and Verify Build
```bash
cd android/LinguaLearn
./gradlew testDebugUnitTest assembleDebug lintDebug
```

Output APK artifact location:
`app/build/outputs/apk/debug/app-debug.apk`

### Device Setup & Pairing
1. Install APK on device: `adb install -r app/build/outputs/apk/debug/app-debug.apk`.
2. Launch LinguaLearn app, sign in with your email/password.
3. In **Devices** tab, click **Generate New Device Token** (e.g., `Pixel 8 Pro IME`).
4. Open **Android Settings -> System -> Languages & Input -> On-screen keyboard**.
5. Enable **LinguaLearn English IME**.
6. When typing in any non-denied English app, switch input method to LinguaLearn IME using the `🌐` button.
