import XCTest
@testable import LinguaLearnCaptureCore

final class CorrectionPopupViewModelTests: XCTestCase {
    func testAutomaticCaptureClearErrorShowsLargeCardAndFormatsErrors() {
        let event = CaptureEvent(eventID: "ev-1", sourceApp: "Notes", text: "Yesterday I go to market.")
        let response = WritingAnalyzeResponse(
            schemaVersion: 1,
            eventId: "ev-1",
            accepted: true,
            originalText: "Yesterday I go to market.",
            correctedText: "Yesterday I went to market.",
            recommendedText: "Yesterday I went to the market.",
            assessment: "clear_error",
            hasClearError: true,
            errors: [
                WritingError(
                    original: "go",
                    correction: "went",
                    explanationRu: "Используйте Past Simple.",
                    topic: "Past Simple",
                    kind: "grammar_error",
                    category: "verb_tense"
                )
            ]
        )

        let viewModel = CorrectionPopupViewModel(event: event, response: response, isPreviewHotkey: false)

        XCTAssertEqual(viewModel.displayMode, .largeCard)
        XCTAssertEqual(viewModel.autoDismissSeconds, 6.0)
        XCTAssertTrue(viewModel.isClearError)
        XCTAssertFalse(viewModel.isPreviewHotkey)
        XCTAssertEqual(viewModel.bestTextToUse, "Yesterday I went to the market.")
        XCTAssertEqual(viewModel.headerTitle, "Better version")
        XCTAssertEqual(viewModel.grammarErrors.count, 1)
        XCTAssertEqual(viewModel.grammarErrors.first?.displayText, "go → went: Используйте Past Simple.")
    }

    func testAutomaticCaptureNonClearErrorShowsCompactChipWith1_8sTimer() {
        let event = CaptureEvent(eventID: "ev-2", sourceApp: "Slack", text: "i am writing English text.")
        let response = WritingAnalyzeResponse(
            schemaVersion: 1,
            eventId: "ev-2",
            accepted: true,
            originalText: "i am writing English text.",
            correctedText: "I am writing English text.",
            recommendedText: "I am writing English text.",
            assessment: "mechanical_only",
            hasClearError: false,
            mechanicalCorrections: [
                WritingError(original: "i", correction: "I", explanationRu: "Пишите I с заглавной буквы.", kind: "mechanical", category: "capitalization")
            ]
        )

        let viewModel = CorrectionPopupViewModel(event: event, response: response, isPreviewHotkey: false)

        XCTAssertEqual(viewModel.displayMode, .compactChip)
        XCTAssertEqual(viewModel.autoDismissSeconds, 1.8)
        XCTAssertFalse(viewModel.isClearError)
        XCTAssertEqual(viewModel.bestTextToUse, "I am writing English text.")
    }

    func testManualPreviewHotkeyShowsLargeCardForAnyTier() {
        let event = CaptureEvent(eventID: "preview-1", sourceApp: "TextEdit", text: "This sentence is fine.")
        let response = WritingAnalyzeResponse(
            schemaVersion: 1,
            eventId: "preview-1",
            accepted: true,
            originalText: "This sentence is fine.",
            correctedText: "This sentence is fine.",
            recommendedText: "This sentence is fine.",
            assessment: "correct",
            hasClearError: false
        )

        let viewModel = CorrectionPopupViewModel(event: event, response: response, isPreviewHotkey: true)

        XCTAssertEqual(viewModel.displayMode, .largeCard)
        XCTAssertEqual(viewModel.autoDismissSeconds, 6.0)
        XCTAssertTrue(viewModel.isPreviewHotkey)
        XCTAssertEqual(viewModel.headerTitle, "Correct ✓")
    }

    func testUsesRecommendedTextOverCorrectedTextForCopyAndReplace() {
        let event = CaptureEvent(eventID: "ev-3", sourceApp: "Mail", text: "Please send me email.")
        let response = WritingAnalyzeResponse(
            schemaVersion: 1,
            eventId: "ev-3",
            accepted: true,
            originalText: "Please send me email.",
            correctedText: "Please send me an email.",
            recommendedText: "Please send me an email when you have a moment.",
            assessment: "clear_error",
            hasClearError: true
        )

        let viewModel = CorrectionPopupViewModel(event: event, response: response, isPreviewHotkey: false)

        XCTAssertEqual(viewModel.recommendedText, "Please send me an email when you have a moment.")
        XCTAssertEqual(viewModel.bestTextToUse, "Please send me an email when you have a moment.")
    }

    func testRendersSeparateGrammarMechanicalAndOptionalSections() {
        let event = CaptureEvent(eventID: "ev-4", sourceApp: "Safari", text: "yesterday i go home and call my friend")
        let response = WritingAnalyzeResponse(
            schemaVersion: 1,
            eventId: "ev-4",
            accepted: true,
            originalText: "yesterday i go home and call my friend",
            correctedText: "Yesterday I went home and called my friend.",
            recommendedText: "Yesterday I went home and called my friend.",
            assessment: "clear_error",
            hasClearError: true,
            errors: [
                WritingError(original: "go", correction: "went", explanationRu: "Прошедшее время.", kind: "grammar_error")
            ],
            mechanicalCorrections: [
                WritingError(original: "yesterday i", correction: "Yesterday I", explanationRu: "Заглавные буквы.", kind: "mechanical")
            ],
            optionalSuggestions: [
                WritingError(original: "call", correction: "rang", explanationRu: "Более естественный вариант.", kind: "style")
            ]
        )

        let viewModel = CorrectionPopupViewModel(event: event, response: response, isPreviewHotkey: false)

        XCTAssertEqual(viewModel.grammarErrors.count, 1)
        XCTAssertEqual(viewModel.grammarErrors.first?.original, "go")
        XCTAssertEqual(viewModel.mechanicalCorrections.count, 1)
        XCTAssertEqual(viewModel.mechanicalCorrections.first?.original, "yesterday i")
        XCTAssertEqual(viewModel.optionalSuggestions.count, 1)
        XCTAssertEqual(viewModel.optionalSuggestions.first?.original, "call")
    }
}
