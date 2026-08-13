import Foundation

public class AppConfig {
    public static let defaultBaseUrl = "https://145.239.82.124.sslip.io/english"

    public static let suiteName = "group.ai.factory.lingualearn"
    public static let apiKey = "lingualearn_api_url"

    public static var baseUrl: String {
        if let customUrl = UserDefaults(suiteName: suiteName)?.string(forKey: apiKey), !customUrl.isEmpty {
            return sanitizeUrl(customUrl)
        }
        if let envUrl = ProcessInfo.processInfo.environment["LINGUALEARN_API_URL"], !envUrl.isEmpty {
            return sanitizeUrl(envUrl)
        }
        if let bundleUrl = Bundle.main.object(forInfoDictionaryKey: "LinguaLearnApiUrl") as? String, !bundleUrl.isEmpty {
            return sanitizeUrl(bundleUrl)
        }
        return defaultBaseUrl
    }

    public static func sanitizeUrl(_ urlStr: String) -> String {
        let trimmed = urlStr.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return defaultBaseUrl }

        #if DEBUG
        return trimmed
        #else
        // Allow loopback HTTP in debug/test environments, require HTTPS for production domains
        if trimmed.hasPrefix("http://127.0.0.1") || trimmed.hasPrefix("http://localhost") {
            return trimmed
        }
        if trimmed.hasPrefix("http://") {
            return "https://" + trimmed.dropFirst(7)
        }
        if !trimmed.hasPrefix("https://") {
            return "https://" + trimmed
        }
        return trimmed
        #endif
    }

    public static func setBaseUrl(_ url: String) {
        let sanitized = sanitizeUrl(url)
        UserDefaults(suiteName: suiteName)?.set(sanitized, forKey: apiKey)
        UserDefaults(suiteName: suiteName)?.synchronize()
    }

    public static func clearBaseUrl() {
        UserDefaults(suiteName: suiteName)?.removeObject(forKey: apiKey)
        UserDefaults(suiteName: suiteName)?.synchronize()
    }
}
