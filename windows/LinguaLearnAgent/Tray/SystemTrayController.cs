using System;
using System.Windows.Forms;
using LinguaLearnAgent.Network;
using LinguaLearnAgent.Queue;
using LinguaLearnAgent.Settings;

namespace LinguaLearnAgent.Tray;

public class SystemTrayController : IDisposable
{
    private readonly PrivacyConsentManager _settings;
    private readonly ApiClient _apiClient;
    private readonly OfflineRetryQueue _retryQueue;
    private NotifyIcon? _notifyIcon;
    private ToolStripMenuItem? _pauseMenuItem;
    private ToolStripMenuItem? _previewMenuItem;

    public SystemTrayController(
        PrivacyConsentManager settings,
        ApiClient apiClient,
        OfflineRetryQueue retryQueue)
    {
        _settings = settings;
        _apiClient = apiClient;
        _retryQueue = retryQueue;
    }

    public void Initialize()
    {
        _notifyIcon = new NotifyIcon
        {
            Icon = System.Drawing.SystemIcons.Application,
            Text = "LinguaLearn Agent (Windows)",
            Visible = true
        };

        var contextMenu = new ContextMenuStrip();

        _pauseMenuItem = new ToolStripMenuItem("Pause Capture", null, OnPauseClicked)
        {
            Checked = _settings.IsPaused
        };

        _previewMenuItem = new ToolStripMenuItem("Toggle Preview Mode (Ctrl+Alt+P)", null, OnPreviewClicked);

        var triggerSendMenuItem = new ToolStripMenuItem("Trigger Send Capture", null, OnTriggerSendClicked);
        var triggerHotkeyMenuItem = new ToolStripMenuItem("Trigger Hotkey Preview", null, OnTriggerHotkeyClicked);

        var pairTokenMenuItem = new ToolStripMenuItem("Pair Device Token...", null, OnPairDeviceTokenClicked);
        var settingsMenuItem = new ToolStripMenuItem("Settings...", null, OnSettingsClicked);
        var retryQueueMenuItem = new ToolStripMenuItem("Retry Sync Queue", null, OnRetryQueueClicked);
        var exitMenuItem = new ToolStripMenuItem("Exit", null, OnExitClicked);

        contextMenu.Items.Add(_pauseMenuItem);
        contextMenu.Items.Add(_previewMenuItem);
        contextMenu.Items.Add(triggerSendMenuItem);
        contextMenu.Items.Add(triggerHotkeyMenuItem);
        contextMenu.Items.Add(new ToolStripSeparator());
        contextMenu.Items.Add(pairTokenMenuItem);
        contextMenu.Items.Add(settingsMenuItem);
        contextMenu.Items.Add(retryQueueMenuItem);
        contextMenu.Items.Add(new ToolStripSeparator());
        contextMenu.Items.Add(exitMenuItem);

        _notifyIcon.ContextMenuStrip = contextMenu;
        _notifyIcon.DoubleClick += (s, e) => OpenMainWindow();
    }

    private void OnTriggerSendClicked(object? sender, EventArgs e)
    {
        _ = App.AutomationListener?.TriggerSendCaptureAsync();
    }

    private void OnTriggerHotkeyClicked(object? sender, EventArgs e)
    {
        _ = App.AutomationListener?.TriggerHotkeyCaptureAsync();
    }

    private void OnPauseClicked(object? sender, EventArgs e)
    {
        _settings.IsPaused = !_settings.IsPaused;
        _settings.Save();
        if (_pauseMenuItem != null)
        {
            _pauseMenuItem.Checked = _settings.IsPaused;
        }
        ShowBalloon("LinguaLearn Capture", _settings.IsPaused ? "Capture paused." : "Capture resumed.");
    }

    private void OnPreviewClicked(object? sender, EventArgs e)
    {
        App.HotkeyManager.IsPreviewOnly = !App.HotkeyManager.IsPreviewOnly;
        if (_previewMenuItem != null)
        {
            _previewMenuItem.Checked = App.HotkeyManager.IsPreviewOnly;
        }
        ShowBalloon("LinguaLearn Hotkey", App.HotkeyManager.IsPreviewOnly ? "Preview mode enabled." : "Preview mode disabled.");
    }

    private void OnPairDeviceTokenClicked(object? sender, EventArgs e)
    {
        OpenMainWindow();
    }

    private void OnSettingsClicked(object? sender, EventArgs e)
    {
        OpenMainWindow();
    }

    private async void OnRetryQueueClicked(object? sender, EventArgs e)
    {
        int processed = await _retryQueue.RetryAllAsync(_apiClient);
        ShowBalloon("Retry Queue", $"Processed {processed} pending items.");
    }

    private void OnExitClicked(object? sender, EventArgs e)
    {
        System.Windows.Application.Current.Shutdown();
    }

    private void OpenMainWindow()
    {
        var mainWindow = System.Windows.Application.Current.MainWindow;
        if (mainWindow != null)
        {
            mainWindow.Show();
            mainWindow.WindowState = System.Windows.WindowState.Normal;
            mainWindow.Activate();
        }
    }

    public void ShowBalloon(string title, string text)
    {
        _notifyIcon?.ShowBalloonTip(3000, title, text, ToolTipIcon.Info);
    }

    public void Dispose()
    {
        if (_notifyIcon != null)
        {
            _notifyIcon.Visible = false;
            _notifyIcon.Dispose();
            _notifyIcon = null;
        }
    }
}
