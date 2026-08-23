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
        let fileToken = config.bearerToken.trimmingCharacters(in: .whitespacesAndNewlines)

        if !fileToken.isEmpty && fileToken != "CHANGE_ME" {
            return config
        }

        if let keychainToken = KeychainTokenStorage.getToken(), !keychainToken.isEmpty {
            config.bearerToken = keychainToken
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
            _ = KeychainTokenStorage.saveToken(token)
        }

        let data = try PayloadCoding.makeEncoder().encode(configuration)
        try data.write(to: url, options: [.atomic])
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }
}
