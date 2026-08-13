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
    public void ApiClient_HttpsBaseUrlConfiguration()
    {
        var settings = new PrivacyConsentManager();
        Assert.Equal("https://lingua.factory.ai", settings.ApiUrl);

        var client = new ApiClient(settings);
        client.SetBaseUrl("https://api.lingualearn.ai");
        Assert.Equal("https://api.lingualearn.ai", settings.ApiUrl);
    }

    [Fact]
    public void PrivacyConsentManager_DeviceTokenProtection()
    {
        var settings = new PrivacyConsentManager();
        var originalToken = "YOUR_DEVICE_TOKEN_HERE";

        settings.DeviceToken = originalToken;
        Assert.Equal(originalToken, settings.DeviceToken);

        string protectedStr = PrivacyConsentManager.ProtectToken(originalToken);
        string unprotectedStr = PrivacyConsentManager.UnprotectToken(protectedStr);
        Assert.Equal(originalToken, unprotectedStr);
    }
}
