using System;
using System.Collections.Generic;
using System.Text.Json;
using LinguaLearnAgent.Network;
using LinguaLearnAgent.UI;

namespace LinguaLearnAgent.Tests;

public class ResponseParserTests
{
    private static readonly JsonSerializerOptions JsonOptions = new JsonSerializerOptions
    {
        PropertyNameCaseInsensitive = true
    };

    public static void RunAll()
    {
        string jsonClearError = @"{
            ""accepted"": true,
            ""schemaVersion"": 1,
            ""eventId"": ""win-evt-001"",
            ""sourceApp"": ""LinguaLearnAgent"",
            ""originalText"": ""She don't know the answer."",
            ""correctedText"": ""She does not know the answer."",
            ""recommendedText"": ""She does not know the answer."",
            ""changed"": true,
            ""assessment"": ""clear_error"",
            ""hasClearError"": true,
            ""summaryRu"": ""Исправлена форма глагола в Present Simple."",
            ""errors"": [
                {
                    ""original"": ""don't"",
                    ""correction"": ""doesn't"",
                    ""explanationRu"": ""Используйте doesn't для третьего лица."",
                    ""topic"": ""Present Simple"",
                    ""confidence"": 0.95,
                    ""level"": ""A2"",
                    ""kind"": ""grammar_error"",
                    ""category"": ""verb_tense""
                }
            ],
            ""topicEvidence"": [],
            ""previewOnly"": false
        }";

        var respClearError = JsonSerializer.Deserialize<AnalysisResponse>(jsonClearError, JsonOptions);
        if (respClearError == null) throw new Exception("Failed to deserialize clear_error response");
        if (respClearError.Assessment != "clear_error") throw new Exception("Assessment mismatch");
        if (!respClearError.HasClearError) throw new Exception("hasClearError mismatch");
        if (respClearError.Errors.Count != 1) throw new Exception("Errors count mismatch");
        if (respClearError.Errors[0].Kind != "grammar_error") throw new Exception("Error kind mismatch");

        var uiModelClearError = CorrectionPopupController.BuildUiModel(respClearError);
        if (uiModelClearError.IsCompactChip) throw new Exception("clear_error must NOT be compact chip");
        if (uiModelClearError.ErrorsList.Count != 1) throw new Exception("Error detail count mismatch");

        string jsonCompact = @"{
            ""accepted"": true,
            ""schemaVersion"": 1,
            ""eventId"": ""win-evt-002"",
            ""sourceApp"": ""LinguaLearnAgent"",
            ""originalText"": ""She does not know."",
            ""correctedText"": ""She does not know."",
            ""changed"": false,
            ""assessment"": ""correct"",
            ""hasClearError"": false,
            ""summaryRu"": ""Ошибок не обнаружено."",
            ""errors"": [],
            ""topicEvidence"": [],
            ""previewOnly"": false
        }";

        var respCompact = JsonSerializer.Deserialize<AnalysisResponse>(jsonCompact, JsonOptions);
        if (respCompact == null) throw new Exception("Failed to deserialize correct response");

        var uiModelCompact = CorrectionPopupController.BuildUiModel(respCompact);
        if (!uiModelCompact.IsCompactChip) throw new Exception("correct assessment must render compact chip");
        if (uiModelCompact.AutoDismissMs != 1800) throw new Exception("Compact chip must set auto dismiss timer");

        Console.WriteLine("[ResponseParserTests] All C# response parser tests passed.");
    }
}
