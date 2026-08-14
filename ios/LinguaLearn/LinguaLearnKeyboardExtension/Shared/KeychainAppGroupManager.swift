import Foundation
import Security

public class KeychainAppGroupManager {
    public static let shared = KeychainAppGroupManager()
    public let baseAccessGroup = "group.ai.factory.lingualearn"
    public let expandedAccessGroup = "$(AppIdentifierPrefix)group.ai.factory.lingualearn"
    public let service = "ai.factory.lingualearn"
    public let account = "lingualearn_device_token"

    public var accessGroup: String {
        return resolveAccessGroup()
    }

    public init() {}

    /// Dynamically resolves the Keychain access group at runtime using AppIdentifierPrefix if available.
    public func resolveAccessGroup() -> String {
        if let prefix = Bundle.main.infoDictionary?["AppIdentifierPrefix"] as? String, !prefix.isEmpty {
            let cleanPrefix = prefix.hasSuffix(".") ? prefix : "\(prefix)."
            return "\(cleanPrefix)\(baseAccessGroup)"
        }
        if let envPrefix = ProcessInfo.processInfo.environment["APP_IDENTIFIER_PREFIX"], !envPrefix.isEmpty {
            let cleanPrefix = envPrefix.hasSuffix(".") ? envPrefix : "\(envPrefix)."
            return "\(cleanPrefix)\(baseAccessGroup)"
        }
        return baseAccessGroup
    }

    public static func loadDeviceToken() -> String? {
        return shared.getDeviceToken()
    }

    @discardableResult
    public static func saveDeviceToken(_ token: String) -> Bool {
        return shared.saveDeviceToken(token)
    }

    @discardableResult
    public static func deleteDeviceToken() -> Bool {
        return shared.deleteDeviceToken()
    }

    @discardableResult
    public func saveDeviceToken(_ token: String) -> Bool {
        guard let data = token.data(using: .utf8) else { return false }

        _ = deleteDeviceToken()

        let queryAdd: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: accessGroup,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]
        let status = SecItemAdd(queryAdd as CFDictionary, nil)
        // Fail closed: return true strictly when Keychain storage operation with access group succeeded.
        // No fallback to private (un-shared) keychain.
        return status == errSecSuccess
    }

    public func getDeviceToken() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: accessGroup,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var dataTypeRef: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &dataTypeRef)

        // Fail closed: return token strictly if retrieved from Keychain with access group.
        // No fallback to private (un-shared) keychain.
        if status == errSecSuccess, let data = dataTypeRef as? Data, let token = String(data: data, encoding: .utf8) {
            return token
        }
        return nil
    }

    @discardableResult
    public func deleteDeviceToken() -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: accessGroup
        ]
        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }
}
