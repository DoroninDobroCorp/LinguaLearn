# LinguaLearn Windows Desktop Agent

Canonical directory: `windows/LinguaLearnAgent`

LinguaLearn Windows Agent is a native desktop application built with .NET 8 (WPF / Windows Forms / UI Automation).
It captures English writing upon explicit triggers (Enter / Send key hook or Win32 global hotkey), filters candidate text, and synchronizes writing samples with the LinguaLearn English backend via the unified OpenAPI 3.0 contract (`schemaVersion: 1`).

## System Architecture

### 1. Focus & Trigger Subsystems
- **UIAutomation Listener (`UIAutomation/UIAutomationListener.cs`)**: Tracks focused editable controls via Microsoft UIAutomation without automatic text capture on focus change. Focus changes never trigger network calls.
- **Global Hotkey Preview (`Hotkey/PreviewHotkeyManager.cs`)**: Registers a Win32 `WM_HOTKEY` (default `Ctrl+Alt+G`) via `HwndSource`. When triggered on a focused edit control, it reads the current draft and sends a request with `previewOnly = true` (does not alter user curriculum mastery scores or evidence).
- **Enter Key Hook (`UIAutomation/EnterKeyHook.cs`)**: Low-level keyboard hook (`WH_KEYBOARD_LL`) that detects Return/Enter in supported non-denied chat applications (Telegram, Slack, browser textarea, Notepad, Outlook).

### 2. Candidate Filtering (`Filter/CandidateFilter.cs`)
- **Sensitive Field Guard**: Rejects password edit controls, PIN inputs, CVV fields, and controls with sensitive naming patterns.
- **Prose Validation**:
  - Rejects text with Cyrillic characters.
  - Rejects code snippets, shell commands, HTML markup, and SQL queries.
  - Rejects URLs and email addresses.
  - Requires minimum length (≥ 5 characters) and sentence terminators (`.`, `!`, `?`).

### 3. DPAPI Credential & Queue Security (`Queue/OfflineRetryQueue.cs`, `Settings/PrivacyConsentManager.cs`)
- **Fail-Closed DPAPI Encryption**: Device tokens and offline retry queue (`offline_retry_queue.dat`) are encrypted with the Windows Data Protection API (`System.Security.Cryptography.ProtectedData` under `DataProtectionScope.CurrentUser`).
- **Zero Plaintext Fallback**: If DPAPI encryption/decryption fails, the agent fails closed and will not persist plaintext secrets or corrupt existing queues.
- **Exact-Once eventId Deduplication**: Each capture payload preserves its unique client-generated GUID `eventId` across all retries, surviving agent restarts and reboots.
- **Quarantine Handling**: Malformed or unprotectable queue files are moved to a timestamped `.quarantine` archive without crashing the agent.

### 4. 4-Tier Assessment Popup Policy (`UI/CorrectionPopupController.cs`, `UI/CorrectionPopupWindow.xaml`)
- `clear_error`: Large correction card displaying grammar error fragments, suggested corrections, and Russian pedagogical explanations.
- `mechanical_only`, `acceptable`, `correct`: Compact confirmation chip (`Grammar OK ✓`) with auto-dismiss (1.8s).
- **Stale Draft Guard (`Replacement/AutoReplaceEngine.cs`)**: Verifies that the focused edit control value has not changed during analysis before replacing. If modified, falls back to copying corrected text to clipboard.

## Build and Test Instructions

### Prerequisites
- Windows 10/11 with .NET 8.0 SDK installed
- Visual Studio 2022 or `dotnet` CLI

### Running Tests & Building
```powershell
cd windows
dotnet test LinguaLearnAgent.Tests/LinguaLearnAgent.Tests.csproj
dotnet build -c Release LinguaLearnAgent/LinguaLearnAgent.csproj
```

### Installation & Launch
1. Build the release binary: `dotnet publish -c Release -r win-x64 --self-contained`
2. Launch `LinguaLearnAgent.exe`.
3. From the System Tray icon, select **Pair Device** to enter your server device token (`ll_dev_...`).
