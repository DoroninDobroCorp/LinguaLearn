import XCTest
@testable import LinguaLearnCaptureCore

final class PayloadTests: XCTestCase {
    func testAnalyzePayloadAndAuthorizationHeader() throws {
        let configuration = CaptureConfiguration(
            apiURL: "https://learn.example/english/api/writing/analyze",
            bearerToken: "device-token",
            appURL: "https://learn.example/english",
            ingressToken: "local-token"
        )
        let event = CaptureEvent(
            eventID: "turn-123",
            sourceApp: "codex",
            text: "Yesterday I go home.",
            sentAt: Date(timeIntervalSince1970: 0)
        )
        let request = try AnalysisAPIClient(configuration: configuration).makeURLRequest(for: event)

        XCTAssertEqual(request.url?.absoluteString, configuration.apiURL)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer device-token")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
        XCTAssertEqual(request.timeoutInterval, 60)

        let body = try XCTUnwrap(request.httpBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(json["eventId"] as? String, "turn-123")
        XCTAssertEqual(json["sourceApp"] as? String, "codex")
        XCTAssertEqual(json["text"] as? String, "Yesterday I go home.")
        XCTAssertEqual(json["sentAt"] as? String, "1970-01-01T00:00:00Z")
        XCTAssertEqual(json["previewOnly"] as? Bool, false)

        let previewRequest = try AnalysisAPIClient(configuration: configuration)
            .makeURLRequest(for: event, previewOnly: true)
        let previewBody = try XCTUnwrap(previewRequest.httpBody)
        let previewJSON = try XCTUnwrap(JSONSerialization.jsonObject(with: previewBody) as? [String: Any])
        XCTAssertEqual(previewJSON["previewOnly"] as? Bool, true)
    }

    func testDecodesCurrentBackendResponseAndLegacyTopicChanges() throws {
        let data = Data(#"""
        {
          "accepted": true,
          "originalText": "Yesterday I go home.",
          "correctedText": "Yesterday I went home.",
          "summaryRu": "Используйте Past Simple.",
          "errors": [{
            "original": "go",
            "correction": "went",
            "explanationRu": "Нужна форма прошедшего времени.",
            "topic": "Past Simple",
            "level": "A2"
          }],
          "topicEvidence": [{
            "topic": "Past Simple",
            "level": "A2",
            "outcome": "error",
            "scoreDelta": -2,
            "newScore": 38
          }],
          "topicChanges": [{"topicName": "Irregular verbs", "delta": -2, "score": 31}]
        }
        """#.utf8)

        let response = try PayloadCoding.makeDecoder().decode(WritingAnalyzeResponse.self, from: data)
        XCTAssertTrue(response.accepted)
        XCTAssertEqual(response.summaryRu, "Используйте Past Simple.")
        XCTAssertEqual(response.errors.first?.displayExplanation, "Нужна форма прошедшего времени.")
        XCTAssertEqual(response.topicEvidence.first?.topic, "Past Simple")
        XCTAssertEqual(response.topicEvidence.first?.scoreDelta, -2)
        XCTAssertEqual(response.topicEvidence.first?.newScore, 38)
        XCTAssertEqual(response.topicChanges.first?.displayName, "Irregular verbs")
    }

    func testConfigurationRequiresHTTPSExceptForLoopbackTesting() throws {
        let secure = CaptureConfiguration(
            apiURL: "https://learn.example/english/api/writing/analyze",
            bearerToken: "a-secure-device-token",
            appURL: "https://learn.example/english",
            ingressToken: "0123456789abcdef"
        )
        XCTAssertNoThrow(try secure.validatedAPIURL())
        XCTAssertNoThrow(try secure.validatedAppURL())
        XCTAssertEqual(try secure.validatedIngressToken(), "0123456789abcdef")

        var loopback = secure
        loopback.apiURL = "http://127.0.0.1:8080/analyze"
        loopback.appURL = "http://localhost:8080/english"
        XCTAssertNoThrow(try loopback.validatedAPIURL())
        XCTAssertNoThrow(try loopback.validatedAppURL())

        var cleartextRemote = secure
        cleartextRemote.apiURL = "http://learn.example/analyze"
        cleartextRemote.appURL = "http://learn.example/english"
        XCTAssertThrowsError(try cleartextRemote.validatedAPIURL())
        XCTAssertThrowsError(try cleartextRemote.validatedAppURL())

        var emptyIngress = secure
        emptyIngress.ingressToken = ""
        XCTAssertThrowsError(try emptyIngress.validatedIngressToken())
    }
}
