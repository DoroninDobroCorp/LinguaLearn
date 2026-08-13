package com.factory.lingualearn.ime

import android.inputmethodservice.InputMethodService
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import com.factory.lingualearn.auth.AuthManager
import com.factory.lingualearn.ime.filter.CandidateFilter
import com.factory.lingualearn.ime.net.ApiClient
import com.factory.lingualearn.ime.queue.BackgroundSyncQueue
import com.factory.lingualearn.ime.replacement.AutoReplaceEngine
import com.factory.lingualearn.ime.ui.PreviewPopupController
import com.factory.lingualearn.ime.ui.PreviewState
import com.factory.lingualearn.ime.ui.PreviewUiState
import com.factory.lingualearn.settings.PrivacyConsentManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class LinguaLearnIMEKeyboardService : InputMethodService() {

    private val serviceJob = SupervisorJob()
    private val serviceScope = CoroutineScope(Dispatchers.Main + serviceJob)

    private lateinit var candidateFilter: CandidateFilter
    private lateinit var replaceEngine: AutoReplaceEngine
    private lateinit var syncQueue: BackgroundSyncQueue
    private lateinit var apiClient: ApiClient
    private lateinit var authManager: AuthManager
    private lateinit var privacyManager: PrivacyConsentManager
    private lateinit var previewController: PreviewPopupController

    private var candidatesContainer: LinearLayout? = null
    private var previewTextView: TextView? = null
    private var summaryTextView: TextView? = null
    private var replaceButton: Button? = null

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

    override fun onCreateCandidatesView(): View {
        val context = applicationContext
        val container = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(16, 8, 16, 8)
            setBackgroundColor(0xFFF1F5F9.toInt())
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }

        val topRow = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        val previewText = TextView(context).apply {
            textSize = 14f
            setTextColor(0xFF1E293B.toInt())
            text = "LinguaLearn Candidate Bar"
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }

        val btn = Button(context).apply {
            text = "Replace"
            visibility = View.GONE
            textSize = 12f
        }

        topRow.addView(previewText)
        topRow.addView(btn)

        val summaryText = TextView(context).apply {
            textSize = 12f
            setTextColor(0xFF64748B.toInt())
            text = ""
            visibility = View.GONE
        }

        container.addView(topRow)
        container.addView(summaryText)

        candidatesContainer = container
        previewTextView = previewText
        summaryTextView = summaryText
        replaceButton = btn

        return container
    }

    fun updateCandidateBarPreview(uiState: PreviewUiState) {
        val pText = previewTextView
        val sText = summaryTextView
        val rBtn = replaceButton

        val shouldShowCandidates = (uiState.state != PreviewState.IDLE)
        setCandidatesViewShown(shouldShowCandidates)

        if (pText == null) return

        when (uiState.state) {
            PreviewState.CHECKING -> {
                pText.text = "Checking: \"${uiState.originalText}\"..."
                sText?.visibility = View.GONE
                rBtn?.visibility = View.GONE
            }
            PreviewState.RESULT_READY -> {
                if (uiState.changed) {
                    pText.text = "Correction: ${uiState.correctedText}"
                    sText?.text = uiState.summaryRu
                    sText?.visibility = if (uiState.summaryRu.isNotEmpty()) View.VISIBLE else View.GONE
                    rBtn?.visibility = View.VISIBLE
                    rBtn?.setOnClickListener {
                        performAutoReplace(uiState.originalText, uiState.correctedText)
                        setCandidatesViewShown(false)
                    }
                } else {
                    pText.text = "Grammar OK ✓"
                    sText?.text = uiState.summaryRu.ifEmpty { "No mistakes found." }
                    sText?.visibility = View.VISIBLE
                    rBtn?.visibility = View.GONE
                }
            }
            PreviewState.ERROR -> {
                pText.text = "Error: ${uiState.errorMessage ?: "Network error"}"
                sText?.visibility = View.GONE
                rBtn?.visibility = View.GONE
            }
            PreviewState.IDLE -> {
                pText.text = ""
                sText?.visibility = View.GONE
                rBtn?.visibility = View.GONE
            }
        }
    }

    override fun onStartInputView(info: EditorInfo?, restarting: Boolean) {
        super.onStartInputView(info, restarting)

        // Sensitive field check (password/PIN/credit card rejection)
        if (candidateFilter.isSensitiveField(info)) {
            setCandidatesViewShown(false)
            return
        }

        // Package allow/deny check
        val packageName = info?.packageName ?: ""
        if (privacyManager.isAppDenied(packageName) || privacyManager.isCapturePaused()) {
            setCandidatesViewShown(false)
            return
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
    }

    fun handleCandidateInput(text: String, previewOnly: Boolean = false) {
        val currentInfo = currentInputEditorInfo
        val filterRes = candidateFilter.filterCandidate(text, currentInfo)

        if (!filterRes.accepted) {
            return
        }

        val deviceToken = authManager.getDeviceToken() ?: syncQueue.getDeviceToken()
        if (deviceToken.isNullOrEmpty()) {
            val errState = previewController.handleError("Device token not configured")
            updateCandidateBarPreview(errState)
            return
        }

        val packageName = currentInfo?.packageName ?: "LinguaLearnIMEKeyboardService"
        val eventId = java.util.UUID.randomUUID().toString()

        val checkingState = previewController.startChecking(text)
        updateCandidateBarPreview(checkingState)

        serviceScope.launch {
            try {
                val response = withContext(Dispatchers.IO) {
                    apiClient.analyzeWriting(
                        deviceToken = deviceToken,
                        eventId = eventId,
                        sourceApp = packageName,
                        originalText = text,
                        sentAt = java.time.Instant.now().toString(),
                        previewOnly = previewOnly
                    )
                }

                val resultState = previewController.handleAnalysisResult(response)
                updateCandidateBarPreview(resultState)

                if (!previewOnly && response.accepted) {
                    // If offline queue was needed or if sync queue registers active items
                }
            } catch (e: Exception) {
                val errState = previewController.handleError(e.message ?: "Network error")
                updateCandidateBarPreview(errState)

                // Enqueue for offline retry preserving the exact SAME eventId so duplicate retries handle cleanly
                withContext(Dispatchers.IO) {
                    syncQueue.enqueue(
                        sourceApp = packageName,
                        originalText = text,
                        previewOnly = previewOnly,
                        eventId = eventId
                    )
                }
            }
        }
    }

    fun performAutoReplace(originalText: String, correctedText: String): Boolean {
        val result = replaceEngine.replaceDraft(currentInputConnection, originalText, correctedText)
        return result.success
    }
}
