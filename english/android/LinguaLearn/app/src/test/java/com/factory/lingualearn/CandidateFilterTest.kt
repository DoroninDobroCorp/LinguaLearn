package com.factory.lingualearn

import android.view.inputmethod.EditorInfo
import com.factory.lingualearn.ime.filter.CandidateFilter
import org.junit.Assert.*
import org.junit.Test

class CandidateFilterTest {

    @Test
    fun testValidProseSentenceAccepted() {
        val input = "She does not understand this complex grammar rule."
        val result = CandidateFilter.filterCandidate(input)
        assertTrue("Valid English prose sentence must be accepted", result.accepted)
        assertNull(result.reason)
    }

    @Test
    fun testCyrillicRejected() {
        val input = "Привет, как твои дела сегодня?"
        val result = CandidateFilter.filterCandidate(input)
        assertFalse("Cyrillic input must be rejected", result.accepted)
        assertEquals("contains_cyrillic", result.reason)
    }

    @Test
    fun testCodeSnippetRejected() {
        val input = "const x = () => { return 42; };"
        val result = CandidateFilter.filterCandidate(input)
        assertFalse("Code snippets must be rejected", result.accepted)
        assertEquals("code_or_command", result.reason)
    }

    @Test
    fun testUrlAndEmailRejected() {
        val urlInput = "Check this out at https://example.com/login now."
        val urlRes = CandidateFilter.filterCandidate(urlInput)
        assertFalse("URLs must be rejected", urlRes.accepted)
        assertEquals("url_or_email", urlRes.reason)

        val emailInput = "Send your feedback to test.user@company.org please."
        val emailRes = CandidateFilter.filterCandidate(emailInput)
        assertFalse("Emails must be rejected", emailRes.accepted)
        assertEquals("url_or_email", emailRes.reason)
    }

    @Test
    fun testSentenceTerminatorRequired() {
        val noTerminator = "I am typing a draft message without punctuation"
        val result = CandidateFilter.filterCandidate(noTerminator)
        assertFalse("Sentences without terminators must be rejected", result.accepted)
        assertEquals("no_sentence_terminator", result.reason)
    }

    @Test
    fun testSensitiveFieldDetection() {
        val editorInfo = EditorInfo().apply {
            inputType = EditorInfo.TYPE_CLASS_TEXT or EditorInfo.TYPE_TEXT_VARIATION_PASSWORD
        }
        val isSensitive = CandidateFilter.isSensitiveField(editorInfo)
        assertTrue("Password inputType must be detected as sensitive field", isSensitive)
    }
}
