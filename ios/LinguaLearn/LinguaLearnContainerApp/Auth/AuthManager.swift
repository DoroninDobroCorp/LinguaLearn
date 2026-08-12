import Foundation
import Combine

public struct UserProfile: Codable {
    public let id: Int
    public let email: String
    public let role: String
    public let cefrLevel: String?
}

public class AuthManager: ObservableObject {
    @Published public var isAuthenticated: Bool = false
    @Published public var currentUser: UserProfile?
    @Published public var errorMessage: String?

    private let baseUrl = "http://127.0.0.1:3001"

    public init() {
        checkSession()
    }

    public func checkSession() {
        guard let url = URL(string: "\(baseUrl)/api/auth/me") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200, let data = data else {
                    self?.isAuthenticated = false
                    self?.currentUser = nil
                    return
                }

                if let decoded = try? JSONDecoder().decode([String: UserProfile].self, from: data), let user = decoded["user"] {
                    self?.currentUser = user
                    self?.isAuthenticated = true
                }
            }
        }.resume()
    }

    public func login(email: String, password: String, completion: @escaping (Bool) -> Void) {
        guard let url = URL(string: "\(baseUrl)/api/auth/login") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = ["email": email, "password": password]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200, let data = data else {
                    self?.errorMessage = "Invalid email or password"
                    completion(false)
                    return
                }

                if let decoded = try? JSONDecoder().decode([String: UserProfile].self, from: data), let user = decoded["user"] {
                    self?.currentUser = user
                    self?.isAuthenticated = true
                    self?.errorMessage = nil
                    completion(true)
                } else {
                    completion(false)
                }
            }
        }.resume()
    }

    public func signup(email: String, password: String, inviteCode: String, completion: @escaping (Bool) -> Void) {
        guard let url = URL(string: "\(baseUrl)/api/auth/signup") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = ["email": email, "password": password, "invite_code": inviteCode]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 201, let data = data else {
                    self?.errorMessage = "Signup failed: Check your invite code and credentials"
                    completion(false)
                    return
                }

                if let decoded = try? JSONDecoder().decode([String: UserProfile].self, from: data), let user = decoded["user"] {
                    self?.currentUser = user
                    self?.isAuthenticated = true
                    self?.errorMessage = nil
                    completion(true)
                } else {
                    completion(false)
                }
            }
        }.resume()
    }

    public func logout() {
        guard let url = URL(string: "\(baseUrl)/api/auth/logout") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"

        URLSession.shared.dataTask(with: request) { [weak self] _, _, _ in
            DispatchQueue.main.async {
                self?.currentUser = nil
                self?.isAuthenticated = false
            }
        }.resume()
    }
}
