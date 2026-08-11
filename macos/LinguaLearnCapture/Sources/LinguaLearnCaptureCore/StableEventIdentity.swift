import CryptoKit
import Foundation

public enum StableEventIdentity {
    /// Creates an idempotency key for noisy Accessibility callbacks. The recent-content cache
    /// remains the second line of defence when two callbacks straddle a bucket boundary.
    public static func accessibilityEventID(
        sourceApp: String,
        text: String,
        capturedAt: Date,
        bucketWidth: TimeInterval = 30
    ) -> String {
        let width = max(5, bucketWidth)
        let bucket = Int(floor(capturedAt.timeIntervalSince1970 / width))
        let canonical = [
            sourceApp.lowercased(),
            EventDeduplicator.normalizedContent(text),
            String(bucket)
        ].joined(separator: "\u{001F}")
        let digest = SHA256.hash(data: Data(canonical.utf8))
        return "ax-" + digest.map { String(format: "%02x", $0) }.joined()
    }
}
