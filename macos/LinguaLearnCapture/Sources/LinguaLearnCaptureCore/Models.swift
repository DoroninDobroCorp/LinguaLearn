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
    public let schemaVersion: Int
    public let eventId: String
    public let sourceApp: String
    public let originalText: String
    public let text: String
    public let sentAt: Date
    public let previewOnly: Bool

    public init(event: CaptureEvent, previewOnly: Bool = false) {
        schemaVersion = 1
        eventId = event.eventID
        sourceApp = event.sourceApp
        originalText = event.text
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
    public let confidence: Double?
    public let kind: String?
    public let category: String?

    public init(
        original: String? = nil,
        correction: String? = nil,
        explanationRu: String? = nil,
        explanation: String? = nil,
        topic: String? = nil,
        level: String? = nil,
        confidence: Double? = nil,
        kind: String? = nil,
        category: String? = nil
    ) {
        self.original = original
        self.correction = correction
        self.explanationRu = explanationRu
        self.explanation = explanation
        self.topic = topic
        self.level = level
        self.confidence = confidence
        self.kind = kind
        self.category = category
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
    public let topicId: Int?
    public let topic: String
    public let category: String?
    public let level: String?
    public let outcome: String?
    public let confidence: Double?
    public let explanationRu: String?
    public let scoreDelta: Int?
    public let newScore: Int?

    public init(
        topicId: Int? = nil,
        topic: String,
        category: String? = nil,
        level: String? = nil,
        outcome: String? = nil,
        confidence: Double? = nil,
        explanationRu: String? = nil,
        scoreDelta: Int? = nil,
        newScore: Int? = nil
    ) {
        self.topicId = topicId
        self.topic = topic
        self.category = category
        self.level = level
        self.outcome = outcome
        self.confidence = confidence
        self.explanationRu = explanationRu
        self.scoreDelta = scoreDelta
        self.newScore = newScore
    }
}

public struct WritingAnalyzeResponse: Codable, Equatable, Sendable {
    public let schemaVersion: Int?
    public let eventId: String?
    public let sampleId: Int?
    public let previewOnly: Bool?
    public let accepted: Bool
    public let rejectionReason: String?
    public let sourceApp: String?
    public let originalText: String?
    public let correctedText: String?
    public let recommendedText: String?
    public let assessment: String?
    public let hasClearError: Bool?
    public let changed: Bool?
    public let summaryRu: String?
    public let errors: [WritingError]
    public let mechanicalCorrections: [WritingError]
    public let optionalSuggestions: [WritingError]
    public let topicEvidence: [TopicEvidence]
    public let topicChanges: [TopicChange]

    public init(
        schemaVersion: Int? = 1,
        eventId: String? = nil,
        sampleId: Int? = nil,
        previewOnly: Bool? = nil,
        accepted: Bool = true,
        rejectionReason: String? = nil,
        sourceApp: String? = nil,
        originalText: String? = nil,
        correctedText: String? = nil,
        recommendedText: String? = nil,
        assessment: String? = nil,
        hasClearError: Bool? = nil,
        changed: Bool? = nil,
        summaryRu: String? = nil,
        errors: [WritingError] = [],
        mechanicalCorrections: [WritingError] = [],
        optionalSuggestions: [WritingError] = [],
        topicEvidence: [TopicEvidence] = [],
        topicChanges: [TopicChange] = []
    ) {
        self.schemaVersion = schemaVersion
        self.eventId = eventId
        self.sampleId = sampleId
        self.previewOnly = previewOnly
        self.accepted = accepted
        self.rejectionReason = rejectionReason
        self.sourceApp = sourceApp
        self.originalText = originalText
        self.correctedText = correctedText
        self.recommendedText = recommendedText
        self.assessment = assessment
        self.hasClearError = hasClearError
        self.changed = changed
        self.summaryRu = summaryRu
        self.errors = errors
        self.mechanicalCorrections = mechanicalCorrections
        self.optionalSuggestions = optionalSuggestions
        self.topicEvidence = topicEvidence
        self.topicChanges = topicChanges
    }

    public var isClearError: Bool {
        if let hasClearError = hasClearError {
            return hasClearError
        }
        if let assessment = assessment {
            return assessment == "clear_error"
        }
        return !errors.isEmpty
    }

    private enum CodingKeys: String, CodingKey {
        case schemaVersion, eventId, sampleId, previewOnly, accepted, rejectionReason, sourceApp
        case originalText, correctedText, recommendedText, assessment, hasClearError, changed, summaryRu
        case errors, mechanicalCorrections, optionalSuggestions, topicEvidence, topicChanges
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try container.decodeIfPresent(Int.self, forKey: .schemaVersion)
        eventId = try container.decodeIfPresent(String.self, forKey: .eventId)
        sampleId = try container.decodeIfPresent(Int.self, forKey: .sampleId)
        previewOnly = try container.decodeIfPresent(Bool.self, forKey: .previewOnly)
        accepted = try container.decodeIfPresent(Bool.self, forKey: .accepted) ?? true
        rejectionReason = try container.decodeIfPresent(String.self, forKey: .rejectionReason)
        sourceApp = try container.decodeIfPresent(String.self, forKey: .sourceApp)
        originalText = try container.decodeIfPresent(String.self, forKey: .originalText)
        correctedText = try container.decodeIfPresent(String.self, forKey: .correctedText)
        recommendedText = try container.decodeIfPresent(String.self, forKey: .recommendedText)
        assessment = try container.decodeIfPresent(String.self, forKey: .assessment)
        hasClearError = try container.decodeIfPresent(Bool.self, forKey: .hasClearError)
        changed = try container.decodeIfPresent(Bool.self, forKey: .changed)
        summaryRu = try container.decodeIfPresent(String.self, forKey: .summaryRu)
        errors = try container.decodeIfPresent([WritingError].self, forKey: .errors) ?? []
        mechanicalCorrections = try container.decodeIfPresent([WritingError].self, forKey: .mechanicalCorrections) ?? []
        optionalSuggestions = try container.decodeIfPresent([WritingError].self, forKey: .optionalSuggestions) ?? []
        topicEvidence = try container.decodeIfPresent([TopicEvidence].self, forKey: .topicEvidence) ?? []
        topicChanges = try container.decodeIfPresent([TopicChange].self, forKey: .topicChanges) ?? []
    }
}

public enum PopupDisplayMode: Equatable, Sendable {
    case compactChip
    case largeCard
}

public struct PopupPolicy: Sendable {
    public static func displayMode(for response: WritingAnalyzeResponse, isPreviewHotkey: Bool) -> PopupDisplayMode {
        if isPreviewHotkey {
            return .largeCard
        }
        return response.isClearError ? .largeCard : .compactChip
    }
}

public struct LocalIngressRequest: Codable, Equatable, Sendable {
    public let schemaVersion: Int?
    public let eventId: String
    public let sourceApp: String
    public let originalText: String?
    public let text: String
    public let sentAt: Date?

    public init(eventId: String, sourceApp: String, text: String, sentAt: Date? = nil, schemaVersion: Int? = 1, originalText: String? = nil) {
        self.eventId = eventId
        self.sourceApp = sourceApp
        self.text = text
        self.sentAt = sentAt
        self.schemaVersion = schemaVersion
        self.originalText = originalText ?? text
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
