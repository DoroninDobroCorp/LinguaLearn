import Foundation

public struct AnalysisResponse: Codable {
    public let schemaVersion: Int?
    public let accepted: Bool
    public let eventId: String
    public let originalText: String
    public let correctedText: String
    public let changed: Bool
    public let summaryRu: String
    public let previewOnly: Bool
    public let rejectionReason: String?

    enum CodingKeys: String, CodingKey {
        case schemaVersion
        case accepted
        case eventId
        case originalText
        case correctedText
        case changed
        case summaryRu
        case previewOnly
        case rejectionReason
    }
}

public class ApiClient {
    private let baseUrl: String

    public init(baseUrl: String = "http://127.0.0.1:3001") {
        self.baseUrl = baseUrl
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

        URLSession.shared.dataTask(with: request) { data, response, error in
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
