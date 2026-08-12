import Foundation
import Combine

public struct PracticeExercise: Codable, Identifiable {
    public var id: String { prompt }
    public let topic: String
    public let prompt: String
    public let options: [String]?
    public let correctAnswer: String
    public let explanationRu: String

    enum CodingKeys: String, CodingKey {
        case topic
        case prompt
        case options
        case correctAnswer = "correct_answer"
        case explanationRu = "explanation_ru"
    }
}

public class PracticeViewModel: ObservableObject {
    @Published public var exercises: [PracticeExercise] = []
    @Published public var sessionId: Int?
    @Published public var isCompleted: Bool = false
    @Published public var score: Int = 0

    private let baseUrl = "http://127.0.0.1:3001"

    public init() {
        fetchTodayPractice()
    }

    public func fetchTodayPractice() {
        guard let url = URL(string: "\(baseUrl)/api/practice/today") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200, let data = data else { return }
                if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    self?.sessionId = json["session_id"] as? Int
                    if let exData = try? JSONSerialization.data(withJSONObject: json["exercises"] ?? []),
                       let exList = try? JSONDecoder().decode([PracticeExercise].self, from: exData) {
                        self?.exercises = exList
                    }
                }
            }
        }.resume()
    }

    public func completeSession(userAnswers: [[String: String]]) {
        guard let sid = sessionId, let url = URL(string: "\(baseUrl)/api/practice/sessions/\(sid)/complete") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = ["answers": userAnswers]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else { return }
                self?.isCompleted = true
            }
        }.resume()
    }
}
