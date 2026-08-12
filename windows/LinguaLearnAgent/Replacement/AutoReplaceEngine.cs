using System;
using System.Windows.Automation;
using System.Windows.Forms;

namespace LinguaLearnAgent.Replacement;

public class AutoReplaceEngine
{
    public bool ReplaceTextInFocusedElement(AutomationElement element, string newText)
    {
        if (element == null || string.IsNullOrEmpty(newText)) return false;

        try
        {
            if (element.TryGetCurrentPattern(ValuePattern.Pattern, out object patternObj))
            {
                var valuePattern = (ValuePattern)patternObj;
                if (!valuePattern.Current.IsReadOnly)
                {
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
            // Fallback to SendKeys replacement
            SendKeys.SendWait("^a");
            SendKeys.SendWait("{BACKSPACE}");
            SendKeys.SendWait(newText);
            return true;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[AutoReplaceEngine] SendKeys fallback failed: {ex.Message}");
            return false;
        }
    }
}
