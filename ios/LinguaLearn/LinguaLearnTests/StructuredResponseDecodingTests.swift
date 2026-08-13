import XCTest
@testable import LinguaLearnContainerApp

final class StructuredResponseDecodingTests: XCTestCase {
    func testStructuredResponseDecodingFullContract() throws {
        let jsonStr = """
        {
            "schemaVersion": 1,
            "accepted": true,
            "eventId": "evt-ios-structured-100",
            "originalText": "She don't know the answer.",
            "correctedText": "She doesn't know the answer.",
            "changed": true,
            "summaryRu": "Ошибка в согласовании подлежащего и сказуемого.",
            "previewOnly": false,
            "assessment": "clear_error",
            "hasClearError": true,
            "recommendedText": "She doesn't know the answer.",
            "errors": [
                {
                    "kind": "grammar",
                    "category": "subject_verb_agreement",
                    "topic": "present_simple",
                    "original_fragment": "don't",
                    "replacement_fragment": "doesn't",
                    "message": "Subject-verb agreement error",
                    "explanation_ru": "Используйте doesn't для третьего лица единственного числа."
                }
            ],
            "mechanicalCorrections": [
                {
                    "original_fragment": "don't",
                    "replacement_fragment": "doesn't",
                    "explanation_ru": "Замена глагола"
                }
            ],
            "optionalSuggestions": [
                {
                    "suggestion": "She is not aware of the answer.",
                    "explanation_ru": "Более формальный вариант"
                }
            ],
            "topicEvidence": [
                {
                    "topic": "present_simple",
                    "confidence": 0.95,
                    "outcome": "error"
                }
            ]
        }
        """

        let data = jsonStr.data(using: .utf8)!
        let response = try JSONDecoder().decode(AnalysisResponse.self, from: data)

        XCTAssertTrue(response.accepted)
        XCTAssertEqual(response.eventId, "evt-ios-structured-100")
        XCTAssertEqual(response.originalText, "She don't know the answer.")
        XCTAssertEqual(response.correctedText, "She doesn't know the answer.")
        XCTAssertTrue(response.changed)
        XCTAssertEqual(response.summaryRu, "Ошибка в согласовании подлежащего и сказуемого.")
        XCTAssertFalse(response.previewOnly)
        XCTAssertEqual(response.assessment, "clear_error")
        XCTAssertEqual(response.hasClearError, true)
        XCTAssertEqual(response.recommendedText, "She doesn't know the answer.")

        XCTAssertEqual(response.errors?.count, 1)
        let errorItem = response.errors?.first
        XCTAssertEqual(errorItem?.kind, "grammar")
        XCTAssertEqual(errorItem?.category, "subject_verb_agreement")
        XCTAssertEqual(errorItem?.topic, "present_simple")
        XCTAssertEqual(errorItem?.originalFragment, "don't")
        XCTAssertEqual(errorItem?.replacementFragment, "doesn't")
        XCTAssertEqual(errorItem?.explanationRu, "Используйте doesn't для третьего лица единственного числа.")

        XCTAssertEqual(response.mechanicalCorrections?.count, 1)
        XCTAssertEqual(response.mechanicalCorrections?.first?.originalFragment, "don't")

        XCTAssertEqual(response.optionalSuggestions?.count, 1)
        XCTAssertEqual(response.optionalSuggestions?.first?.suggestion, "She is not aware of the answer.")

        XCTAssertEqual(response.topicEvidence?.count, 1)
        XCTAssertEqual(response.topicEvidence?.first?.topic, "present_simple")
        XCTAssertEqual(response.topicEvidence?.first?.confidence, 0.95)
        XCTAssertEqual(response.topicEvidence?.first?.outcome, "error")
    }

    func testMinimalLegacyResponseDecoding() throws {
        let jsonStr = """
        {
            "accepted": true,
            "correctedText": "Hello world.",
            "changed": false
        }
        """

        let data = jsonStr.data(using: .utf8)!
        let response = try JSONDecoder().decode(AnalysisResponse.self, from: data)

        XCTAssertTrue(response.accepted)
        XCTAssertEqual(response.correctedText, "Hello world.")
        XCTAssertFalse(response.changed)
        XCTAssertNil(response.assessment)
        XCTAssertNil(response.hasClearError)
        XCTAssertNil(response.errors)

        let tier = AnalysisTier.resolve(from: response)
        XCTAssertEqual(tier, .correct)
        XCTAssertFalse(tier.isDetailedCard)
    }

    func testFourTierAssessmentResolution() throws {
        let clearErrorResp = AnalysisResponse(
            correctedText: "She doesn't know.",
            assessment: "clear_error",
            hasClearError: true,
            errors: [WritingAnalysisErrorItem(kind: "grammar_error", category: "verb_tense")]
        )
        let tier1 = AnalysisTier.resolve(from: clearErrorResp)
        XCTAssertEqual(tier1, .clearError)
        XCTAssertTrue(tier1.isDetailedCard)

        let mechanicalResp = AnalysisResponse(
            correctedText: "Hello world.",
            assessment: "mechanical_only",
            hasClearError: false,
            mechanicalCorrections: [MechanicalCorrectionItem(explanationRu: "Typo fix")]
        )
        let tier2 = AnalysisTier.resolve(from: mechanicalResp)
        XCTAssertEqual(tier2, .mechanicalOnly)
        XCTAssertFalse(tier2.isDetailedCard)

        let acceptableResp = AnalysisResponse(
            correctedText: "Hello there.",
            assessment: "acceptable",
            hasClearError: false,
            optionalSuggestions: [OptionalSuggestionItem(suggestion: "Greetings.")]
        )
        let tier3 = AnalysisTier.resolve(from: acceptableResp)
        XCTAssertEqual(tier3, .acceptable)
        XCTAssertFalse(tier3.isDetailedCard)

        let correctResp = AnalysisResponse(
            correctedText: "Hello.",
            assessment: "correct",
            hasClearError: false
        )
        let tier4 = AnalysisTier.resolve(from: correctResp)
        XCTAssertEqual(tier4, .correct)
        XCTAssertFalse(tier4.isDetailedCard)
    }
}
