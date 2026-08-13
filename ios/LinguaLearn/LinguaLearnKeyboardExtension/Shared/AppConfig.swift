import Foundation

public class AppConfig {
    public static let defaultBaseUrl = "http://127.0.0.1:3001"
    private static let suiteName = "group.ai.factory.lingualearn"
    private static let apiKey = "lingualearn_api_url"

    public static var baseUrl: String {
        if let customUrl = UserDefaults(suiteName: suiteName)?.string(forKey: apiKey), !customUrl.isEmpty {
            return customUrl
        }
        if let envUrl = ProcessInfo.processInfo.environment["LINGUALEARN_API_URL"], !envUrl.isEmpty {
            return envUrl
        }
        if let bundleUrl = Bundle.main.object(forInfoDictionaryKey: "LinguaLearnApiUrl") as? String, !bundleUrl.isEmpty {
            return bundleUrl
        }
        return defaultBaseUrl
    }

    public static func setBaseUrl(_ url: String) {
        UserDefaults(suiteName: suiteName)?.set(url, forKey: apiKey)
        UserDefaults(suiteName: suiteName)?.synchronize()
    }

    public static func clearBaseUrl() {
        UserDefaults(suiteName: suiteName)?.removeObject(forKey: apiKey)
        UserDefaults(suiteName: suiteName)?.synchronize()
    }
}
