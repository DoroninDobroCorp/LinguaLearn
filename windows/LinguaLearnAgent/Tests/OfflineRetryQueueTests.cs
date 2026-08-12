using System;
using System.IO;
using LinguaLearnAgent.Network;
using LinguaLearnAgent.Queue;
using LinguaLearnAgent.Settings;

namespace LinguaLearnAgent.Tests;

public class OfflineRetryQueueTests
{
    public static void RunAll()
    {
        string tempPath = Path.Combine(Path.GetTempPath(), "test_retry_queue.json");
        if (File.Exists(tempPath)) File.Delete(tempPath);

        var settings = new PrivacyConsentManager();
        var queue = new OfflineRetryQueue(settings, tempPath);

        queue.Enqueue(new AnalysisPayload { OriginalText = "First failed item." });
        queue.Enqueue(new AnalysisPayload { OriginalText = "Second failed item." });

        if (queue.Count != 2) throw new Exception("Enqueue failed");

        var item = queue.Dequeue();
        if (item?.OriginalText != "First failed item.") throw new Exception("Dequeue order mismatch");

        if (File.Exists(tempPath)) File.Delete(tempPath);

        Console.WriteLine("[OfflineRetryQueueTests] All C# offline queue tests passed.");
    }
}
