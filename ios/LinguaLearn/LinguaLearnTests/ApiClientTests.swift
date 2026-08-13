import XCTest
@testable import LinguaLearnContainerApp

final class MockURLProtocol: URLProtocol {
    static var requestHandler: ((URLRequest) throws -> (HTTPURLResponse, Data?))?

    override class func canInit(with request: URLRequest) -> Bool {
        return true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        return request
    }

    override func startLoading() {
        guard let handler = MockURLProtocol.requestHandler else {
            XCTFail("Handler is not set.")
            return
        }

        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            if let data = data {
                client?.urlProtocol(self, didLoad: data)
            }
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

final class ApiClientTests: XCTestCase {
    private var session: URLSession!

    override func setUp() {
        super.setUp()
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        session = URLSession(configuration: config)
    }

    override func tearDown() {
        session = nil
        MockURLProtocol.requestHandler = nil
        super.tearDown()
    }

    func testPayloadSerializationConformsToSchemaVersion1() {
        let payload = QueuedWritingPayload(
            schemaVersion: 1,
            eventId: "ios-test-99",
            sourceApp: "LinguaLearnKeyboardExtension",
            originalText: "She don't know.",
            previewOnly: false
        )

        XCTAssertEqual(payload.schemaVersion, 1)
        XCTAssertEqual(payload.eventId, "ios-test-99")
        XCTAssertEqual(payload.sourceApp, "LinguaLearnKeyboardExtension")
        XCTAssertEqual(payload.originalText, "She don't know.")
        XCTAssertFalse(payload.previewOnly)
    }

    func testApiClientUrlProtocolIntegrationSuccess() {
        let expectation = self.expectation(description: "URLProtocol integration completion")

        let mockResponseJson = """
        {
            "schemaVersion": 1,
            "accepted": true,
            "eventId": "evt-urlprotocol-101",
            "originalText": "She don't know.",
            "correctedText": "She doesn't know.",
            "changed": true,
            "summaryRu": "Ошибка в согласовании подлежащего и сказуемого.",
            "previewOnly": false,
            "assessment": "clear_error",
            "hasClearError": true,
            "recommendedText": "She doesn't know.",
            "errors": [
                {
                    "kind": "grammar_error",
                    "category": "subject_verb_agreement",
                    "topic": "present_simple",
                    "original_fragment": "don't",
                    "replacement_fragment": "doesn't",
                    "explanation_ru": "Используйте doesn't для третьего лица единственного числа."
                }
            ]
        }
        """

        var capturedRequest: URLRequest?
        MockURLProtocol.requestHandler = { request in
            capturedRequest = request
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!
            return (response, mockResponseJson.data(using: .utf8))
        }

        let client = ApiClient(baseUrl: "https://145.239.82.124.sslip.io/english", session: session)
        let payload = QueuedWritingPayload(eventId: "evt-urlprotocol-101", originalText: "She don't know.")

        client.analyze(payload: payload, deviceToken: "ll_dev_test_token_456") { result in
            switch result {
            case .success(let response):
                XCTAssertEqual(response.assessment, "clear_error")
                XCTAssertEqual(response.hasClearError, true)
                XCTAssertEqual(response.recommendedText, "She doesn't know.")
                XCTAssertEqual(response.errors?.count, 1)
                XCTAssertEqual(response.errors?.first?.originalFragment, "don't")
                XCTAssertEqual(response.errors?.first?.replacementFragment, "doesn't")
            case .failure(let error):
                XCTFail("Expected success but received error: \(error)")
            }
            expectation.fulfill()
        }

        waitForExpectations(timeout: 2.0, handler: nil)

        XCTAssertNotNil(capturedRequest)
        XCTAssertEqual(capturedRequest?.httpMethod, "POST")
        XCTAssertEqual(capturedRequest?.value(forHTTPHeaderField: "Authorization"), "Bearer ll_dev_test_token_456")
        XCTAssertEqual(capturedRequest?.value(forHTTPHeaderField: "Content-Type"), "application/json")
        XCTAssertTrue(capturedRequest?.url?.path.contains("/api/writing/analyze") ?? false)
    }

    func testApiClientUrlProtocolAuthCookieAndTokenFlows() {
        let expectation = self.expectation(description: "Auth token/cookie test completion")

        var capturedAuthHeader: String?
        MockURLProtocol.requestHandler = { request in
            capturedAuthHeader = request.value(forHTTPHeaderField: "Authorization")
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Set-Cookie": "lingua_session=test_session_abc123; Path=/; HttpOnly"]
            )!
            let responseJson = "{\"accepted\":true,\"correctedText\":\"Good.\",\"changed\":false}"
            return (response, responseJson.data(using: .utf8))
        }

        let client = ApiClient(baseUrl: "https://145.239.82.124.sslip.io/english", session: session)
        let payload = QueuedWritingPayload(eventId: "evt-cookie-1", originalText: "Good.")

        client.analyze(payload: payload, deviceToken: "ll_dev_cookie_token_789") { result in
            switch result {
            case .success(let response):
                XCTAssertTrue(response.accepted)
            case .failure(let error):
                XCTFail("Expected success, got: \(error)")
            }
            expectation.fulfill()
        }

        waitForExpectations(timeout: 2.0, handler: nil)

        XCTAssertEqual(capturedAuthHeader, "Bearer ll_dev_cookie_token_789")
    }

    func testApiClientUrlProtocolHttpError401Handling() {
        let expectation = self.expectation(description: "HTTP 401 error handling completion")

        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: 401,
                httpVersion: nil,
                headerFields: nil
            )!
            let errJson = "{\"error\":\"Unauthorized\"}"
            return (response, errJson.data(using: .utf8))
        }

        let client = ApiClient(baseUrl: "https://145.239.82.124.sslip.io/english", session: session)
        let payload = QueuedWritingPayload(eventId: "evt-err-401", originalText: "Test.")

        client.analyze(payload: payload, deviceToken: "invalid_token") { result in
            switch result {
            case .success:
                XCTFail("Expected failure for 401 response")
            case .failure(let error as NSError):
                XCTAssertEqual(error.code, 401)
            }
            expectation.fulfill()
        }

        waitForExpectations(timeout: 2.0, handler: nil)
    }
}
