# LinguaLearn iOS Container App & Custom Keyboard Extension MVP

`ios/LinguaLearn` contains the native iOS client implementation for the LinguaLearn English learning ecosystem.

## System Architecture & App Group Container

The iOS project consists of two primary targets sharing an App Group container (`group.ai.factory.lingualearn`):

1. **Container App (`LinguaLearnContainerApp`)**:
   - **Authentication (`AuthManager`, `LoginView`)**: Invite code registration and session login.
   - **Device Token Pairing (`DeviceTokenManager`, `DeviceTokenView`)**: Generates plain-text device tokens (`ll_dev_...`) and saves token credentials into the shared App Group container.
   - **Settings & Privacy (`PrivacyConsentManager`, `SettingsView`)**: Capture pause toggle, application denylist/allowlist, and raw-text retention selection (0, 7, 30 days).
   - **Correction Inbox (`InboxViewModel`, `InboxView`)**: Displays real-time writing correction diffs, Russian error explanations, and feedback controls (`helpful`, `undo_progress`).
   - **Today Daily Practice (`PracticeViewModel`, `TodayPracticeView`)**: Daily exercise sessions targeting weak topics.
   - **Retention Status (`RetentionManager`, `RetentionStatusView`)**: Data privacy, raw-text retention status, export, and account deletion.

2. **Custom Keyboard Extension (`LinguaLearnKeyboardExtension`)**:
   - **App Group Shared Container (`AppGroupManager`, `RetryQueue`)**: Reads device token and settings from `UserDefaults(suiteName: "group.ai.factory.lingualearn")`.
   - **Candidate Filtering (`CandidateFilter`)**: Prose sentence boundary check (`.`, `!`, `?`, min 3 words), rejection of code, URLs, emails, Cyrillic text, and secure/password fields (`isSecureTextEntry`, passcode/secret keywords).
   - **Preview Popup (`PreviewPopupView`)**: Displays grammar suggestions and Russian explanations in a non-intrusive popup view.
   - **Auto-Replace (`AutoReplaceEngine`)**: Replaces typed draft in `textDocumentProxy` with `correctedText`.
   - **Network Retry Queue (`NetworkRetryQueue`, `ApiClient`)**: Transmits payloads to `POST /api/writing/analyze` with Bearer token authentication and `schemaVersion: 1`. Queues failed requests for exact-once retry.

## Unified OpenAPI 3.0 Contract (`schemaVersion: 1`)

All network requests emitted by the keyboard extension and container app strictly conform to OpenAPI spec (`schemaVersion: 1`):

```json
{
  "schemaVersion": 1,
  "eventId": "uuid-v4-client-generated",
  "sourceApp": "LinguaLearnKeyboardExtension",
  "originalText": "She don't know the answer.",
  "sentAt": "2026-08-12T12:00:00Z",
  "previewOnly": false
}
```

## iOS Keyboard Extension Limitations & Architecture Constraints

1. **Full Access & Network Authorization**:
   - Custom keyboard extensions run in a restricted sandbox. Network access and shared Keychain access require `RequestsOpenAccess = true` in `Info.plist` and explicit user activation in iOS Settings (`Settings -> General -> Keyboard -> Keyboards -> Allow Full Access`).
   - Without Full Access, network calls to `POST /api/writing/analyze` are blocked by iOS App Transport Security.

2. **Memory Allocation Limits**:
   - iOS places a strict RAM limit on keyboard extensions (~12MB to 16MB). Exceeding memory thresholds causes instant process termination (`SIGKILL`) by the operating system.
   - The extension relies on lightweight `URLSession` data tasks and zero heavy third-party UI dependencies.

3. **Keychain & App Group Codesigning Entitlements**:
   - Shared token storage between the Container App and Keyboard Extension requires matching `com.apple.security.application-groups` (`group.ai.factory.lingualearn`) and `keychain-access-groups` (`$(AppIdentifierPrefix)group.ai.factory.lingualearn`) in target entitlements files.
   - Build settings set `CODE_SIGN_ENTITLEMENTS` for both container and keyboard targets.

4. **Secure Text Entry Exclusion**:
   - Whenever focus enters a secure text field (`isSecureTextEntry = true`, e.g. passwords, CVV fields), iOS automatically bypasses custom keyboards or disables Full Access context for security.
   - `CandidateFilter` verifies `isSecureTextEntry` and keyword patterns (`password`, `secret`, `passcode`) to instantly reject secure text capture.

5. **Document Proxy Boundary & Focus Restrictions**:
   - `UITextDocumentProxy` allows reading context before and after the cursor (`documentContextBeforeInput`, `documentContextAfterInput`) and inserting/deleting text. It cannot inspect rich formatted text or access text outside the active control.

## Running Tests

Swift unit tests are located in `LinguaLearnTests/`:
- `CandidateFilterTests.swift`: Evaluates candidate prose filtering and secure field exclusion.
- `RetryQueueTests.swift`: Evaluates shared container queue serialization and deduplication.
- `ApiClientTests.swift`: Evaluates Bearer device token authentication and schema payload construction.
