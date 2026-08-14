import Foundation
import Combine

public struct DeviceToken: Codable, Identifiable {
    public let id: Int
    public let deviceName: String
    public let appVersion: String?
    public let lastUsedAt: String?
    public let revokedAt: String?
    public let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case deviceName = "device_name"
        case appVersion = "app_version"
        case lastUsedAt = "last_used_at"
        case revokedAt = "revoked_at"
        case createdAt = "created_at"
    }

    public init(id: Int, deviceName: String, appVersion: String? = nil, lastUsedAt: String? = nil, revokedAt: String? = nil, createdAt: String) {
        self.id = id
        self.deviceName = deviceName
        self.appVersion = appVersion
        self.lastUsedAt = lastUsedAt
        self.revokedAt = revokedAt
        self.createdAt = createdAt
    }
}

public struct DeviceTokenResponse: Codable {
    public let tokens: [DeviceToken]

    public init(tokens: [DeviceToken]) {
        self.tokens = tokens
    }
}

public class DeviceTokenManager: ObservableObject {
    @Published public var devices: [DeviceToken] = []
    @Published public var activeDeviceToken: String?
    @Published public var newlyCreatedToken: String?
    @Published public var isLoading: Bool = false
    @Published public var errorMessage: String?
    @Published public var isStorageFailure: Bool = false
    @Published public var isPaired: Bool = false

    private var baseUrl: String { AppConfig.baseUrl }

    public init() {
        verifyPairing()
        fetchDevices()
    }

    @discardableResult
    public func verifyPairing() -> Bool {
        if let token = AppGroupManager.shared.getDeviceToken(), !token.isEmpty {
            self.activeDeviceToken = token
            self.isPaired = true
            return true
        } else {
            self.activeDeviceToken = nil
            self.isPaired = false
            return false
        }
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

                // Handle standard server dictionary response { "tokens": [...] } as well as array fallback
                if let response = try? JSONDecoder().decode(DeviceTokenResponse.self, from: data) {
                    self?.devices = response.tokens
                } else if let decoded = try? JSONDecoder().decode([DeviceToken].self, from: data) {
                    self?.devices = decoded
                }
            }
        }.resume()
    }

    public func createDeviceToken(deviceName: String, completion: @escaping (String?) -> Void) {
        guard let url = URL(string: "\(baseUrl)/api/devices/tokens") else {
            self.errorMessage = "Invalid URL"
            completion(nil)
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = ["device_name": deviceName]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        isLoading = true
        errorMessage = nil
        isStorageFailure = false

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                self?.isLoading = false
                if let error = error {
                    self?.errorMessage = "Network error: \(error.localizedDescription)"
                    completion(nil)
                    return
                }

                guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 201, let data = data else {
                    self?.errorMessage = "Failed to create device token from server"
                    completion(nil)
                    return
                }

                if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let token = json["token"] as? String {
                    let saved = AppGroupManager.shared.saveDeviceToken(token)
                    if saved {
                        self?.activeDeviceToken = token
                        self?.newlyCreatedToken = token
                        self?.errorMessage = nil
                        self?.isStorageFailure = false
                        self?.isPaired = true
                        self?.fetchDevices()
                        completion(token)
                    } else {
                        // Fail closed on Keychain storage failure & propagate UI error
                        self?.activeDeviceToken = nil
                        self?.isPaired = false
                        self?.isStorageFailure = true
                        self?.errorMessage = "Keychain Storage Failure: Failed to store device token in shared App Group Keychain."
                        completion(nil)
                    }
                } else {
                    self?.errorMessage = "Invalid JSON response"
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
