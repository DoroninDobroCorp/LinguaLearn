import Foundation

public class NetworkRetryQueue {
    private let queue = RetryQueue()
    private let apiClient: ApiClient
    private var isFlushing = false

    public init(apiClient: ApiClient = ApiClient()) {
        self.apiClient = apiClient
    }

    public func enqueue(payload: QueuedWritingPayload) {
        queue.enqueue(payload)
        flush()
    }

    public func flush() {
        guard !isFlushing else { return }
        guard let token = AppGroupManager.shared.getDeviceToken(), !token.isEmpty else { return }
        guard let nextItem = queue.dequeue() else { return }

        isFlushing = true
        apiClient.analyze(payload: nextItem, deviceToken: token) { [weak self] result in
            guard let self = self else { return }
            self.isFlushing = false

            switch result {
            case .success:
                // Success: proceed with flushing remaining items
                self.flush()
            case .failure:
                // Failure: put item back with incremented retry count if under limit
                if nextItem.retryCount < 5 {
                    var retried = nextItem
                    retried.retryCount += 1
                    self.queue.enqueue(retried)
                }
            }
        }
    }
}
