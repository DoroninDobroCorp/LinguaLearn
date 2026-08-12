import XCTest
@testable import LinguaLearnContainerApp

final class CandidateFilterTests: XCTestCase {
    func testValidProseSentenceAccepted() {
        let text = "She does not understand this complex grammar rule."
        let result = CandidateFilter.evaluate(text: text)
        XCTAssertTrue(result.accepted)
        XCTAssertNil(result.reason)
    }

    func testCodeInputRejected() {
        let codeText = "const x = () => { return 42; };"
        let result = CandidateFilter.evaluate(text: codeText)
        XCTAssertFalse(result.accepted)
        XCTAssertEqual(result.reason, "code_or_command")
    }

    func testUrlAndEmailRejected() {
        let urlText = "Check this link: https://example.com/login for details."
        let resultUrl = CandidateFilter.evaluate(text: urlText)
        XCTAssertFalse(resultUrl.accepted)
        XCTAssertEqual(resultUrl.reason, "url_or_email")

        let emailText = "Contact me at john.doe@company.org anytime."
        let resultEmail = CandidateFilter.evaluate(text: emailText)
        XCTAssertFalse(resultEmail.accepted)
        XCTAssertEqual(resultEmail.reason, "url_or_email")
    }

    func testCyrillicInputRejected() {
        let cyrillicText = "Привет, как твои дела сегодня?"
        let result = CandidateFilter.evaluate(text: cyrillicText)
        XCTAssertFalse(result.accepted)
        XCTAssertEqual(result.reason, "contains_cyrillic")
    }

    func testShortPhraseWithoutTerminatorRejected() {
        let shortText = "Hello world"
        let result = CandidateFilter.evaluate(text: shortText)
        XCTAssertFalse(result.accepted)
        XCTAssertEqual(result.reason, "no_sentence_terminator")
    }

    func testSecureFieldExclusion() {
        let secureContext = InputFieldContext(isSecureTextEntry: true)
        let result = CandidateFilter.evaluate(text: "SecretPassword123!", context: secureContext)
        XCTAssertFalse(result.accepted)
        XCTAssertEqual(result.reason, "secure_field")

        let passwordFieldContext = InputFieldContext(placeholder: "Enter user passcode")
        let result2 = CandidateFilter.evaluate(text: "123456", context: passwordFieldContext)
        XCTAssertFalse(result2.accepted)
        XCTAssertEqual(result2.reason, "secure_field")
    }
}
