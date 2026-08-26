import XCTest
@testable import LinguaLearnCaptureCore

final class SentenceDiffHighlighterTests: XCTestCase {
    func testNoChangesReturnsEmptyRanges() {
        let text = "This is a completely correct English sentence."
        let ranges = SentenceDiffHighlighter.computeCorrectionRanges(
            original: text,
            corrected: text
        )
        XCTAssertTrue(ranges.isEmpty)
    }

    func testSingleWordGrammarCorrection() {
        let original = "Yesterday I go to the store."
        let corrected = "Yesterday I went to the store."
        let errors = [
            FormattedWritingError(
                original: "go",
                correction: "went",
                explanation: "Past Simple",
                kind: "grammar_error"
            )
        ]
        let ranges = SentenceDiffHighlighter.computeCorrectionRanges(
            original: original,
            corrected: corrected,
            errors: errors
        )

        XCTAssertFalse(ranges.isEmpty)
        let highlightedTexts = ranges.map { (corrected as NSString).substring(with: $0) }
        XCTAssertTrue(highlightedTexts.contains("went"))
        XCTAssertFalse(highlightedTexts.contains("Yesterday"))
        XCTAssertFalse(highlightedTexts.contains("store"))
    }

    func testMultiWordReplacement() {
        let original = "She do not knows the answer."
        let corrected = "She does not know the answer."
        let errors = [
            FormattedWritingError(
                original: "do not knows",
                correction: "does not know",
                explanation: "Subject-verb agreement",
                kind: "grammar_error"
            )
        ]
        let ranges = SentenceDiffHighlighter.computeCorrectionRanges(
            original: original,
            corrected: corrected,
            errors: errors
        )

        XCTAssertFalse(ranges.isEmpty)
        let corrNSString = corrected as NSString
        let highlighted = ranges.map { corrNSString.substring(with: $0) }
        // Either the individual tokens "does" and "know" or the full phrase "does not know" are covered
        let combined = ranges.reduce("") { $0 + corrNSString.substring(with: $1) }
        XCTAssertTrue(combined.contains("does") || highlighted.contains("does not know"))
        XCTAssertTrue(combined.contains("know") || highlighted.contains("does not know"))
    }

    func testInsertedArticleAndVerbCorrection() {
        let original = "Yesterday I go to market."
        let corrected = "Yesterday I went to the market."
        let ranges = SentenceDiffHighlighter.computeCorrectionRanges(
            original: original,
            corrected: corrected
        )

        let corrNSString = corrected as NSString
        let highlightedTexts = ranges.map { corrNSString.substring(with: $0) }
        XCTAssertTrue(highlightedTexts.contains("went"))
        XCTAssertTrue(highlightedTexts.contains("the"))
    }

    func testCapitalizationAndPunctuation() {
        let original = "i am a student"
        let corrected = "I am a student."
        let ranges = SentenceDiffHighlighter.computeCorrectionRanges(
            original: original,
            corrected: corrected
        )

        let corrNSString = corrected as NSString
        let highlightedTexts = ranges.map { corrNSString.substring(with: $0) }
        XCTAssertTrue(highlightedTexts.contains("I"))
        XCTAssertTrue(highlightedTexts.contains("."))
    }

    func testDeletedWordWithExplicitCorrection() {
        let original = "I am agree with you."
        let corrected = "I agree with you."
        let errors = [
            FormattedWritingError(
                original: "am agree",
                correction: "agree",
                explanation: "Do not use 'am' with 'agree'",
                kind: "grammar_error"
            )
        ]
        let ranges = SentenceDiffHighlighter.computeCorrectionRanges(
            original: original,
            corrected: corrected,
            errors: errors
        )

        let corrNSString = corrected as NSString
        let highlightedTexts = ranges.map { corrNSString.substring(with: $0) }
        XCTAssertTrue(highlightedTexts.contains("agree"))
    }

    func testTokenizePreservesFullString() {
        let text = "Hello, world! 123   foo_bar."
        let tokens = SentenceDiffHighlighter.tokenize(text)
        let concatenated = tokens.map(\.text).joined()
        XCTAssertEqual(concatenated, text)
    }

    func testMergeRanges() {
        let r1 = NSRange(location: 0, length: 5)
        let r2 = NSRange(location: 3, length: 4) // overlaps with r1: 0..7
        let r3 = NSRange(location: 10, length: 3)

        let merged = SentenceDiffHighlighter.mergeRanges([r1, r2, r3])
        XCTAssertEqual(merged.count, 2)
        XCTAssertEqual(merged[0], NSRange(location: 0, length: 7))
        XCTAssertEqual(merged[1], NSRange(location: 10, length: 3))
    }
}
