import Foundation

public enum HookInboxDisposition: Sendable {
    case remove
    case retain
}

public struct HookInboxImportReport: Equatable, Sendable {
    public var discovered = 0
    public var removed = 0
    public var retained = 0
    public var quarantined = 0

    public init() {}
}

/// Imports atomic spool files written by the Codex hook.
///
/// The hook and the agent are separate processes. Writers publish only a final `.json` path via
/// `rename(2)`, while this store ignores temporary files and serializes drains within the agent.
public final class HookInboxStore: @unchecked Sendable {
    public let inboxURL: URL
    public let quarantineURL: URL

    private let fileManager: FileManager
    private let lock = NSLock()
    private let maximumFileBytes: Int

    public init(
        configurationURL: URL,
        fileManager: FileManager = .default,
        maximumFileBytes: Int = 512 * 1024
    ) {
        self.inboxURL = configurationURL.deletingLastPathComponent()
            .appendingPathComponent("hook-inbox", isDirectory: true)
        self.quarantineURL = inboxURL.appendingPathComponent("quarantine", isDirectory: true)
        self.fileManager = fileManager
        self.maximumFileBytes = max(1_024, maximumFileBytes)
    }

    public init(
        inboxURL: URL,
        fileManager: FileManager = .default,
        maximumFileBytes: Int = 512 * 1024
    ) {
        self.inboxURL = inboxURL
        self.quarantineURL = inboxURL.appendingPathComponent("quarantine", isDirectory: true)
        self.fileManager = fileManager
        self.maximumFileBytes = max(1_024, maximumFileBytes)
    }

    /// Loads every fully-published hook event once. The caller decides whether a submission is
    /// durably owned by the normal queue (`remove`) or must remain for the next drain (`retain`).
    @discardableResult
    public func importPending(
        _ submit: (CaptureEvent) -> HookInboxDisposition
    ) -> HookInboxImportReport {
        lock.lock()
        defer { lock.unlock() }

        var report = HookInboxImportReport()
        do {
            try ensureDirectory(inboxURL)
        } catch {
            return report
        }

        let propertyKeys: Set<URLResourceKey> = [
            .isRegularFileKey,
            .isSymbolicLinkKey,
            .fileSizeKey,
            .creationDateKey,
            .contentModificationDateKey,
        ]
        let files: [URL]
        do {
            files = try fileManager.contentsOfDirectory(
                at: inboxURL,
                includingPropertiesForKeys: Array(propertyKeys),
                options: [.skipsHiddenFiles]
            )
            .filter { $0.pathExtension.lowercased() == "json" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
        } catch {
            return report
        }

        for file in files {
            report.discovered += 1
            let event: CaptureEvent
            do {
                let values = try file.resourceValues(forKeys: propertyKeys)
                guard values.isRegularFile == true,
                      values.isSymbolicLink != true,
                      let fileSize = values.fileSize,
                      fileSize > 0,
                      fileSize <= maximumFileBytes else {
                    throw HookInboxReadError.invalidFile
                }
                let data = try Data(contentsOf: file, options: [.mappedIfSafe])
                let request = try PayloadCoding.makeDecoder().decode(LocalIngressRequest.self, from: data)
                event = try validatedEvent(
                    request,
                    fallbackDate: values.creationDate ?? values.contentModificationDate
                )
            } catch {
                if quarantine(file) {
                    report.quarantined += 1
                } else if fileManager.fileExists(atPath: file.path) {
                    report.retained += 1
                }
                continue
            }

            switch submit(event) {
            case .remove:
                do {
                    try fileManager.removeItem(at: file)
                    report.removed += 1
                } catch CocoaError.fileNoSuchFile {
                    // The hook may have received 200/202 and unlinked the same file concurrently.
                    report.removed += 1
                } catch {
                    report.retained += 1
                }
            case .retain:
                report.retained += 1
            }
        }
        return report
    }

    private func validatedEvent(
        _ request: LocalIngressRequest,
        fallbackDate: Date?
    ) throws -> CaptureEvent {
        let eventID = request.eventId.trimmingCharacters(in: .whitespacesAndNewlines)
        let sourceApp = request.sourceApp.trimmingCharacters(in: .whitespacesAndNewlines)
        guard isValidEventID(eventID),
              !sourceApp.isEmpty, sourceApp.count <= 100,
              !request.text.isEmpty, request.text.count <= 64_000 else {
            throw HookInboxReadError.invalidPayload
        }
        return CaptureEvent(
            eventID: eventID,
            sourceApp: sourceApp,
            text: request.text,
            // New hooks always persist sentAt. The file timestamp is a stable migration fallback
            // for the brief pre-spool hook version and avoids changing payloads across restarts.
            sentAt: request.sentAt ?? fallbackDate ?? Date(timeIntervalSince1970: 0)
        )
    }

    private func isValidEventID(_ value: String) -> Bool {
        guard !value.isEmpty, value.count <= 200 else { return false }
        let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._:-")
        guard value.unicodeScalars.allSatisfy(allowed.contains),
              let first = value.unicodeScalars.first else { return false }
        return CharacterSet.alphanumerics.contains(first) && first.isASCII
    }

    private func ensureDirectory(_ url: URL) throws {
        try fileManager.createDirectory(
            at: url,
            withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700]
        )
        try fileManager.setAttributes([.posixPermissions: 0o700], ofItemAtPath: url.path)
    }

    private func quarantine(_ file: URL) -> Bool {
        do {
            let wasSymbolicLink = try? file.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink
            try ensureDirectory(quarantineURL)
            let stem = file.deletingPathExtension().lastPathComponent
            let destination = quarantineURL.appendingPathComponent(
                "\(stem).malformed-\(UUID().uuidString.lowercased()).json",
                isDirectory: false
            )
            try fileManager.moveItem(at: file, to: destination)
            // chmod follows symbolic links on Darwin. Keep a quarantined link inert without ever
            // touching permissions on its target; normal malformed files are tightened to 0600.
            if wasSymbolicLink != true {
                try fileManager.setAttributes([.posixPermissions: 0o600], ofItemAtPath: destination.path)
            }
            return true
        } catch CocoaError.fileNoSuchFile {
            // Concurrent successful hook delivery removed it; no recovery remains necessary.
            return true
        } catch {
            return false
        }
    }
}

private enum HookInboxReadError: Error {
    case invalidFile
    case invalidPayload
}
