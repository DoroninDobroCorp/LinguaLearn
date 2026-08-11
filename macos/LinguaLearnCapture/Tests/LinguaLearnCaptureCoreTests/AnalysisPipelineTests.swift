import Foundation
import XCTest
@testable import LinguaLearnCaptureCore

final class AnalysisPipelineTests: XCTestCase {
    override func setUp() {
        super.setUp()
        PipelineURLProtocol.reset()
    }

    override func tearDown() {
        PipelineURLProtocol.reset()
        super.tearDown()
    }

    func testEventInProgressUsesServerRetryDelay() {
        PipelineURLProtocol.statusCode = 409
        PipelineURLProtocol.body = Data(#"{"error":"still working","code":"EVENT_IN_PROGRESS"}"#.utf8)
        PipelineURLProtocol.headers = ["Retry-After": "2"]

        let completed = expectation(description: "in-progress response surfaced")
        makeClient().analyze(event: testEvent()) { result in
            guard case .failure(.inProgress(let retryAfter)) = result else {
                return XCTFail("Expected EVENT_IN_PROGRESS to have dedicated retry semantics")
            }
            XCTAssertEqual(retryAfter, 2)
            XCTAssertEqual(
                AnalysisAPIError.inProgress(retryAfter: retryAfter).retryDelay(afterAttempt: 7),
                2
            )
            completed.fulfill()
        }
        wait(for: [completed], timeout: 2)
    }

    func testEventIDConflictRemainsNonRetryable() {
        let error = AnalysisAPIError.httpStatus(
            409,
            #"{"error":"different payload","code":"EVENT_ID_CONFLICT"}"#
        )
        XCTAssertEqual(error.retryDelay(afterAttempt: 1), 300)
    }

    func testMalformedDurableQueueFailsClosedWithoutOverwritingIt() throws {
        let queueURL = temporaryQueueURL()
        defer { try? FileManager.default.removeItem(at: queueURL.deletingLastPathComponent()) }
        try FileManager.default.createDirectory(
            at: queueURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        let malformed = Data("not valid queue json".utf8)
        try malformed.write(to: queueURL)

        let pipeline = makePipeline(queueURL: queueURL)
        XCTAssertFalse(pipeline.isStorageHealthy)
        XCTAssertFalse(pipeline.enqueue(testEvent()))
        XCTAssertEqual(pipeline.depth, 0)
        XCTAssertEqual(try Data(contentsOf: queueURL), malformed)
    }

    func testPersistenceFailureRejectsNewEventInsteadOfKeepingRAMOnly() throws {
        let container = FileManager.default.temporaryDirectory
            .appendingPathComponent("lingualearn-blocked-storage-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: container) }
        try Data("regular file, not a directory".utf8).write(to: container)
        let impossibleQueueURL = container.appendingPathComponent("pending-events.json")

        let pipeline = makePipeline(queueURL: impossibleQueueURL)
        XCTAssertTrue(pipeline.isStorageHealthy)
        XCTAssertFalse(pipeline.enqueue(testEvent()))
        XCTAssertFalse(pipeline.isStorageHealthy)
        XCTAssertEqual(pipeline.depth, 0)
    }

    func testPersistedNextAttemptIsHonoredWhileLaterEventRuns() throws {
        let queueURL = temporaryQueueURL()
        defer { try? FileManager.default.removeItem(at: queueURL.deletingLastPathComponent()) }
        try FileManager.default.createDirectory(at: queueURL.deletingLastPathComponent(), withIntermediateDirectories: true)

        let frozenNow = Date(timeIntervalSince1970: 2_000)
        let backedOff = PersistedQueueFixture(
            event: testEvent(id: "backed-off"),
            retryCount: 3,
            nextAttemptAt: frozenNow.addingTimeInterval(60)
        )
        try PayloadCoding.makeEncoder().encode([backedOff]).write(to: queueURL)

        let laterSucceeded = expectation(description: "later due event succeeds")
        let backedOffRanEarly = expectation(description: "backed-off event must not run early")
        backedOffRanEarly.isInverted = true
        let pipeline = makePipeline(queueURL: queueURL, now: { frozenNow })
        pipeline.onSuccess = { event, _ in
            if event.eventID == "later" {
                laterSucceeded.fulfill()
            } else if event.eventID == "backed-off" {
                backedOffRanEarly.fulfill()
            }
        }

        pipeline.start()
        XCTAssertTrue(pipeline.enqueue(testEvent(id: "later", text: "I am ready!")))
        wait(for: [laterSucceeded, backedOffRanEarly], timeout: 0.4)

        XCTAssertEqual(PipelineURLProtocol.recordedEventIDs(), ["later"])
        XCTAssertEqual(pipeline.depth, 1)
    }

    func testPermanentFailureDoesNotBlockLaterEventOrRetryOnEnqueue() {
        PipelineURLProtocol.responseProvider = { eventID in
            if eventID == "permanent" {
                return PipelineStubResponse(
                    statusCode: 400,
                    body: Data(#"{"error":"invalid request"}"#.utf8)
                )
            }
            return .success
        }

        let frozenNow = Date(timeIntervalSince1970: 3_000)
        let firstFailed = expectation(description: "permanent event fails")
        let laterSucceeded = expectation(description: "later event succeeds")
        let pipeline = makePipeline(queueURL: temporaryQueueURL(), now: { frozenNow })
        pipeline.onFailure = { event, _ in
            if event.eventID == "permanent" { firstFailed.fulfill() }
        }
        pipeline.onSuccess = { event, _ in
            if event.eventID == "later" { laterSucceeded.fulfill() }
        }

        XCTAssertTrue(pipeline.enqueue(testEvent(id: "permanent")))
        wait(for: [firstFailed], timeout: 2)
        XCTAssertTrue(pipeline.enqueue(testEvent(id: "later", text: "I am ready!")))
        wait(for: [laterSucceeded], timeout: 2)

        XCTAssertEqual(PipelineURLProtocol.recordedEventIDs(), ["permanent", "later"])
        XCTAssertEqual(pipeline.depth, 1)
    }

    func testEventInProgressPersistsExactRetryAfter() throws {
        PipelineURLProtocol.responseProvider = { _ in
            PipelineStubResponse(
                statusCode: 409,
                body: Data(#"{"error":"still working","code":"EVENT_IN_PROGRESS"}"#.utf8),
                headers: ["Retry-After": "2"]
            )
        }
        let queueURL = temporaryQueueURL()
        defer { try? FileManager.default.removeItem(at: queueURL.deletingLastPathComponent()) }
        let frozenNow = Date(timeIntervalSince1970: 4_000)
        let failed = expectation(description: "in-progress response persisted")
        let pipeline = makePipeline(queueURL: queueURL, now: { frozenNow })
        pipeline.onFailure = { _, error in
            guard case .inProgress(let retryAfter) = error else {
                return XCTFail("Expected in-progress error")
            }
            XCTAssertEqual(retryAfter, 2)
            failed.fulfill()
        }

        XCTAssertTrue(pipeline.enqueue(testEvent()))
        wait(for: [failed], timeout: 2)

        let restored = try PayloadCoding.makeDecoder().decode(
            [PersistedQueueFixture].self,
            from: Data(contentsOf: queueURL)
        )
        XCTAssertEqual(restored.first?.nextAttemptAt, frozenNow.addingTimeInterval(2))
    }

    func testFailedEventRemainsInDurableQueue() throws {
        PipelineURLProtocol.statusCode = 503
        PipelineURLProtocol.body = Data(#"{"error":"offline"}"#.utf8)
        let queueURL = temporaryQueueURL()
        defer { try? FileManager.default.removeItem(at: queueURL.deletingLastPathComponent()) }

        let failed = expectation(description: "failure surfaced")
        let pipeline = makePipeline(queueURL: queueURL)
        pipeline.onFailure = { _, _ in failed.fulfill() }
        XCTAssertTrue(pipeline.enqueue(testEvent()))
        wait(for: [failed], timeout: 2)

        let objects = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: queueURL)) as? [[String: Any]])
        XCTAssertEqual(objects.count, 1)
        let event = try XCTUnwrap(objects.first?["event"] as? [String: Any])
        XCTAssertEqual(event["eventID"] as? String, "persisted-event")
        XCTAssertEqual(pipeline.depth, 1)
        let attributes = try FileManager.default.attributesOfItem(atPath: queueURL.path)
        XCTAssertEqual(attributes[.posixPermissions] as? NSNumber, NSNumber(value: 0o600))
    }

    func testSuccessfulEventIsRemovedFromDurableQueue() throws {
        let queueURL = temporaryQueueURL()
        defer { try? FileManager.default.removeItem(at: queueURL.deletingLastPathComponent()) }

        let succeeded = expectation(description: "success surfaced")
        let pipeline = makePipeline(queueURL: queueURL)
        pipeline.onSuccess = { _, _ in succeeded.fulfill() }
        XCTAssertTrue(pipeline.enqueue(testEvent()))
        wait(for: [succeeded], timeout: 2)

        let objects = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: queueURL)) as? [[String: Any]])
        XCTAssertTrue(objects.isEmpty)
        XCTAssertEqual(pipeline.depth, 0)
    }

