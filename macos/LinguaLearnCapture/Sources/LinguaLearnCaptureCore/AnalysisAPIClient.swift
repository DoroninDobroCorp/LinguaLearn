import Foundation

public enum AnalysisAPIError: LocalizedError {
    case invalidConfiguration(Error)
    case transport(Error)
    case invalidResponse
    case inProgress(retryAfter: TimeInterval)
    case httpStatus(Int, String)
    case decoding(Error)

    public var errorDescription: String? {
        switch self {
        case .invalidConfiguration(let error): return error.localizedDescription
        case .transport(let error): return "Network error: \(error.localizedDescription)"
        case .invalidResponse: return "The server returned an invalid response"
        case .inProgress: return "This sentence is still being analyzed"
        case .httpStatus(let status, let message): return "LinguaLearn returned HTTP \(status): \(message)"
        case .decoding(let error): return "Could not decode analysis: \(error.localizedDescription)"
        }
    }
}

public final class AnalysisAPIClient: @unchecked Sendable {
    private let configuration: CaptureConfiguration
    private let session: URLSession
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    public init(configuration: CaptureConfiguration, session: URLSession = .shared) {
        self.configuration = configuration
        self.session = session
        encoder = PayloadCoding.makeEncoder()
        decoder = PayloadCoding.makeDecoder()
    }

    public func makeURLRequest(for event: CaptureEvent, previewOnly: Bool = false) throws -> URLRequest {
        let endpoint: URL
        do {
            endpoint = try configuration.validatedAPIURL()
        } catch {
            throw AnalysisAPIError.invalidConfiguration(error)
        }

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        // The server allows the model up to 45 seconds. Keep the client alive long
        // enough to receive that result instead of creating an avoidable retry.
        request.timeoutInterval = 60
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(configuration.bearerToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try encoder.encode(WritingAnalyzeRequest(event: event, previewOnly: previewOnly))
        return request
    }

    public func analyze(
        event: CaptureEvent,
        previewOnly: Bool = false,
        completion: @escaping (Result<WritingAnalyzeResponse, AnalysisAPIError>) -> Void
    ) {
        let request: URLRequest
        do {
            request = try makeURLRequest(for: event, previewOnly: previewOnly)
        } catch let error as AnalysisAPIError {
            completion(.failure(error))
            return
        } catch {
            completion(.failure(.invalidConfiguration(error)))
            return
        }

        session.dataTask(with: request) { [decoder] data, response, error in
            if let error {
                completion(.failure(.transport(error)))
                return
            }
            guard let httpResponse = response as? HTTPURLResponse, let data else {
                completion(.failure(.invalidResponse))
                return
            }
            guard (200..<300).contains(httpResponse.statusCode) else {
                if httpResponse.statusCode == 409,
                   let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   payload["code"] as? String == "EVENT_IN_PROGRESS" {
                    let rawDelay = httpResponse.value(forHTTPHeaderField: "Retry-After")
                        .flatMap(TimeInterval.init)
                    let retryAfter = rawDelay.map { min(10, max(0.25, $0)) } ?? 1
                    completion(.failure(.inProgress(retryAfter: retryAfter)))
                    return
                }
                let body = String(data: data.prefix(1_024), encoding: .utf8) ?? ""
                completion(.failure(.httpStatus(httpResponse.statusCode, body)))
                return
            }
            do {
                completion(.success(try decoder.decode(WritingAnalyzeResponse.self, from: data)))
            } catch {
                completion(.failure(.decoding(error)))
            }
        }.resume()
    }
}
