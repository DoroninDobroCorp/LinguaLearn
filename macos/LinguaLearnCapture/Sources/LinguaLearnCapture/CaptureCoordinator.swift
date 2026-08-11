import Foundation
import LinguaLearnCaptureCore

enum CaptureSubmissionResult: Equatable {
    case queued
    case paused
    case filtered(SentenceRejectionReason)
    case duplicate
    case queueFull
    case storageUnavailable
}

final class CaptureCoordinator {
    private let stateLock = NSLock()
    private let filter: EnglishSentenceFilter
    private let deduplicator: EventDeduplicator
    private let pipeline: AnalysisPipeline
    private var paused = false

    var onAnalysis: ((CaptureEvent, WritingAnalyzeResponse) -> Void)? {
        didSet { pipeline.onSuccess = onAnalysis }
    }
    var onFailure: ((CaptureEvent, AnalysisAPIError) -> Void)? {
        didSet { pipeline.onFailure = onFailure }
    }

    init(configuration: CaptureConfiguration, pendingEventsURL: URL? = nil) {
        filter = EnglishSentenceFilter(minimumWords: configuration.minimumEnglishWords)
        deduplicator = EventDeduplicator(contentWindow: configuration.dedupeWindowSeconds)
        pipeline = AnalysisPipeline(
            client: AnalysisAPIClient(configuration: configuration),
            maximumDepth: configuration.maxQueueDepth,
            persistenceURL: pendingEventsURL
        )
        paused = !configuration.captureEnabled
    }

    func setPaused(_ value: Bool) {
        stateLock.lock()
        paused = value
        stateLock.unlock()
    }

    var isPaused: Bool {
        stateLock.lock()
        defer { stateLock.unlock() }
        return paused
    }

    @discardableResult
    func submit(_ event: CaptureEvent) -> CaptureSubmissionResult {
        guard !isPaused else { return .paused }
        guard pipeline.isStorageHealthy else { return .storageUnavailable }
        let result = filter.evaluate(event.text)
        guard result.accepted else { return .filtered(result.reason ?? .notEnglish) }
        guard deduplicator.checkAndInsert(
            eventID: event.eventID,
            sourceApp: event.sourceApp,
            text: event.text,
            now: event.sentAt
        ) else {
            return .duplicate
        }
        guard pipeline.enqueue(event) else {
            deduplicator.removeReservation(
                eventID: event.eventID,
                sourceApp: event.sourceApp,
                text: event.text,
                insertedAt: event.sentAt
            )
            return pipeline.isStorageHealthy ? .queueFull : .storageUnavailable
        }
        return .queued
    }

    var queueDepth: Int { pipeline.depth }
    var isStorageHealthy: Bool { pipeline.isStorageHealthy }

    func startQueue() {
        pipeline.start()
    }
}
