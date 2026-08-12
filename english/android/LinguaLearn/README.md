# LinguaLearn Android App & Input Method Editor (IME Keyboard Service)

LinguaLearn Android client providing an Android Container App (Jetpack Compose) and an Input Method Editor (IME Keyboard Service) for real-time English writing correction and practice.

## Architecture

- **Container App (`com.factory.lingualearn`)**:
  - Jetpack Compose UI for Authentication, Invite Code Redemption, Device Token Management, Today Practice, Correction Inbox, Raw-Text Retention Status, and Privacy Settings.
  - Device token storage backed by Android Keystore + EncryptedSharedPreferences (`AuthManager`, `DeviceTokenManager`).
  - Privacy controls (`PrivacyConsentManager`) supporting capture consent, application denylist (e.g. banking/password apps), and capture pause.

- **IME Keyboard Service (`com.factory.lingualearn.ime`)**:
  - Extends Android `InputMethodService` (`LinguaLearnIMEKeyboardService`).
  - Sensitive field rejection (`CandidateFilter`) checking `EditorInfo.inputType` variations (passwords, PINs, credit cards).
  - Prose candidate filtering (`CandidateFilter`) excluding Cyrillic text, code/commands, URLs/emails, and checking sentence boundary terminators.
  - Correction Strip UI controller (`PreviewPopupController`) displaying status (`Checking…`), diffs, Russian explanations, and buttons for `Check`, `Replace`, `Copy`, and `Learn`.
  - Stale draft auto-replace engine (`AutoReplaceEngine`) validating text before cursor via `InputConnection`.
  - Durable background sync queue (`BackgroundSyncQueue`) handling offline retries with exponential backoff and UUID `eventId` exact-once deduplication.
  - REST client (`ApiClient`) communicating over OpenAPI 3.0 contract (`schemaVersion: 1`) using Bearer device token auth.

## Build & Test Instructions

### Gradle Build
```bash
./gradlew assembleDebug
./gradlew test
```

### Enabling Keyboard Service on Android
1. Open Android Settings -> System -> Languages & Input -> On-screen keyboard.
2. Enable "LinguaLearn English IME".
3. Switch active input method to LinguaLearn IME when writing in English applications.
