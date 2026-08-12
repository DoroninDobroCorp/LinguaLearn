package com.factory.lingualearn.ime.replacement

import android.view.inputmethod.InputConnection

data class ReplaceResult(
    val success: Boolean,
    val reason: String?
)

class AutoReplaceEngine {

    fun canReplaceDraft(
        inputConnection: InputConnection?,
        originalText: String
    ): Boolean {
        if (inputConnection == null) return false
        val textBeforeCursor = inputConnection.getTextBeforeCursor(originalText.length + 20, 0)?.toString() ?: ""
        return textBeforeCursor.trimEnd().endsWith(originalText.trimEnd())
    }

    fun replaceDraft(
        inputConnection: InputConnection?,
        originalText: String,
        correctedText: String
    ): ReplaceResult {
        if (inputConnection == null) {
            return ReplaceResult(false, "no_input_connection")
        }
        if (!canReplaceDraft(inputConnection, originalText)) {
            return ReplaceResult(false, "stale_draft_mismatch")
        }

        // Delete original text before cursor and commit corrected text
        inputConnection.deleteSurroundingText(originalText.length, 0)
        inputConnection.commitText(correctedText, 1)

        return ReplaceResult(true, null)
    }
}
