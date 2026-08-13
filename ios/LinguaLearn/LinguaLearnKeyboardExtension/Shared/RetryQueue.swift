import Foundation

public struct QueuedWritingPayload: Codable, Identifiable {
    public var id: String { eventId }
    public let schemaVersion: Int
    public let eventId: String
    public let sourceApp: String
    public let originalText: String
    public let text: String
    public let sentAt: String
    public let previewOnly: Bool
    public var retryCount: Int

    public init(
        schemaVersion: Int = 1,
        eventId: String,
        sourceApp: String = "LinguaLearnKeyboardExtension",
        originalText: String,
        text: String? = nil,
        sentAt: String = ISO8601DateFormatter().string(from: Date()),
        previewOnly: Bool = false,
        retryCount: Int = 0
    ) {
        self.schemaVersion = schemaVersion
        self.eventId = eventId
        self.sourceApp = sourceApp
        self.originalText = originalText
        self.text = text ?? originalText
        self.sentAt = sentAt
        self.previewOnly = previewOnly
        self.retryCount = retryCount
    }
}

public class RetryQueue {
    public static let shared = RetryQueue()
    public private(set) var items: [QueuedWritingPayload] = []

    public var count: Int { items.count }

    public init() {
        loadFromStorage()
    }

    public func enqueue(_ payload: QueuedWritingPayload) {
        if !items.contains(where: { $0.eventId == payload.eventId }) {
            items.append(payload)
            saveToStorage()
        }
    }

    public func dequeue() -> QueuedWritingPayload? {
        guard !items.isEmpty else { return nil }
        let item = items.removeFirst()
        saveToStorage()
        return item
    }

    public func remove(eventId: String) {
        items.removeAll(where: { $0.eventId == eventId })
        saveToStorage()
    }

    public func saveToStorage() {
        if let data = try? JSONEncoder().encode(items) {
            AppGroupManager.shared.saveQueueData(data)
        }
    }

    public func loadFromStorage() {
        if let data = AppGroupManager.shared.getQueueData(),
           let decoded = try? JSONDecoder().decode([QueuedWritingPayload].self, from: data) {
            self.items = decoded
        }
    }
}
