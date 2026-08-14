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

    @discardableResult
    public func saveDeviceToken(_ token: String) -> Bool {
        let success = keychainManager.saveDeviceToken(token)
        if success {
            // Securely store token exclusively in Keychain; purge legacy plaintext token from UserDefaults if present
            userDefaults?.removeObject(forKey: Keys.deviceToken)
            userDefaults?.synchronize()
        }
        return success
    }

    public func getDeviceToken() -> String? {
        // Retrieve token strictly from Keychain (plaintext UserDefaults storage eliminated)
        if userDefaults?.object(forKey: Keys.deviceToken) != nil {
            userDefaults?.removeObject(forKey: Keys.deviceToken)
            userDefaults?.synchronize()
        }
        return keychainManager.getDeviceToken()
    }

    @discardableResult
    public func clearDeviceToken() -> Bool {
        let success = keychainManager.deleteDeviceToken()
        userDefaults?.removeObject(forKey: Keys.deviceToken)
        userDefaults?.synchronize()
        return success
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
