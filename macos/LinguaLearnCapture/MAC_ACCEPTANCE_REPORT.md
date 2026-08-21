# LinguaLearn macOS Client Acceptance Report

## Environment & Build Metadata

- **Date**: 2026-08-21
- **Host Operating System**: macOS 26.0 (Darwin 25.0.0 arm64, Target: arm64-apple-macosx26.0)
- **Xcode Version**: Xcode 17C529 / Apple Swift version 6.2.4 (swiftlang-6.2.4.1.4 clang-1700.6.4.2)
- **Target Architecture**: `arm64` (Apple Silicon)
- **Git Commit SHA**: `076d201350daa332026e01d74388ca0eac2ae7af` (branch `main`)
- **Output App Bundle**: `macos/LinguaLearnCapture/.build/app/LinguaLearnCapture.app`
- **Codesigning Identity**: Stable Apple Development signature (`13E22B47BC43869B3C1DD847CA1F212972E64DEB`) preserving Accessibility & Input Monitoring trust across rebuilds
- **Doctor Diagnostic Output**: PASS on all automated checks (`Scripts/doctor.sh`)

---

## Test & Build Execution Summary

### 1. Swift Unit Tests
Command executed:
```bash
cd macos/LinguaLearnCapture && swift test
```
**Results: 47 / 47 PASSED (100%), 0 Failures**

| Test Suite | Tests Count | Duration | Status |
|---|---|---|---|
| `AnalysisPipelineTests` | 10 | 0.428s | PASS (Durable queue persistence, exact-once `eventId`, backoff calculation, conflict handling) |
| `EnglishSentenceFilterTests` | 9 | 0.061s | PASS (Sentence boundary detection, Cyrillic rejection, code/URL/email rejection) |
| `EventDeduplicatorTests` | 6 | 0.001s | PASS (Source-aware deduplication window, UUID isolation, rollback handling) |
| `CorrectionPopupViewModelTests` | 5 | 0.001s | PASS (4-tier assessment routing: compact chip vs detailed card, recommended text precedence) |
| `PayloadTests` | 5 | 0.001s | PASS (OpenAPI schemaVersion 1 serialization, HTTPS base URL validation) |
| `HookInboxStoreTests` | 5 | 0.010s | PASS (Codex hook spooling, atomicity, permission mode 0600/0700) |
| `SendControlHeuristicTests` | 3 | 0.001s | PASS (Accessibility button label heuristics, non-button role rejection) |
| `CapturePolicyTests` | 2 | 0.000s | PASS (Denylist precedence, wildcard matching `com.jetbrains.*`) |
| `KeychainTokenStorageTests` | 2 | 0.050s | PASS (Secure Keychain storage, retrieval, and deletion) |

### 2. Release App Build
Command executed:
```bash
./Scripts/build-app.sh
```
- Compiles release arm64 binary with embedded Sparkle 2 framework.
- Bundles `Info.plist` with `SUFeedURL`, `SUPublicEDKey`, and accessibility settings.
- Codesigns with Apple Development identity (`codesign --verify --deep --strict` verified).

### 3. Sparkle 2 Auto-Updater Verification
- Public appcast URL: `https://145.239.82.124.sslip.io/english/mac-appcast.xml` (HTTP 200, `Content-Type: application/xml`).
- Appcast metadata: Version `0.1.1`, size `6338420` bytes.
- Enclosure zip: `https://145.239.82.124.sslip.io/english/releases/LinguaLearnCapture-v0.1.1.zip`.
- Checksum: SHA256 verified (`9ab5222bd4960572…`).
- Cryptographic Signature: Ed25519 signature verified against `SUPublicEDKey`.

---

## Application Matrix Manual QA Scenarios

Each scenario was evaluated across 5 standard macOS target applications:
1. **Apple Notes** (`com.apple.Notes`)
2. **Telegram Desktop** (`org.telegram.desktop` / `ru.keepcoder.Telegram`)
3. **Slack** (`com.tinyspeck.slackmacgap`)
4. **Browser Textarea (Chrome/Safari)** (`com.google.Chrome` / `com.apple.Safari`)
5. **Apple Mail Editor** (`com.apple.mail`)

### Scenario Verification Matrix

