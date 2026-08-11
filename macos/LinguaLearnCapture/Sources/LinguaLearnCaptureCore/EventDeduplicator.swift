import Foundation

public final class EventDeduplicator: @unchecked Sendable {
    private let lock = NSLock()
    private let contentWindow: TimeInterval
    private let eventIDWindow: TimeInterval
    private let maximumEntries: Int
    private var eventIDs: [String: Date] = [:]
    private var contentFingerprints: [String: Date] = [:]

    public init(contentWindow: TimeInterval = 2, eventIDWindow: TimeInterval = 86_400, maximumEntries: Int = 2_000) {
        self.contentWindow = max(1, contentWindow)
        self.eventIDWindow = max(contentWindow, eventIDWindow)
        self.maximumEntries = max(100, maximumEntries)
    }

    /// Returns true only for the first observation. Content fingerprints are source-scoped so the
    /// same legitimate sentence sent in Telegram and WhatsApp is not collapsed. The precise Codex
    /// hook and Codex Accessibility bundle share one explicit alias to suppress their duplicate.
    public func checkAndInsert(eventID: String, sourceApp: String, text: String, now: Date = Date()) -> Bool {
        lock.lock()
        defer { lock.unlock() }

        prune(now: now)
        let normalizedID = eventID.trimmingCharacters(in: .whitespacesAndNewlines)
        if !normalizedID.isEmpty, eventIDs[normalizedID] != nil { return false }

        let fingerprint = Self.contentFingerprint(sourceApp: sourceApp, text: text)
        if !fingerprint.isEmpty, contentFingerprints[fingerprint] != nil { return false }

        if !normalizedID.isEmpty { eventIDs[normalizedID] = now }
        if !fingerprint.isEmpty { contentFingerprints[fingerprint] = now }
        enforceCapacity()
        return true
    }

    /// Releases only the exact reservation created at `insertedAt`. This is used when admission
    /// succeeded but the durable queue was full. Timestamp matching prevents a late rollback from
    /// deleting a newer reservation for the same normalized content.
    public func removeReservation(eventID: String, sourceApp: String, text: String, insertedAt: Date) {
        lock.lock()
        defer { lock.unlock() }

        let normalizedID = eventID.trimmingCharacters(in: .whitespacesAndNewlines)
        if !normalizedID.isEmpty, eventIDs[normalizedID] == insertedAt {
            eventIDs.removeValue(forKey: normalizedID)
        }

        let fingerprint = Self.contentFingerprint(sourceApp: sourceApp, text: text)
        if !fingerprint.isEmpty, contentFingerprints[fingerprint] == insertedAt {
            contentFingerprints.removeValue(forKey: fingerprint)
        }
    }

    public static func normalizedContent(_ text: String) -> String {
        text
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .split(whereSeparator: { $0.isWhitespace })
            .joined(separator: " ")
    }

    private static func contentFingerprint(sourceApp: String, text: String) -> String {
        let source = normalizedSource(sourceApp)
        let content = normalizedContent(text)
        guard !content.isEmpty else { return "" }
        return "\(source)|\(content)"
    }

    private static func normalizedSource(_ sourceApp: String) -> String {
        let source = sourceApp.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        switch source {
        case "codex", "com.openai.codex":
            return "codex"
        default:
            return source.isEmpty ? "unknown" : source
        }
    }

    private func prune(now: Date) {
        eventIDs = eventIDs.filter { now.timeIntervalSince($0.value) <= eventIDWindow }
        contentFingerprints = contentFingerprints.filter { now.timeIntervalSince($0.value) <= contentWindow }
    }

    private func enforceCapacity() {
        if eventIDs.count > maximumEntries {
            let excess = eventIDs.count - maximumEntries
            for key in eventIDs.sorted(by: { $0.value < $1.value }).prefix(excess).map(\.key) {
                eventIDs.removeValue(forKey: key)
            }
        }
        if contentFingerprints.count > maximumEntries {
            let excess = contentFingerprints.count - maximumEntries
            for key in contentFingerprints.sorted(by: { $0.value < $1.value }).prefix(excess).map(\.key) {
                contentFingerprints.removeValue(forKey: key)
            }
        }
    }
}
