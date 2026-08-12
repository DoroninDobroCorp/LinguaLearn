package com.factory.lingualearn.ime

import android.inputmethodservice.InputMethodService
import android.view.View
import android.view.inputmethod.EditorInfo
import com.factory.lingualearn.auth.AuthManager
import com.factory.lingualearn.ime.filter.CandidateFilter
import com.factory.lingualearn.ime.net.ApiClient
import com.factory.lingualearn.ime.queue.BackgroundSyncQueue
import com.factory.lingualearn.ime.replacement.AutoReplaceEngine
import com.factory.lingualearn.ime.ui.PreviewPopupController
import com.factory.lingualearn.settings.PrivacyConsentManager

class LinguaLearnIMEKeyboardService : InputMethodService() {

    private lateinit var candidateFilter: CandidateFilter
    private lateinit var replaceEngine: AutoReplaceEngine
    private lateinit var syncQueue: BackgroundSyncQueue
    private lateinit var apiClient: ApiClient
    private lateinit var authManager: AuthManager
    private lateinit var privacyManager: PrivacyConsentManager
    private lateinit var previewController: PreviewPopupController

    override fun onCreate() {
        super.onCreate()
        candidateFilter = CandidateFilter
        replaceEngine = AutoReplaceEngine()
        syncQueue = BackgroundSyncQueue(applicationContext)
        apiClient = ApiClient()
        authManager = AuthManager(applicationContext)
        privacyManager = PrivacyConsentManager(applicationContext)
        previewController = PreviewPopupController()
    }

    override fun onStartInputView(info: EditorInfo?, restarting: Boolean) {
        super.onStartInputView(info, restarting)

        // Sensitive field check (password/PIN/credit card rejection)
        if (candidateFilter.isSensitiveField(info)) {
            return
        }

        // Package allow/deny check
        val packageName = info?.packageName ?: ""
        if (privacyManager.isAppDenied(packageName) || privacyManager.isCapturePaused()) {
            return
        }
    }

    fun handleCandidateInput(text: String, previewOnly: Boolean = false) {
        val currentInfo = currentInputEditorInfo
        val filterRes = candidateFilter.filterCandidate(text, currentInfo)

        if (!filterRes.accepted) {
            return
        }

        val deviceToken = authManager.getDeviceToken() ?: "ll_dev_android_default_token"
        val packageName = currentInfo?.packageName ?: "LinguaLearnIMEKeyboardService"

        previewController.startChecking(text)

        try {
            val response = apiClient.analyzeWriting(
                deviceToken = deviceToken,
                eventId = java.util.UUID.randomUUID().toString(),
                sourceApp = packageName,
                originalText = text,
                sentAt = java.time.Instant.now().toString(),
                previewOnly = previewOnly
            )

            previewController.handleAnalysisResult(response)

            if (!previewOnly && response.accepted) {
                syncQueue.enqueue(
                    sourceApp = packageName,
                    originalText = text,
                    previewOnly = false
                )
            }
        } catch (e: Exception) {
            previewController.handleError(e.message ?: "Network error")
            syncQueue.enqueue(
                sourceApp = packageName,
                originalText = text,
                previewOnly = previewOnly
            )
        }
    }

    fun performAutoReplace(originalText: String, correctedText: String): Boolean {
        val result = replaceEngine.replaceDraft(currentInputConnection, originalText, correctedText)
        return result.success
    }
}
