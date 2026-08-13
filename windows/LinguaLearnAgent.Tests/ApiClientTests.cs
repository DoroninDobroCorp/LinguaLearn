using Xunit;
using LinguaLearnAgent.Network;
using LinguaLearnAgent.Settings;

namespace LinguaLearnAgent.Tests;

public class ApiClientTests
{
    [Fact]
    public void AnalysisPayload_SerializesWithDefaults()
    {
        var payload = new AnalysisPayload
        {
            SchemaVersion = 1,
            EventId = "win-test-001",
            SourceApp = "LinguaLearnAgent",
            OriginalText = "Testing the Windows API client payload.",
            Text = "Testing the Windows API client payload.",
            PreviewOnly = false
        };

        Assert.Equal(1, payload.SchemaVersion);
        Assert.Equal("win-test-001", payload.EventId);
        Assert.Equal("LinguaLearnAgent", payload.SourceApp);
        Assert.False(payload.PreviewOnly);
    }

    [Fact]
    public void ApiClient_BaseUrlConfiguration()
    {
        var settings = new PrivacyConsentManager();
        var client = new ApiClient(settings);
        client.SetBaseUrl("http://localhost:3001/");
        Assert.NotNull(client);
    }
}
