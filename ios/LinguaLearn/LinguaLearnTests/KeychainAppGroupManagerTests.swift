import XCTest
@testable import LinguaLearnContainerApp

final class KeychainAppGroupManagerTests: XCTestCase {
    func testKeychainAppGroupStorageAndRetrieval() {
        let testToken = "sample_dummy_token_123"
        let keychain = KeychainAppGroupManager.shared

        XCTAssertEqual(keychain.accessGroup, "group.ai.factory.lingualearn")
        XCTAssertEqual(keychain.service, "ai.factory.lingualearn")
        XCTAssertEqual(keychain.account, "lingualearn_device_token")

        AppGroupManager.shared.saveDeviceToken(testToken)
        let retrieved = AppGroupManager.shared.getDeviceToken()

        XCTAssertEqual(retrieved, testToken)
    }

    func testKeychainDeleteDeviceToken() {
        let testToken = "sample_dummy_token_to_delete"
        AppGroupManager.shared.saveDeviceToken(testToken)
        XCTAssertEqual(AppGroupManager.shared.getDeviceToken(), testToken)

        AppGroupManager.shared.clearDeviceToken()
        let retrieved = AppGroupManager.shared.getDeviceToken()
        XCTAssertNil(retrieved)
    }
}

