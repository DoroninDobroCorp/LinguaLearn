package com.factory.lingualearn.ime

import android.inputmethodservice.InputMethodService
import android.view.KeyEvent
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
    private var checkButton: Button? = null

    override fun onCreate() {
        super.onCreate()
        candidateFilter = CandidateFilter
        replaceEngine = AutoReplaceEngine()
        authManager = AuthManager(applicationContext)
        syncQueue = BackgroundSyncQueue(applicationContext)
        apiClient = ApiClient(baseUrl = authManager.getApiBaseUrl())
        privacyManager = PrivacyConsentManager(applicationContext)
        previewController = PreviewPopupController()
    }

    override fun onCreateInputView(): View {
        val context = applicationContext
        val keyboardLayout = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(8, 8, 8, 8)
            setBackgroundColor(0xFF2D3748.toInt()) // Dark theme keyboard background
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }

        val rows = listOf(
            listOf("q", "w", "e", "r", "t", "y", "u", "i", "o", "p"),
            listOf("a", "s", "d", "f", "g", "h", "j", "k", "l"),
            listOf("z", "x", "c", "v", "b", "n", "m", ",", ".")
        )

        for (rowKeys in rows) {
            val rowLayout = LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { topMargin = 4; bottomMargin = 4 }
            }
            for (key in rowKeys) {
                val btn = Button(context).apply {
                    text = key
                    textSize = 14f
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                        leftMargin = 2
                        rightMargin = 2
                    }
                    setOnClickListener {
                        onKeyTyped(key)
                    }
                }
                rowLayout.addView(btn)
            }
            keyboardLayout.addView(rowLayout)
        }

        // Bottom row: Space, Manual Check, Backspace, Send / Enter
        val bottomRow = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = 4; bottomMargin = 4 }
        }

        val spaceBtn = Button(context).apply {
            text = "SPACE"
            textSize = 12f
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 2f).apply {
                leftMargin = 2
                rightMargin = 2
            }
            setOnClickListener {
                onKeyTyped(" ")
            }
        }

        val checkBtn = Button(context).apply {
            text = "CHECK 🔍"
            textSize = 11f
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.2f).apply {
                leftMargin = 2
                rightMargin = 2
            }
            setOnClickListener {
                onCheckPressed()
            }
        }

        val backspaceBtn = Button(context).apply {
            text = "⌫"
            textSize = 14f
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                leftMargin = 2
                rightMargin = 2
            }
            setOnClickListener {
                onBackspaceTyped()
            }
        }

        val sendBtn = Button(context).apply {
            text = "SEND / ↵"
            textSize = 11f
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.3f).apply {
                leftMargin = 2
                rightMargin = 2
            }
            setOnClickListener {
                onSendOrEnterPressed()
            }
        }

        bottomRow.addView(spaceBtn)
        bottomRow.addView(checkBtn)
        bottomRow.addView(backspaceBtn)
        bottomRow.addView(sendBtn)
        keyboardLayout.addView(bottomRow)

        return keyboardLayout
    }

    fun onKeyTyped(char: String) {
        currentInputConnection?.commitText(char, 1)
    }

    fun onBackspaceTyped() {
        currentInputConnection?.deleteSurroundingText(1, 0)
    }

    fun onCheckPressed() {
        val ic = currentInputConnection
        val textBefore = ic?.getTextBeforeCursor(1024, 0)?.toString() ?: ""
        if (textBefore.isNotBlank()) {
            handleCandidateInput(textBefore.trim(), previewOnly = true)
        }
    }

    fun onSendOrEnterPressed() {
        val ic = currentInputConnection
        val textBefore = ic?.getTextBeforeCursor(1024, 0)?.toString() ?: ""

        val info = currentInputEditorInfo
        if (info != null && info.actionId != EditorInfo.IME_ACTION_NONE && info.actionId != EditorInfo.IME_ACTION_UNSPECIFIED) {
            ic?.performEditorAction(info.actionId)
        } else {
            ic?.sendKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER))
            ic?.sendKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ENTER))
        }

        if (textBefore.isNotBlank()) {
            handleCandidateInput(textBefore.trim(), previewOnly = false)
        }
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

        val chkBtn = Button(context).apply {
            text = "Check"
            textSize = 12f
            setOnClickListener {
                onCheckPressed()
            }
        }

        topRow.addView(previewText)
        topRow.addView(chkBtn)
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
        checkButton = chkBtn

        return container
    }

    fun updateCandidateBarPreview(uiState: PreviewUiState) {
        val pText = previewTextView
        val sText = summaryTextView
        val rBtn = replaceButton
        val cContainer = candidatesContainer

        val shouldShowCandidates = (uiState.state != PreviewState.IDLE)
        setCandidatesViewShown(shouldShowCandidates)

        if (pText == null) return

        when (uiState.state) {
            PreviewState.CHECKING -> {
                cContainer?.setBackgroundColor(0xFFF1F5F9.toInt())
                pText.text = "Checking: \"${uiState.originalText}\"..."
                sText?.visibility = View.GONE
                rBtn?.visibility = View.GONE
            }
            PreviewState.RESULT_READY -> {
                val targetText = if (uiState.recommendedText.isNotEmpty()) uiState.recommendedText else uiState.correctedText

                if (uiState.hasClearError) {
                    // clear_error tier -> detailed card UI policy
                    cContainer?.setBackgroundColor(0xFFFFF0F0.toInt()) // Reddish error tint
                    val errorDetails = if (uiState.errors.isNotEmpty()) {
                        uiState.errors.joinToString("; ") { "${it.original} ➔ ${it.correction}: ${it.explanationRu}" }
                    } else uiState.summaryRu

                    pText.text = "Grammar Error: $targetText"
                    sText?.text = errorDetails.ifEmpty { "Detailed Grammar Card" }
                    sText?.visibility = View.VISIBLE
                    rBtn?.visibility = View.VISIBLE
                    rBtn?.setOnClickListener {
                        performAutoReplace(uiState.originalText, targetText)
                        setCandidatesViewShown(false)
                    }
                } else {
                    // Non-clear_error tiers (mechanical_only, acceptable, correct) -> compact chip UI policy
                    cContainer?.setBackgroundColor(0xFFF1F5F9.toInt()) // Neutral compact chip background
                    if (uiState.assessment == "mechanical_only") {
                        pText.text = "Grammar OK ✓ (spelling fix)"
                        sText?.text = uiState.summaryRu.ifEmpty { "Mechanical/spelling correction" }
                        sText?.visibility = View.VISIBLE
                    } else if (uiState.assessment == "acceptable") {
                        pText.text = "Grammar OK ✓"
                        sText?.text = uiState.summaryRu.ifEmpty { "Acceptable phrasing" }
                        sText?.visibility = View.VISIBLE
                    } else {
                        pText.text = "Grammar OK ✓"
                        sText?.text = uiState.summaryRu.ifEmpty { "No mistakes found." }
                        sText?.visibility = View.VISIBLE
                    }

                    if (uiState.changed && targetText.isNotEmpty() && targetText != uiState.originalText) {
                        rBtn?.visibility = View.VISIBLE
                        rBtn?.setOnClickListener {
                            performAutoReplace(uiState.originalText, targetText)
                            setCandidatesViewShown(false)
                        }
                    } else {
                        rBtn?.visibility = View.GONE
                    }
                }
            }
            PreviewState.ERROR -> {
                cContainer?.setBackgroundColor(0xFFFFF7ED.toInt())
                pText.text = "Error: ${uiState.errorMessage ?: "Network error"}"
                sText?.visibility = View.GONE
                rBtn?.visibility = View.GONE
            }
            PreviewState.IDLE -> {
                cContainer?.setBackgroundColor(0xFFF1F5F9.toInt())
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
        val sentAt = java.time.Instant.now().toString()

        val checkingState = previewController.startChecking(text)
        updateCandidateBarPreview(checkingState)

        serviceScope.launch {
            try {
                val response = withContext(Dispatchers.IO) {
                    val client = ApiClient(baseUrl = authManager.getApiBaseUrl())
                    client.analyzeWriting(
                        deviceToken = deviceToken,
                        eventId = eventId,
                        sourceApp = packageName,
                        originalText = text,
                        sentAt = sentAt,
                        previewOnly = previewOnly
                    )
                }

                val resultState = previewController.handleAnalysisResult(response)
                updateCandidateBarPreview(resultState)

                if (!previewOnly && !response.accepted) {
                    withContext(Dispatchers.IO) {
                        syncQueue.enqueue(
                            sourceApp = packageName,
                            originalText = text,
                            previewOnly = previewOnly,
                            eventId = eventId,
                            sentAt = sentAt
                        )
                    }
                }
            } catch (e: Exception) {
                val errState = previewController.handleError(e.message ?: "Network error")
                updateCandidateBarPreview(errState)

                if (!previewOnly) {
                    // Enqueue for offline retry preserving the exact SAME eventId and sentAt
                    withContext(Dispatchers.IO) {
                        syncQueue.enqueue(
                            sourceApp = packageName,
                            originalText = text,
                            previewOnly = previewOnly,
                            eventId = eventId,
                            sentAt = sentAt
                        )
                    }
                }
            }
        }
    }

    fun performAutoReplace(originalText: String, correctedText: String): Boolean {
        val result = replaceEngine.replaceDraft(currentInputConnection, originalText, correctedText)
        return result.success
    }
}

