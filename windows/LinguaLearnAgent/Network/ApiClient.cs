using System;
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

public class ApiClient
{
    private readonly HttpClient _httpClient;
    private readonly PrivacyConsentManager _settings;
    private string _baseUrl = "http://localhost:3001";

    public ApiClient(PrivacyConsentManager settings, HttpClient? customClient = null)
    {
        _settings = settings;
        _httpClient = customClient ?? new HttpClient();
    }

    public void SetBaseUrl(string baseUrl)
    {
        _baseUrl = baseUrl.TrimEnd('/');
    }

    public async Task<bool> SendAnalysisAsync(AnalysisPayload payload)
    {
        try
        {
            string url = $"{_baseUrl}/api/writing/analyze";
            string json = JsonSerializer.Serialize(payload);
            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Content = new StringContent(json, Encoding.UTF8, "application/json");

            string token = _settings.DeviceToken;
            if (!string.IsNullOrWhiteSpace(token))
            {
                request.Headers.Add("Authorization", $"Bearer {token}");
            }

            using var response = await _httpClient.SendAsync(request);
            return response.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[ApiClient] Analysis request failed: {ex.Message}");
            return false;
        }
    }
}
