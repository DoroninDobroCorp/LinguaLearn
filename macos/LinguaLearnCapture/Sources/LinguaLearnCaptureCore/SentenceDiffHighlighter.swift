import Foundation

public struct TextSpan: Equatable, Sendable {
    public let range: NSRange
    public let text: String

    public init(range: NSRange, text: String) {
        self.range = range
        self.text = text
    }
}

public enum SentenceDiffHighlighter {
    public struct Token: Equatable {
        public let text: String
        public let range: NSRange
        public let isWhitespace: Bool

        public init(text: String, range: NSRange, isWhitespace: Bool) {
            self.text = text
            self.range = range
            self.isWhitespace = isWhitespace
        }
    }

    public static func tokenize(_ text: String) -> [Token] {
        let nsString = text as NSString
        var tokens: [Token] = []
        let fullRange = NSRange(location: 0, length: nsString.length)

        guard let regex = try? NSRegularExpression(
            pattern: "[\\p{L}\\p{N}_]+|[^\\p{L}\\p{N}_\\s]+|\\s+",
            options: []
        ) else {
            return tokens
        }

        regex.enumerateMatches(in: text, options: [], range: fullRange) { match, _, _ in
            guard let matchRange = match?.range else { return }
            let tokenText = nsString.substring(with: matchRange)
            let isWs = tokenText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            tokens.append(Token(text: tokenText, range: matchRange, isWhitespace: isWs))
        }
        return tokens
    }

    /// Computes NSRanges of corrected / modified / inserted segments in `corrected` relative to `original`.
    public static func computeCorrectionRanges(
        original: String,
        corrected: String,
        errors: [FormattedWritingError] = []
    ) -> [NSRange] {
        let origTrimmed = original.trimmingCharacters(in: .whitespacesAndNewlines)
        let corrTrimmed = corrected.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !corrTrimmed.isEmpty else { return [] }
        guard origTrimmed != corrTrimmed else { return [] }

        let origTokens = tokenize(original)
        let corrTokens = tokenize(corrected)

        guard !corrTokens.isEmpty else { return [] }

        let n = origTokens.count
        let m = corrTokens.count

        var dp = Array(repeating: Array(repeating: 0, count: m + 1), count: n + 1)
        for i in 0..<n {
            for j in 0..<m {
                if origTokens[i].text == corrTokens[j].text {
                    dp[i + 1][j + 1] = dp[i][j] + 1
                } else {
                    dp[i + 1][j + 1] = max(dp[i + 1][j], dp[i][j + 1])
                }
            }
        }

        var matchedInCorr = Set<Int>()
        var i = n
        var j = m

        while i > 0 && j > 0 {
            if origTokens[i - 1].text == corrTokens[j - 1].text {
                matchedInCorr.insert(j - 1)
                i -= 1
                j -= 1
            } else if dp[i - 1][j] >= dp[i][j - 1] {
                i -= 1
            } else {
                j -= 1
            }
        }

        var rawRanges: [NSRange] = []

        for idx in 0..<m {
            if !matchedInCorr.contains(idx) {
                let token = corrTokens[idx]
                if !token.isWhitespace {
                    rawRanges.append(token.range)
                }
            }
        }

        // Also incorporate explicit error corrections if present
        let corrNSString = corrected as NSString
        for err in errors {
            guard let corr = err.correction?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !corr.isEmpty,
                  corr != err.original?.trimmingCharacters(in: .whitespacesAndNewlines) else {
                continue
            }

            var searchRange = NSRange(location: 0, length: corrNSString.length)
            while searchRange.location < corrNSString.length {
                let found = corrNSString.range(of: corr, options: [.caseInsensitive], range: searchRange)
                if found.location != NSNotFound {
                    rawRanges.append(found)
                    let nextLocation = found.location + max(found.length, 1)
                    if nextLocation < corrNSString.length {
                        searchRange = NSRange(location: nextLocation, length: corrNSString.length - nextLocation)
                    } else {
                        break
                    }
                } else {
                    break
                }
            }
        }

        // If there are deletions that caused entire corrected string to be a subsequence of original,
        // but original != corrected, and no tokens were unmatched:
        if rawRanges.isEmpty && origTrimmed != corrTrimmed {
            for err in errors {
                if let origErr = err.original?.trimmingCharacters(in: .whitespacesAndNewlines), !origErr.isEmpty {
                    if let word = origErr.components(separatedBy: .whitespacesAndNewlines).last {
                        let found = corrNSString.range(of: word, options: [.caseInsensitive])
                        if found.location != NSNotFound {
                            rawRanges.append(found)
                        }
                    }
                }
            }
        }

        return mergeRanges(rawRanges)
    }

    public static func mergeRanges(_ ranges: [NSRange]) -> [NSRange] {
        guard !ranges.isEmpty else { return [] }
        let sorted = ranges.sorted { $0.location < $1.location }
        var merged: [NSRange] = []
        var current = sorted[0]

        for range in sorted.dropFirst() {
            if range.location <= current.location + current.length {
                let newEnd = max(current.location + current.length, range.location + range.length)
                current = NSRange(location: current.location, length: newEnd - current.location)
            } else {
                merged.append(current)
                current = range
            }
        }
        merged.append(current)
        return merged
    }
}
