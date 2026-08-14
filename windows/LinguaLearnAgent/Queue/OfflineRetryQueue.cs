using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using LinguaLearnAgent.Network;
using LinguaLearnAgent.Settings;

namespace LinguaLearnAgent.Queue;

public class RetryQueueItem
{
    [JsonPropertyName("payload")]
    public AnalysisPayload Payload { get; set; } = new();

    [JsonPropertyName("retryCount")]
    public int RetryCount { get; set; } = 0;

    [JsonPropertyName("nextAttemptAt")]
    public DateTime NextAttemptAt { get; set; } = DateTime.UtcNow;
}

public class OfflineRetryQueue : IDisposable
{
    private readonly PrivacyConsentManager _settings;
    private readonly string _queueFilePath;
    private readonly List<RetryQueueItem> _queue = new();
    private CancellationTokenSource? _cts;
    private Task? _backgroundTask;

    public event EventHandler<string>? QueueCorruptQuarantined;

    public int Count
    {
        get
        {
            lock (_queue) return _queue.Count;
        }
    }

    public OfflineRetryQueue(PrivacyConsentManager settings, string? customPath = null)
    {
        _settings = settings;
        string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        string folder = Path.Combine(appData, "LinguaLearnAgent");
        Directory.CreateDirectory(folder);
        _queueFilePath = customPath ?? Path.Combine(folder, "offline_retry_queue.dat");
        LoadQueue();
    }

    public void Enqueue(AnalysisPayload payload)
    {
        lock (_queue)
        {
            _queue.Add(new RetryQueueItem
            {
                Payload = payload,
                RetryCount = 0,
                NextAttemptAt = DateTime.UtcNow
            });
            SaveQueue();
        }
    }

    public AnalysisPayload? Dequeue()
    {
        lock (_queue)
        {
            if (_queue.Count == 0) return null;
            var item = _queue[0];
            _queue.RemoveAt(0);
            SaveQueue();
            return item.Payload;
        }
    }

    public async Task<int> RetryAllAsync(ApiClient apiClient)
    {
        List<RetryQueueItem> snapshot;
        lock (_queue)
        {
            if (_queue.Count == 0) return 0;
            snapshot = new List<RetryQueueItem>(_queue);
        }

        int processed = 0;
        var remaining = new List<RetryQueueItem>();
        DateTime now = DateTime.UtcNow;

        foreach (var item in snapshot)
        {
            if (now < item.NextAttemptAt)
            {
                remaining.Add(item);
                continue;
            }

            bool success = await apiClient.SendAnalysisAsync(item.Payload);
            if (success)
            {
                processed++;
            }
            else
            {
                item.RetryCount++;
                double delaySeconds = Math.Min(60.0, Math.Pow(2, item.RetryCount));
                item.NextAttemptAt = DateTime.UtcNow.AddSeconds(delaySeconds);
                remaining.Add(item);
            }
        }

        lock (_queue)
        {
            _queue.Clear();
            _queue.AddRange(remaining);
            SaveQueue();
        }

        return processed;
    }

    public int RetryAll(ApiClient apiClient)
    {
        return RetryAllAsync(apiClient).GetAwaiter().GetResult();
    }

    public void StartBackgroundProcessor(ApiClient apiClient, TimeSpan checkInterval)
    {
        StopBackgroundProcessor();
        _cts = new CancellationTokenSource();
        var token = _cts.Token;

        _backgroundTask = Task.Run(async () =>
        {
            while (!token.IsCancellationRequested)
            {
                try
                {
                    await Task.Delay(checkInterval, token);
                    if (_settings.IsPaused) continue;
                    await RetryAllAsync(apiClient);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[OfflineRetryQueue] Background retry error: {ex.Message}");
                }
            }
        }, token);
    }

    public void StopBackgroundProcessor()
    {
        if (_cts != null)
        {
            _cts.Cancel();
            _cts.Dispose();
            _cts = null;
        }
    }

    public void SaveQueue()
    {
        try
        {
            string json = JsonSerializer.Serialize(_queue);
            byte[] rawBytes = Encoding.UTF8.GetBytes(json);
            byte[] protectedBytes;

            if (OperatingSystem.IsWindows())
            {
                try
                {
                    protectedBytes = ProtectedData.Protect(rawBytes, null, DataProtectionScope.CurrentUser);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[OfflineRetryQueue] DPAPI Protect failed: {ex.Message}");
                    return; // FAIL CLOSED: Do not write unencrypted raw bytes!
                }
            }
            else
            {
                protectedBytes = rawBytes;
            }

            File.WriteAllBytes(_queueFilePath, protectedBytes);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[OfflineRetryQueue] Save failed: {ex.Message}");
        }
    }

    public void LoadQueue()
    {
        try
        {
            if (File.Exists(_queueFilePath))
            {
                byte[] protectedBytes = File.ReadAllBytes(_queueFilePath);
                if (protectedBytes.Length == 0) return;

                byte[] rawBytes;

                if (OperatingSystem.IsWindows())
                {
                    try
                    {
                        rawBytes = ProtectedData.Unprotect(protectedBytes, null, DataProtectionScope.CurrentUser);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[OfflineRetryQueue] DPAPI Unprotect failed: {ex.Message}");
                        QuarantineQueueFile($"DPAPI unprotect failed: {ex.Message}");
                        return; // FAIL CLOSED: Do not load unencrypted or corrupt queue data
                    }
                }
                else
                {
                    rawBytes = protectedBytes;
                }

                string json = Encoding.UTF8.GetString(rawBytes);
                try
                {
                    var items = JsonSerializer.Deserialize<List<RetryQueueItem>>(json);
                    if (items != null)
                    {
                        lock (_queue)
                        {
                            _queue.Clear();
                            _queue.AddRange(items);
                        }
                        return;
                    }
                }
                catch
                {
                    try
                    {
                        var legacyItems = JsonSerializer.Deserialize<List<AnalysisPayload>>(json);
                        if (legacyItems != null)
                        {
                            lock (_queue)
                            {
                                _queue.Clear();
                                foreach (var p in legacyItems)
                                {
                                    _queue.Add(new RetryQueueItem { Payload = p });
                                }
                            }
                            return;
                        }
                    }
                    catch
                    {
                        QuarantineQueueFile("JSON deserialization failed");
                        return;
                    }
                }

                QuarantineQueueFile("Invalid queue format");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[OfflineRetryQueue] Load failed: {ex.Message}");
            QuarantineQueueFile($"Load failed: {ex.Message}");
        }
    }

    public void QuarantineQueueFile(string reason)
    {
        try
        {
            if (File.Exists(_queueFilePath))
            {
                string quarantinePath = $"{_queueFilePath}.quarantine";
                if (File.Exists(quarantinePath))
                {
                    File.Delete(quarantinePath);
                }
                File.Move(_queueFilePath, quarantinePath);
                Console.WriteLine($"[OfflineRetryQueue] Quarantined corrupt queue file to {quarantinePath}: {reason}");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[OfflineRetryQueue] Quarantine failed: {ex.Message}");
        }

        string message = $"Corrupt offline queue file quarantined: {reason}";
        QueueCorruptQuarantined?.Invoke(this, message);
    }

    public void Dispose()
    {
        StopBackgroundProcessor();
    }
}
