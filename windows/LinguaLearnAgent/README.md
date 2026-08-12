# LinguaLearn Windows Desktop Agent (`windows/LinguaLearnAgent`)

LinguaLearn Agent is a native Windows desktop application built with .NET 8 (WPF / Windows Forms / UI Automation).
It captures learner writing in real time from focused edit controls, performs candidate filtering, and syncs writing samples to the LinguaLearn English backend via the unified OpenAPI contract (`schemaVersion: 1`).

## Key Features

- **UI Automation Edit Control Capture**: Listens to focus change and text edit events via `UIAutomationListener`.
- **System Tray Notification UI**: System tray menu providing Pause/Resume capture, Pair Device Token, Settings, Preview Hotkey Mode toggle, and Sync Retry Queue.
- **Preview Hotkey Mode**: Global hotkey (Ctrl+Alt+P) toggles preview mode without committing user progress.
- **Auto-Replace Engine**: Replaces corrected text in focused edit controls using Windows UI Automation `ValuePattern` and fallback key events.
- **Offline Retry Queue**: Encrypted / durable file-backed queue for failed requests with Bearer device token auth retry logic.
- **Candidate Filtering**: Sensitive/password field rejection, Cyrillic character rejection, code/URL detection, and prose sentence boundary validation.

## Architecture

- `LinguaLearnAgent.csproj`: .NET 8 WPF project file targeting Windows.
- `App.xaml` / `App.xaml.cs`: Application entrypoint initializing system tray, hotkey manager, and UI automation listeners.
- `MainWindow.xaml` / `MainWindow.xaml.cs`: Agent dashboard for device pairing, privacy controls, and queue management.
- `UIAutomation/UIAutomationListener.cs`: Focus and text edit handler capturing candidate sentences.
- `Filter/CandidateFilter.cs`: Prose validation and password field rejection rules.
- `Tray/SystemTrayController.cs`: System tray icon, context menu, and balloon notifications.
- `Hotkey/PreviewHotkeyManager.cs`: Win32 global hotkey registration for Preview Mode.
- `Replacement/AutoReplaceEngine.cs`: Text replacement handler in UI Automation edit controls.
- `Queue/OfflineRetryQueue.cs`: Persistent queue for offline analysis payloads.
- `Network/ApiClient.cs`: HTTP client posting analysis payloads to `POST /api/writing/analyze`.
- `Settings/PrivacyConsentManager.cs`: Storage manager for device tokens and privacy settings.
- `Tests/`: C# unit test suite for filter, retry queue, and API client.
