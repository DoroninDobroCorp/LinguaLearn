import Foundation

/// Monitors CLI agent history logs (such as ~/.claude/history.jsonl and ~/.codex/history.jsonl)
/// to capture user messages in real-time, including follow-up/steering messages sent while the agent
/// is executing tools or mid-turn.
public final class CLIHistoryMonitor: @unchecked Sendable {
    public struct WatchedSource: Sendable {
        public let sourceApp: String
        public let fileURL: URL
        public var lastOffset: UInt64

        public init(sourceApp: String, fileURL: URL, lastOffset: UInt64) {
            self.sourceApp = sourceApp
            self.fileURL = fileURL
            self.lastOffset = lastOffset
        }
    }

    private let onEvent: @Sendable (CaptureEvent) -> Void
    private let queue = DispatchQueue(label: "com.lingualearn.capture.cli-history")
    private var sources: [WatchedSource]
    private var timer: DispatchSourceTimer?

    public init(
        sources: [WatchedSource]? = nil,
        onEvent: @escaping @Sendable (CaptureEvent) -> Void
    ) {
        self.onEvent = onEvent
        if let customSources = sources {
            self.sources = customSources
        } else {
            let home = FileManager.default.homeDirectoryForCurrentUser
            let claudeURL = home.appendingPathComponent(".claude/history.jsonl")
            let codexURL = home.appendingPathComponent(".codex/history.jsonl")

            let initialClaudeOffset = Self.currentFileSize(at: claudeURL)
            let initialCodexOffset = Self.currentFileSize(at: codexURL)

            self.sources = [
                WatchedSource(sourceApp: "claude", fileURL: claudeURL, lastOffset: initialClaudeOffset),
                WatchedSource(sourceApp: "codex", fileURL: codexURL, lastOffset: initialCodexOffset)
            ]
        }
    }

    public func start() {
        guard timer == nil else { return }
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + 0.3, repeating: 0.5, leeway: .milliseconds(100))
        timer.setEventHandler { [weak self] in
            self?.poll()
        }
        self.timer = timer
        timer.resume()
    }

    public func stop() {
        timer?.setEventHandler {}
        timer?.cancel()
        timer = nil
    }

    deinit {
        stop()
    }

    public static func currentFileSize(at url: URL) -> UInt64 {
        guard let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
              let size = attrs[.size] as? UInt64 else {
            return 0
        }
        return size
    }

    public func poll() {
        for index in sources.indices {
            pollSource(at: index)
        }
    }

    private func pollSource(at index: Int) {
        let source = sources[index]
        let url = source.fileURL
        let currentSize = Self.currentFileSize(at: url)

        guard currentSize > 0 else {
            if currentSize == 0 && source.lastOffset > 0 {
                sources[index].lastOffset = 0
            }
            return
        }

        if currentSize < source.lastOffset {
            // File was truncated or rotated
            sources[index].lastOffset = 0
        }

        guard currentSize > sources[index].lastOffset else { return }

        guard let handle = try? FileHandle(forReadingFrom: url) else { return }
        defer { try? handle.close() }

        do {
            try handle.seek(toOffset: sources[index].lastOffset)
            let data = handle.readDataToEndOfFile()
            guard !data.isEmpty else { return }

            let newline = UInt8(0x0A)
            var lastNewlineOffset = 0

            for (idx, byte) in data.enumerated() {
                if byte == newline {
                    let lineData = data.subdata(in: lastNewlineOffset..<idx)
                    lastNewlineOffset = idx + 1
                    if let lineString = String(data: lineData, encoding: .utf8) {
                        let trimmed = lineString.trimmingCharacters(in: .whitespacesAndNewlines)
                        if !trimmed.isEmpty {
                            processLine(trimmed, sourceApp: source.sourceApp)
                        }
                    }
                }
            }

            sources[index].lastOffset += UInt64(lastNewlineOffset)
        } catch {
            sources[index].lastOffset = currentSize
        }
    }

    private func processLine(_ line: String, sourceApp: String) {
        guard let data = line.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return
        }

        let rawPrompt: String?
        if sourceApp == "claude" {
            rawPrompt = json["display"] as? String ?? json["text"] as? String ?? json["prompt"] as? String
        } else {
            rawPrompt = json["text"] as? String ?? json["prompt"] as? String ?? json["display"] as? String
        }

        guard let prompt = rawPrompt?.trimmingCharacters(in: .whitespacesAndNewlines),
              !prompt.isEmpty,
              prompt.count <= 64_000 else {
            return
        }

        // Ignore slash commands like /clear, /compact, /cost, /exit, /help, etc.
        if prompt.hasPrefix("/") || prompt.hasPrefix("!") {
            return
        }

        let timestamp: Date
        if let tsNum = json["timestamp"] as? Double {
            timestamp = tsNum > 1_000_000_000_000 ? Date(timeIntervalSince1970: tsNum / 1000) : Date(timeIntervalSince1970: tsNum)
        } else if let tsNum = json["ts"] as? Double {
            timestamp = tsNum > 1_000_000_000_000 ? Date(timeIntervalSince1970: tsNum / 1000) : Date(timeIntervalSince1970: tsNum)
        } else {
            timestamp = Date()
        }

        let sessionId = (json["sessionId"] as? String) ?? (json["session_id"] as? String) ?? sourceApp
        let stamp = Int(timestamp.timeIntervalSince1970 * 1000)
        let hash = String(format: "%08x", prompt.hashValue)
        let eventID = "\(sourceApp)-hist-\(sessionId.prefix(16))-\(stamp)-\(hash)"

        let event = CaptureEvent(
            eventID: eventID,
            sourceApp: sourceApp,
            text: prompt,
            sentAt: timestamp
        )

        onEvent(event)
    }
}
