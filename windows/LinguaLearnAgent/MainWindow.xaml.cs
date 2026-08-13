using System;
using System.Windows;
using System.Windows.Interop;
using LinguaLearnAgent.Settings;

namespace LinguaLearnAgent;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        LoadSettingsIntoUI();
    }

    protected override void OnSourceInitialized(EventArgs e)
    {
        base.OnSourceInitialized(e);
        try
        {
            var handle = new WindowInteropHelper(this).Handle;
            if (handle != IntPtr.Zero && App.HotkeyManager != null)
            {
                App.HotkeyManager.RegisterWindowHandle(handle);
                App.HotkeyManager.HotkeyPressed += OnHotkeyPressed;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[MainWindow] Hotkey registration exception: {ex.Message}");
        }
    }

    private async void OnHotkeyPressed(object? sender, EventArgs e)
    {
        if (App.AutomationListener != null)
        {
            await App.AutomationListener.TriggerHotkeyCaptureAsync();
        }
    }

    private void LoadSettingsIntoUI()
    {
        ApiUrlTextBox.Text = App.SettingsManager.ApiUrl;
        DeviceTokenTextBox.Text = App.SettingsManager.DeviceToken;
        PauseCaptureCheckBox.IsChecked = App.SettingsManager.IsPaused;
        PreviewModeCheckBox.IsChecked = App.HotkeyManager.IsPreviewOnly;
        UpdateQueueStatus();
    }

    private void SaveApiUrlButton_Click(object sender, RoutedEventArgs e)
    {
        var url = ApiUrlTextBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(url))
        {
            url = "https://lingua.factory.ai";
        }
        App.SettingsManager.ApiUrl = url;
        App.ApiClient.SetBaseUrl(url);
        App.SettingsManager.Save();
        MessageBox.Show($"HTTPS API URL saved: {url}", "LinguaLearn Agent", MessageBoxButton.OK, MessageBoxImage.Information);
    }

    private void SaveTokenButton_Click(object sender, RoutedEventArgs e)
    {
        var token = DeviceTokenTextBox.Text.Trim();
        App.SettingsManager.DeviceToken = token;
        App.SettingsManager.Save();
        MessageBox.Show("Device token saved successfully.", "LinguaLearn Agent", MessageBoxButton.OK, MessageBoxImage.Information);
    }

    private void PauseCaptureCheckBox_Click(object sender, RoutedEventArgs e)
    {
        bool isPaused = PauseCaptureCheckBox.IsChecked == true;
        App.SettingsManager.IsPaused = isPaused;
        App.SettingsManager.Save();
    }

    private void PreviewModeCheckBox_Click(object sender, RoutedEventArgs e)
    {
        bool isPreview = PreviewModeCheckBox.IsChecked == true;
        App.HotkeyManager.IsPreviewOnly = isPreview;
    }

    private void RetryNowButton_Click(object sender, RoutedEventArgs e)
    {
        int processed = App.RetryQueue.RetryAll(App.ApiClient);
        UpdateQueueStatus();
        MessageBox.Show($"Processed {processed} pending queue items.", "LinguaLearn Agent", MessageBoxButton.OK, MessageBoxImage.Information);
    }

    public void UpdateQueueStatus()
    {
        QueueCountTextBlock.Text = $"Pending items: {App.RetryQueue.Count}";
    }
}
