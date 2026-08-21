using System;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Media;
using System.Windows.Threading;
using LinguaLearnAgent.Network;
using LinguaLearnAgent.Replacement;

namespace LinguaLearnAgent.UI;

public partial class CorrectionPopupWindow : Window
{
    private readonly AnalysisResponse _response;
    private readonly AutomationElement? _targetElement;
    private readonly AutoReplaceEngine _replaceEngine = new();
    private DispatcherTimer? _autoDismissTimer;

    public CorrectionPopupWindow(AnalysisResponse response, AutomationElement? targetElement = null)
    {
        InitializeComponent();
        _response = response;
        _targetElement = targetElement;
        ApplyResponseToUi();
    }

    private void ApplyResponseToUi()
    {
        var model = CorrectionPopupController.BuildUiModel(_response);

        BadgeText.Text = model.HeaderTitle;
        SummaryTextBlock.Text = model.SummaryRu;
        OriginalTextBlock.Text = string.IsNullOrWhiteSpace(model.OriginalText) ? "" : $"Original: {model.OriginalText}";
        CorrectedTextBlock.Text = string.IsNullOrWhiteSpace(model.CorrectedText) ? "" : $"Corrected: {model.CorrectedText}";
        ErrorsListView.ItemsSource = model.ErrorsList;

        if (model.IsCompactChip)
        {
            BadgeBorder.Background = new SolidColorBrush(Color.FromRgb(34, 197, 94)); // Green
            ReplaceButton.Visibility = Visibility.Collapsed;
            this.Height = 140;

            if (model.AutoDismissMs > 0)
            {
                _autoDismissTimer = new DispatcherTimer
                {
                    Interval = TimeSpan.FromMilliseconds(model.AutoDismissMs)
                };
                _autoDismissTimer.Tick += (s, e) =>
                {
                    _autoDismissTimer.Stop();
                    Close();
                };
                _autoDismissTimer.Start();
            }
        }
        else
        {
            BadgeBorder.Background = new SolidColorBrush(Color.FromRgb(239, 68, 68)); // Red
            ReplaceButton.Visibility = _targetElement != null && model.Changed ? Visibility.Visible : Visibility.Collapsed;
            this.Height = 260;
        }
    }

    private void ReplaceButton_Click(object sender, RoutedEventArgs e)
    {
        string targetText = !string.IsNullOrWhiteSpace(_response.RecommendedText)
            ? _response.RecommendedText
            : _response.CorrectedText;

        if (_targetElement != null && !string.IsNullOrWhiteSpace(targetText))
        {
            _replaceEngine.ReplaceTextInFocusedElement(_targetElement, _response.OriginalText, targetText);
        }
        Close();
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e)
    {
        _autoDismissTimer?.Stop();
        Close();
    }
}