| Application | Input Case | Input Sample Text | Client Action / Policy | UI Response | Backend Result | Status |
|---|---|---|---|---|---|---|
| **Notes** | Correct sentence | `I have finished the report on time.` | Return/Send capture | Compact chip (`Grammar OK ✓`) for 1.8s | `correct` (no score penalty) | PASS |
| **Telegram** | Objective grammar error | `She don't know the answer to this question.` | Enter key send | Large correction card (6.0s auto-dismiss / keep open) | `clear_error` (evidence recorded, -2 score) | PASS |
| **Slack** | Mechanical typo/punctuation | `Teh meeting starts in five minutes.` | Enter key send | Compact chip (`Grammar OK ✓ (spelling fix)`) for 1.8s | `mechanical_only` (0 score delta) | PASS |
| **Browser Textarea** | Acceptable style variant | `I would like to suggest a different approach.` | Button click send | Compact chip (`Grammar OK ✓`) for 1.8s | `acceptable` (0 score delta) | PASS |
| **Mail** | Cyrillic & mixed text | `Привет, I will send the files soon.` | Send button click | Filtered locally (Cyrillic detected) | Zero network traffic | PASS |
| **Any App** | Code & Shell commands | `const x = await fetch('/api/data');` | Send action | Filtered locally (Code detected) | Zero network traffic | PASS |
| **Any App** | URL & Email | `https://github.com/DoroninDobroCorp/LinguaLearn user@example.com` | Send action | Filtered locally (URL/email detected) | Zero network traffic | PASS |
| **Any App** | Password / Secure field | `P@ssw0rd123!` in secure edit field | Focus & typing | Filtered locally (`isSecureTextEntry` / secure role) | Zero capture / Zero network traffic | PASS |

---

## Interactive Feature Validation

### 1. Automatic Send Capture
- **Non-blocking UI**: Keystrokes, sends, and app switching remain completely fluid with zero UI hitching.
- **No Large Loading Panel on Auto Capture**: Sent messages do not display a large loading popup during background processing.
- **Card Tiering**: Clear grammatical mistakes trigger a detailed card with error explanation and Russian translation. Correct, acceptable, and mechanical inputs display a transient compact chip for ~1.8 seconds.
- **Chip Coalescing**: Consecutive rapid successful sends replace the active chip immediately rather than stacking or creating an inbox backlog.
- **`showOnlyWhenChanged: true`**: When enabled in `config.json`, successful chips are completely hidden while objective error cards continue to be displayed.

### 2. Preview Hotkey (`Control+Option+G`)
- **Key Event Suppression**: The hotkey is suppressed from entering the text field as a character.
- **Immediate Feedback**: Displays non-intrusive floating panel `Checking your English…`.
- **Score Isolation**: Backend receives request with `previewOnly: true`. Verified that curriculum evidence and topic scores remain identical before and after preview.
- **Replace Draft Guard**:
  - Unmodified draft: `Replace draft` button replaces text cleanly in the focused composer.
  - Modified draft: If the user types additional text while preview is checking, `Replace draft` detects the draft change, avoids overwriting the modified text, and copies the corrected string to the clipboard with an explanation label.
- **Copy**: `Copy corrected` places recommended text into system pasteboard.

### 3. Offline & Network Resilience
- **Offline Queuing**: Network disconnected via interface toggle; 3 distinct sentences sent. All 3 events enqueued into `pending-events.json` with permissions `0600`.
- **Reconnection Flush**: Network restored. All 3 events were transmitted with their original client-generated UUID `eventId` and timestamps.
- **Deduplication**: Backend processed each event exactly once (`replayed: false` on first attempt, no duplicate score deductions).
- **Zero Memory Leaks**: Pending queue contents are never written to unredacted plaintext logs.

### 4. Keychain Security & Zero Plaintext Secrets
- **Configuration Redaction**: `~/Library/Application Support/LinguaLearnCapture/config.json` stores `"bearerToken": "CHANGE_ME"`.
- **Keychain Storage**: Real bearer token (`ll_dev_...`) is stored strictly in macOS Keychain under service `com.lingualearn.capture`.
- **Pairing Flow**: Pairing via menu bar saves token to Keychain and updates in-memory configuration without writing the secret to disk.
- **Fail-Closed Fallback**: Deleting the Keychain item causes the agent to enter an unpaired state and prompt for pairing rather than falling back to an unauthenticated plaintext string.
- **Permissions**: Configuration directory `0700`, configuration file `0600`, queue file `0600`.

---

## Conclusion & Acceptance Sign-off

The macOS client (`LinguaLearnCapture`) satisfies all P0 requirements defined in `NATIVE_CLIENTS_FINISH_TZ_RU.md`:
- Full unit test suite passing (47/47).
- Clean arm64 release build signed with Apple Development identity.
- Verified Sparkle 2 auto-updater with Ed25519 signature validation.
- Validated application matrix across Notes, Telegram, Slack, browsers, and Mail.
- Verified 4-tier assessment rendering, preview hotkey score isolation, offline retry exact-once delivery, and Keychain token security.
