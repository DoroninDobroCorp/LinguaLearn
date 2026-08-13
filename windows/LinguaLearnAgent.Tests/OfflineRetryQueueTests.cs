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

    public void Dispose()
    {
        if (File.Exists(_tempPath))
        {
            try { File.Delete(_tempPath); } catch { }
        }
    }
}
