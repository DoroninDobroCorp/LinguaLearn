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
        var queue = new OfflineRetryQueue(settings, _tempPath);

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

    public void Dispose()
    {
        if (File.Exists(_tempPath))
        {
            try { File.Delete(_tempPath); } catch { }
        }
    }
}
