using System;
using System.Windows;
using LinguaLearnAgent.Filter;
using LinguaLearnAgent.Hotkey;
using LinguaLearnAgent.Network;
using LinguaLearnAgent.Queue;
using LinguaLearnAgent.Settings;
using LinguaLearnAgent.Tray;
using LinguaLearnAgent.UIAutomation;

namespace LinguaLearnAgent;

public partial class App : Application
{
    public static PrivacyConsentManager SettingsManager { get; private set; } = new();
    public static ApiClient ApiClient { get; private set; } = new(SettingsManager);
    public static OfflineRetryQueue RetryQueue { get; private set; } = new(SettingsManager);
    public static CandidateFilter CandidateFilter { get; private set; } = new();
    public static SystemTrayController TrayController { get; private set; } = null!;
    public static PreviewHotkeyManager HotkeyManager { get; private set; } = null!;
    public static UIAutomationListener AutomationListener { get; private set; } = null!;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        SettingsManager.Load();
        TrayController = new SystemTrayController(SettingsManager, ApiClient, RetryQueue);
        HotkeyManager = new PreviewHotkeyManager();
        AutomationListener = new UIAutomationListener(CandidateFilter, ApiClient, RetryQueue, SettingsManager, HotkeyManager);

        RetryQueue.QueueCorruptQuarantined += OnQueueCorruptQuarantined;

        TrayController.Initialize();
        AutomationListener.StartListening();
        RetryQueue.StartBackgroundProcessor(ApiClient, TimeSpan.FromSeconds(15));
    }

    private void OnQueueCorruptQuarantined(object? sender, string message)
    {
        TrayController?.ShowBalloon("Offline Queue Quarantined", message);
    }

    protected override void OnExit(ExitEventArgs e)
    {
        RetryQueue?.StopBackgroundProcessor();
        AutomationListener?.StopListening();
        HotkeyManager?.Dispose();
        TrayController?.Dispose();
        RetryQueue?.Dispose();
        base.OnExit(e);
    }
}
