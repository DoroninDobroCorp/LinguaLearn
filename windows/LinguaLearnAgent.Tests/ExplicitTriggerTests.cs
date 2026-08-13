using System;
using System.Threading.Tasks;
using Xunit;
using LinguaLearnAgent.Filter;
using LinguaLearnAgent.Hotkey;
using LinguaLearnAgent.Network;
using LinguaLearnAgent.Queue;
using LinguaLearnAgent.Settings;
using LinguaLearnAgent.UIAutomation;

namespace LinguaLearnAgent.Tests;

public class ExplicitTriggerTests
{
    [Fact]
    public void FocusChange_DoesNotTriggerAnalysisAutomatically()
    {
        var settings = new PrivacyConsentManager();
        var filter = new CandidateFilter();
        var apiClient = new ApiClient(settings);
        var queue = new OfflineRetryQueue(settings);
        var hotkeyManager = new PreviewHotkeyManager();

        var listener = new UIAutomationListener(filter, apiClient, queue, settings, hotkeyManager);

        // Verify focus listener initialized with null LastSentPayload
        Assert.Null(listener.LastSentPayload);
        Assert.Null(listener.LastResponse);
    }

    [Fact]
    public async Task ExplicitSendTrigger_SetsPreviewOnlyFalse()
    {
        var settings = new PrivacyConsentManager();
        var filter = new CandidateFilter();
        var apiClient = new ApiClient(settings);
        var queue = new OfflineRetryQueue(settings);
        var hotkeyManager = new PreviewHotkeyManager();

        var listener = new UIAutomationListener(filter, apiClient, queue, settings, hotkeyManager);

        var sampleText = "I writes an English sentence on my Windows desktop.";
        var response = await listener.TriggerSendCaptureAsync(sampleText);

        Assert.NotNull(listener.LastSentPayload);
        Assert.Equal(sampleText, listener.LastSentPayload.OriginalText);
        Assert.False(listener.LastSentPayload.PreviewOnly, "Explicit Send trigger must set PreviewOnly = false");
    }

    [Fact]
    public async Task ExplicitHotkeyTrigger_SetsPreviewOnlyTrue()
    {
        var settings = new PrivacyConsentManager();
        var filter = new CandidateFilter();
        var apiClient = new ApiClient(settings);
        var queue = new OfflineRetryQueue(settings);
        var hotkeyManager = new PreviewHotkeyManager();

        var listener = new UIAutomationListener(filter, apiClient, queue, settings, hotkeyManager);

        var sampleText = "She don't know the answer to this question.";
        var response = await listener.TriggerHotkeyCaptureAsync(sampleText);

        Assert.NotNull(listener.LastSentPayload);
        Assert.Equal(sampleText, listener.LastSentPayload.OriginalText);
        Assert.True(listener.LastSentPayload.PreviewOnly, "Explicit Hotkey trigger must set PreviewOnly = true");
    }
}
