import Foundation

public class AppGroupManager {
    public static let shared = AppGroupManager()
    public let suiteName = "group.ai.factory.lingualearn"
    private let userDefaults: UserDefaults?
    private let keychainManager = KeychainAppGroupManager.shared

    private enum Keys {
        static let deviceToken = "lingualearn_device_token"
        static let capturePaused = "lingualearn_capture_paused"
        static let retryQueue = "lingualearn_retry_queue"
        static let userSettings = "lingualearn_user_settings"
    }

    public init() {
        self.userDefaults = UserDefaults(suiteName: suiteName) ?? UserDefaults.standard
    }

    public func saveDeviceToken(_ token: String) {
        _ = keychainManager.saveDeviceToken(token)
        userDefaults?.set(token, forKey: Keys.deviceToken)
        userDefaults?.synchronize()
    }

    public func getDeviceToken() -> String? {
        if let token = keychainManager.getDeviceToken() {
            return token
        }
        return userDefaults?.string(forKey: Keys.deviceToken)
    }

    public func clearDeviceToken() {
        _ = keychainManager.deleteDeviceToken()
        userDefaults?.removeObject(forKey: Keys.deviceToken)
        userDefaults?.synchronize()
    }

    public func saveCapturePaused(_ paused: Bool) {
        userDefaults?.set(paused, forKey: Keys.capturePaused)
        userDefaults?.synchronize()
    }

    public func isCapturePaused() -> Bool {
        return userDefaults?.bool(forKey: Keys.capturePaused) ?? false
    }

    public func saveQueueData(_ data: Data) {
        userDefaults?.set(data, forKey: Keys.retryQueue)
        userDefaults?.synchronize()
    }

    public func getQueueData() -> Data? {
        return userDefaults?.data(forKey: Keys.retryQueue)
    }

    public func clearQueueData() {
        userDefaults?.removeObject(forKey: Keys.retryQueue)
        userDefaults?.synchronize()
    }
}
