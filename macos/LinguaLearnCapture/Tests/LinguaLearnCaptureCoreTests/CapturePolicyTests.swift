import XCTest
@testable import LinguaLearnCaptureCore

final class CapturePolicyTests: XCTestCase {
    func testDenylistWinsAndSupportsPrefixWildcard() {
        let configuration = CaptureConfiguration(
            apiURL: "https://example.test/english/api/writing/analyze",
            bearerToken: "token",
            appURL: "https://example.test/english",
            ingressToken: "local",
            allowAllNonDenied: true,
            allowedBundleIdentifiers: ["com.jetbrains.intellij"],
            deniedBundleIdentifiers: ["com.jetbrains.*"]
        )
        let policy = CapturePolicy(configuration: configuration)
        XCTAssertFalse(policy.allows(bundleIdentifier: "com.jetbrains.intellij"))
        XCTAssertFalse(policy.allows(bundleIdentifier: "com.jetbrains.pycharm-EAP"))
        XCTAssertTrue(policy.allows(bundleIdentifier: "org.telegram.desktop"))
    }

    func testStrictAllowlist() {
        let configuration = CaptureConfiguration(
            apiURL: "https://example.test/english/api/writing/analyze",
            bearerToken: "token",
            appURL: "https://example.test/english",
            ingressToken: "local",
            allowAllNonDenied: false,
            allowedBundleIdentifiers: ["org.telegram.*"],
            deniedBundleIdentifiers: []
        )
        let policy = CapturePolicy(configuration: configuration)
        XCTAssertTrue(policy.allows(bundleIdentifier: "org.telegram.desktop"))
        XCTAssertFalse(policy.allows(bundleIdentifier: "net.whatsapp.WhatsApp"))
    }
}
