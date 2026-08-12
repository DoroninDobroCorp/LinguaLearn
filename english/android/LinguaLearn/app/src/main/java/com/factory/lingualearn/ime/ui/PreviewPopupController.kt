package com.factory.lingualearn.ime.ui

import com.factory.lingualearn.ime.net.AnalysisResponse

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
    val summaryRu: String = "",
    val changed: Boolean = false,
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
        currentUiState = PreviewUiState(
            state = PreviewState.RESULT_READY,
            originalText = response.originalText,
            correctedText = response.correctedText ?: response.originalText,
            summaryRu = response.summaryRu ?: "Ошибка не обнаружена.",
            changed = response.changed
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
