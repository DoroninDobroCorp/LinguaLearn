import XCTest
@testable import LinguaLearnCaptureCore

final class PopupPolicyTests: XCTestCase {
    func testAssessmentTierDecodingAndInvariants() throws {
        let clearErrorJSON = Data(#"""
        {
          "accepted": true,
          "assessment": "clear_error",
          "originalText": "I goes to school",
          "correctedText": "I go to school",
          "errors": [{
            "original": "goes",
            "correction": "go",
            "explanationRu": "Используйте go для первого лица.",
            "topic": "Present Simple"
          }]
        }
        """#.utf8)
        let clearErrorResp = try PayloadCoding.makeDecoder().decode(WritingAnalyzeResponse.self, from: clearErrorJSON)
        XCTAssertEqual(clearErrorResp.assessment, "clear_error")
        XCTAssertEqual(clearErrorResp.effectiveAssessmentTier, .clearError)
        XCTAssertTrue(clearErrorResp.isClearError)

        let mechanicalJSON = Data(#"""
        {
          "accepted": true,
          "assessment": "mechanical_only",
          "originalText": "i go to school.",
          "correctedText": "I go to school.",
          "errors": []
        }
        """#.utf8)
        let mechanicalResp = try PayloadCoding.makeDecoder().decode(WritingAnalyzeResponse.self, from: mechanicalJSON)
        XCTAssertEqual(mechanicalResp.assessment, "mechanical_only")
        XCTAssertEqual(mechanicalResp.effectiveAssessmentTier, .mechanicalOnly)
        XCTAssertFalse(mechanicalResp.isClearError)

        let acceptableJSON = Data(#"""
        {
          "accepted": true,
          "assessment": "acceptable",
          "originalText": "I am going to school now",
          "correctedText": "I am going to school now.",
          "errors": []
        }
        """#.utf8)
        let acceptableResp = try PayloadCoding.makeDecoder().decode(WritingAnalyzeResponse.self, from: acceptableJSON)
        XCTAssertEqual(acceptableResp.assessment, "acceptable")
        XCTAssertEqual(acceptableResp.effectiveAssessmentTier, .acceptable)
        XCTAssertFalse(acceptableResp.isClearError)

        let correctJSON = Data(#"""
        {
          "accepted": true,
          "assessment": "correct",
          "originalText": "I go to school.",
          "correctedText": "I go to school.",
          "errors": []
        }
        """#.utf8)
        let correctResp = try PayloadCoding.makeDecoder().decode(WritingAnalyzeResponse.self, from: correctJSON)
        XCTAssertEqual(correctResp.assessment, "correct")
        XCTAssertEqual(correctResp.effectiveAssessmentTier, .correct)
        XCTAssertFalse(correctResp.isClearError)
    }

    func testAutomaticPopupPolicySelectsCompactChipVsLargeCard() {
        let clearErrorResp = WritingAnalyzeResponse(
            accepted: true,
            originalText: "I goes to school",
            correctedText: "I go to school",
            errors: [WritingError(original: "goes", correction: "go", topic: "Present Simple")],
            assessment: "clear_error"
        )
        let mechanicalResp = WritingAnalyzeResponse(
            accepted: true,
            originalText: "i go to school",
            correctedText: "I go to school",
            errors: [],
            assessment: "mechanical_only"
        )
        let acceptableResp = WritingAnalyzeResponse(
            accepted: true,
            originalText: "I am going to school",
            correctedText: "I am going to school.",
            errors: [],
            assessment: "acceptable"
        )
        let correctResp = WritingAnalyzeResponse(
            accepted: true,
            originalText: "I go to school.",
            correctedText: "I go to school.",
            errors: [],
            assessment: "correct"
        )

        // Automatic Send trigger (isPreview: false)
        XCTAssertEqual(PopupPresentationPolicy.displayMode(for: clearErrorResp, isPreview: false), .largeCard)
        XCTAssertEqual(PopupPresentationPolicy.displayMode(for: mechanicalResp, isPreview: false), .compactChip)
        XCTAssertEqual(PopupPresentationPolicy.displayMode(for: acceptableResp, isPreview: false), .compactChip)
        XCTAssertEqual(PopupPresentationPolicy.displayMode(for: correctResp, isPreview: false), .compactChip)

        // Manual preview hotkey mode (isPreview: true) retains full UI for all tiers
        XCTAssertEqual(PopupPresentationPolicy.displayMode(for: clearErrorResp, isPreview: true), .largeCard)
        XCTAssertEqual(PopupPresentationPolicy.displayMode(for: mechanicalResp, isPreview: true), .largeCard)
        XCTAssertEqual(PopupPresentationPolicy.displayMode(for: acceptableResp, isPreview: true), .largeCard)
        XCTAssertEqual(PopupPresentationPolicy.displayMode(for: correctResp, isPreview: true), .largeCard)
    }

    func testLegacyResponseFallbackWithoutAssessmentField() {
        // Fallback when errors exist
        let legacyErrorResp = WritingAnalyzeResponse(
            accepted: true,
            originalText: "I goes to school",
            correctedText: "I go to school",
            errors: [WritingError(original: "goes", correction: "go", topic: "Present Simple")],
            assessment: nil
        )
        XCTAssertEqual(legacyErrorResp.effectiveAssessmentTier, .clearError)
        XCTAssertTrue(legacyErrorResp.isClearError)
        XCTAssertEqual(PopupPresentationPolicy.displayMode(for: legacyErrorResp, isPreview: false), .largeCard)

        // Fallback when no errors exist
        let legacyCorrectResp = WritingAnalyzeResponse(
            accepted: true,
            originalText: "I go to school.",
            correctedText: "I go to school.",
            errors: [],
            assessment: nil
        )
        XCTAssertEqual(legacyCorrectResp.effectiveAssessmentTier, .correct)
        XCTAssertFalse(legacyCorrectResp.isClearError)
        XCTAssertEqual(PopupPresentationPolicy.displayMode(for: legacyCorrectResp, isPreview: false), .compactChip)
    }
}
