package com.factory.lingualearn

import com.factory.lingualearn.ime.filter.CandidateFilter
import com.factory.lingualearn.ime.replacement.AutoReplaceEngine
import org.junit.Assert.*
import org.junit.Test

class LinguaLearnIMEKeyboardServiceTest {

    @Test
    fun testKeyboardCandidateFilterAcceptedText() {
        val validText = "She does not agree with this proposal."
        val filterRes = CandidateFilter.filterCandidate(validText)

        assertTrue("Valid prose sentence must be accepted for analysis on Send", filterRes.accepted)
    }

    @Test
    fun testKeyboardSendTriggerRejectsInvalidProse() {
        val invalidText = "System.out.println(\"Hello\");"
        val filterRes = CandidateFilter.filterCandidate(invalidText)

        assertFalse("Code snippets must be rejected before triggering API", filterRes.accepted)
        assertEquals("code_or_command", filterRes.reason)
    }

    @Test
    fun testAutoReplaceEngineCanReplaceDraft() {
        val engine = AutoReplaceEngine()
        val originalText = "She don't know the answer."
        val correctedText = "She doesn't know the answer."

        val canReplaceNull = engine.canReplaceDraft(null, originalText)
        assertFalse("Cannot replace draft when inputConnection is null", canReplaceNull)
        val replaceResNull = engine.replaceDraft(null, originalText, correctedText)
        assertFalse(replaceResNull.success)
        assertEquals("no_input_connection", replaceResNull.reason)
    }
}
