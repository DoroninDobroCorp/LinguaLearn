using Xunit;
using LinguaLearnAgent.Filter;

namespace LinguaLearnAgent.Tests;

public class CandidateFilterTests
{
    [Fact]
    public void ValidEnglishSentence_Accepted()
    {
        var filter = new CandidateFilter();
        var result = filter.FilterCandidate("She does not know the answer to this question.");
        Assert.True(result.Accepted, "Valid English sentence ending with a period must be accepted");
        Assert.Null(result.Reason);
    }

    [Fact]
    public void CyrillicText_Rejected()
    {
        var filter = new CandidateFilter();
        var result = filter.FilterCandidate("Привет world!");
        Assert.False(result.Accepted, "Text containing Cyrillic must be rejected");
        Assert.Equal("cyrillic_detected", result.Reason);
    }

    [Fact]
    public void CodeOrCommand_Rejected()
    {
        var filter = new CandidateFilter();
        var result = filter.FilterCandidate("const x = () => { return 42; };");
        Assert.False(result.Accepted, "Code constructs must be rejected");
        Assert.Equal("code_or_command", result.Reason);
    }

    [Fact]
    public void UrlOrEmail_Rejected()
    {
        var filter = new CandidateFilter();
        var result = filter.FilterCandidate("Visit https://example.com for info.");
        Assert.False(result.Accepted, "Text containing URLs must be rejected");
        Assert.Equal("url_or_email", result.Reason);
    }

    [Fact]
    public void SecureField_Rejected()
    {
        var filter = new CandidateFilter();
        var result = filter.FilterCandidate("secretpassword123.", isSecureField: true);
        Assert.False(result.Accepted, "Secure password input field must be rejected");
        Assert.Equal("password_or_sensitive_field", result.Reason);
    }

    [Fact]
    public void ShortText_Rejected()
    {
        var filter = new CandidateFilter();
        var result = filter.FilterCandidate("Hi.");
        Assert.False(result.Accepted, "Text under 5 characters must be rejected");
        Assert.Equal("too_short", result.Reason);
    }

    [Fact]
    public void NoSentenceTerminator_Rejected()
    {
        var filter = new CandidateFilter();
        var result = filter.FilterCandidate("This is an unfinished sentence without punctuation");
        Assert.False(result.Accepted, "Sentence without terminating punctuation must be rejected");
        Assert.Equal("no_sentence_terminator", result.Reason);
    }
}
