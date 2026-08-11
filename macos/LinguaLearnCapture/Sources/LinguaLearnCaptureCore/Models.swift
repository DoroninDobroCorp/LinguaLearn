import Foundation

public struct CaptureEvent: Codable, Equatable, Sendable {
    public let eventID: String
    public let sourceApp: String
    public let text: String
    public let sentAt: Date

    public init(eventID: String, sourceApp: String, text: String, sentAt: Date = Date()) {
        self.eventID = eventID
        self.sourceApp = sourceApp
        self.text = text
        self.sentAt = sentAt
    }
}

public struct WritingAnalyzeRequest: Codable, Equatable, Sendable {
    public let eventId: String
    public let sourceApp: String
    public let text: String
    public let sentAt: Date
    public let previewOnly: Bool

    public init(event: CaptureEvent, previewOnly: Bool = false) {
        eventId = event.eventID
        sourceApp = event.sourceApp
        text = event.text
        sentAt = event.sentAt
        self.previewOnly = previewOnly
    }
}

public struct WritingError: Codable, Equatable, Sendable {
    public let original: String?
    public let correction: String?
    public let explanationRu: String?
    public let explanation: String?
    public let topic: String?
    public let level: String?

    public init(
        original: String? = nil,
        correction: String? = nil,
        explanationRu: String? = nil,
        explanation: String? = nil,
        topic: String? = nil,
        level: String? = nil
    ) {
        self.original = original
        self.correction = correction
        self.explanationRu = explanationRu
        self.explanation = explanation
        self.topic = topic
        self.level = level
    }

    public var displayExplanation: String? {
        let russian = explanationRu?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let russian, !russian.isEmpty { return russian }
        let fallback = explanation?.trimmingCharacters(in: .whitespacesAndNewlines)
        return fallback?.isEmpty == false ? fallback : nil
    }
}

public struct TopicChange: Codable, Equatable, Sendable {
    public let topic: String?
    public let topicName: String?
    public let delta: Int?
    public let score: Int?

    public init(topic: String? = nil, topicName: String? = nil, delta: Int? = nil, score: Int? = nil) {
        self.topic = topic
        self.topicName = topicName
        self.delta = delta
        self.score = score
    }

    public var displayName: String? {
        let primary = topic?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let primary, !primary.isEmpty { return primary }
        let fallback = topicName?.trimmingCharacters(in: .whitespacesAndNewlines)
        return fallback?.isEmpty == false ? fallback : nil
    }
}

public struct TopicEvidence: Codable, Equatable, Sendable {
    public let topic: String
    public let level: String?
    public let outcome: String?
    public let scoreDelta: Int?
    public let newScore: Int?

    public init(
        topic: String,
        level: String? = nil,
        outcome: String? = nil,
        scoreDelta: Int? = nil,
        newScore: Int? = nil
    ) {
        self.topic = topic
        self.level = level
        self.outcome = outcome
        self.scoreDelta = scoreDelta
        self.newScore = newScore
    }
}

public struct WritingAnalyzeResponse: Codable, Equatable, Sendable {
    public let accepted: Bool
    public let originalText: String?
    public let correctedText: String?
    public let summaryRu: String?
    public let errors: [WritingError]
    public let topicEvidence: [TopicEvidence]
    public let topicChanges: [TopicChange]

    public init(
        accepted: Bool,
        originalText: String? = nil,
        correctedText: String? = nil,
        summaryRu: String? = nil,
        errors: [WritingError] = [],
        topicEvidence: [TopicEvidence] = [],
        topicChanges: [TopicChange] = []
    ) {
        self.accepted = accepted
        self.originalText = originalText
        self.correctedText = correctedText
        self.summaryRu = summaryRu
        self.errors = errors
        self.topicEvidence = topicEvidence
        self.topicChanges = topicChanges
    }

    private enum CodingKeys: String, CodingKey {
        case accepted, originalText, correctedText, summaryRu, errors, topicEvidence, topicChanges
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        accepted = try container.decodeIfPresent(Bool.self, forKey: .accepted) ?? true
        originalText = try container.decodeIfPresent(String.self, forKey: .originalText)
        correctedText = try container.decodeIfPresent(String.self, forKey: .correctedText)
        summaryRu = try container.decodeIfPresent(String.self, forKey: .summaryRu)
        errors = try container.decodeIfPresent([WritingError].self, forKey: .errors) ?? []
        topicEvidence = try container.decodeIfPresent([TopicEvidence].self, forKey: .topicEvidence) ?? []
        topicChanges = try container.decodeIfPresent([TopicChange].self, forKey: .topicChanges) ?? []
    }
}

public struct LocalIngressRequest: Codable, Equatable, Sendable {
    public let eventId: String
    public let sourceApp: String
    public let text: String
    public let sentAt: Date?

    public init(eventId: String, sourceApp: String, text: String, sentAt: Date? = nil) {
        self.eventId = eventId
        self.sourceApp = sourceApp
        self.text = text
        self.sentAt = sentAt
    }

    public var captureEvent: CaptureEvent {
        CaptureEvent(eventID: eventId, sourceApp: sourceApp, text: text, sentAt: sentAt ?? Date())
    }
}

public enum PayloadCoding {
    public static func makeEncoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }

    public static func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
