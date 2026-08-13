import XCTest
@testable import LinguaLearnCaptureCore

final class KeychainTokenStorageTests: XCTestCase {
    override func setUp() {
        super.setUp()
        KeychainTokenStorage.deleteToken(account: "testDeviceToken")
    }

    override func tearDown() {
        KeychainTokenStorage.deleteToken(account: "testDeviceToken")
        super.tearDown()
    }

    func testSaveAndRetrieveToken() {
        let testToken = "test_token_account_12345"
        let saved = KeychainTokenStorage.saveToken(testToken, account: "testDeviceToken")
        XCTAssertTrue(saved, "Expected token to be saved successfully to Keychain")

        let retrieved = KeychainTokenStorage.getToken(account: "testDeviceToken")
        XCTAssertEqual(retrieved, testToken, "Retrieved token should match saved token")
    }

    func testDeleteToken() {
        let testToken = "test_token_account_to_delete"
        KeychainTokenStorage.saveToken(testToken, account: "testDeviceToken")

        let deleted = KeychainTokenStorage.deleteToken(account: "testDeviceToken")
        XCTAssertTrue(deleted, "Expected token deletion to succeed")

        let retrieved = KeychainTokenStorage.getToken(account: "testDeviceToken")
        XCTAssertNil(retrieved, "Token should be nil after deletion")
    }
}
