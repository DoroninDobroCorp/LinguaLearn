import XCTest
@testable import LinguaLearnCaptureCore

final class SendControlHeuristicTests: XCTestCase {
    func testAcceptsSemanticSendAndSubmitButtonLabels() {
        XCTAssertTrue(SendControlHeuristic.recognizes(role: "AXButton", labelCandidates: ["Send"]))
        XCTAssertTrue(SendControlHeuristic.recognizes(role: "AXButton", labelCandidates: ["", "Send message"]))
        XCTAssertTrue(SendControlHeuristic.recognizes(role: "axbutton", labelCandidates: ["Submit form button"]))
        XCTAssertTrue(SendControlHeuristic.recognizes(role: "AXButton", labelCandidates: ["sendMessageButton"]))
        XCTAssertTrue(SendControlHeuristic.recognizes(role: "AXButton", labelCandidates: ["Отправить сообщение"]))
        XCTAssertTrue(SendControlHeuristic.recognizes(role: "AXButton", labelCandidates: ["Кнопка: Опубликовать"]))
    }

    func testRejectsRecognizedWordsOnNonButtonRoles() {
        XCTAssertFalse(SendControlHeuristic.recognizes(role: "AXLink", labelCandidates: ["Send"]))
        XCTAssertFalse(SendControlHeuristic.recognizes(role: "AXMenuItem", labelCandidates: ["Submit"]))
        XCTAssertFalse(SendControlHeuristic.recognizes(role: "AXImage", labelCandidates: ["Отправить"]))
    }

    func testRejectsAmbiguousOrDangerousButtonLabels() {
        let rejected = [
            "",
            "➤",
            "Send later",
            "Do not send",
            "Resend",
            "Send settings",
            "Submit order",
            "Forward",
            "Share",
            "Save",
            "Search",
            "Отправить позже",
            "Не отправлять"
        ]

        for label in rejected {
            XCTAssertFalse(
                SendControlHeuristic.recognizes(role: "AXButton", labelCandidates: [label]),
                "Unexpectedly accepted label: \(label)"
            )
        }
    }
}
