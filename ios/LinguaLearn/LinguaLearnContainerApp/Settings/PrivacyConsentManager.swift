import Foundation
import Combine

public class PrivacyConsentManager: ObservableObject {
    @Published public var capturePaused: Bool = false
    @Published public var deniedApps: [String] = ["Telegram"]
    @Published public var retentionDays: Int = 30

    private var baseUrl: String { AppConfig.baseUrl }

    public init() {
        loadSettings()
    }

    public func loadSettings() {
        guard let url = URL(string: "\(baseUrl)/api/user/settings") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200, let data = data else { return }
                if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let settings = json["settings"] as? [String: Any] {
                    self?.capturePaused = (settings["capture_paused"] as? Int ?? 0) == 1
                    if let days = settings["raw_text_retention_days"] as? Int {
                        self?.retentionDays = days
                    }
                    AppGroupManager.shared.saveCapturePaused(self?.capturePaused ?? false)
                }
            }
        }.resume()
    }

    public func saveSettings() {
        guard let url = URL(string: "\(baseUrl)/api/user/settings") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "capture_paused": capturePaused ? 1 : 0,
            "raw_text_retention_days": retentionDays,
            "denied_apps": deniedApps
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        AppGroupManager.shared.saveCapturePaused(capturePaused)

        URLSession.shared.dataTask(with: request).resume()
    }
}
