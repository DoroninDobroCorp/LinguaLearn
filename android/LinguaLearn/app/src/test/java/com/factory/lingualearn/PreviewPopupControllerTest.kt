package com.factory.lingualearn

import com.factory.lingualearn.ime.net.AnalysisError
import com.factory.lingualearn.ime.net.AnalysisResponse
import com.factory.lingualearn.ime.net.MechanicalCorrection
import com.factory.lingualearn.ime.net.OptionalSuggestion
import com.factory.lingualearn.ime.ui.PreviewPopupController
import com.factory.lingualearn.ime.ui.PreviewState
import org.junit.Assert.*
import org.junit.Test

class PreviewPopupControllerTest {

    @Test
    fun testStartCheckingState() {
        val controller = PreviewPopupController()
        val state = controller.startChecking("She don't know the answer.")

        assertEquals(PreviewState.CHECKING, state.state)
        assertEquals("She don't know the answer.", state.originalText)
    }

    @Test
    fun testHandleAnalysisResultClearErrorDetailedCardTier() {
        val controller = PreviewPopupController()
        controller.startChecking("She don't know the answer.")

        val response = AnalysisResponse(
            schemaVersion = 1,
            eventId = "evt-android-001",
            sampleId = 10,
            previewOnly = true,
            accepted = true,
            rejectionReason = null,
            sourceApp = "com.slack",
            originalText = "She don't know the answer.",
            correctedText = "She doesn't know the answer.",
            recommendedText = "She doesn't know the answer.",
            assessment = "clear_error",
            hasClearError = true,
            changed = true,
            summaryRu = "Используйте doesn't для третьего лица.",
            errors = listOf(
                AnalysisError("don't", "doesn't", "Третье лицо", "Subject-verb agreement", 0.95, "grammar", "agreement")
            ),
            topicEvidence = emptyList()
        )

        val state = controller.handleAnalysisResult(response)

        assertEquals(PreviewState.RESULT_READY, state.state)
        assertTrue(state.hasClearError)
        assertEquals("clear_error", state.assessment)
        assertTrue(state.changed)
        assertEquals("She doesn't know the answer.", state.recommendedText)
        assertEquals("She doesn't know the answer.", state.correctedText)
        assertEquals("Используйте doesn't для третьего лица.", state.summaryRu)
        assertEquals(1, state.errors.size)
    }

    @Test
    fun testHandleAnalysisResultMechanicalOnlyCompactChipTier() {
        val controller = PreviewPopupController()
        controller.startChecking("She doesnt know the answer.")

        val response = AnalysisResponse(
            schemaVersion = 1,
            eventId = "evt-android-mech",
            sampleId = 11,
            previewOnly = true,
            accepted = true,
            rejectionReason = null,
            sourceApp = "com.whatsapp",
            originalText = "She doesnt know the answer.",
            correctedText = "She doesn't know the answer.",
            recommendedText = "She doesn't know the answer.",
            assessment = "mechanical_only",
            hasClearError = false,
            changed = true,
            summaryRu = "Добавлен апостроф.",
            errors = emptyList(),
            mechanicalCorrections = listOf(
                MechanicalCorrection("doesnt", "doesn't", "Апостроф")
            ),
            topicEvidence = emptyList()
        )

        val state = controller.handleAnalysisResult(response)

        assertEquals(PreviewState.RESULT_READY, state.state)
        assertFalse(state.hasClearError)
        assertEquals("mechanical_only", state.assessment)
        assertTrue(state.changed)
        assertEquals("She doesn't know the answer.", state.recommendedText)
        assertEquals(1, state.mechanicalCorrections.size)
    }

    @Test
    fun testHandleAnalysisResultAcceptableCompactChipTier() {
        val controller = PreviewPopupController()
        controller.startChecking("I want to eat apples.")

        val response = AnalysisResponse(
            schemaVersion = 1,
            eventId = "evt-android-acc",
            sampleId = 12,
            previewOnly = true,
            accepted = true,
            rejectionReason = null,
            sourceApp = "com.slack",
            originalText = "I want to eat apples.",
            correctedText = "I want to eat apples.",
            recommendedText = "I want to eat apples.",
            assessment = "acceptable",
            hasClearError = false,
            changed = false,
            summaryRu = "Фраза естественна.",
            errors = emptyList(),
            optionalSuggestions = listOf(
                OptionalSuggestion("eat apples", "have some apples", "Стилистический вариант")
            ),
            topicEvidence = emptyList()
        )

        val state = controller.handleAnalysisResult(response)

        assertEquals(PreviewState.RESULT_READY, state.state)
        assertFalse(state.hasClearError)
        assertEquals("acceptable", state.assessment)
        assertFalse(state.changed)
        assertEquals(1, state.optionalSuggestions.size)
    }

    @Test
    fun testHandleErrorState() {
        val controller = PreviewPopupController()
        val state = controller.handleError("Device token not configured")

        assertEquals(PreviewState.ERROR, state.state)
        assertEquals("Device token not configured", state.errorMessage)
    }
}

