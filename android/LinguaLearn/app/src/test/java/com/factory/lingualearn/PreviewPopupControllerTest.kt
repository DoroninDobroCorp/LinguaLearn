package com.factory.lingualearn

import com.factory.lingualearn.ime.net.AnalysisResponse
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
    fun testHandleAnalysisResultWithCorrection() {
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
            changed = true,
            summaryRu = "Используйте doesn't для третьего лица.",
            errors = emptyList(),
            topicEvidence = emptyList()
        )

        val state = controller.handleAnalysisResult(response)

        assertEquals(PreviewState.RESULT_READY, state.state)
        assertTrue(state.changed)
        assertEquals("She doesn't know the answer.", state.correctedText)
        assertEquals("Используйте doesn't для третьего лица.", state.summaryRu)
    }

    @Test
    fun testHandleErrorState() {
        val controller = PreviewPopupController()
        val state = controller.handleError("Device token not configured")

        assertEquals(PreviewState.ERROR, state.state)
        assertEquals("Device token not configured", state.errorMessage)
    }
}
