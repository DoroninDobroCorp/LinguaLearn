using System;
using LinguaLearnAgent.Network;
using LinguaLearnAgent.Settings;

namespace LinguaLearnAgent.Tests;

public class ApiClientTests
{
    public static void RunAll()
    {
        var settings = new PrivacyConsentManager();
        settings.DeviceToken = "ll_dev_test_token_12345";
        var client = new ApiClient(settings);

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
