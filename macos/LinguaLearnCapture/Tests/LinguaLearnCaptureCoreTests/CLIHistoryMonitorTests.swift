import XCTest
@testable import LinguaLearnCaptureCore

final class CLIHistoryMonitorTests: XCTestCase {
    private var temporaryDirectory: URL!

    override func setUp() {
        super.setUp()
        temporaryDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("lingualearn-cli-history-tests-\(UUID().uuidString)")
        try? FileManager.default.createDirectory(at: temporaryDirectory, withIntermediateDirectories: true)
    }

    override func tearDown() {
        if let temporaryDirectory {
            try? FileManager.default.removeItem(at: temporaryDirectory)
        }
        super.tearDown()
    }

    func testMonitorsClaudeHistoryAndCapturesNewLinesOnly() throws {
        let historyFile = temporaryDirectory.appendingPathComponent("history.jsonl")

        // Pre-populate historical content
        let initialLine = #"{"display":"Old past message from yesterday","timestamp":1787695044599,"sessionId":"sess-old"}"# + "\n"
        try initialLine.write(to: historyFile, atomically: true, encoding: .utf8)

        let capturedBox = CapturedEventsBox()
        let source = CLIHistoryMonitor.WatchedSource(
            sourceApp: "claude",
            fileURL: historyFile,
            lastOffset: CLIHistoryMonitor.currentFileSize(at: historyFile)
        )

        let monitor = CLIHistoryMonitor(sources: [source]) { event in
            capturedBox.append(event)
        }

        // Poll without changes - nothing new
        monitor.poll()
        XCTAssertTrue(capturedBox.events.isEmpty)

        // Append new Claude line
        let newLine1 = #"{"display":"Yesterday I go to the store and buys apples","timestamp":1787708172524,"sessionId":"sess-new"}"# + "\n"
        let handle = try FileHandle(forWritingTo: historyFile)
        try handle.seekToEnd()
        try handle.write(contentsOf: Data(newLine1.utf8))
        try handle.close()

        monitor.poll()
        XCTAssertEqual(capturedBox.events.count, 1)
        XCTAssertEqual(capturedBox.events[0].sourceApp, "claude")
        XCTAssertEqual(capturedBox.events[0].text, "Yesterday I go to the store and buys apples")
        XCTAssertEqual(capturedBox.events[0].sentAt, Date(timeIntervalSince1970: 1787708172.524))

        // Append multiple lines including slash command (which should be skipped)
        let newLines = [
            #"{"display":"/compact","timestamp":1787708180000,"sessionId":"sess-new"}"#,
            #"{"display":"She don't know the answer to this question","timestamp":1787708190207,"sessionId":"sess-new"}"#
        ].joined(separator: "\n") + "\n"

        let handle2 = try FileHandle(forWritingTo: historyFile)
        try handle2.seekToEnd()
        try handle2.write(contentsOf: Data(newLines.utf8))
        try handle2.close()

        monitor.poll()
        XCTAssertEqual(capturedBox.events.count, 2)
        XCTAssertEqual(capturedBox.events[1].text, "She don't know the answer to this question")
    }

    func testMonitorsCodexHistoryFormat() throws {
        let historyFile = temporaryDirectory.appendingPathComponent("codex-history.jsonl")
        try "".write(to: historyFile, atomically: true, encoding: .utf8)

        let capturedBox = CapturedEventsBox()
        let source = CLIHistoryMonitor.WatchedSource(
            sourceApp: "codex",
            fileURL: historyFile,
            lastOffset: 0
        )

        let monitor = CLIHistoryMonitor(sources: [source]) { event in
            capturedBox.append(event)
        }

        let line = #"{"session_id":"019dcdd6-7ee9","ts":1777274954,"text":"We was very happy to see them."}"# + "\n"
        try line.write(to: historyFile, atomically: true, encoding: .utf8)

        monitor.poll()
        XCTAssertEqual(capturedBox.events.count, 1)
        XCTAssertEqual(capturedBox.events[0].sourceApp, "codex")
        XCTAssertEqual(capturedBox.events[0].text, "We was very happy to see them.")
        XCTAssertEqual(capturedBox.events[0].sentAt, Date(timeIntervalSince1970: 1777274954))
    }
}

private final class CapturedEventsBox: @unchecked Sendable {
    private let lock = NSLock()
    private var _events: [CaptureEvent] = []

    var events: [CaptureEvent] {
        lock.lock()
        defer { lock.unlock() }
        return _events
    }

    func append(_ event: CaptureEvent) {
        lock.lock()
        defer { lock.unlock() }
        _events.append(event)
    }
}
