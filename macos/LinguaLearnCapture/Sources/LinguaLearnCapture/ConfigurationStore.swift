import Foundation
import LinguaLearnCaptureCore

enum ConfigurationStoreError: LocalizedError {
    case keychainWriteFailed

    var errorDescription: String? {
        switch self {
        case .keychainWriteFailed:
            return "Could not save the device token in macOS Keychain. Configuration was not changed."
        }
    }
}

enum ConfigurationStore {
    static var configurationURL: URL {
        if let override = ProcessInfo.processInfo.environment["LINGUALEARN_CAPTURE_CONFIG"], !override.isEmpty {
            return URL(fileURLWithPath: NSString(string: override).expandingTildeInPath)
        }
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return support
            .appendingPathComponent("LinguaLearnCapture", isDirectory: true)
            .appendingPathComponent("config.json", isDirectory: false)
    }

    static var pendingEventsURL: URL {
        configurationURL.deletingLastPathComponent().appendingPathComponent("pending-events.json")
    }

    static func loadOrCreate() throws -> CaptureConfiguration {
        let url = configurationURL
        if !FileManager.default.fileExists(atPath: url.path) {
            try write(CaptureConfiguration.template, to: url)
        }
        let data = try Data(contentsOf: url)
        var config = try PayloadCoding.makeDecoder().decode(CaptureConfiguration.self, from: data)
        let legacyToken = config.bearerToken.trimmingCharacters(in: .whitespacesAndNewlines)

        if let keychainToken = KeychainTokenStorage.getToken(), !keychainToken.isEmpty {
            config.bearerToken = keychainToken
        } else if !legacyToken.isEmpty && legacyToken != "CHANGE_ME" {
            // One-time migration from older builds that stored the token in config.json.
            guard KeychainTokenStorage.saveToken(legacyToken) else {
                throw ConfigurationStoreError.keychainWriteFailed
            }
            config.bearerToken = legacyToken
            try write(config, to: url)
        }
        return config
    }

    static func write(_ configuration: CaptureConfiguration, to url: URL = configurationURL) throws {
        let directory = url.deletingLastPathComponent()
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700]
        )

        let token = configuration.bearerToken.trimmingCharacters(in: .whitespacesAndNewlines)
        if !token.isEmpty && token != "CHANGE_ME" {
            guard KeychainTokenStorage.saveToken(token) else {
                throw ConfigurationStoreError.keychainWriteFailed
            }
        }

        // bearerToken remains a runtime compatibility field, but secrets are
        // never serialized to config.json. The real value lives only in Keychain.
        var redacted = configuration
        redacted.bearerToken = "CHANGE_ME"
        if token.isEmpty {
            redacted.bearerToken = ""
        }
        let data = try PayloadCoding.makeEncoder().encode(redacted)
        try data.write(to: url, options: [.atomic])
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }
}
