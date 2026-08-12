using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using LinguaLearnAgent.Network;
using LinguaLearnAgent.Settings;

namespace LinguaLearnAgent.Queue;

public class OfflineRetryQueue
{
    private readonly PrivacyConsentManager _settings;
    private readonly string _queueFilePath;
    private readonly List<AnalysisPayload> _queue = new();

    public int Count => _queue.Count;

    public OfflineRetryQueue(PrivacyConsentManager settings, string? customPath = null)
    {
        _settings = settings;
        string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        string folder = Path.Combine(appData, "LinguaLearnAgent");
        Directory.CreateDirectory(folder);
        _queueFilePath = customPath ?? Path.Combine(folder, "offline_retry_queue.json");
        LoadQueue();
    }

    public void Enqueue(AnalysisPayload payload)
    {
        lock (_queue)
        {
            _queue.Add(payload);
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
            return item;
        }
    }

    public int RetryAll(ApiClient apiClient)
    {
        lock (_queue)
        {
            if (_queue.Count == 0) return 0;
            int processed = 0;
            var remaining = new List<AnalysisPayload>();

            foreach (var payload in _queue)
            {
                bool success = apiClient.SendAnalysisAsync(payload).GetAwaiter().GetResult();
                if (success)
                {
                    processed++;
                }
                else
                {
                    remaining.Add(payload);
                }
            }

            _queue.Clear();
            _queue.AddRange(remaining);
            SaveQueue();
            return processed;
        }
    }

    public void SaveQueue()
    {
        try
        {
            string json = JsonSerializer.Serialize(_queue);
            File.WriteAllText(_queueFilePath, json);
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
                string json = File.ReadAllText(_queueFilePath);
                var items = JsonSerializer.Deserialize<List<AnalysisPayload>>(json);
                if (items != null)
                {
                    _queue.Clear();
                    _queue.AddRange(items);
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[OfflineRetryQueue] Load failed: {ex.Message}");
        }
    }
}
