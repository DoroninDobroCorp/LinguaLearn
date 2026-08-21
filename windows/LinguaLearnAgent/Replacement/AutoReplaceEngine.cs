using System;
using System.Windows.Automation;
using System.Windows.Forms;

namespace LinguaLearnAgent.Replacement;

public class AutoReplaceEngine
{
    public bool ReplaceTextInFocusedElement(AutomationElement element, string newText)
    {
        return ReplaceTextInFocusedElement(element, string.Empty, newText);
    }

    public bool ReplaceTextInFocusedElement(AutomationElement element, string originalText, string newText)
    {
        if (element == null || string.IsNullOrEmpty(newText)) return false;

        try
        {
            if (element.TryGetCurrentPattern(ValuePattern.Pattern, out object patternObj))
            {
                var valuePattern = (ValuePattern)patternObj;
                if (!valuePattern.Current.IsReadOnly)
                {
                    string currentText = valuePattern.Current.Value ?? string.Empty;

                    // Stale draft check: if the text in the control changed since analysis began,
                    // do not delete or overwrite the user's new input. Fall back to copying to clipboard.
                    if (!string.IsNullOrEmpty(originalText) &&
                        !string.Equals(currentText, originalText, StringComparison.Ordinal) &&
                        !currentText.EndsWith(originalText, StringComparison.Ordinal))
                    {
                        Clipboard.SetText(newText);
                        return false;
                    }

                    valuePattern.SetValue(newText);
                    return true;
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[AutoReplaceEngine] ValuePattern set failed: {ex.Message}");
        }

        try
        {
            // If AutomationElement pattern is unavailable or stale, copy to clipboard for safety
            Clipboard.SetText(newText);
            return false;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[AutoReplaceEngine] Clipboard fallback failed: {ex.Message}");
            return false;
        }
    }
}
