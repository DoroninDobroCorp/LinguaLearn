import XCTest
@testable import LinguaLearnContainerApp

final class SendTriggerTests: XCTestCase {
    func testTypingDoesNotTriggerAnalysisEvent() {
        let vc = KeyboardViewController()
        vc.textDidChange(nil)

        // Typing alone should not emit lastSentPayload
        XCTAssertNil(vc.lastSentPayload)
    }

    func testExplicitSendTriggerEmitsPayloadOnValidProse() {
        let vc = KeyboardViewController()
        let token = "ll_dev_test_send_trigger_token"
        AppGroupManager.shared.saveDeviceToken(token)

        let sentence = "She does not understand the complex grammar rules."
        vc.triggerSendEvent(explicitText: sentence)

        XCTAssertNotNil(vc.lastSentPayload)
        XCTAssertEqual(vc.lastSentPayload?.originalText, sentence)
        XCTAssertEqual(vc.lastSentPayload?.sourceApp, "LinguaLearnKeyboardExtension")
        XCTAssertFalse(vc.lastSentPayload?.previewOnly ?? true)
    }
}
