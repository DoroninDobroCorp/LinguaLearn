import Foundation
import XCTest
@testable import LinguaLearnCaptureCore

final class HookInboxStoreTests: XCTestCase {
    func testConfigurationParentDefinesInboxAndQueuedEventIsRemoved() throws {
        let root = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let configurationURL = root.appendingPathComponent("support/config.json")
        let store = HookInboxStore(configurationURL: configurationURL)
        XCTAssertEqual(
            store.inboxURL.standardizedFileURL.path,
            root.appendingPathComponent("support/hook-inbox").standardizedFileURL.path
        )

        let sentAt = Date(timeIntervalSince1970: 1_786_330_000)
        let file = try write(
            LocalIngressRequest(
                eventId: "codex-turn-1",
                sourceApp: "codex",
                text: "Yesterday I go home.",
                sentAt: sentAt
            ),
            named: "valid.json",
            to: store.inboxURL
        )
        var imported: CaptureEvent?
        let report = store.importPending { event in
            imported = event
            return .remove
        }

        XCTAssertEqual(report, HookInboxImportReport(discovered: 1, removed: 1))
        XCTAssertEqual(imported?.eventID, "codex-turn-1")
        XCTAssertEqual(imported?.sourceApp, "codex")
        XCTAssertEqual(imported?.text, "Yesterday I go home.")
        XCTAssertEqual(imported?.sentAt, sentAt)
        XCTAssertFalse(FileManager.default.fileExists(atPath: file.path))
        XCTAssertEqual(try permissions(of: store.inboxURL), 0o700)
    }

    func testPausedOrFullDispositionRetainsFileForNextDrain() throws {
        let root = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = HookInboxStore(inboxURL: root.appendingPathComponent("hook-inbox"))
        let file = try write(
            LocalIngressRequest(
                eventId: "codex-turn-retained",
                sourceApp: "codex",
                text: "I will try again later.",
                sentAt: Date(timeIntervalSince1970: 100)
            ),
            named: "retained.json",
            to: store.inboxURL
        )

        let first = store.importPending { _ in .retain }
        XCTAssertEqual(first, HookInboxImportReport(discovered: 1, retained: 1))
        XCTAssertTrue(FileManager.default.fileExists(atPath: file.path))

        let second = store.importPending { _ in .remove }
        XCTAssertEqual(second, HookInboxImportReport(discovered: 1, removed: 1))
        XCTAssertFalse(FileManager.default.fileExists(atPath: file.path))
    }

    func testFilteredAndDuplicateCanShareRemoveDispositionWithoutReimport() throws {
        let root = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = HookInboxStore(inboxURL: root.appendingPathComponent("hook-inbox"))
        try write(
            LocalIngressRequest(
                eventId: "codex-turn-filtered",
                sourceApp: "codex",
                text: "Thanks",
                sentAt: Date(timeIntervalSince1970: 100)
            ),
            named: "filtered.json",
            to: store.inboxURL
        )

        XCTAssertEqual(
            store.importPending { _ in .remove },
            HookInboxImportReport(discovered: 1, removed: 1)
        )
        var callbackCount = 0
        XCTAssertEqual(store.importPending { _ in callbackCount += 1; return .remove }, HookInboxImportReport())
        XCTAssertEqual(callbackCount, 0)
    }

    func testMalformedInvalidOversizedAndSymlinkFilesAreQuarantinedSafely() throws {
        let root = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let inbox = root.appendingPathComponent("hook-inbox")
        try FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)

        try Data("not-json".utf8).write(to: inbox.appendingPathComponent("malformed.json"))
        try Data(#"{"eventId":"bad id","sourceApp":"codex","text":"Valid sentence."}"#.utf8)
            .write(to: inbox.appendingPathComponent("invalid.json"))
        try Data(repeating: 0x41, count: 2_048).write(to: inbox.appendingPathComponent("oversized.json"))

        let outside = root.appendingPathComponent("outside.txt")
        try Data("do not chmod or read me".utf8).write(to: outside)
        try FileManager.default.setAttributes([.posixPermissions: 0o644], ofItemAtPath: outside.path)
        try FileManager.default.createSymbolicLink(
            at: inbox.appendingPathComponent("link.json"),
            withDestinationURL: outside
        )

        let store = HookInboxStore(inboxURL: inbox, maximumFileBytes: 1_024)
        var callbacks = 0
        let report = store.importPending { _ in callbacks += 1; return .remove }
        XCTAssertEqual(report.discovered, 4)
        XCTAssertEqual(report.quarantined, 4)
        XCTAssertEqual(callbacks, 0)
        XCTAssertEqual(try permissions(of: outside), 0o644)
        XCTAssertEqual(try permissions(of: store.quarantineURL), 0o700)
        XCTAssertEqual(
            try FileManager.default.contentsOfDirectory(atPath: store.quarantineURL.path).count,
            4
        )
    }

    func testMissingSentAtUsesStableFileTimestampFallback() throws {
        let root = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = HookInboxStore(inboxURL: root.appendingPathComponent("hook-inbox"))
        try FileManager.default.createDirectory(at: store.inboxURL, withIntermediateDirectories: true)
        let file = store.inboxURL.appendingPathComponent("legacy.json")
        try Data(#"{"eventId":"legacy-turn","sourceApp":"codex","text":"This is legacy."}"#.utf8)
            .write(to: file)
        let fallback = Date(timeIntervalSince1970: 1_700_000_000)
        try FileManager.default.setAttributes([.modificationDate: fallback], ofItemAtPath: file.path)

        var captured: CaptureEvent?
        _ = store.importPending { captured = $0; return .retain }
        XCTAssertNotNil(captured)
        // APFS creation time normally wins; regardless of which stable filesystem timestamp is
        // available, it must not fall back to the current import time.
        XCTAssertLessThan(captured!.sentAt.timeIntervalSinceNow, -1)
    }

    private func temporaryDirectory() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("lingualearn-hook-inbox-\(UUID().uuidString)", isDirectory: true)
    }

    @discardableResult
    private func write(
        _ request: LocalIngressRequest,
        named name: String,
        to directory: URL
    ) throws -> URL {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let file = directory.appendingPathComponent(name)
        try PayloadCoding.makeEncoder().encode(request).write(to: file, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
        return file
    }

    private func permissions(of url: URL) throws -> Int {
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        return (attributes[.posixPermissions] as? NSNumber)?.intValue ?? -1
    }
}

private extension HookInboxImportReport {
    init(discovered: Int = 0, removed: Int = 0, retained: Int = 0, quarantined: Int = 0) {
        self.init()
        self.discovered = discovered
        self.removed = removed
        self.retained = retained
        self.quarantined = quarantined
    }
}