    func testRestoresAndSendsPendingEventAfterRestart() throws {
        let queueURL = temporaryQueueURL()
        defer { try? FileManager.default.removeItem(at: queueURL.deletingLastPathComponent()) }
        try FileManager.default.createDirectory(at: queueURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        let persisted = Data(#"""
        [{
          "event": {
            "eventID": "persisted-event",
            "sourceApp": "codex",
            "text": "How are you?",
            "sentAt": "1970-01-01T00:16:40Z"
          },
          "retryCount": 2
        }]
        """#.utf8)
        try persisted.write(to: queueURL)

        let succeeded = expectation(description: "restored event sent")
        let pipeline = makePipeline(queueURL: queueURL)
        pipeline.onSuccess = { event, _ in
            XCTAssertEqual(event.eventID, "persisted-event")
            succeeded.fulfill()
        }
        XCTAssertEqual(pipeline.depth, 1)
        pipeline.start()
        wait(for: [succeeded], timeout: 2)
        XCTAssertEqual(pipeline.depth, 0)
    }

    private func makePipeline(
        queueURL: URL,
        now: @escaping @Sendable () -> Date = { Date() }
    ) -> AnalysisPipeline {
        AnalysisPipeline(
            client: makeClient(),
            maximumDepth: 10,
            persistenceURL: queueURL,
            now: now
        )
    }

    private func makeClient() -> AnalysisAPIClient {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [PipelineURLProtocol.self]
        let session = URLSession(configuration: configuration)
        let captureConfiguration = CaptureConfiguration(
            apiURL: "https://capture.test/english/api/writing/analyze",
            bearerToken: "test-token",
            appURL: "https://capture.test/english",
            ingressToken: "local-token"
        )
        return AnalysisAPIClient(configuration: captureConfiguration, session: session)
    }

    private func temporaryQueueURL() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("lingualearn-pipeline-\(UUID().uuidString)", isDirectory: true)
            .appendingPathComponent("pending-events.json")
    }

    private func testEvent(
        id: String = "persisted-event",
        text: String = "How are you?"
    ) -> CaptureEvent {
        CaptureEvent(
            eventID: id,
            sourceApp: "codex",
            text: text,
            sentAt: Date(timeIntervalSince1970: 1_000)
        )
    }
}

private struct PersistedQueueFixture: Codable {
    let event: CaptureEvent
    let retryCount: Int
    let nextAttemptAt: Date?
}

private struct PipelineStubResponse {
    let statusCode: Int
    let body: Data
    var headers: [String: String] = [:]

    static let success = PipelineStubResponse(
        statusCode: 200,
        body: Data(#"{"accepted":true,"correctedText":"How are you?","errors":[],"topicEvidence":[]}"#.utf8)
    )
}

private final class PipelineURLProtocol: URLProtocol {
    private static let stateLock = NSLock()
    static var statusCode = 200
    static var body = Data(#"{"accepted":true,"correctedText":"How are you?","errors":[],"topicEvidence":[]}"#.utf8)
    static var headers: [String: String] = [:]
    static var responseProvider: ((String) -> PipelineStubResponse)?
    private static var eventIDs: [String] = []

    static func reset() {
        stateLock.lock()
        statusCode = 200
        body = PipelineStubResponse.success.body
        headers = [:]
        responseProvider = nil
        eventIDs = []
        stateLock.unlock()
    }

    static func recordedEventIDs() -> [String] {
        stateLock.lock()
        defer { stateLock.unlock() }
        return eventIDs
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let eventID = Self.bodyData(from: request)
            .flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }?["eventId"] as? String ?? ""
        Self.stateLock.lock()
        Self.eventIDs.append(eventID)
        let provider = Self.responseProvider
        let fallback = PipelineStubResponse(
            statusCode: Self.statusCode,
            body: Self.body,
            headers: Self.headers
        )
        Self.stateLock.unlock()
        let stub = provider?(eventID) ?? fallback

        var headerFields = stub.headers
        headerFields["Content-Type"] = "application/json"
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: stub.statusCode,
            httpVersion: "HTTP/1.1",
            headerFields: headerFields
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: stub.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    private static func bodyData(from request: URLRequest) -> Data? {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return nil }

        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4_096)
        while true {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count < 0 { return nil }
            if count == 0 { break }
            data.append(buffer, count: count)
        }
        return data
    }

    override func stopLoading() {}
}
