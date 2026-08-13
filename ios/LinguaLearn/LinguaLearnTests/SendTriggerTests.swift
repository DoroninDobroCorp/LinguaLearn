import XCTest
@testable import LinguaLearnContainerApp

final class SendTriggerTests: XCTestCase {
    func testTypingDoesNotTriggerAnalysisEvent() {
        let vc = KeyboardViewController()
        vc.textDidChange(nil)

        // Typing alone should not emit lastSentPayload
        XCTAssertNil(vc.lastSentPayload)
    }

    func testTypingCharacterKeysUpdatesDraftWithoutTriggeringAnalysis() {
        let vc = KeyboardViewController()
        vc.viewDidLoad()

        vc.typeText("She don't know the answer.")

        XCTAssertEqual(vc.currentDraft, "She don't know the answer.")
        XCTAssertNil(vc.lastSentPayload, "Typing characters alone must NOT trigger analysis payload")
    }

    func testExplicitSendTriggerEmitsPayloadOnValidProse() {
        let vc = KeyboardViewController()
        let token = "ll_dev_test_send_trigger_token"
        AppGroupManager.shared.saveDeviceToken(token)

        let sentence = "She does not understand the complex grammar rules."
        vc.triggerSendEvent(previewOnly: false, explicitText: sentence)

        XCTAssertNotNil(vc.lastSentPayload)
        XCTAssertEqual(vc.lastSentPayload?.originalText, sentence)
        XCTAssertEqual(vc.lastSentPayload?.sourceApp, "LinguaLearnKeyboardExtension")
        XCTAssertFalse(vc.lastSentPayload?.previewOnly ?? true)
    }

    func testExplicitSendButtonTapTriggersAnalysis() {
        let vc = KeyboardViewController()
        vc.viewDidLoad()
        let token = "ll_dev_test_button_tap_token"
        AppGroupManager.shared.saveDeviceToken(token)

        vc.typeText("She does not understand the complex grammar rules.")
        XCTAssertNil(vc.lastSentPayload, "Payload must be nil before explicit send")

        vc.handleSendTrigger()

        XCTAssertNotNil(vc.lastSentPayload)
        XCTAssertEqual(vc.lastSentPayload?.originalText, "She does not understand the complex grammar rules.")
        XCTAssertFalse(vc.lastSentPayload?.previewOnly ?? true)
    }

    func testManualCheckButtonTapTriggersPreviewOnlyAnalysis() {
        let vc = KeyboardViewController()
        vc.viewDidLoad()
        let token = "ll_dev_test_check_tap_token"
        AppGroupManager.shared.saveDeviceToken(token)

        vc.typeText("She does not understand the complex grammar rules.")
        XCTAssertNil(vc.lastSentPayload)

        vc.handleCheckTrigger()

        XCTAssertNotNil(vc.lastSentPayload)
        XCTAssertEqual(vc.lastSentPayload?.originalText, "She does not understand the complex grammar rules.")
        XCTAssertTrue(vc.lastSentPayload?.previewOnly ?? false, "Manual Check button must set previewOnly = true")
    }
}
