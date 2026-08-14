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

public class EnterKeyHookTests
{
    [Fact]
    public void EnterKeyHook_FiresEnterPressedEvent()
    {
        using var hook = new EnterKeyHook();
        bool eventFired = false;

        hook.EnterPressed += (sender, args) =>
        {
            eventFired = true;
        };

        hook.OnEnterPressed();

        Assert.True(eventFired, "EnterPressed event must fire on Enter key press");
    }

    [Fact]
    public async Task EnterKeyHook_TriggersCaptureOnEditableControl()
    {
        var settings = new PrivacyConsentManager();
        var filter = new CandidateFilter();
        var apiClient = new ApiClient(settings);
        using var queue = new OfflineRetryQueue(settings);
        using var hotkeyManager = new PreviewHotkeyManager();
        using var hook = new EnterKeyHook();

        var listener = new UIAutomationListener(filter, apiClient, queue, settings, hotkeyManager, hook);

        var sampleText = "I submit this text using the Enter key hook.";
        var response = await listener.TriggerEnterKeyCaptureAsync(sampleText);

        Assert.NotNull(listener.LastSentPayload);
        Assert.Equal(sampleText, listener.LastSentPayload.OriginalText);
        Assert.False(listener.LastSentPayload.PreviewOnly, "Enter key hook must trigger analysis with PreviewOnly = false");
    }

    [Fact]
    public void EnterKeyHook_HookCallback_DispatchesAsynchronouslyWithoutBlockingHookChain()
    {
        using var hook = new EnterKeyHook();
        var startTime = DateTime.UtcNow;

        // Verify OnEnterPressed fires without throwing
        hook.OnEnterPressed();
        var elapsed = (DateTime.UtcNow - startTime).TotalMilliseconds;

        Assert.True(elapsed < 100, "Hook callback must return immediately without blocking synchronous execution");
    }
}
