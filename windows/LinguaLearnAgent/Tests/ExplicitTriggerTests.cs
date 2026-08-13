using System;
using LinguaLearnAgent.Filter;
using LinguaLearnAgent.Hotkey;
using LinguaLearnAgent.Network;
using LinguaLearnAgent.Queue;
using LinguaLearnAgent.Settings;
using LinguaLearnAgent.UIAutomation;

namespace LinguaLearnAgent.Tests;

public class ExplicitTriggerTests
{
    public static void RunAll()
    {
        var settings = new PrivacyConsentManager();
        var filter = new CandidateFilter();
        var apiClient = new ApiClient(settings);
        using var queue = new OfflineRetryQueue(settings);
        using var hotkeyManager = new PreviewHotkeyManager();

        var listener = new UIAutomationListener(filter, apiClient, queue, settings, hotkeyManager);

        // 1. Verify focus-change capture does NOT set LastSentPayload automatically
        if (listener.LastSentPayload != null)
        {
            throw new Exception("Focus-change capture must NOT trigger analysis automatically");
        }

        // 2. Verify explicit Send trigger creates payload with PreviewOnly = false
        var sendTask = listener.TriggerSendCaptureAsync("I writes an English sentence on my Windows desktop.");
        sendTask.Wait();

        if (listener.LastSentPayload == null)
        {
            throw new Exception("Explicit Send trigger must create LastSentPayload");
        }

        if (listener.LastSentPayload.PreviewOnly != false)
        {
            throw new Exception("Explicit Send trigger must set PreviewOnly = false");
        }

        // 3. Verify explicit Hotkey trigger creates payload with PreviewOnly = true
        var hotkeyTask = listener.TriggerHotkeyCaptureAsync("She don't know the answer to this question.");
        hotkeyTask.Wait();

        if (listener.LastSentPayload == null)
        {
            throw new Exception("Explicit Hotkey trigger must create LastSentPayload");
        }

        if (listener.LastSentPayload.PreviewOnly != true)
        {
            throw new Exception("Explicit Hotkey trigger must set PreviewOnly = true");
        }

        Console.WriteLine("[ExplicitTriggerTests] All C# explicit trigger tests passed.");
    }
}
