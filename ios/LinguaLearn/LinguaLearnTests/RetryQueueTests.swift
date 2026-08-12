import XCTest
@testable import LinguaLearnContainerApp

final class RetryQueueTests: XCTestCase {
    func testEnqueueAndDequeueExactOnce() {
        let queue = RetryQueue()
        let payload1 = QueuedWritingPayload(eventId: "ios-evt-001", originalText: "She don't know the answer.")
        let payload2 = QueuedWritingPayload(eventId: "ios-evt-002", originalText: "Yesterday I go home.")

        queue.enqueue(payload1)
        queue.enqueue(payload2)

        // Duplicate enqueue must be ignored
        queue.enqueue(payload1)

        XCTAssertEqual(queue.items.count, 2)

        let dequeued1 = queue.dequeue()
        XCTAssertEqual(dequeued1?.eventId, "ios-evt-001")

        let dequeued2 = queue.dequeue()
        XCTAssertEqual(dequeued2?.eventId, "ios-evt-002")

        XCTAssertNil(queue.dequeue())
    }
}
