using System;
using LinguaLearnAgent.Network;
using LinguaLearnAgent.Settings;

namespace LinguaLearnAgent.Tests;

public class ApiClientTests
{
    public static void RunAll()
    {
        var settings = new PrivacyConsentManager();
        settings.DeviceToken = "YOUR_DEVICE_TOKEN_HERE";
        if (settings.ApiUrl != "https://lingua.factory.ai") throw new Exception("Default ApiUrl must be HTTPS https://lingua.factory.ai");

        var client = new ApiClient(settings);
        client.SetBaseUrl("https://api.lingualearn.ai");
        if (settings.ApiUrl != "https://api.lingualearn.ai") throw new Exception("SetBaseUrl must update settings ApiUrl");

        var payload = new AnalysisPayload
        {
            SchemaVersion = 1,
            EventId = "win-test-001",
            SourceApp = "LinguaLearnAgent",
            OriginalText = "Testing the Windows API client payload.",
            Text = "Testing the Windows API client payload.",
            PreviewOnly = false
        };

        if (payload.SchemaVersion != 1) throw new Exception("SchemaVersion must be 1");
        if (payload.SourceApp != "LinguaLearnAgent") throw new Exception("SourceApp mismatch");

        Console.WriteLine("[ApiClientTests] All C# API client tests passed.");
    }
}
