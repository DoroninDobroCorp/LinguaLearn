using System.Text.Json;
using Xunit;
using LinguaLearnAgent.Network;
using LinguaLearnAgent.UI;

namespace LinguaLearnAgent.Tests;

public class ResponseParserTests
{
    private static readonly JsonSerializerOptions JsonOptions = new JsonSerializerOptions
    {
        PropertyNameCaseInsensitive = true
    };

    [Fact]
    public void ClearErrorResponse_DecodesStructuredFields_RendersLargeCard()
    {
        string json = @"{
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
            ""mechanicalCorrections"": [],
            ""optionalSuggestions"": [],
            ""topicEvidence"": [],
            ""previewOnly"": false
        }";

        var response = JsonSerializer.Deserialize<AnalysisResponse>(json, JsonOptions);

        Assert.NotNull(response);
        Assert.True(response.Accepted);
        Assert.Equal("clear_error", response.Assessment);
        Assert.True(response.HasClearError);
        Assert.Equal("She does not know the answer.", response.RecommendedText);
        Assert.Single(response.Errors);

        var err = response.Errors[0];
        Assert.Equal("don't", err.Original);
        Assert.Equal("doesn't", err.Correction);
        Assert.Equal("A2", err.Level);
        Assert.Equal("grammar_error", err.Kind);
        Assert.Equal("verb_tense", err.Category);

        var uiModel = CorrectionPopupController.BuildUiModel(response);
        Assert.False(uiModel.IsCompactChip, "clear_error response must render full card");
        Assert.Equal("Grammar Correction Card", uiModel.HeaderTitle);
        Assert.Single(uiModel.ErrorsList);
        Assert.Equal("grammar_error", uiModel.ErrorsList[0].Kind);
        Assert.Equal("verb_tense", uiModel.ErrorsList[0].Category);
    }

    [Fact]
    public void CompactChipResponse_RendersGrammarOk()
    {
        string json = @"{
            ""accepted"": true,
            ""schemaVersion"": 1,
            ""eventId"": ""win-evt-002"",
            ""sourceApp"": ""LinguaLearnAgent"",
            ""originalText"": ""She does not know."",
            ""correctedText"": ""She does not know."",
            ""recommendedText"": ""She does not know."",
            ""changed"": false,
            ""assessment"": ""correct"",
            ""hasClearError"": false,
            ""summaryRu"": ""Ошибок не обнаружено."",
            ""errors"": [],
            ""mechanicalCorrections"": [],
            ""optionalSuggestions"": [],
            ""topicEvidence"": [],
            ""previewOnly"": false
        }";

        var response = JsonSerializer.Deserialize<AnalysisResponse>(json, JsonOptions);

        Assert.NotNull(response);
        Assert.Equal("correct", response.Assessment);
        Assert.False(response.HasClearError);

        var uiModel = CorrectionPopupController.BuildUiModel(response);
        Assert.True(uiModel.IsCompactChip, "correct assessment must render compact chip");
        Assert.Equal("Grammar OK ✓", uiModel.HeaderTitle);
        Assert.Equal(1800, uiModel.AutoDismissMs);
    }

    [Fact]
    public void MechanicalOnlyResponse_RendersCompactChip()
    {
        string json = @"{
            ""accepted"": true,
            ""schemaVersion"": 1,
            ""eventId"": ""win-evt-003"",
            ""sourceApp"": ""LinguaLearnAgent"",
            ""originalText"": ""she does not know."",
            ""correctedText"": ""She does not know."",
            ""recommendedText"": ""She does not know."",
            ""changed"": true,
            ""assessment"": ""mechanical_only"",
            ""hasClearError"": false,
            ""summaryRu"": ""Механические исправления."",
            ""errors"": [],
            ""mechanicalCorrections"": [
                {
                    ""original"": ""she"",
                    ""correction"": ""She"",
                    ""explanationRu"": ""Капитализация первой буквы."",
                    ""topic"": ""Capitalization"",
                    ""confidence"": 0.99,
                    ""kind"": ""mechanical"",
                    ""category"": ""capitalization""
                }
            ],
            ""optionalSuggestions"": [],
            ""topicEvidence"": [],
            ""previewOnly"": false
        }";

        var response = JsonSerializer.Deserialize<AnalysisResponse>(json, JsonOptions);

        Assert.NotNull(response);
        Assert.Equal("mechanical_only", response.Assessment);
        Assert.False(response.HasClearError);
        Assert.Single(response.MechanicalCorrections);

        var uiModel = CorrectionPopupController.BuildUiModel(response);
        Assert.True(uiModel.IsCompactChip, "mechanical_only assessment must render compact chip");
        Assert.Equal("Grammar OK ✓", uiModel.HeaderTitle);
        Assert.Equal(1800, uiModel.AutoDismissMs);
    }
}
