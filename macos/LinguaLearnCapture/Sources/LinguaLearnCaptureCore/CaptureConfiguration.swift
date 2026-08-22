import Foundation

public struct CaptureConfiguration: Codable, Equatable, Sendable {
    public static let canonicalProductionEndpoint = "https://145.239.82.124.sslip.io/english"
    public static let canonicalProductionAPIURL = "https://145.239.82.124.sslip.io/english/api/writing/analyze"
    public static let defaultVibeProxyAPIURL = "http://127.0.0.1:8318/v1/chat/completions"
    public static let defaultVibeProxyAppURL = "http://127.0.0.1:8318"

    public var apiURL: String
    public var model: String
    public var bearerToken: String
    public var appURL: String
    public var ingressPort: UInt16
    public var ingressToken: String
    public var captureEnabled: Bool
    public var allowAllNonDenied: Bool
    public var allowedBundleIdentifiers: [String]
    public var deniedBundleIdentifiers: [String]
    public var minimumEnglishWords: Int
    public var dedupeWindowSeconds: TimeInterval
    public var composerClearTimeoutMilliseconds: Int
    public var showOnlyWhenChanged: Bool
    public var maxQueueDepth: Int

    public init(
        apiURL: String = CaptureConfiguration.defaultVibeProxyAPIURL,
        model: String = "gemini-3.7-flash-high",
        bearerToken: String = "",
        appURL: String = CaptureConfiguration.defaultVibeProxyAppURL,
        ingressPort: UInt16 = 43_119,
        ingressToken: String,
        captureEnabled: Bool = true,
        allowAllNonDenied: Bool = true,
        allowedBundleIdentifiers: [String] = [],
        deniedBundleIdentifiers: [String] = CaptureConfiguration.defaultDeniedBundleIdentifiers,
        minimumEnglishWords: Int = 2,
        dedupeWindowSeconds: TimeInterval = 2,
        composerClearTimeoutMilliseconds: Int = 900,
        showOnlyWhenChanged: Bool = false,
        maxQueueDepth: Int = 1_000
    ) {
        self.apiURL = apiURL
        self.model = model
        self.bearerToken = bearerToken
        self.appURL = appURL
        self.ingressPort = ingressPort
        self.ingressToken = ingressToken
        self.captureEnabled = captureEnabled
        self.allowAllNonDenied = allowAllNonDenied
        self.allowedBundleIdentifiers = allowedBundleIdentifiers
        self.deniedBundleIdentifiers = deniedBundleIdentifiers
        self.minimumEnglishWords = max(2, minimumEnglishWords)
        self.dedupeWindowSeconds = max(1, dedupeWindowSeconds)
        self.composerClearTimeoutMilliseconds = max(100, composerClearTimeoutMilliseconds)
        self.showOnlyWhenChanged = showOnlyWhenChanged
        self.maxQueueDepth = max(1, maxQueueDepth)
    }

    private enum CodingKeys: String, CodingKey {
        case apiURL, model, bearerToken, appURL, ingressPort, ingressToken
        case captureEnabled, allowAllNonDenied, allowedBundleIdentifiers, deniedBundleIdentifiers
        case minimumEnglishWords, dedupeWindowSeconds, composerClearTimeoutMilliseconds
        case showOnlyWhenChanged, maxQueueDepth
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        apiURL = try container.decodeIfPresent(String.self, forKey: .apiURL) ?? CaptureConfiguration.defaultVibeProxyAPIURL
        model = try container.decodeIfPresent(String.self, forKey: .model) ?? "gemini-3.7-flash-high"
        bearerToken = try container.decodeIfPresent(String.self, forKey: .bearerToken) ?? ""
        appURL = try container.decodeIfPresent(String.self, forKey: .appURL) ?? CaptureConfiguration.defaultVibeProxyAppURL
        ingressPort = try container.decodeIfPresent(UInt16.self, forKey: .ingressPort) ?? 43_119
        ingressToken = try container.decodeIfPresent(String.self, forKey: .ingressToken) ?? ""
        captureEnabled = try container.decodeIfPresent(Bool.self, forKey: .captureEnabled) ?? true
        allowAllNonDenied = try container.decodeIfPresent(Bool.self, forKey: .allowAllNonDenied) ?? true
        allowedBundleIdentifiers = try container.decodeIfPresent([String].self, forKey: .allowedBundleIdentifiers) ?? []
        deniedBundleIdentifiers = try container.decodeIfPresent([String].self, forKey: .deniedBundleIdentifiers) ?? CaptureConfiguration.defaultDeniedBundleIdentifiers
        minimumEnglishWords = max(2, try container.decodeIfPresent(Int.self, forKey: .minimumEnglishWords) ?? 2)
        dedupeWindowSeconds = max(1, try container.decodeIfPresent(TimeInterval.self, forKey: .dedupeWindowSeconds) ?? 2)
        composerClearTimeoutMilliseconds = max(100, try container.decodeIfPresent(Int.self, forKey: .composerClearTimeoutMilliseconds) ?? 900)
        showOnlyWhenChanged = try container.decodeIfPresent(Bool.self, forKey: .showOnlyWhenChanged) ?? false
        maxQueueDepth = max(1, try container.decodeIfPresent(Int.self, forKey: .maxQueueDepth) ?? 1_000)
    }

