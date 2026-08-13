using System;
using System.Threading.Tasks;
using System.Windows.Automation;
using LinguaLearnAgent.Filter;
using LinguaLearnAgent.Hotkey;
using LinguaLearnAgent.Network;
using LinguaLearnAgent.Queue;
using LinguaLearnAgent.Settings;
using LinguaLearnAgent.UI;

namespace LinguaLearnAgent.UIAutomation;

public class UIAutomationListener
{
    private readonly CandidateFilter _filter;
    private readonly ApiClient _apiClient;
    private readonly OfflineRetryQueue _retryQueue;
    private readonly PrivacyConsentManager _settings;
    private readonly PreviewHotkeyManager _hotkeyManager;
    private readonly EnterKeyHook _enterKeyHook;
    private AutomationElement? _currentFocusedElement;
    private bool _isListening;

    public AutomationElement? CurrentFocusedElement => _currentFocusedElement;
    public AnalysisPayload? LastSentPayload { get; private set; }
    public AnalysisResponse? LastResponse { get; private set; }
    public EnterKeyHook EnterKeyHook => _enterKeyHook;

    public UIAutomationListener(
        CandidateFilter filter,
        ApiClient apiClient,
        OfflineRetryQueue retryQueue,
        PrivacyConsentManager settings,
        PreviewHotkeyManager hotkeyManager,
        EnterKeyHook? enterKeyHook = null)
    {
        _filter = filter;
        _apiClient = apiClient;
        _retryQueue = retryQueue;
        _settings = settings;
        _hotkeyManager = hotkeyManager;
        _enterKeyHook = enterKeyHook ?? new EnterKeyHook();
    }

    public void StartListening()
    {
        if (_isListening) return;
        try
        {
            Automation.AddAutomationFocusChangedEventHandler(OnFocusChanged);
            _enterKeyHook.EnterPressed += OnEnterKeyPressed;
            _enterKeyHook.Start();
            _isListening = true;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[UIAutomationListener] Failed to attach focus or keyhook handler: {ex.Message}");
        }
    }

    public void StopListening()
    {
        if (!_isListening) return;
        try
        {
            Automation.RemoveAutomationFocusChangedEventHandler(OnFocusChanged);
            _enterKeyHook.EnterPressed -= OnEnterKeyPressed;
            _enterKeyHook.Stop();
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
            if (sender is AutomationElement element)
            {
                _currentFocusedElement = element;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[UIAutomationListener] Focus change tracking error: {ex.Message}");
        }
    }

    public async void OnEnterKeyPressed(object? sender, EventArgs e)
    {
        await TriggerEnterKeyCaptureAsync();
    }

    public async Task<AnalysisResponse?> TriggerEnterKeyCaptureAsync(string? textOverride = null)
    {
        if (_settings.IsPaused) return null;

        if (_currentFocusedElement != null && IsSecureField(_currentFocusedElement))
        {
            Console.WriteLine("[UIAutomationListener] [EnterKeyHook] Excluded secure/password field.");
            return null;
        }

        return await ExecuteTriggerAsync(textOverride, previewOnly: false, triggerName: "EnterKeyHookTrigger");
    }

    public async Task<AnalysisResponse?> TriggerSendCaptureAsync(string? textOverride = null)
    {
        return await ExecuteTriggerAsync(textOverride, previewOnly: _hotkeyManager.IsPreviewOnly, triggerName: "SendTrigger");
    }

    public async Task<AnalysisResponse?> TriggerHotkeyCaptureAsync(string? textOverride = null)
    {
        return await ExecuteTriggerAsync(textOverride, previewOnly: true, triggerName: "HotkeyTrigger");
    }

    private async Task<AnalysisResponse?> ExecuteTriggerAsync(string? textOverride, bool previewOnly, string triggerName)
    {
        if (_settings.IsPaused) return null;

        string text = textOverride ?? string.Empty;
        string sourceApp = "WindowsEditControl";

        if (string.IsNullOrWhiteSpace(text) && _currentFocusedElement != null)
        {
            if (IsSecureField(_currentFocusedElement))
            {
                Console.WriteLine($"[UIAutomationListener] [{triggerName}] Ignored secure/password field.");
                return null;
            }
            text = ExtractControlText(_currentFocusedElement);
            try
            {
                sourceApp = _currentFocusedElement.Current.LocalizedControlType ?? "WindowsEditControl";
            }
            catch { }
        }

        if (string.IsNullOrWhiteSpace(text)) return null;

        var filterResult = _filter.FilterCandidate(text, isSecureField: false);
        if (!filterResult.Accepted)
        {
            Console.WriteLine($"[UIAutomationListener] [{triggerName}] Candidate rejected: {filterResult.Reason}");
            return null;
        }

        var payload = new AnalysisPayload
        {
            SchemaVersion = 1,
            EventId = Guid.NewGuid().ToString(),
            SourceApp = sourceApp,
            OriginalText = text,
            Text = text,
            SentAt = DateTime.UtcNow.ToString("o"),
            PreviewOnly = previewOnly
        };

        LastSentPayload = payload;

        var response = await _apiClient.AnalyzeWritingAsync(payload);
        LastResponse = response;

        if (response != null && response.Accepted)
        {
            CorrectionPopupController.ShowResponse(response, _currentFocusedElement);
        }
        else
        {
            _retryQueue.Enqueue(payload);
        }

        return response;
    }

    public bool IsSecureField(AutomationElement element)
    {
        try
        {
            if (element.Current.IsPassword) return true;
            string name = element.Current.Name ?? "";
            string className = element.Current.ClassName ?? "";
            string automationId = element.Current.AutomationId ?? "";
            if (name.Contains("Password", StringComparison.OrdinalIgnoreCase) ||
                className.Contains("Password", StringComparison.OrdinalIgnoreCase) ||
                automationId.Contains("Password", StringComparison.OrdinalIgnoreCase) ||
                name.Contains("PIN", StringComparison.OrdinalIgnoreCase) ||
                name.Contains("Secret", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }
        catch
        {
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
        await TriggerSendCaptureAsync(text);
    }
}
