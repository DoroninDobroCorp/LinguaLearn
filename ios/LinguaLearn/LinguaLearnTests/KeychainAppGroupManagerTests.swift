import XCTest
@testable import LinguaLearnContainerApp

final class KeychainAppGroupManagerTests: XCTestCase {
    override func setUp() {
        super.setUp()
        AppGroupManager.shared.clearDeviceToken()
    }

    override func tearDown() {
        AppGroupManager.shared.clearDeviceToken()
        super.tearDown()
    }

    func testKeychainAppGroupStorageAndRetrieval() {
        let testToken = "sample_dummy_token_123"
        let keychain = KeychainAppGroupManager.shared

        XCTAssertEqual(keychain.accessGroup, "group.ai.factory.lingualearn")
        XCTAssertEqual(keychain.expandedAccessGroup, "$(AppIdentifierPrefix)group.ai.factory.lingualearn")
        XCTAssertEqual(keychain.service, "ai.factory.lingualearn")
        XCTAssertEqual(keychain.account, "lingualearn_device_token")

        AppGroupManager.shared.saveDeviceToken(testToken)
        let retrieved = AppGroupManager.shared.getDeviceToken()

        XCTAssertEqual(retrieved, testToken)

        // Verify plaintext token is strictly NOT stored in UserDefaults
        let defaults = UserDefaults(suiteName: "group.ai.factory.lingualearn")
        XCTAssertNil(defaults?.string(forKey: "lingualearn_device_token"), "Plaintext device token must NOT be stored in UserDefaults")
        XCTAssertNil(UserDefaults.standard.string(forKey: "lingualearn_device_token"), "Plaintext device token must NOT be in standard UserDefaults")
    }

    func testKeychainDeleteDeviceToken() {
        let testToken = "sample_dummy_token_to_delete"
        AppGroupManager.shared.saveDeviceToken(testToken)
        XCTAssertEqual(AppGroupManager.shared.getDeviceToken(), testToken)

        AppGroupManager.shared.clearDeviceToken()
        let retrieved = AppGroupManager.shared.getDeviceToken()
        XCTAssertNil(retrieved, "Failed or deleted Keychain lookup must fail closed and return nil")

        // Verify UserDefaults also remains clean
        let defaults = UserDefaults(suiteName: "group.ai.factory.lingualearn")
        XCTAssertNil(defaults?.string(forKey: "lingualearn_device_token"))
    }

    func testFailClosedOnKeychainMissingItem() {
        _ = KeychainAppGroupManager.deleteDeviceToken()
        let token = KeychainAppGroupManager.loadDeviceToken()
        XCTAssertNil(token, "Keychain missing item must return nil without fallback")
    }
}
