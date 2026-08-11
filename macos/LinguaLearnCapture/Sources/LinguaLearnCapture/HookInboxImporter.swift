import Foundation
import LinguaLearnCaptureCore

/// Periodically transfers durable Codex hook spools into the normal analysis queue.
final class HookInboxImporter {
    private let store: HookInboxStore
    private weak var coordinator: CaptureCoordinator?
    private let interval: TimeInterval
    private let queue = DispatchQueue(label: "com.lingualearn.capture.hook-inbox")
    private var timer: DispatchSourceTimer?

    init(
        store: HookInboxStore,
        coordinator: CaptureCoordinator,
        interval: TimeInterval = 3
    ) {
        self.store = store
        self.coordinator = coordinator
        self.interval = max(0.5, interval)
    }

    func start() {
        guard timer == nil else { return }
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now(), repeating: interval, leeway: .milliseconds(250))
        timer.setEventHandler { [weak self] in
            self?.drain()
        }
        self.timer = timer
        timer.resume()
    }

    func stop() {
        timer?.setEventHandler {}
        timer?.cancel()
        timer = nil
    }

    private func drain() {
        guard let coordinator else { return }
        store.importPending { event in
            switch coordinator.submit(event) {
            case .queued, .duplicate, .filtered:
                return .remove
            case .paused, .queueFull, .storageUnavailable:
                return .retain
            }
        }
    }

    deinit {
        stop()
    }
}
