import Foundation

public struct CaptureConfiguration: Codable, Equatable, Sendable {
    public var apiURL: String
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
        apiURL: String,
        bearerToken: String,
        appURL: String,
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
            apiURL: "https://YOUR_LINGUALEARN_HOST/english/api/writing/analyze",
            bearerToken: "CHANGE_ME",
            appURL: "https://YOUR_LINGUALEARN_HOST/english",
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
    private func isSecureOrLoopback(_ url: URL) -> Bool {
        if url.scheme?.lowercased() == "https" { return true }
        guard url.scheme?.lowercased() == "http" else { return false }
        let host = url.host?.lowercased() ?? ""
        return host == "localhost" || host == "127.0.0.1" || host == "::1"
    }

    func validatedAPIURL() throws -> URL {
        guard let url = URL(string: apiURL),
              url.host != nil,
              isSecureOrLoopback(url) else {
            throw ConfigurationError.invalidAPIURL
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
