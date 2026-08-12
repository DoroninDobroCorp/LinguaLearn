using System;
using System.Text.RegularExpressions;

namespace LinguaLearnAgent.Filter;

public record CandidateResult(bool Accepted, string? Reason);

public class CandidateFilter
{
    private static readonly Regex CyrillicRegex = new(@"[\u0400-\u04FF]", RegexOptions.Compiled);
    private static readonly Regex CodeRegex = new(@"(const\s+|let\s+|var\s+|function\s*\(|def\s+|import\s+|class\s+|SELECT\s+|INSERT\s+|return\s+|<\/?[a-z][\s\S]*>|\{|\};)", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex UrlRegex = new(@"(https?://\S+|www\.\S+|\S+@\S+\.\S+)", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex SentenceTerminatorRegex = new(@"[\.!\?]", RegexOptions.Compiled);

    public CandidateResult FilterCandidate(string text, bool isSecureField = false)
    {
        if (isSecureField)
        {
            return new CandidateResult(false, "password_or_sensitive_field");
        }

        if (string.IsNullOrWhiteSpace(text))
        {
            return new CandidateResult(false, "empty_text");
        }

        string trimmed = text.Trim();

        if (trimmed.Length < 5)
        {
            return new CandidateResult(false, "too_short");
        }

        if (CyrillicRegex.IsMatch(trimmed))
        {
            return new CandidateResult(false, "cyrillic_detected");
        }

        if (CodeRegex.IsMatch(trimmed))
        {
            return new CandidateResult(false, "code_or_command");
        }

        if (UrlRegex.IsMatch(trimmed))
        {
            return new CandidateResult(false, "url_or_email");
        }

        if (!SentenceTerminatorRegex.IsMatch(trimmed))
        {
            return new CandidateResult(false, "no_sentence_terminator");
        }

        return new CandidateResult(true, null);
    }
}
