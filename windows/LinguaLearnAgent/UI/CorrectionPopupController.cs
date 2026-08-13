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
    public string DetailsText => $"{Original} ➔ {Correction} ({Topic})";
}

public static class CorrectionPopupController
{
    public static AnalysisResponse? LastDisplayedResponse { get; private set; }

    public static CorrectionUiModel BuildUiModel(AnalysisResponse response)
    {
        string tier = response.Assessment ?? "correct";
        bool isClearError = string.Equals(tier, "clear_error", StringComparison.OrdinalIgnoreCase);

        var model = new CorrectionUiModel
        {
            AssessmentTier = tier,
            OriginalText = response.OriginalText,
            CorrectedText = response.CorrectedText,
            SummaryRu = string.IsNullOrWhiteSpace(response.SummaryRu) ?
                (isClearError ? "Найдены ошибки в тексте." : "Ошибок не обнаружено.") : response.SummaryRu,
            Changed = response.Changed,
            IsCompactChip = !isClearError,
            AutoDismissMs = !isClearError ? 1800 : 0
        };

        if (isClearError)
        {
            model.HeaderTitle = "Grammar Correction Card";
            foreach (var err in response.Errors)
            {
                model.ErrorsList.Add(new ErrorDetailViewModel
                {
                    Original = err.Original,
                    Correction = err.Correction,
                    ExplanationRu = err.ExplanationRu,
                    Topic = err.Topic
                });
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
