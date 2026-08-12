using System.Windows;
using LinguaLearnAgent.Settings;

namespace LinguaLearnAgent;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        LoadSettingsIntoUI();
    }

    private void LoadSettingsIntoUI()
    {
        DeviceTokenTextBox.Text = App.SettingsManager.DeviceToken;
        PauseCaptureCheckBox.IsChecked = App.SettingsManager.IsPaused;
        PreviewModeCheckBox.IsChecked = App.HotkeyManager.IsPreviewOnly;
        UpdateQueueStatus();
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