    public static let defaultDeniedBundleIdentifiers = [
        "com.apple.Terminal",
        "com.googlecode.iterm2",
        "dev.warp.*",
        "com.microsoft.VSCode*",
        "com.apple.dt.Xcode*",
        "com.jetbrains.*",
        "com.sublimetext.*",
        "com.github.atom",
        "com.agilebits.*",
        "com.1password.*",
        "com.bitwarden.*",
        "org.keepassxc.*"
    ]

    public static var template: CaptureConfiguration {
        CaptureConfiguration(
            apiURL: defaultVibeProxyAPIURL,
            model: "gemini-3.7-flash-high",
            bearerToken: "",
            appURL: defaultVibeProxyAppURL,
            ingressToken: UUID().uuidString.replacingOccurrences(of: "-", with: "")
        )
    }

    public static var canonicalProductionTemplate: CaptureConfiguration {
        CaptureConfiguration(
            apiURL: "https://145.239.82.124.sslip.io/english/api/writing/analyze",
            model: "gemini-3.5-flash-lite",
            bearerToken: "CHANGE_ME",
            appURL: "https://145.239.82.124.sslip.io/english",
            ingressToken: UUID().uuidString.replacingOccurrences(of: "-", with: "")
        )
    }
}

public enum ConfigurationError: LocalizedError {
    case invalidAPIURL
    case missingBearerToken
    case invalidAppURL
    case missingIngressToken

    public var errorDescription: String? {
        switch self {
        case .invalidAPIURL: return "apiURL must use HTTPS (HTTP is allowed only for loopback testing)"
        case .missingBearerToken: return "bearerToken is missing or still set to CHANGE_ME"
        case .invalidAppURL: return "appURL must use HTTPS (HTTP is allowed only for loopback testing)"
        case .missingIngressToken: return "ingressToken must contain at least 16 characters"
        }
    }
}

public extension CaptureConfiguration {
    func isLoopback(_ url: URL) -> Bool {
        let host = url.host?.lowercased() ?? ""
        return host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "[::1]"
    }

    func isSecureOrLoopback(_ url: URL) -> Bool {
        if url.scheme?.lowercased() == "https" { return true }
        guard url.scheme?.lowercased() == "http" else { return false }
        return isLoopback(url)
    }

    func validatedAPIURL() throws -> URL {
        guard let url = URL(string: apiURL),
              url.host != nil,
              isSecureOrLoopback(url) else {
            throw ConfigurationError.invalidAPIURL
        }
        if isLoopback(url) {
            return url
        }
        let token = bearerToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !token.isEmpty, token != "CHANGE_ME" else {
            throw ConfigurationError.missingBearerToken
        }
        return url
    }

    func validatedAppURL() throws -> URL {
        guard let url = URL(string: appURL),
              url.host != nil,
              isSecureOrLoopback(url) else {
            throw ConfigurationError.invalidAppURL
        }
        return url
    }

    func validatedIngressToken() throws -> String {
        let token = ingressToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard token.count >= 16 else { throw ConfigurationError.missingIngressToken }
        return token
    }
}

public struct CapturePolicy: Sendable {
    private let allowAllNonDenied: Bool
    private let allowed: [String]
    private let denied: [String]

    public init(configuration: CaptureConfiguration) {
        allowAllNonDenied = configuration.allowAllNonDenied
        allowed = configuration.allowedBundleIdentifiers.map { $0.lowercased() }
        denied = configuration.deniedBundleIdentifiers.map { $0.lowercased() }
    }

    public func allows(bundleIdentifier: String) -> Bool {
        let identifier = bundleIdentifier.lowercased()
        if denied.contains(where: { Self.matches(identifier, pattern: $0) }) { return false }
        if allowed.contains(where: { Self.matches(identifier, pattern: $0) }) { return true }
        return allowAllNonDenied
    }

    private static func matches(_ identifier: String, pattern: String) -> Bool {
        if pattern.hasSuffix("*") {
            return identifier.hasPrefix(String(pattern.dropLast()))
        }
        return identifier == pattern
    }
}
