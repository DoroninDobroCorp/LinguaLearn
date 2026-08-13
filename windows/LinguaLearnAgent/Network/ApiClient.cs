using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using LinguaLearnAgent.Settings;

namespace LinguaLearnAgent.Network;

public class AnalysisPayload
{
    [JsonPropertyName("schemaVersion")]
    public int SchemaVersion { get; set; } = 1;

    [JsonPropertyName("eventId")]
    public string EventId { get; set; } = Guid.NewGuid().ToString();

    [JsonPropertyName("sourceApp")]
    public string SourceApp { get; set; } = "LinguaLearnAgent";

    [JsonPropertyName("originalText")]
    public string OriginalText { get; set; } = string.Empty;

    [JsonPropertyName("text")]
    public string Text { get; set; } = string.Empty;

    [JsonPropertyName("sentAt")]
    public string SentAt { get; set; } = DateTime.UtcNow.ToString("o");

    [JsonPropertyName("previewOnly")]
    public bool PreviewOnly { get; set; } = false;
}

public class AnalysisErrorItem
{
    [JsonPropertyName("original")]
    public string Original { get; set; } = string.Empty;

    [JsonPropertyName("correction")]
    public string Correction { get; set; } = string.Empty;

    [JsonPropertyName("explanationRu")]
    public string ExplanationRu { get; set; } = string.Empty;

    [JsonPropertyName("topic")]
    public string Topic { get; set; } = string.Empty;

    [JsonPropertyName("confidence")]
    public double Confidence { get; set; }

    [JsonPropertyName("level")]
    public string? Level { get; set; }

    [JsonPropertyName("kind")]
    public string? Kind { get; set; }

    [JsonPropertyName("category")]
    public string? Category { get; set; }
}

public class AnalysisEvidenceItem
{
    [JsonPropertyName("topic")]
    public string Topic { get; set; } = string.Empty;

    [JsonPropertyName("outcome")]
    public string Outcome { get; set; } = string.Empty;

    [JsonPropertyName("confidence")]
    public double Confidence { get; set; }

    [JsonPropertyName("explanationRu")]
    public string ExplanationRu { get; set; } = string.Empty;
}

public class AnalysisResponse
{
    [JsonPropertyName("accepted")]
    public bool Accepted { get; set; }

    [JsonPropertyName("schemaVersion")]
    public int SchemaVersion { get; set; }

    [JsonPropertyName("eventId")]
    public string EventId { get; set; } = string.Empty;

    [JsonPropertyName("sourceApp")]
    public string SourceApp { get; set; } = string.Empty;

    [JsonPropertyName("originalText")]
    public string OriginalText { get; set; } = string.Empty;

    [JsonPropertyName("correctedText")]
    public string CorrectedText { get; set; } = string.Empty;

    [JsonPropertyName("recommendedText")]
    public string RecommendedText { get; set; } = string.Empty;

    [JsonPropertyName("changed")]
    public bool Changed { get; set; }

    [JsonPropertyName("assessment")]
    public string Assessment { get; set; } = "correct";

    [JsonPropertyName("hasClearError")]
    public bool HasClearError { get; set; }

    [JsonPropertyName("summaryRu")]
    public string SummaryRu { get; set; } = string.Empty;

    [JsonPropertyName("errors")]
    public List<AnalysisErrorItem> Errors { get; set; } = new();

    [JsonPropertyName("mechanicalCorrections")]
    public List<AnalysisErrorItem> MechanicalCorrections { get; set; } = new();

    [JsonPropertyName("optionalSuggestions")]
    public List<AnalysisErrorItem> OptionalSuggestions { get; set; } = new();

    [JsonPropertyName("topicEvidence")]
    public List<AnalysisEvidenceItem> TopicEvidence { get; set; } = new();

    [JsonPropertyName("previewOnly")]
    public bool PreviewOnly { get; set; }

    [JsonPropertyName("rejectionReason")]
    public string? RejectionReason { get; set; }
}

public class ApiClient
{
    private static readonly JsonSerializerOptions JsonOptions = new JsonSerializerOptions
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly HttpClient _httpClient;
    private readonly PrivacyConsentManager _settings;
    private string _baseUrl;

    public ApiClient(PrivacyConsentManager settings, HttpClient? customClient = null)
    {
        _settings = settings;
        _httpClient = customClient ?? new HttpClient();
        _baseUrl = string.IsNullOrWhiteSpace(_settings.ApiUrl) ? "https://145.239.82.124.sslip.io/english" : _settings.ApiUrl;
    }

    public void SetBaseUrl(string baseUrl)
    {
        if (!string.IsNullOrWhiteSpace(baseUrl))
        {
            _baseUrl = baseUrl.TrimEnd('/');
            _settings.ApiUrl = _baseUrl;
        }
    }

    public async Task<AnalysisResponse?> AnalyzeWritingAsync(AnalysisPayload payload)
    {
        try
        {
            string baseUrl = !string.IsNullOrWhiteSpace(_baseUrl) ? _baseUrl : _settings.ApiUrl;
            string url = $"{baseUrl.TrimEnd('/')}/api/writing/analyze";
            string json = JsonSerializer.Serialize(payload, JsonOptions);
            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Content = new StringContent(json, Encoding.UTF8, "application/json");

            string token = _settings.DeviceToken;
            if (!string.IsNullOrWhiteSpace(token))
            {
                request.Headers.Add("Authorization", $"Bearer {token}");
            }

            using var response = await _httpClient.SendAsync(request);
            if (!response.IsSuccessStatusCode) return null;

            string respJson = await response.Content.ReadAsStringAsync();
            return JsonSerializer.Deserialize<AnalysisResponse>(respJson, JsonOptions);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[ApiClient] Analysis request failed: {ex.Message}");
            return null;
        }
    }

    public async Task<bool> SendAnalysisAsync(AnalysisPayload payload)
    {
        var result = await AnalyzeWritingAsync(payload);
        return result != null && result.Accepted;
    }

    public async Task<(bool Success, string Commit, string Version, string Error)> TestConnectionAsync()
    {
        try
        {
            string baseUrl = !string.IsNullOrWhiteSpace(_baseUrl) ? _baseUrl : _settings.ApiUrl;
            string url = $"{baseUrl.TrimEnd('/')}/health";
            using var response = await _httpClient.GetAsync(url);
            if (response.IsSuccessStatusCode)
            {
                string respJson = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(respJson);
                var root = doc.RootElement;
                string commit = root.TryGetProperty("gitCommit", out var c) ? c.GetString() ?? "unknown" : "unknown";
                string version = root.TryGetProperty("appVersion", out var v) ? v.GetString() ?? "1.0.0" : "1.0.0";
                return (true, commit, version, string.Empty);
            }
            else
            {
                return (false, "unknown", string.Empty, $"HTTP {(int)response.StatusCode}");
            }
        }
        catch (Exception ex)
        {
            return (false, "unknown", string.Empty, ex.Message);
        }
    }
}
