import Foundation

public struct WritingAnalysisErrorItem: Codable {
    public let kind: String?
    public let category: String?
    public let topic: String?
    public let originalFragment: String?
    public let replacementFragment: String?
    public let message: String?
    public let explanationRu: String?

    enum CodingKeys: String, CodingKey {
        case kind
        case category
        case topic
        case originalFragment = "original_fragment"
        case replacementFragment = "replacement_fragment"
        case message
        case explanationRu = "explanation_ru"
    }

    public init(
        kind: String? = nil,
        category: String? = nil,
        topic: String? = nil,
        originalFragment: String? = nil,
        replacementFragment: String? = nil,
        message: String? = nil,
        explanationRu: String? = nil
    ) {
        self.kind = kind
        self.category = category
        self.topic = topic
        self.originalFragment = originalFragment
        self.replacementFragment = replacementFragment
        self.message = message
        self.explanationRu = explanationRu
    }
}

public struct MechanicalCorrectionItem: Codable {
    public let originalFragment: String?
    public let replacementFragment: String?
    public let explanationRu: String?

    enum CodingKeys: String, CodingKey {
        case originalFragment = "original_fragment"
        case replacementFragment = "replacement_fragment"
        case explanationRu = "explanation_ru"
    }

    public init(originalFragment: String? = nil, replacementFragment: String? = nil, explanationRu: String? = nil) {
        self.originalFragment = originalFragment
        self.replacementFragment = replacementFragment
        self.explanationRu = explanationRu
    }
}

public struct OptionalSuggestionItem: Codable {
    public let suggestion: String?
    public let explanationRu: String?

    enum CodingKeys: String, CodingKey {
        case suggestion
        case explanationRu = "explanation_ru"
    }

    public init(suggestion: String? = nil, explanationRu: String? = nil) {
        self.suggestion = suggestion
        self.explanationRu = explanationRu
    }
}

public struct TopicEvidenceItem: Codable {
    public let topic: String
    public let confidence: Double
    public let outcome: String

    public init(topic: String, confidence: Double, outcome: String) {
        self.topic = topic
        self.confidence = confidence
        self.outcome = outcome
    }
}

public struct AnalysisResponse: Codable {
    public let schemaVersion: Int?
    public let acceptedRaw: Bool?
    public let eventIdRaw: String?
    public let originalTextRaw: String?
    public let correctedText: String
    public let changedRaw: Bool?
    public let summaryRuRaw: String?
    public let previewOnlyRaw: Bool?
    public let rejectionReason: String?
    public let assessment: String?
    public let hasClearError: Bool?
    public let errors: [WritingAnalysisErrorItem]?
    public let mechanicalCorrections: [MechanicalCorrectionItem]?
    public let optionalSuggestions: [OptionalSuggestionItem]?
    public let recommendedText: String?
    public let topicEvidence: [TopicEvidenceItem]?

    public var accepted: Bool { acceptedRaw ?? true }
    public var eventId: String { eventIdRaw ?? "" }
    public var originalText: String { originalTextRaw ?? "" }
    public var changed: Bool { changedRaw ?? (originalText != correctedText) }
    public var summaryRu: String { summaryRuRaw ?? "" }
    public var previewOnly: Bool { previewOnlyRaw ?? false }

    enum CodingKeys: String, CodingKey {
        case schemaVersion
        case acceptedRaw = "accepted"
        case eventIdRaw = "eventId"
        case originalTextRaw = "originalText"
        case correctedText
        case changedRaw = "changed"
        case summaryRuRaw = "summaryRu"
        case previewOnlyRaw = "previewOnly"
        case rejectionReason
        case assessment
        case hasClearError
        case errors
        case mechanicalCorrections
        case optionalSuggestions
        case recommendedText
        case topicEvidence
    }

    public init(
        schemaVersion: Int? = 1,
        accepted: Bool = true,
        eventId: String = "",
        originalText: String = "",
        correctedText: String,
        changed: Bool = true,
        summaryRu: String = "",
        previewOnly: Bool = false,
        rejectionReason: String? = nil,
        assessment: String? = nil,
        hasClearError: Bool? = nil,
        errors: [WritingAnalysisErrorItem]? = nil,
        mechanicalCorrections: [MechanicalCorrectionItem]? = nil,
        optionalSuggestions: [OptionalSuggestionItem]? = nil,
        recommendedText: String? = nil,
        topicEvidence: [TopicEvidenceItem]? = nil
    ) {
        self.schemaVersion = schemaVersion
        self.acceptedRaw = accepted
        self.eventIdRaw = eventId
        self.originalTextRaw = originalText
        self.correctedText = correctedText
        self.changedRaw = changed
        self.summaryRuRaw = summaryRu
        self.previewOnlyRaw = previewOnly
        self.rejectionReason = rejectionReason
        self.assessment = assessment
        self.hasClearError = hasClearError
        self.errors = errors
        self.mechanicalCorrections = mechanicalCorrections
        self.optionalSuggestions = optionalSuggestions
        self.recommendedText = recommendedText
        self.topicEvidence = topicEvidence
    }
}

public class ApiClient {
    public let customBaseUrl: String?
    private let session: URLSession

    public var baseUrl: String {
        return customBaseUrl ?? AppConfig.baseUrl
    }

    public init(baseUrl: String? = nil, session: URLSession? = nil) {
        self.customBaseUrl = baseUrl
        if let session = session {
            self.session = session
        } else {
            let config = URLSessionConfiguration.default
            config.timeoutIntervalForRequest = 3.0
            config.timeoutIntervalForResource = 5.0
            self.session = URLSession(configuration: config)
        }
    }

    public func analyze(
        payload: QueuedWritingPayload,
        deviceToken: String,
        completion: @escaping (Result<AnalysisResponse, Error>) -> Void
    ) {
        guard let url = URL(string: "\(baseUrl)/api/writing/analyze") else {
            completion(.failure(NSError(domain: "ApiClient", code: 400, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"])))
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 3.0
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(deviceToken)", forHTTPHeaderField: "Authorization")

        let bodyDict: [String: Any] = [
            "schemaVersion": payload.schemaVersion,
            "eventId": payload.eventId,
            "sourceApp": payload.sourceApp,
            "originalText": payload.originalText,
            "text": payload.text,
            "sentAt": payload.sentAt,
            "previewOnly": payload.previewOnly
        ]

        request.httpBody = try? JSONSerialization.data(withJSONObject: bodyDict)

        session.dataTask(with: request) { data, response, error in
            if let error = error {
                completion(.failure(error))
                return
            }

            guard let httpResponse = response as? HTTPURLResponse else {
                completion(.failure(NSError(domain: "ApiClient", code: 500, userInfo: [NSLocalizedDescriptionKey: "No response"])))
                return
            }

            guard (200...299).contains(httpResponse.statusCode), let data = data else {
                completion(.failure(NSError(domain: "ApiClient", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: "HTTP \(httpResponse.statusCode)"])))
                return
            }

            do {
                let decoded = try JSONDecoder().decode(AnalysisResponse.self, from: data)
                completion(.success(decoded))
            } catch {
                completion(.failure(error))
            }
        }.resume()
    }
}
