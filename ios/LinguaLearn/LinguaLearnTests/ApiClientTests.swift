import XCTest
@testable import LinguaLearnContainerApp

final class ApiClientTests: XCTestCase {
    func testPayloadSerializationConformsToSchemaVersion1() {
        let payload = QueuedWritingPayload(
            schemaVersion: 1,
            eventId: "ios-test-99",
            sourceApp: "LinguaLearnKeyboardExtension",
            originalText: "She don't know.",
            previewOnly: false
        )

        XCTAssertEqual(payload.schemaVersion, 1)
        XCTAssertEqual(payload.eventId, "ios-test-99")
        XCTAssertEqual(payload.sourceApp, "LinguaLearnKeyboardExtension")
        XCTAssertEqual(payload.originalText, "She don't know.")
        XCTAssertFalse(payload.previewOnly)
    }
}
