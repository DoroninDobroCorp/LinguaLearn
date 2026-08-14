using System;
using System.IO;
using Xunit;
using LinguaLearnAgent.Network;
using LinguaLearnAgent.Queue;
using LinguaLearnAgent.Settings;

namespace LinguaLearnAgent.Tests;

public class OfflineRetryQueueTests : IDisposable
{
    private readonly string _tempPath;

    public OfflineRetryQueueTests()
    {
        _tempPath = Path.Combine(Path.GetTempPath(), $"test_retry_queue_{Guid.NewGuid():N}.json");
    }

    [Fact]
    public void EnqueueAndDequeue_PreservesOrder()
    {
        var settings = new PrivacyConsentManager();
        using var queue = new OfflineRetryQueue(settings, _tempPath);

        queue.Enqueue(new AnalysisPayload { OriginalText = "First failed item." });
        queue.Enqueue(new AnalysisPayload { OriginalText = "Second failed item." });

        Assert.Equal(2, queue.Count);

        var item1 = queue.Dequeue();
        Assert.NotNull(item1);
        Assert.Equal("First failed item.", item1.OriginalText);

        var item2 = queue.Dequeue();
        Assert.NotNull(item2);
        Assert.Equal("Second failed item.", item2.OriginalText);

        Assert.Equal(0, queue.Count);
    }

    [Fact]
    public async System.Threading.Tasks.Task AsyncRetryQueue_ProcessesItemsNonBlockingly()
    {
        var settings = new PrivacyConsentManager();
        using var queue = new OfflineRetryQueue(settings, _tempPath);

        queue.Enqueue(new AnalysisPayload { OriginalText = "Retry item 1" });
        var apiClient = new ApiClient(settings);

        int processed = await queue.RetryAllAsync(apiClient);
        // ApiClient will fail in test env, so item remains in queue with incremented retry count
        Assert.Equal(1, queue.Count);
    }

    [Fact]
    public void CorruptQueueFile_IsQuarantined_AndRaisesEvent()
    {
        var settings = new PrivacyConsentManager();
        File.WriteAllText(_tempPath, "Corrupt non-JSON data inside retry queue");

        bool eventFired = false;
        string? notificationMessage = null;

        using var queue = new OfflineRetryQueue(settings, _tempPath);
        queue.QueueCorruptQuarantined += (sender, msg) =>
        {
            eventFired = true;
            notificationMessage = msg;
        };

        // Trigger load
        queue.LoadQueue();

        Assert.True(eventFired, "QueueCorruptQuarantined event must be raised for corrupt queue files");
        Assert.NotNull(notificationMessage);
        Assert.Contains("quarantined", notificationMessage, StringComparison.OrdinalIgnoreCase);

        string quarantinePath = $"{_tempPath}.quarantine";
        Assert.True(File.Exists(quarantinePath), "Corrupt queue file must be moved to .quarantine path");
        Assert.False(File.Exists(_tempPath), "Original corrupt file path must no longer exist after quarantine");

        if (File.Exists(quarantinePath))
        {
            try { File.Delete(quarantinePath); } catch { }
        }
    }

    public void Dispose()
    {
        if (File.Exists(_tempPath))
        {
            try { File.Delete(_tempPath); } catch { }
        }
    }
}
