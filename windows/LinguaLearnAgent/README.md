# LinguaLearn Windows Desktop Agent (`windows/LinguaLearnAgent`)

LinguaLearn Agent is a native Windows desktop application built with .NET 8 (WPF / Windows Forms / UI Automation).
It captures learner writing on explicit Send or Hotkey trigger from focused edit controls, performs candidate filtering, and syncs writing samples to the LinguaLearn English backend via the unified OpenAPI contract (`schemaVersion: 1`).

## Key Features

- **HTTPS API Base URL Configuration**: User-configurable HTTPS API base URL (default `https://145.239.82.124.sslip.io/english` without hardcoded HTTP fallback) accessible via agent UI settings.
- **DPAPI Credential & Queue Security**: Device tokens and offline retry queue (`offline_retry_queue.dat`) are encrypted on disk using Windows Data Protection API (`System.Security.Cryptography.ProtectedData` under `DataProtectionScope.CurrentUser`).
- **UI Automation Edit Control Capture**: Listens to focus change events (`UIAutomationListener`) to track active controls without automatic text capture on focus change. Focus changes never trigger text capture; analysis occurs strictly on explicit trigger.
- **System Tray Notification UI**: System tray menu providing Pause/Resume capture, Pair Device Token, Settings, Preview Hotkey Mode toggle, and Sync Retry Queue.
- **WM_HOTKEY Preview Mode**: Real Win32 global hotkey (`WM_HOTKEY` via `HwndSource`) displaying full 4-tier preview cards including objective grammar errors, mechanical corrections, and optional suggestions without altering user topic progress (`previewOnly = true`).
- **Password Control Rejection**: Password inputs, PIN controls, and sensitive edit fields are strictly excluded from capture.
- **Auto-Replace Engine**: Replaces corrected text in focused edit controls using Windows UI Automation `ValuePattern` and fallback key events (`recommendedText`).
- **Offline Retry Queue**: DPAPI-encrypted file-backed retry queue (`offline_retry_queue.dat`) for offline or transient network failures.
- **Candidate Filtering**: Sensitive/password field rejection, Cyrillic character rejection, code/URL detection, and prose sentence boundary validation.

## Architecture

- `LinguaLearnAgent.csproj`: .NET 8 WPF project file targeting Windows.
- `App.xaml` / `App.xaml.cs`: Application entrypoint initializing system tray, hotkey manager, and UI automation listeners.
- `MainWindow.xaml` / `MainWindow.xaml.cs`: Agent dashboard for HTTPS API configuration, DPAPI device pairing, privacy controls, and queue management.
- `UIAutomation/UIAutomationListener.cs`: Focus handler and explicit trigger execution manager.
- `Filter/CandidateFilter.cs`: Prose validation and password field rejection rules.
- `Tray/SystemTrayController.cs`: System tray icon, context menu, and balloon notifications.
- `Hotkey/PreviewHotkeyManager.cs`: Win32 `WM_HOTKEY` global hotkey registration for Preview Mode.
- `Replacement/AutoReplaceEngine.cs`: Text replacement handler in UI Automation edit controls.
- `Queue/OfflineRetryQueue.cs`: DPAPI-encrypted persistent queue for offline analysis payloads.
- `Network/ApiClient.cs`: Configurable HTTPS API client posting payloads to `POST /api/writing/analyze`.
- `Settings/PrivacyConsentManager.cs`: Storage manager for DPAPI-protected device tokens and HTTPS settings.
- `Tests/`: C# unit test suite for candidate filter, retry queue, API client, DPAPI encryption, and WM_HOTKEY hook.
