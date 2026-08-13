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
        XCTAssertEqual(AppConfig.baseUrl, AppConfig.defaultBaseUrl)
        XCTAssertEqual(ApiClient().baseUrl, AppConfig.defaultBaseUrl)
    }

    func testCustomBaseUrlConfiguration() {
        let customUrl = "https://api.lingua.example.com"
        AppConfig.setBaseUrl(customUrl)
        XCTAssertEqual(AppConfig.baseUrl, customUrl)
        XCTAssertEqual(ApiClient().baseUrl, customUrl)

        let explicitClient = ApiClient(baseUrl: "http://localhost:4000")
        XCTAssertEqual(explicitClient.baseUrl, "http://localhost:4000")
    }
}
