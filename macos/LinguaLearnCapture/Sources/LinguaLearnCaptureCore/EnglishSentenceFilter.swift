import Foundation
import NaturalLanguage

public enum SentenceRejectionReason: String, Equatable, Sendable {
    case empty
    case tooLong
    case noSentenceTerminator
    case tooFewEnglishWords
    case containsNonLatinLetters
    case urlOrEmail
    case looksLikeCode
    case notEnglish
}

public struct SentenceFilterResult: Equatable, Sendable {
    public let accepted: Bool
    public let reason: SentenceRejectionReason?
    public let wordCount: Int
    public let englishConfidence: Double

    public init(accepted: Bool, reason: SentenceRejectionReason?, wordCount: Int, englishConfidence: Double) {
        self.accepted = accepted
        self.reason = reason
        self.wordCount = wordCount
        self.englishConfidence = englishConfidence
    }
}

public struct EnglishSentenceFilter: Sendable {
    private static let minimumWordsWithoutTerminator = 4

    public let minimumWords: Int
    public let maximumCharacters: Int

    public init(minimumWords: Int = 2, maximumCharacters: Int = 8_000) {
        self.minimumWords = max(2, minimumWords)
        self.maximumCharacters = max(100, maximumCharacters)
    }

    public func evaluate(_ rawText: String) -> SentenceFilterResult {
        let text = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return rejected(.empty) }
        guard text.count <= maximumCharacters else { return rejected(.tooLong) }
        let words = englishWords(in: text)
        // A completed sentence may be followed by an emoji or more text. Requiring a non-letter /
        // non-number boundary avoids treating the dot in `1.2` as sentence punctuation. Casual
        // chats often omit final punctuation, so four or more English words are also sentence-like
        // enough to analyze while short labels and isolated words remain ignored.
        let hasTerminator = text.range(
            of: #"[.!?](?=$|[^\p{L}\p{N}])"#,
            options: .regularExpression
        ) != nil
        guard hasTerminator || words.count >= Self.minimumWordsWithoutTerminator else {
            return rejected(.noSentenceTerminator)
        }
        guard !containsURLOrEmail(text) else { return rejected(.urlOrEmail) }
        guard !looksLikeCode(text) else { return rejected(.looksLikeCode) }

        guard words.count >= minimumWords else {
            return SentenceFilterResult(
                accepted: false,
                reason: .tooFewEnglishWords,
                wordCount: words.count,
                englishConfidence: 0
            )
        }
        guard containsOnlyLatinSentenceLetters(text) else {
            return SentenceFilterResult(
                accepted: false,
                reason: .containsNonLatinLetters,
                wordCount: words.count,
                englishConfidence: 0
            )
        }

        let confidence = languageConfidence(for: text, words: words)
        guard confidence >= minimumConfidence(forWordCount: words.count) else {
            return SentenceFilterResult(
                accepted: false,
                reason: .notEnglish,
                wordCount: words.count,
                englishConfidence: confidence
            )
        }
        return SentenceFilterResult(
            accepted: true,
            reason: nil,
            wordCount: words.count,
            englishConfidence: confidence
        )
    }

    private func rejected(_ reason: SentenceRejectionReason) -> SentenceFilterResult {
        SentenceFilterResult(accepted: false, reason: reason, wordCount: 0, englishConfidence: 0)
    }

    private func englishWords(in text: String) -> [String] {
        guard let expression = try? NSRegularExpression(pattern: #"\b[A-Za-z]+(?:['’][A-Za-z]+)?\b"#) else {
            return []
        }
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        return expression.matches(in: text, range: range).compactMap { match in
            guard let swiftRange = Range(match.range, in: text) else { return nil }
            return String(text[swiftRange])
        }
    }

    private func containsOnlyLatinSentenceLetters(_ text: String) -> Bool {
        for scalar in text.unicodeScalars where CharacterSet.letters.contains(scalar) {
            let isASCII = scalar.value >= 65 && scalar.value <= 90 || scalar.value >= 97 && scalar.value <= 122
            let isAcceptedEnglishPunctuationLetter = [0x2019].contains(Int(scalar.value))
            if !isASCII && !isAcceptedEnglishPunctuationLetter { return false }
        }
        return true
    }

    private func containsURLOrEmail(_ text: String) -> Bool {
        let patterns = [
            #"(?i)\b(?:https?://|www\.)\S+"#,
            #"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b"#,
            #"(?i)(?:^|\s)[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/(?:\S*)"#,
            #"(?i)(?:^|\s)[A-Z0-9-]+\.(?:com|net|org|io|dev|app|ai|me|ru|co|uk)(?:[.!?]?)(?:\s|$)"#
        ]
        return patterns.contains { text.range(of: $0, options: .regularExpression) != nil }
    }

    private func looksLikeCode(_ text: String) -> Bool {
        if text.contains("```") { return true }
        if text.range(of: #"(?m)^\s*(?:\$|>>>|#include\b|import\s+[A-Za-z0-9_.]+\s*;|(?:const|let|var|func|function|class)\s+[A-Za-z_$])"#, options: .regularExpression) != nil {
            return true
        }
        if text.range(of: #"(?:/Users/|/Applications/|~/|[A-Za-z]:\\)"#, options: .regularExpression) != nil {
            return true
        }
        let codeTokens = ["=>", "==", "!=", "&&", "||", "</", "/>", "{\"", "\":"]
        if codeTokens.filter({ text.contains($0) }).count >= 2 { return true }

        let nonLanguageSymbols = text.unicodeScalars.filter { scalar in
            "{}[]<>_=\\|`".unicodeScalars.contains(scalar)
        }.count
        return nonLanguageSymbols >= 4 && Double(nonLanguageSymbols) / Double(max(1, text.count)) > 0.08
    }

    private func languageConfidence(for text: String, words: [String]) -> Double {
        let recognizer = NLLanguageRecognizer()
        recognizer.processString(text)
        let naturalLanguageConfidence = recognizer.languageHypotheses(withMaximum: 3)[.english] ?? 0

        let commonWords: Set<String> = [
            "a", "am", "an", "and", "are", "as", "at", "be", "been", "but", "by", "can", "did", "do",
            "does", "for", "from", "had", "has", "have", "he", "her", "here", "him", "his", "how", "i",
            "if", "in", "is", "it", "its", "me", "my", "not", "of", "on", "or", "our", "she", "so",
            "that", "the", "their", "them", "there", "they", "this", "to", "was", "we", "were", "what",
            "when", "where", "which", "who", "why", "will", "with", "would", "you", "your"
        ]
        let commonCount = words.map { $0.lowercased() }.filter { commonWords.contains($0) }.count
        let heuristicConfidence = min(1, Double(commonCount) / Double(max(1, min(words.count, 3))))
        return max(naturalLanguageConfidence, heuristicConfidence)
    }

    private func minimumConfidence(forWordCount count: Int) -> Double {
        count <= 3 ? 0.34 : 0.45
    }
}
