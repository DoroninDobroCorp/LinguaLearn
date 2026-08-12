package com.factory.lingualearn

import com.factory.lingualearn.ime.net.AnalysisError
import com.factory.lingualearn.ime.net.AnalysisResponse
import com.factory.lingualearn.ime.net.TopicEvidence
import org.junit.Assert.*
import org.junit.Test

class ApiClientTest {

    @Test
    fun testAnalysisResponseModelSchemaVersion1() {
        val error = AnalysisError(
            original = "don't",
            correction = "doesn't",
            explanationRu = "Используйте doesn't для третьего лица единственного числа.",
            topic = "Past Simple (irregular verbs)",
            confidence = 0.95
        )

        val evidence = TopicEvidence(
            topic = "Past Simple (irregular verbs)",
            outcome = "error",
            confidence = 0.95,
            explanationRu = "Ошибка в форме глагола."
        )

        val response = AnalysisResponse(
            schemaVersion = 1,
            eventId = "evt-test-android-001",
            sampleId = 42,
            previewOnly = false,
            accepted = true,
            rejectionReason = null,
            sourceApp = "com.slack",
            originalText = "She don't know the answer.",
            correctedText = "She doesn't know the answer.",
            changed = true,
            summaryRu = "Ошибка в согласовании подлежащего и глагола.",
            errors = listOf(error),
            topicEvidence = listOf(evidence)
        )

        assertEquals(1, response.schemaVersion)
        assertEquals("evt-test-android-001", response.eventId)
        assertEquals(42, response.sampleId)
        assertTrue(response.accepted)
        assertTrue(response.changed)
        assertEquals("She doesn't know the answer.", response.correctedText)
        assertEquals(1, response.errors.size)
        assertEquals(1, response.topicEvidence.size)
    }
}
