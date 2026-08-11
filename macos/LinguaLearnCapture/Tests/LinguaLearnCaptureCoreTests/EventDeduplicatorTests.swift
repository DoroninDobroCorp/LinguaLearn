import XCTest
@testable import LinguaLearnCaptureCore

final class EventDeduplicatorTests: XCTestCase {
    func testRejectsRepeatedEventID() {
        let deduplicator = EventDeduplicator(contentWindow: 12)
        let now = Date(timeIntervalSince1970: 1_000)
        XCTAssertTrue(deduplicator.checkAndInsert(eventID: "turn-1", sourceApp: "codex", text: "How are you?", now: now))
        XCTAssertFalse(deduplicator.checkAndInsert(eventID: "turn-1", sourceApp: "org.telegram.desktop", text: "A different sentence.", now: now))
    }

    func testRejectsSameContentFromDifferentSources() {
        let deduplicator = EventDeduplicator(contentWindow: 12)
        let now = Date(timeIntervalSince1970: 1_000)
        XCTAssertTrue(deduplicator.checkAndInsert(eventID: "ax-1", sourceApp: "com.openai.codex", text: "  How   are YOU? ", now: now))
        XCTAssertFalse(deduplicator.checkAndInsert(eventID: "codex-turn-1", sourceApp: "codex", text: "how are you?", now: now.addingTimeInterval(1)))
    }

    func testAllowsTwoLegitimateAXSendsAfterWindowEvenInsideOldThirtySecondBucket() {
        let deduplicator = EventDeduplicator(contentWindow: 12)
        let firstSend = Date(timeIntervalSince1970: 1_201)
        let secondSend = firstSend.addingTimeInterval(13)
        XCTAssertEqual(Int(firstSend.timeIntervalSince1970 / 30), Int(secondSend.timeIntervalSince1970 / 30))

        XCTAssertTrue(deduplicator.checkAndInsert(eventID: "ax-uuid-1", sourceApp: "org.telegram.desktop", text: "How are you?", now: firstSend))
        XCTAssertTrue(deduplicator.checkAndInsert(eventID: "ax-uuid-2", sourceApp: "org.telegram.desktop", text: "How are you?", now: secondSend))
    }

    func testAllowsSameContentFromDifferentNonCodexApps() {
        let deduplicator = EventDeduplicator(contentWindow: 12)
        let now = Date(timeIntervalSince1970: 1_000)
        XCTAssertTrue(deduplicator.checkAndInsert(eventID: "telegram-1", sourceApp: "org.telegram.desktop", text: "How are you?", now: now))
        XCTAssertTrue(deduplicator.checkAndInsert(eventID: "whatsapp-1", sourceApp: "net.whatsapp.WhatsApp", text: "How are you?", now: now.addingTimeInterval(1)))
    }

    func testRollbackMakesQueueFullSubmissionRetryable() {
        let deduplicator = EventDeduplicator(contentWindow: 12)
        let now = Date(timeIntervalSince1970: 1_000)
        XCTAssertTrue(deduplicator.checkAndInsert(eventID: "event-1", sourceApp: "org.telegram.desktop", text: "How are you?", now: now))

        deduplicator.removeReservation(
            eventID: "event-1",
            sourceApp: "org.telegram.desktop",
            text: "How are you?",
            insertedAt: now
        )

        XCTAssertTrue(deduplicator.checkAndInsert(eventID: "event-1", sourceApp: "org.telegram.desktop", text: "How are you?", now: now))
    }

    func testLateRollbackDoesNotRemoveNewerReservation() {
        let deduplicator = EventDeduplicator(contentWindow: 1)
        let oldDate = Date(timeIntervalSince1970: 1_000)
        let newDate = oldDate.addingTimeInterval(2)
        XCTAssertTrue(deduplicator.checkAndInsert(eventID: "old", sourceApp: "org.telegram.desktop", text: "How are you?", now: oldDate))
        XCTAssertTrue(deduplicator.checkAndInsert(eventID: "new", sourceApp: "org.telegram.desktop", text: "How are you?", now: newDate))

        deduplicator.removeReservation(
            eventID: "old",
            sourceApp: "org.telegram.desktop",
            text: "How are you?",
            insertedAt: oldDate
        )

        XCTAssertFalse(deduplicator.checkAndInsert(eventID: "third", sourceApp: "org.telegram.desktop", text: "How are you?", now: newDate))
    }

}
