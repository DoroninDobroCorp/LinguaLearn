using System;
using System.Windows.Automation;
using LinguaLearnAgent.Filter;
using LinguaLearnAgent.Hotkey;
using LinguaLearnAgent.Network;
using LinguaLearnAgent.Queue;
using LinguaLearnAgent.Settings;

namespace LinguaLearnAgent.UIAutomation;

public class UIAutomationListener
{
    private readonly CandidateFilter _filter;
    private readonly ApiClient _apiClient;
    private readonly OfflineRetryQueue _retryQueue;
    private readonly PrivacyConsentManager _settings;
    private readonly PreviewHotkeyManager _hotkeyManager;
    private bool _isListening;

    public UIAutomationListener(
        CandidateFilter filter,
        ApiClient apiClient,
        OfflineRetryQueue retryQueue,
        PrivacyConsentManager settings,
        PreviewHotkeyManager hotkeyManager)
    {
        _filter = filter;
        _apiClient = apiClient;
        _retryQueue = retryQueue;
        _settings = settings;
        _hotkeyManager = hotkeyManager;
    }

    public void StartListening()
    {
        if (_isListening) return;
        try
        {
            Automation.AddAutomationFocusChangedEventHandler(OnFocusChanged);
            _isListening = true;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[UIAutomationListener] Failed to attach focus handler: {ex.Message}");
        }
    }

    public void StopListening()
    {
        if (!_isListening) return;
        try
        {
            Automation.RemoveAutomationFocusChangedEventHandler(OnFocusChanged);
            _isListening = false;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[UIAutomationListener] Failed to remove focus handler: {ex.Message}");
        }
    }

    private void OnFocusChanged(object sender, AutomationFocusChangedEventArgs e)
    {
        if (_settings.IsPaused) return;

        try
        {
            if (sender is not AutomationElement element) return;

            // Password field rejection check
            if (IsSecureField(element))
            {
                Console.WriteLine("[UIAutomationListener] Ignored secure/password field.");
                return;
            }

            var text = ExtractControlText(element);
            if (string.IsNullOrWhiteSpace(text)) return;

            string sourceApp = element.Current.LocalizedControlType ?? "WindowsEditControl";

            var filterResult = _filter.FilterCandidate(text, isSecureField: false);
            if (!filterResult.Accepted)
            {
                Console.WriteLine($"[UIAutomationListener] Candidate rejected: {filterResult.Reason}");
                return;
            }

            ProcessCapturedText(text, sourceApp);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[UIAutomationListener] Focus change error: {ex.Message}");
        }
    }

    public bool IsSecureField(AutomationElement element)
    {
        try
        {
            if (element.Current.IsPassword) return true;
            string name = element.Current.Name ?? "";
            string className = element.Current.ClassName ?? "";
            if (name.Contains("Password", StringComparison.OrdinalIgnoreCase) ||
                className.Contains("Password", StringComparison.OrdinalIgnoreCase) ||
                name.Contains("PIN", StringComparison.OrdinalIgnoreCase) ||
                name.Contains("Secret", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }
        catch
        {
            // If element is invalid, treat as sensitive
            return true;
        }
        return false;
    }

    public string ExtractControlText(AutomationElement element)
    {
        try
        {
            if (element.TryGetCurrentPattern(ValuePattern.Pattern, out object patternObj))
            {
                var valuePattern = (ValuePattern)patternObj;
                return valuePattern.Current.Value;
            }

            if (element.TryGetCurrentPattern(TextPattern.Pattern, out object textPatternObj))
            {
                var textPattern = (TextPattern)textPatternObj;
                return textPattern.DocumentRange.GetText(-1);
            }
        }
        catch
        {
            // Ignore
        }
        return string.Empty;
    }

    public async void ProcessCapturedText(string text, string sourceApp)
    {
        var payload = new AnalysisPayload
        {
            SchemaVersion = 1,
            EventId = Guid.NewGuid().ToString(),
            SourceApp = sourceApp,
            OriginalText = text,
            Text = text,
            SentAt = DateTime.UtcNow.ToString("o"),
            PreviewOnly = _hotkeyManager.IsPreviewOnly
        };

        bool success = await _apiClient.SendAnalysisAsync(payload);
        if (!success)
        {
            _retryQueue.Enqueue(payload);
        }
    }
}
