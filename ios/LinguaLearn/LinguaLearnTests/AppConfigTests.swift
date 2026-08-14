import XCTest
@testable import LinguaLearnContainerApp

final class AppConfigTests: XCTestCase {
    override func setUp() {
        super.setUp()
        AppConfig.clearBaseUrl()
    }

    override func tearDown() {
        AppConfig.clearBaseUrl()
        super.tearDown()
    }

    func testDefaultBaseUrl() {
        XCTAssertFalse(AppConfig.baseUrl.isEmpty)
        XCTAssertEqual(AppConfig.baseUrl, "https://145.239.82.124.sslip.io/english")
        XCTAssertEqual(ApiClient().baseUrl, "https://145.239.82.124.sslip.io/english")
    }

    func testCustomBaseUrlConfiguration() {
        let customUrl = "https://api.lingua.example.com"
        AppConfig.setBaseUrl(customUrl)
        XCTAssertEqual(AppConfig.baseUrl, customUrl)
        XCTAssertEqual(ApiClient().baseUrl, customUrl)

        let explicitClient = ApiClient(baseUrl: "https://explicit.lingua.example.com")
        XCTAssertEqual(explicitClient.baseUrl, "https://explicit.lingua.example.com")
    }

    func testSharedAppGroupStorage() {
        let testHttpsUrl = "https://custom.api.org"
        AppConfig.setBaseUrl(testHttpsUrl)

        let storedInSuite = UserDefaults(suiteName: AppConfig.suiteName)?.string(forKey: AppConfig.apiKey)
        XCTAssertEqual(storedInSuite, testHttpsUrl)
    }

    func testSanitizeUrlEnforcesHttpsOrLoopback() {
        let loopbackUrl = "http://127.0.0.1:3001"
        XCTAssertEqual(AppConfig.sanitizeUrl(loopbackUrl), "http://127.0.0.1:3001")

        let localhostUrl = "http://localhost:3001"
        XCTAssertEqual(AppConfig.sanitizeUrl(localhostUrl), "http://localhost:3001")

        let validHttps = "https://custom.api.org"
        XCTAssertEqual(AppConfig.sanitizeUrl(validHttps), "https://custom.api.org")

        let insecureRemote = "http://insecure.example.com"
        XCTAssertEqual(AppConfig.sanitizeUrl(insecureRemote), AppConfig.defaultBaseUrl)
    }

    func testHttpsEnforcementByRejection() {
        let insecureUrl = "http://insecure.example.com"
        let success = AppConfig.setBaseUrl(insecureUrl)
        XCTAssertFalse(success, "Plaintext HTTP remote URL must be rejected")
        XCTAssertEqual(AppConfig.baseUrl, AppConfig.defaultBaseUrl)

        XCTAssertTrue(AppConfig.isSecureUrl("https://secure.example.com"))
        XCTAssertTrue(AppConfig.isSecureUrl("http://127.0.0.1:3001"))
        XCTAssertTrue(AppConfig.isSecureUrl("http://localhost:3001"))
        XCTAssertFalse(AppConfig.isSecureUrl("http://insecure.example.com"))
    }
}
