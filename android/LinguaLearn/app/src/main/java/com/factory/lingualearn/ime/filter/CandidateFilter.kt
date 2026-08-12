package com.factory.lingualearn.ime.filter

import android.view.inputmethod.EditorInfo

data class FilterResult(
    val accepted: Boolean,
    val reason: String?
)

object CandidateFilter {

    private val SENSITIVE_INPUT_TYPES = setOf(
        EditorInfo.TYPE_TEXT_VARIATION_PASSWORD,
        EditorInfo.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD,
        EditorInfo.TYPE_TEXT_VARIATION_WEB_PASSWORD,
        EditorInfo.TYPE_NUMBER_VARIATION_PASSWORD
    )

    private val CODE_PATTERNS = listOf(
        Regex("""^\s*(const|let|var|function|def|class|import|return|public|private)\s+"""),
        Regex("""[\{\}\[\];<>]"""),
        Regex("""^\s*#include""")
    )

    private val URL_OR_EMAIL_REGEX = Regex("""(https?://\S+|www\.\S+|\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b)""")
    private val CYRILLIC_REGEX = Regex("""[\u0400-\u04FF]""")
    private val SENTENCE_TERMINATORS = setOf('.', '!', '?')

    fun isSensitiveField(editorInfo: EditorInfo?): Boolean {
        if (editorInfo == null) return false
        val inputType = editorInfo.inputType
        val variation = inputType and EditorInfo.TYPE_MASK_VARIATION
        val classType = inputType and EditorInfo.TYPE_MASK_CLASS

        if (classType == EditorInfo.TYPE_CLASS_TEXT && SENSITIVE_INPUT_TYPES.contains(variation)) {
            return true
        }
        if (classType == EditorInfo.TYPE_CLASS_NUMBER && variation == EditorInfo.TYPE_NUMBER_VARIATION_PASSWORD) {
            return true
        }

        val hintText = (editorInfo.hintText ?: "").toString().lowercase()
        val fieldName = (editorInfo.fieldName ?: "").toString().lowercase()
        val packageName = (editorInfo.packageName ?: "").toString().lowercase()

        val sensitiveKeywords = listOf("password", "passcode", "pin", "credit_card", "cvv", "secret", "one-time")
        for (kw in sensitiveKeywords) {
            if (hintText.contains(kw) || fieldName.contains(kw) || packageName.contains(kw)) {
                return true
            }
        }
        return false
    }

    fun containsCyrillic(text: String): Boolean {
        return CYRILLIC_REGEX.containsMatchIn(text)
    }

    fun isCodeOrCommand(text: String): Boolean {
        return CODE_PATTERNS.any { it.containsMatchIn(text) }
    }

    fun isUrlOrEmail(text: String): Boolean {
        return URL_OR_EMAIL_REGEX.containsMatchIn(text)
    }

    fun hasSentenceTerminator(text: String): Boolean {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return false
        val lastChar = trimmed.last()
        return SENTENCE_TERMINATORS.contains(lastChar)
    }

    fun filterCandidate(text: String, editorInfo: EditorInfo? = null): FilterResult {
        if (isSensitiveField(editorInfo)) {
            return FilterResult(false, "secure_password_field")
        }
        val trimmed = text.trim()
        if (trimmed.length < 5) {
            return FilterResult(false, "too_short")
        }
        if (containsCyrillic(trimmed)) {
            return FilterResult(false, "contains_cyrillic")
        }
        if (isCodeOrCommand(trimmed)) {
            return FilterResult(false, "code_or_command")
        }
        if (isUrlOrEmail(trimmed)) {
            return FilterResult(false, "url_or_email")
        }
        if (!hasSentenceTerminator(trimmed)) {
            return FilterResult(false, "no_sentence_terminator")
        }

        return FilterResult(true, null)
    }
}
