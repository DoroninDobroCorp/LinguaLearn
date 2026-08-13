package com.factory.lingualearn.ime.ui

import com.factory.lingualearn.ime.net.AnalysisError
import com.factory.lingualearn.ime.net.AnalysisResponse
import com.factory.lingualearn.ime.net.MechanicalCorrection
import com.factory.lingualearn.ime.net.OptionalSuggestion

enum class PreviewState {
    IDLE,
    CHECKING,
    RESULT_READY,
    ERROR
}

data class PreviewUiState(
    val state: PreviewState = PreviewState.IDLE,
    val originalText: String = "",
    val correctedText: String = "",
    val recommendedText: String = "",
    val summaryRu: String = "",
    val assessment: String? = null,
    val hasClearError: Boolean = false,
    val changed: Boolean = false,
    val errors: List<AnalysisError> = emptyList(),
    val mechanicalCorrections: List<MechanicalCorrection> = emptyList(),
    val optionalSuggestions: List<OptionalSuggestion> = emptyList(),
    val errorMessage: String? = null
)

class PreviewPopupController {

    private var currentUiState = PreviewUiState()

    fun startChecking(originalText: String): PreviewUiState {
        currentUiState = PreviewUiState(
            state = PreviewState.CHECKING,
            originalText = originalText
        )
        return currentUiState
    }

    fun handleAnalysisResult(response: AnalysisResponse): PreviewUiState {
        val hasClearErr = response.hasClearError || response.assessment == "clear_error"
        val recText = if (!response.recommendedText.isNullOrEmpty()) {
            response.recommendedText
        } else {
            response.correctedText ?: response.originalText
        }

        currentUiState = PreviewUiState(
            state = PreviewState.RESULT_READY,
            originalText = response.originalText,
            correctedText = response.correctedText ?: response.originalText,
            recommendedText = recText,
            summaryRu = response.summaryRu ?: if (hasClearErr) "Грамматическая ошибка." else "Ошибок не найдено.",
            assessment = response.assessment ?: (if (hasClearErr) "clear_error" else "correct"),
            hasClearError = hasClearErr,
            changed = response.changed,
            errors = response.errors,
            mechanicalCorrections = response.mechanicalCorrections,
            optionalSuggestions = response.optionalSuggestions
        )
        return currentUiState
    }

    fun handleError(error: String): PreviewUiState {
        currentUiState = PreviewUiState(
            state = PreviewState.ERROR,
            errorMessage = error
        )
        return currentUiState
    }

    fun getUiState(): PreviewUiState = currentUiState
}

