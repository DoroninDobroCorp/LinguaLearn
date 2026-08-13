import Foundation
import Combine

public class RetentionManager: ObservableObject {
    @Published public var retentionDays: Int = 30
    @Published public var exportedJson: String?
    @Published public var isDeletingAccount: Bool = false

    private var baseUrl: String { AppConfig.baseUrl }

    public init() {}

    public func exportData() {
        guard let url = URL(string: "\(baseUrl)/api/user/export") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let data = data, let str = String(data: data, encoding: .utf8) else { return }
                self?.exportedJson = str
            }
        }.resume()
    }

    public func deleteAccount(completion: @escaping (Bool) -> Void) {
        guard let url = URL(string: "\(baseUrl)/api/user/account") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"

        URLSession.shared.dataTask(with: request) { _, response, _ in
            DispatchQueue.main.async {
                let success = (response as? HTTPURLResponse)?.statusCode == 200
                completion(success)
            }
        }.resume()
    }
}
