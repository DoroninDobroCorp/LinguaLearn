import XCTest
@testable import LinguaLearnCaptureCore

final class EnglishSentenceFilterTests: XCTestCase {
    private let filter = EnglishSentenceFilter(minimumWords: 2)

    func testAcceptsEnglishSentenceWithPeriod() {
        let result = filter.evaluate("Yesterday I go to the store.")
        XCTAssertTrue(result.accepted, "Unexpected rejection: \(String(describing: result.reason))")
        XCTAssertGreaterThanOrEqual(result.wordCount, 2)
    }

    func testAcceptsQuestionAndExclamation() {
        XCTAssertTrue(filter.evaluate("How are you?").accepted)
        XCTAssertTrue(filter.evaluate("I am ready!").accepted)
    }

    func testAcceptsTerminatorBeforeTrailingEmojiOrText() {
        XCTAssertTrue(filter.evaluate("That was great! 😊").accepted)
        XCTAssertTrue(filter.evaluate("This part is complete. here is a trailing note").accepted)
    }

    func testDecimalPointIsNotATerminator() {
        XCTAssertTrue(filter.evaluate("This uses version 1.2 without an ending").accepted)
    }

    func testAcceptsSentenceLikeChatWithoutFinalPunctuation() {
        XCTAssertTrue(filter.evaluate("This is a sentence").accepted)
        XCTAssertTrue(filter.evaluate("so now i tried but i can't see advice popup").accepted)
    }

    func testStillRejectsIsolatedWordsAndShortFragments() {
        XCTAssertEqual(filter.evaluate("Hello.").reason, .tooFewEnglishWords)
        XCTAssertEqual(filter.evaluate("hello").reason, .noSentenceTerminator)
        XCTAssertEqual(filter.evaluate("good morning friend").reason, .noSentenceTerminator)
    }

    func testRejectsURLAndEmail() {
        XCTAssertEqual(filter.evaluate("Please visit https://example.com.").reason, .urlOrEmail)
        XCTAssertEqual(filter.evaluate("Email me at person@example.com.").reason, .urlOrEmail)
    }

    func testRejectsCodeAndPaths() {
        XCTAssertEqual(filter.evaluate("const value = foo == bar && baz != qux.").reason, .looksLikeCode)
        XCTAssertEqual(filter.evaluate("Open /Users/me/project now.").reason, .looksLikeCode)
    }

    func testRejectsMixedCyrillicText() {
        XCTAssertEqual(filter.evaluate("This is текст." ).reason, .containsNonLatinLetters)
    }
}
