import Foundation
import Combine

public struct DeviceToken: Codable, Identifiable {
    public let id: Int
    public let deviceName: String
    public let createdAt: String
    public let lastUsedAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case deviceName = "device_name"
        case createdAt = "created_at"
        case lastUsedAt = "last_used_at"
    }
}

public class DeviceTokenManager: ObservableObject {
    @Published public var devices: [DeviceToken] = []
    @Published public var activeDeviceToken: String?
    @Published public var newlyCreatedToken: String?
    @Published public var isLoading: Bool = false

    private let baseUrl = "http://127.0.0.1:3001"

    public init() {
        self.activeDeviceToken = AppGroupManager.shared.getDeviceToken()
        fetchDevices()
    }

    public func fetchDevices() {
        guard let url = URL(string: "\(baseUrl)/api/devices/tokens") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200, let data = data else {
                    return
                }

                if let decoded = try? JSONDecoder().decode([DeviceToken].self, from: data) {
                    self?.devices = decoded
                }
            }
        }.resume()
    }

    public func createDeviceToken(deviceName: String, completion: @escaping (String?) -> Void) {
        guard let url = URL(string: "\(baseUrl)/api/devices/tokens") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = ["device_name": deviceName]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 201, let data = data else {
                    completion(nil)
                    return
                }

                if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let token = json["token"] as? String {
                    self?.activeDeviceToken = token
                    self?.newlyCreatedToken = token
                    AppGroupManager.shared.saveDeviceToken(token)
                    self?.fetchDevices()
                    completion(token)
                } else {
                    completion(nil)
                }
            }
        }.resume()
    }

    public func revokeDeviceToken(id: Int) {
        guard let url = URL(string: "\(baseUrl)/api/devices/tokens/\(id)/revoke") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"

        URLSession.shared.dataTask(with: request) { [weak self] _, _, _ in
            DispatchQueue.main.async {
                self?.fetchDevices()
            }
        }.resume()
    }
}
