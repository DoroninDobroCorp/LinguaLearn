import Foundation
import Combine

public struct WritingSampleItem: Codable, Identifiable {
    public let id: Int
    public let eventId: String
    public let sourceApp: String
    public let originalText: String?
    public let correctedText: String?
    public let changed: Int
    public let summaryRu: String?
    public let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case eventId = "event_id"
        case sourceApp = "source_app"
        case originalText = "original_text"
        case correctedText = "corrected_text"
        case changed
        case summaryRu = "summary_ru"
        case createdAt = "created_at"
    }
}

public class InboxViewModel: ObservableObject {
    @Published public var samples: [WritingSampleItem] = []
    @Published public var isLoading: Bool = false

    private let baseUrl = "http://127.0.0.1:3001"

    public init() {
        fetchSamples()
    }

    public func fetchSamples() {
        guard let url = URL(string: "\(baseUrl)/api/writing/samples") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"

        isLoading = true
        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                self?.isLoading = false
                guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200, let data = data else { return }
                if let decoded = try? JSONDecoder().decode([WritingSampleItem].self, from: data) {
                    self?.samples = decoded
                }
            }
        }.resume()
    }

    public func submitFeedback(sampleId: Int, feedbackType: String) {
        guard let url = URL(string: "\(baseUrl)/api/writing/samples/\(sampleId)/feedback") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = ["feedback_type": feedbackType]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        URLSession.shared.dataTask(with: request) { [weak self] _, _, _ in
            DispatchQueue.main.async {
                self?.fetchSamples()
            }
        }.resume()
    }
}
