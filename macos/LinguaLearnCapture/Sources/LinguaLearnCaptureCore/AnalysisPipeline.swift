import Foundation

public final class AnalysisPipeline: @unchecked Sendable {
    public typealias SuccessHandler = (CaptureEvent, WritingAnalyzeResponse) -> Void
    public typealias FailureHandler = (CaptureEvent, AnalysisAPIError) -> Void

    private struct QueueItem: Codable {
        let event: CaptureEvent
        var retryCount: Int
        var nextAttemptAt: Date?
    }

    private let stateQueue = DispatchQueue(label: "com.lingualearn.capture.analysis-queue")
    private let client: AnalysisAPIClient
    private let maximumDepth: Int
    private let persistenceURL: URL?
    private let now: @Sendable () -> Date
    private var pending: [QueueItem] = []
    private var isProcessing = false
    private var persistenceHealthy = true
    private var scheduledWake: DispatchWorkItem?
    private var scheduledWakeAt: Date?

    public var onSuccess: SuccessHandler?
    public var onFailure: FailureHandler?

    public init(
        client: AnalysisAPIClient,
        maximumDepth: Int = 100,
        persistenceURL: URL? = nil,
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.client = client
        self.maximumDepth = max(1, maximumDepth)
        self.persistenceURL = persistenceURL
        self.now = now
        if let persistenceURL,
           FileManager.default.fileExists(atPath: persistenceURL.path) {
            do {
                let data = try Data(contentsOf: persistenceURL)
                // Never truncate a previously accepted durable queue merely because
                // a later configuration lowers maximumDepth.
                pending = try PayloadCoding.makeDecoder().decode([QueueItem].self, from: data)
            } catch {
                // Fail closed: do not overwrite a malformed/unreadable queue with
                // an apparently empty one on the next capture.
                persistenceHealthy = false
            }
        }
    }

    public func start() {
        stateQueue.async { [weak self] in self?.startNextIfNeeded() }
    }

    @discardableResult
    public func enqueue(_ event: CaptureEvent) -> Bool {
        stateQueue.sync {
            guard persistenceHealthy else { return false }
            if pending.contains(where: { $0.event.eventID == event.eventID }) {
                return true
            }
            let currentDepth = pending.count
            guard currentDepth < maximumDepth else { return false }
            pending.append(QueueItem(event: event, retryCount: 0, nextAttemptAt: nil))
            guard persist() else {
                pending.removeLast()
                persistenceHealthy = false
                return false
            }
            startNextIfNeeded()
            return true
        }
    }

    public var depth: Int {
        stateQueue.sync { pending.count }
    }

    public var isStorageHealthy: Bool {
        stateQueue.sync { persistenceHealthy }
    }

    private func startNextIfNeeded() {
        dispatchPrecondition(condition: .onQueue(stateQueue))
        guard !isProcessing, !pending.isEmpty else { return }
        let currentTime = now()
        guard let itemIndex = pending.firstIndex(where: { item in
            item.nextAttemptAt.map { $0 <= currentTime } ?? true
        }) else {
            scheduleWakeForEarliestAttempt(now: currentTime)
            return
        }

        cancelScheduledWake()
        isProcessing = true
        let item = pending[itemIndex]
        client.analyze(event: item.event) { [weak self] result in
            self?.stateQueue.async {
                self?.finish(item: item, result: result)
            }
        }
    }

    private func finish(item: QueueItem, result: Result<WritingAnalyzeResponse, AnalysisAPIError>) {
        dispatchPrecondition(condition: .onQueue(stateQueue))
        switch result {
        case .success(let response):
            if let index = pending.firstIndex(where: { $0.event.eventID == item.event.eventID }) {
                pending.remove(at: index)
                persistenceHealthy = persist()
            }
            isProcessing = false
            if let onSuccess {
                DispatchQueue.main.async { onSuccess(item.event, response) }
            }
            startNextIfNeeded()
        case .failure(let error):
            var retry = item
            retry.retryCount += 1
            let delay = error.retryDelay(afterAttempt: retry.retryCount)
            retry.nextAttemptAt = now().addingTimeInterval(delay)
            if let index = pending.firstIndex(where: { $0.event.eventID == item.event.eventID }) {
                pending[index] = retry
                persistenceHealthy = persist()
            }
            isProcessing = false
            if let onFailure {
                DispatchQueue.main.async { onFailure(item.event, error) }
            }

            // Keep every failure durable, but select another due item before waiting for this
            // item's persisted backoff. This prevents a permanent failure at the head from
            // blocking newer sentences and prevents enqueue() from bypassing the retry delay.
            startNextIfNeeded()
        }
    }

    private func scheduleWakeForEarliestAttempt(now: Date) {
        dispatchPrecondition(condition: .onQueue(stateQueue))
        guard let earliest = pending.compactMap(\.nextAttemptAt).min() else { return }
        if let scheduledWakeAt, scheduledWakeAt <= earliest { return }

        cancelScheduledWake()
        let delay = max(0, earliest.timeIntervalSince(now))
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.scheduledWake = nil
            self.scheduledWakeAt = nil
            self.startNextIfNeeded()
        }
        scheduledWake = work
        scheduledWakeAt = earliest
        stateQueue.asyncAfter(deadline: .now() + delay, execute: work)
    }

    private func cancelScheduledWake() {
        dispatchPrecondition(condition: .onQueue(stateQueue))
        scheduledWake?.cancel()
        scheduledWake = nil
        scheduledWakeAt = nil
    }

    @discardableResult
    private func persist() -> Bool {
        dispatchPrecondition(condition: .onQueue(stateQueue))
        guard let persistenceURL else { return true }
        do {
            let directory = persistenceURL.deletingLastPathComponent()
            try FileManager.default.createDirectory(
                at: directory,
                withIntermediateDirectories: true,
                attributes: [.posixPermissions: 0o700]
            )
            let data = try PayloadCoding.makeEncoder().encode(pending)
            try data.write(to: persistenceURL, options: [.atomic])
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: persistenceURL.path)
            return true
        } catch {
            // The current in-memory state remains usable, but new captures fail
            // closed until a later queue mutation successfully persists again.
            return false
        }
    }
}

extension AnalysisAPIError {
    func retryDelay(afterAttempt attempt: Int) -> TimeInterval {
        switch self {
        case .inProgress(let retryAfter):
            return retryAfter
        case .transport:
            return min(60, pow(2, Double(min(max(0, attempt - 1), 6))))
        case .httpStatus(let status, _):
            if status == 408 || status == 429 || status >= 500 {
                return min(60, pow(2, Double(min(max(0, attempt - 1), 6))))
            }
            return 300
        case .invalidConfiguration, .invalidResponse, .decoding:
            return 300
        }
    }
}
