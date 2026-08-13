using System;
using System.Collections.Generic;
using System.Windows.Automation;
using LinguaLearnAgent.Network;

namespace LinguaLearnAgent.UI;

public class CorrectionUiModel
{
    public string HeaderTitle { get; set; } = string.Empty;
    public string AssessmentTier { get; set; } = "correct";
    public string OriginalText { get; set; } = string.Empty;
    public string CorrectedText { get; set; } = string.Empty;
    public string SummaryRu { get; set; } = string.Empty;
    public bool Changed { get; set; }
    public bool IsCompactChip { get; set; }
    public int AutoDismissMs { get; set; }
    public List<ErrorDetailViewModel> ErrorsList { get; set; } = new();
}

public class ErrorDetailViewModel
{
    public string Original { get; set; } = string.Empty;
    public string Correction { get; set; } = string.Empty;
    public string ExplanationRu { get; set; } = string.Empty;
    public string Topic { get; set; } = string.Empty;
    public string? Kind { get; set; }
    public string? Category { get; set; }
    public string? Level { get; set; }
    public string DetailsText => $"{Original} ➔ {Correction} ({Topic}{(string.IsNullOrEmpty(Kind) ? "" : $" [{Kind}]")})";
}

public static class CorrectionPopupController
{
    public static AnalysisResponse? LastDisplayedResponse { get; private set; }

    public static CorrectionUiModel BuildUiModel(AnalysisResponse response)
    {
        string tier = response.Assessment ?? "correct";
        bool isClearError = response.HasClearError || string.Equals(tier, "clear_error", StringComparison.OrdinalIgnoreCase);
        bool isManualPreview = response.PreviewOnly;

        bool showFullCard = isClearError || isManualPreview;

        string displayCorrected = !string.IsNullOrWhiteSpace(response.RecommendedText)
            ? response.RecommendedText
            : response.CorrectedText;

        var model = new CorrectionUiModel
        {
            AssessmentTier = tier,
            OriginalText = response.OriginalText,
            CorrectedText = displayCorrected,
            SummaryRu = string.IsNullOrWhiteSpace(response.SummaryRu) ?
                (isClearError ? "Найдены ошибки в тексте." : (isManualPreview ? "Предварительный просмотр фраз." : "Ошибок не обнаружено.")) : response.SummaryRu,
            Changed = response.Changed,
            IsCompactChip = !showFullCard,
            AutoDismissMs = !showFullCard ? 1800 : 0
        };

        if (showFullCard)
        {
            model.HeaderTitle = isManualPreview ? "Grammar Preview (Hotkey)" : "Grammar Correction Card";

            if (response.Errors != null)
            {
                foreach (var err in response.Errors)
                {
                    model.ErrorsList.Add(new ErrorDetailViewModel
                    {
                        Original = err.Original,
                        Correction = err.Correction,
                        ExplanationRu = err.ExplanationRu,
                        Topic = err.Topic,
                        Kind = string.IsNullOrEmpty(err.Kind) ? "grammar_error" : err.Kind,
                        Category = err.Category,
                        Level = err.Level
                    });
                }
            }

            if (response.MechanicalCorrections != null)
            {
                foreach (var mech in response.MechanicalCorrections)
                {
                    model.ErrorsList.Add(new ErrorDetailViewModel
                    {
                        Original = mech.Original,
                        Correction = mech.Correction,
                        ExplanationRu = mech.ExplanationRu,
                        Topic = string.IsNullOrEmpty(mech.Topic) ? "Опечатки и оформление" : mech.Topic,
                        Kind = string.IsNullOrEmpty(mech.Kind) ? "mechanical" : mech.Kind,
                        Category = mech.Category,
                        Level = mech.Level
                    });
                }
            }

            if (response.OptionalSuggestions != null)
            {
                foreach (var opt in response.OptionalSuggestions)
                {
                    model.ErrorsList.Add(new ErrorDetailViewModel
                    {
                        Original = opt.Original,
                        Correction = opt.Correction,
                        ExplanationRu = opt.ExplanationRu,
                        Topic = string.IsNullOrEmpty(opt.Topic) ? "Рекомендации по стилю" : opt.Topic,
                        Kind = string.IsNullOrEmpty(opt.Kind) ? "style" : opt.Kind,
                        Category = opt.Category,
                        Level = opt.Level
                    });
                }
            }
        }
        else
        {
            model.HeaderTitle = "Grammar OK ✓";
        }

        return model;
    }

    public static void ShowResponse(AnalysisResponse response, AutomationElement? focusedElement = null)
    {
        LastDisplayedResponse = response;
        var uiModel = BuildUiModel(response);
        try
        {
            if (System.Windows.Application.Current != null)
            {
                System.Windows.Application.Current.Dispatcher.Invoke(() =>
                {
                    var popup = new CorrectionPopupWindow(response, focusedElement);
                    popup.Show();
                });
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[CorrectionPopupController] Non-GUI environment popup display: {ex.Message}");
        }
    }
}
