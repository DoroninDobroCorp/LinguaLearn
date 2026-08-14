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

    /// Verifies whether the URL string uses HTTPS or is a permitted local loopback address.
    public static func isSecureUrl(_ urlStr: String) -> Bool {
        let trimmed = urlStr.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return false }

        // Allow loopback HTTP in development/testing environments
        if trimmed.hasPrefix("http://127.0.0.1") || trimmed.hasPrefix("http://localhost") {
            return true
        }

        // Require HTTPS for all remote domains
        return trimmed.hasPrefix("https://")
    }

    public static func sanitizeUrl(_ urlStr: String) -> String {
        let trimmed = urlStr.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return defaultBaseUrl }

        if isSecureUrl(trimmed) {
            return trimmed
        }

        // HTTPS enforcement by rejection of plaintext HTTP remote URLs
        return defaultBaseUrl
    }

    @discardableResult
    public static func setBaseUrl(_ url: String) -> Bool {
        let trimmed = url.trimmingCharacters(in: .whitespacesAndNewlines)
        guard isSecureUrl(trimmed) else {
            // HTTPS enforcement by rejection: reject setting insecure non-loopback HTTP URL
            return false
        }

        UserDefaults(suiteName: suiteName)?.set(trimmed, forKey: apiKey)
        UserDefaults(suiteName: suiteName)?.synchronize()
        return true
    }

    public static func clearBaseUrl() {
        UserDefaults(suiteName: suiteName)?.removeObject(forKey: apiKey)
        UserDefaults(suiteName: suiteName)?.synchronize()
    }
}
