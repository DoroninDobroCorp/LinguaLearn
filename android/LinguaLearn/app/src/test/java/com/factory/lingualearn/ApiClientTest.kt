package com.factory.lingualearn

import com.factory.lingualearn.ime.net.AnalysisError
import com.factory.lingualearn.ime.net.AnalysisResponse
import com.factory.lingualearn.ime.net.ApiClient
import com.factory.lingualearn.ime.net.MechanicalCorrection
import com.factory.lingualearn.ime.net.OptionalSuggestion
import com.factory.lingualearn.ime.net.TopicEvidence
import org.junit.Assert.*
import org.junit.Test

class ApiClientTest {

    @Test
    fun testDefaultHttpsBaseUrl() {
        val client = ApiClient()
        assertEquals("https://145.239.82.124.sslip.io/english", client.baseUrl)
        assertFalse("Default API URL must not be HTTP 127.0.0.1 in prod", client.baseUrl.contains("127.0.0.1"))
    }

    @Test
    fun testAnalysisResponseModelSchemaVersion1() {
        val error = AnalysisError(
            original = "don't",
            correction = "doesn't",
            explanationRu = "Используйте doesn't для третьего лица единственного числа.",
            topic = "Past Simple (irregular verbs)",
            confidence = 0.95,
            kind = "grammar",
            category = "subject_verb_agreement"
        )

        val evidence = TopicEvidence(
            topic = "Past Simple (irregular verbs)",
            outcome = "error",
            confidence = 0.95,
            explanationRu = "Ошибка в форме глагола."
        )

        val mechCorrection = MechanicalCorrection(
            original = "dont",
            correction = "don't",
            explanationRu = "Добавлен апостроф.",
            kind = "mechanical",
            category = "spelling"
        )

        val optSuggestion = OptionalSuggestion(
            original = "know the answer",
            suggestion = "have the answer",
            explanationRu = "Стилистический вариант.",
            kind = "style",
            category = "style"
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
            recommendedText = "She doesn't know the answer.",
            assessment = "clear_error",
            hasClearError = true,
            changed = true,
            summaryRu = "Ошибка в согласовании подлежащего и глагола.",
            errors = listOf(error),
            mechanicalCorrections = listOf(mechCorrection),
            optionalSuggestions = listOf(optSuggestion),
            topicEvidence = listOf(evidence)
        )

        assertEquals(1, response.schemaVersion)
        assertEquals("evt-test-android-001", response.eventId)
        assertEquals(42, response.sampleId)
        assertTrue(response.accepted)
        assertTrue(response.changed)
        assertTrue(response.hasClearError)
        assertEquals("clear_error", response.assessment)
        assertEquals("She doesn't know the answer.", response.recommendedText)
        assertEquals("She doesn't know the answer.", response.correctedText)
        assertEquals(1, response.errors.size)
        assertEquals("grammar", response.errors[0].kind)
        assertEquals("subject_verb_agreement", response.errors[0].category)
        assertEquals(1, response.mechanicalCorrections.size)
        assertEquals("spelling", response.mechanicalCorrections[0].category)
        assertEquals(1, response.optionalSuggestions.size)
        assertEquals("style", response.optionalSuggestions[0].kind)
        assertEquals(1, response.topicEvidence.size)
    }

    @Test
    fun testAnalysisResponseMechanicalOnlyTier() {
        val response = AnalysisResponse(
            schemaVersion = 1,
            eventId = "evt-test-android-mech",
            sampleId = 43,
            previewOnly = false,
            accepted = true,
            rejectionReason = null,
            sourceApp = "com.telegram.messenger",
            originalText = "She doesnt know the answer.",
            correctedText = "She doesn't know the answer.",
            recommendedText = "She doesn't know the answer.",
            assessment = "mechanical_only",
            hasClearError = false,
            changed = true,
            summaryRu = "Исправлен апостроф.",
            errors = emptyList(),
            mechanicalCorrections = listOf(
                MechanicalCorrection(original = "doesnt", correction = "doesn't", explanationRu = "Апостроф")
            ),
            optionalSuggestions = emptyList(),
            topicEvidence = emptyList()
        )

        assertFalse(response.hasClearError)
        assertTrue(response.changed)
        assertEquals("mechanical_only", response.assessment)
        assertEquals("She doesn't know the answer.", response.recommendedText)
        assertEquals(1, response.mechanicalCorrections.size)
    }

    @Test
    fun testAnalysisResponseNoClearError() {
        val response = AnalysisResponse(
            schemaVersion = 1,
            eventId = "evt-test-android-002",
            sampleId = 43,
            previewOnly = false,
            accepted = true,
            rejectionReason = null,
            sourceApp = "com.telegram.messenger",
            originalText = "She does not know the answer.",
            correctedText = "She does not know the answer.",
            recommendedText = "She does not know the answer.",
            assessment = "correct",
            hasClearError = false,
            changed = false,
            summaryRu = null,
            errors = emptyList(),
            topicEvidence = emptyList()
        )

        assertFalse(response.hasClearError)
        assertFalse(response.changed)
        assertEquals("correct", response.assessment)
        assertTrue(response.errors.isEmpty())
    }
}

