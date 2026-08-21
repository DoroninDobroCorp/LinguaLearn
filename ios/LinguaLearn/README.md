# LinguaLearn iOS Container App & Custom Keyboard Extension

Canonical directory: `ios/LinguaLearn`

LinguaLearn iOS client provides a native Container App (SwiftUI) and a Custom Keyboard Extension (UIKit) for real-time English writing assessment, error explanations, and personalized practice.

## System Architecture & App Group Container

The project consists of two primary targets sharing an App Group container (`group.ai.factory.lingualearn`):

### 1. Container App (`LinguaLearnContainerApp`)
- **Authentication (`AuthManager`, `LoginView`)**: Invite code registration and login with session cookies.
- **Device Pairing (`DeviceTokenManager`, `DeviceTokenView`)**: Generates real server device tokens (`POST /api/devices/tokens`) and stores them strictly in the shared Keychain Access Group (`$(AppIdentifierPrefix)group.ai.factory.lingualearn`). Mock tokens and local fake token generators are eliminated.
- **Settings & Privacy (`PrivacyConsentManager`, `SettingsView`)**: Allows pausing writing analysis capture, configuring application allowlists/denylists, and managing privacy settings.
- **Correction Inbox (`InboxViewModel`, `InboxView`)**: Displays real-time writing correction diffs, Russian error explanations, and feedback controls.
- **Today Daily Practice (`PracticeViewModel`, `TodayPracticeView`)**: Daily exercise sessions targeting weak curriculum topics.
- **Retention Status (`RetentionManager`, `RetentionStatusView`)**: Displays 7-day raw-text retention purge status, 1-click JSON bundle export, and permanent account deletion.

### 2. Custom Keyboard Extension (`LinguaLearnKeyboardExtension`)
- **Shared Keychain Token (`KeychainAppGroupManager`, `AppGroupManager`)**: Reads device tokens exclusively from the shared Keychain Access Group. Plaintext storage in `UserDefaults` is strictly prohibited.
- **Candidate Filtering (`CandidateFilter`)**:
  - Enforces minimum word count and sentence boundaries (`.`, `!`, `?`).
  - Rejects secure text fields (`isSecureTextEntry = true`, passwords, PINs, CVV).
  - Rejects Cyrillic text, code snippets, SQL queries, URLs, and emails.
- **Explicit Trigger Model**:
  - Regular typing and backspace update draft context but **never** emit network analysis requests.
  - Tapping **`Check`** triggers a manual preview request with `previewOnly: true` (does not alter learner curriculum progress or evidence).
  - Tapping **`Send`** / Return triggers writing analysis for scoring (`previewOnly: false`).
- **4-Tier Assessment Popup (`PreviewPopupView`)**:
  - `clear_error`: Shows detailed correction card with original text, corrected text, and Russian grammar explanations.
  - `mechanical_only`, `acceptable`, `correct`: Shows compact confirmation chip with 2.0s auto-dismiss.
- **Stale Draft Guard (`AutoReplaceEngine`)**:
  - Verifies that the draft currently before the cursor matches the original analyzed text before replacing.
  - If the draft changed while analysis was pending, falls back to copying corrected text to the system pasteboard without corrupting the active input field.
- **Offline Network Retry Queue (`NetworkRetryQueue`, `RetryQueue`)**:
  - Persists queued events across restarts in the shared container.
  - Preserves exact client-generated `eventId` and `sentAt` across all retry attempts.

## Build and Test Instructions

### Prerequisites
- macOS with Xcode 15+ / 16+ Command Line Tools
- `xcodegen` (installed via Homebrew)

### Generate Project & Run Tests
```bash
cd ios/LinguaLearn
xcodegen generate
./run-tests.sh
```

Or execute via `xcodebuild`:
```bash
xcodebuild test \
    -project LinguaLearn.xcodeproj \
    -scheme LinguaLearnContainerApp \
    -destination "platform=iOS Simulator,name=iPhone 16"
```

## Privacy & Sandboxing Considerations
- **Full Access**: Network access requires enabling "Allow Full Access" in iOS Settings (`Settings -> General -> Keyboard -> Keyboards -> LinguaLearn -> Allow Full Access`). If Full Access is off, the keyboard operates safely in offline mode without crashing.
- **Memory Footprint**: Memory usage is optimized to stay well below the 16MB extension sandbox limit.
