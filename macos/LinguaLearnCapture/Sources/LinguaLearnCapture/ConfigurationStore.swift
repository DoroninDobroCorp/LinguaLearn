import Foundation
import LinguaLearnCaptureCore

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
        return try PayloadCoding.makeDecoder().decode(CaptureConfiguration.self, from: data)
    }

    static func write(_ configuration: CaptureConfiguration, to url: URL = configurationURL) throws {
        let directory = url.deletingLastPathComponent()
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700]
        )
        let data = try PayloadCoding.makeEncoder().encode(configuration)
        try data.write(to: url, options: [.atomic])
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }
}
