using System;
using LinguaLearnAgent.Filter;

namespace LinguaLearnAgent.Tests;

public class CandidateFilterTests
{
    public static void RunAll()
    {
        var filter = new CandidateFilter();

        var valid = filter.FilterCandidate("She does not know the answer to this question.");
        if (!valid.Accepted) throw new Exception("Valid sentence rejected");

        var cyrillic = filter.FilterCandidate("Привет world!");
        if (cyrillic.Accepted) throw new Exception("Cyrillic not rejected");

        var code = filter.FilterCandidate("const x = () => { return 42; };");
        if (code.Accepted) throw new Exception("Code not rejected");

        var url = filter.FilterCandidate("Visit https://example.com for info.");
        if (url.Accepted) throw new Exception("URL not rejected");

        var secure = filter.FilterCandidate("secretpassword123", isSecureField: true);
        if (secure.Accepted) throw new Exception("Secure field not rejected");

        Console.WriteLine("[CandidateFilterTests] All C# candidate filter tests passed.");
    }
}
