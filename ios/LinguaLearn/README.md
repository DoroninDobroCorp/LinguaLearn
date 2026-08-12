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

## Running Tests

Swift unit tests are located in `LinguaLearnTests/`:
- `CandidateFilterTests.swift`: Evaluates candidate prose filtering and secure field exclusion.
- `RetryQueueTests.swift`: Evaluates shared container queue serialization and deduplication.
- `ApiClientTests.swift`: Evaluates Bearer device token authentication and schema payload construction.
