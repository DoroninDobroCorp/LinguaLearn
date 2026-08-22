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
        XCTAssertEqual(json["schemaVersion"] as? Int, 1)
        XCTAssertEqual(json["eventId"] as? String, "turn-123")
        XCTAssertEqual(json["sourceApp"] as? String, "codex")
        XCTAssertEqual(json["originalText"] as? String, "Yesterday I go home.")
        XCTAssertEqual(json["text"] as? String, "Yesterday I go home.")
        XCTAssertEqual(json["sentAt"] as? String, "1970-01-01T00:00:00Z")
        XCTAssertEqual(json["previewOnly"] as? Bool, false)

        let previewRequest = try AnalysisAPIClient(configuration: configuration)
            .makeURLRequest(for: event, previewOnly: true)
        let previewBody = try XCTUnwrap(previewRequest.httpBody)
        let previewJSON = try XCTUnwrap(JSONSerialization.jsonObject(with: previewBody) as? [String: Any])
        XCTAssertEqual(previewJSON["previewOnly"] as? Bool, true)
    }

    func testOpenAIVibeProxyPayloadAndRequest() throws {
        let configuration = CaptureConfiguration(
            apiURL: "http://127.0.0.1:8318/v1/chat/completions",
            model: "gemini-3.7-flash-high",
            bearerToken: "",
            appURL: "http://127.0.0.1:8318",
            ingressToken: "0123456789abcdef"
        )
        let event = CaptureEvent(
            eventID: "turn-456",
            sourceApp: "telegram",
            text: "She do not knows the answer.",
            sentAt: Date(timeIntervalSince1970: 100)
        )
        let client = AnalysisAPIClient(configuration: configuration)
        let request = try client.makeURLRequest(for: event)

        XCTAssertEqual(request.url?.absoluteString, "http://127.0.0.1:8318/v1/chat/completions")
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization")) // Loopback without token has no auth header

        let body = try XCTUnwrap(request.httpBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(json["model"] as? String, "gemini-3.7-flash-high")
        let messages = try XCTUnwrap(json["messages"] as? [[String: Any]])
        XCTAssertEqual(messages.count, 2)
        XCTAssertEqual(messages[0]["role"] as? String, "system")
        XCTAssertTrue((messages[0]["content"] as? String)?.contains("conservative English error detector") == true)
        XCTAssertEqual(messages[1]["role"] as? String, "user")
        XCTAssertTrue((messages[1]["content"] as? String)?.contains("She do not knows the answer.") == true)

        let respFormat = try XCTUnwrap(json["response_format"] as? [String: Any])
        XCTAssertEqual(respFormat["type"] as? String, "json_object")
    }

    func testOpenAIVibeProxyResponseParsingWithMarkdownFences() throws {
        let openAIResponseJSON = """
        {
          "id": "chatcmpl-test-123",
          "object": "chat.completion",
          "created": 1770000000,
          "model": "gemini-3.7-flash-high",
          "choices": [
            {
              "index": 0,
              "message": {
                "role": "assistant",
                "content": "```json\\n{\\n  \\"isEnglish\\": true,\\n  \\"assessment\\": \\"clear_error\\",\\n  \\"correctedText\\": \\"She does not know the answer.\\",\\n  \\"recommendedText\\": \\"She does not know the answer.\\",\\n  \\"summaryRu\\": \\"Используйте 'does not know'.\\",\\n  \\"errors\\": [\\n    {\\n      \\"original\\": \\"do not knows\\",\\n      \\"correction\\": \\"does not know\\",\\n      \\"explanationRu\\": \\"В Present Simple с 'she' используется вспомогательный глагол does и смысловой инфинитив без окончания -s.\\",\\n      \\"kind\\": \\"grammar_error\\",\\n      \\"category\\": \\"subject_verb_agreement\\"\\n    }\\n  ],\\n  \\"topicEvidence\\": [\\n    {\\n      \\"topic\\": \\"Present Simple\\",\\n      \\"outcome\\": \\"error\\",\\n      \\"confidence\\": 0.95\\n    }\\n  ]\\n}\\n```"
              },
              "finish_reason": "stop"
            }
          ]
        }
        """

        let config = CaptureConfiguration.template
        _ = AnalysisAPIClient(configuration: config)

        let extracted = AnalysisAPIClient.extractJSONData(from: "```json\n{\"isEnglish\": true}\n```")
        XCTAssertNotNil(extracted)

        let event = CaptureEvent(eventID: "evt-fence", sourceApp: "codex", text: "She do not knows the answer.")
        let data = Data(openAIResponseJSON.utf8)

        // Verify decoding ModelAnalysisResult
        let openAI = try PayloadCoding.makeDecoder().decode(OpenAIChatCompletionsResponse.self, from: data)
        let content = try XCTUnwrap(openAI.choices?.first?.message?.content)
        let jsonBytes = try XCTUnwrap(AnalysisAPIClient.extractJSONData(from: content))
        let modelResult = try PayloadCoding.makeDecoder().decode(ModelAnalysisResult.self, from: jsonBytes)

        XCTAssertEqual(modelResult.isEnglish, true)
        XCTAssertEqual(modelResult.assessment, "clear_error")
        XCTAssertEqual(modelResult.correctedText, "She does not know the answer.")
        XCTAssertEqual(modelResult.errors?.count, 1)
        XCTAssertEqual(modelResult.errors?.first?.original, "do not knows")
        XCTAssertEqual(modelResult.errors?.first?.correction, "does not know")
        XCTAssertEqual(modelResult.topicEvidence?.first?.topic, "Present Simple")

        let fullResponse = modelResult.toWritingAnalyzeResponse(for: event, previewOnly: false)
        XCTAssertTrue(fullResponse.accepted)
        XCTAssertTrue(fullResponse.isClearError)
        XCTAssertEqual(fullResponse.correctedText, "She does not know the answer.")
    }

    func testOpenAIVibeProxyResponseParsingRawJSON() throws {
        let openAIResponseJSON = """
        {
          "id": "chatcmpl-test-raw",
          "object": "chat.completion",
          "created": 1770000000,
          "model": "gemini-3.7-flash-high",
          "choices": [
            {
              "index": 0,
              "message": {
                "role": "assistant",
                "content": "{\\"isEnglish\\": true, \\"assessment\\": \\"correct\\", \\"correctedText\\": \\"I went to school today.\\", \\"summaryRu\\": \\"Все верно.\\", \\"errors\\": [], \\"topicEvidence\\": [{\\"topic\\": \\"Past Simple\\", \\"outcome\\": \\"success\\", \\"confidence\\": 0.95}]}"
              },
              "finish_reason": "stop"
            }
          ]
        }
        """

        let event = CaptureEvent(eventID: "evt-raw", sourceApp: "codex", text: "I went to school today.")
        let data = Data(openAIResponseJSON.utf8)

        let openAI = try PayloadCoding.makeDecoder().decode(OpenAIChatCompletionsResponse.self, from: data)
        let content = try XCTUnwrap(openAI.choices?.first?.message?.content)
        let jsonBytes = try XCTUnwrap(AnalysisAPIClient.extractJSONData(from: content))
        let modelResult = try PayloadCoding.makeDecoder().decode(ModelAnalysisResult.self, from: jsonBytes)

        XCTAssertEqual(modelResult.assessment, "correct")
        XCTAssertEqual(modelResult.errors?.isEmpty, true)
        let resp = modelResult.toWritingAnalyzeResponse(for: event, previewOnly: false)
        XCTAssertFalse(resp.isClearError)
        XCTAssertTrue(resp.accepted)
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

        // Loopback VibeProxy configuration allows empty bearerToken
        var loopback = secure
        loopback.apiURL = "http://127.0.0.1:8318/v1/chat/completions"
        loopback.appURL = "http://127.0.0.1:8318"
        loopback.bearerToken = ""
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

    func testDecodesStructuredContractAndAssessmentFields() throws {
        let json = Data(#"""
        {
          "accepted": true,
          "assessment": "clear_error",
          "hasClearError": true,
          "originalText": "Yesterday I go to market.",
          "correctedText": "Yesterday I went to the market.",
          "recommendedText": "Yesterday I went to the market.",
          "changed": true,
          "errors": [
            {
              "original": "go",
              "correction": "went",
              "explanationRu": "Используйте Past Simple.",
              "topic": "Past Simple",
              "level": "A2",
              "kind": "grammar_error",
              "category": "verb_tense"
            }
          ],
          "mechanicalCorrections": [
            {
              "original": "market",
              "correction": "the market",
              "kind": "mechanical",
              "category": "article"
            }
          ],
          "optionalSuggestions": [
            {
              "original": "market",
              "correction": "supermarket",
              "kind": "style",
              "category": "vocabulary"
            }
          ]
        }
        """#.utf8)

        let response = try PayloadCoding.makeDecoder().decode(WritingAnalyzeResponse.self, from: json)
        XCTAssertTrue(response.accepted)
        XCTAssertEqual(response.assessment, "clear_error")
        XCTAssertEqual(response.hasClearError, true)
        XCTAssertTrue(response.isClearError)
        XCTAssertEqual(response.recommendedText, "Yesterday I went to the market.")
        XCTAssertEqual(response.errors.first?.kind, "grammar_error")
        XCTAssertEqual(response.errors.first?.category, "verb_tense")
        XCTAssertEqual(response.mechanicalCorrections.first?.kind, "mechanical")
        XCTAssertEqual(response.mechanicalCorrections.first?.category, "article")
        XCTAssertEqual(response.optionalSuggestions.first?.kind, "style")
        XCTAssertEqual(response.optionalSuggestions.first?.category, "vocabulary")
    }

    func testLiveVibeProxyIfAvailable() throws {
        let configuration = CaptureConfiguration.template
        let client = AnalysisAPIClient(configuration: configuration)

        let exp = expectation(description: "VibeProxy health check")
        client.testConnection { result in
            switch result {
            case .success(let health):
                XCTAssertEqual(health.status, "healthy")
                print("Live VibeProxy is available: status=\(health.status ?? ""), version=\(health.appVersion ?? "")")
            case .failure(let error):
                print("Live VibeProxy not reachable in test (skipping): \(error)")
            }
            exp.fulfill()
        }
        wait(for: [exp], timeout: 3)
    }

    func testLiveVibeProxyAnalyzeSentenceIfAvailable() throws {
        let configuration = CaptureConfiguration.template
        let client = AnalysisAPIClient(configuration: configuration)

        let exp = expectation(description: "VibeProxy analyze check")
        let event = CaptureEvent(eventID: "test-live-1", sourceApp: "test", text: "She do not knows the answer.")
        client.analyze(event: event) { result in
            switch result {
            case .success(let response):
                XCTAssertTrue(response.accepted)
                XCTAssertTrue(response.isClearError)
                XCTAssertEqual(response.correctedText, "She does not know the answer.")
                print("Live VibeProxy analyze passed: corrected=\(response.correctedText ?? ""), errors=\(response.errors.count)")
            case .failure(let error):
                print("Live VibeProxy analyze error (skipping if down): \(error)")
            }
            exp.fulfill()
        }
        wait(for: [exp], timeout: 10)
    }

    func testPopupPolicyEnforcesCompactChipAndLargeCardRules() throws {
        let clearErrorResp = WritingAnalyzeResponse(
            assessment: "clear_error",
            hasClearError: true,
            errors: [WritingError(original: "go", correction: "went")]
        )
        let mechanicalOnlyResp = WritingAnalyzeResponse(
            assessment: "mechanical_only",
            hasClearError: false,
            mechanicalCorrections: [WritingError(original: "i", correction: "I")]
        )
        let acceptableResp = WritingAnalyzeResponse(
            assessment: "acceptable",
            hasClearError: false
        )
        let correctResp = WritingAnalyzeResponse(
            assessment: "correct",
            hasClearError: false
        )

        // Automatic capture policy checks
        XCTAssertEqual(PopupPolicy.displayMode(for: clearErrorResp, isPreviewHotkey: false), .largeCard)
        XCTAssertEqual(PopupPolicy.displayMode(for: mechanicalOnlyResp, isPreviewHotkey: false), .compactChip)
        XCTAssertEqual(PopupPolicy.displayMode(for: acceptableResp, isPreviewHotkey: false), .compactChip)
        XCTAssertEqual(PopupPolicy.displayMode(for: correctResp, isPreviewHotkey: false), .compactChip)

        // Manual preview hotkey (Control+Option+G) policy checks - ALWAYS largeCard
        XCTAssertEqual(PopupPolicy.displayMode(for: clearErrorResp, isPreviewHotkey: true), .largeCard)
        XCTAssertEqual(PopupPolicy.displayMode(for: mechanicalOnlyResp, isPreviewHotkey: true), .largeCard)
        XCTAssertEqual(PopupPolicy.displayMode(for: acceptableResp, isPreviewHotkey: true), .largeCard)
        XCTAssertEqual(PopupPolicy.displayMode(for: correctResp, isPreviewHotkey: true), .largeCard)
    }
}
