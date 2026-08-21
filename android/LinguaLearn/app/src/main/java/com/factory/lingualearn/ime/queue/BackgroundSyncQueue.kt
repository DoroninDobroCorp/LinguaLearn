package com.factory.lingualearn.ime.queue

import android.content.Context
import android.content.SharedPreferences
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkRequest
import com.factory.lingualearn.devices.EncryptedTokenStorage
import com.factory.lingualearn.ime.net.ApiClient
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.TimeUnit

data class QueueItem(
    val eventId: String,
    val sourceApp: String,
    val originalText: String,
    val sentAt: String,
    val previewOnly: Boolean,
    val retryCount: Int = 0,
    val lastError: String? = null,
    val isTerminal: Boolean = false
)

class BackgroundSyncQueue(
    private val context: Context,
    customPrefs: SharedPreferences? = null
) {

    private val prefs: SharedPreferences = customPrefs ?: EncryptedTokenStorage.getEncryptedSharedPreferences(context, "lingualearn_sync_queue")

    companion object {
        private const val KEY_QUEUE_ITEMS = "queue_items"
        private const val KEY_DEVICE_TOKEN = "device_token"
        private const val KEY_LAST_GLOBAL_ERROR = "last_global_error"
        const val MAX_RETRIES = 5
        const val MAX_QUEUE_SIZE = 100
    }

    fun setDeviceToken(deviceToken: String) {
        prefs.edit().putString(KEY_DEVICE_TOKEN, deviceToken).apply()
    }

    fun getDeviceToken(): String? {
        return prefs.getString(KEY_DEVICE_TOKEN, null)
    }

    fun scheduleWorkManagerSync() {
        try {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val syncWorkRequest = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    WorkRequest.MIN_BACKOFF_MILLIS,
                    TimeUnit.MILLISECONDS
                )
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                "LinguaLearnBackgroundSync",
                ExistingWorkPolicy.REPLACE,
                syncWorkRequest
            )
        } catch (e: Throwable) {
            // Safely ignored if WorkManager runtime is not available in JVM unit tests
        }
    }

    @Synchronized
    fun enqueue(
        sourceApp: String,
        originalText: String,
        previewOnly: Boolean = false,
        eventId: String = UUID.randomUUID().toString(),
        sentAt: String = java.time.Instant.now().toString()
    ): QueueItem {
        val currentQueue = getQueueItems().toMutableList()

        // Deduplicate: if an item with the same eventId already exists in queue, return existing item
        val existing = currentQueue.find { it.eventId == eventId }
        if (existing != null) {
            return existing
        }

        // Bounded queue: drop oldest items if max queue size reached
        while (currentQueue.size >= MAX_QUEUE_SIZE) {
            currentQueue.removeAt(0)
        }

        val item = QueueItem(
            eventId = eventId,
            sourceApp = sourceApp,
            originalText = originalText,
            sentAt = sentAt,
            previewOnly = previewOnly
        )

        currentQueue.add(item)
        saveQueueItems(currentQueue)
        scheduleWorkManagerSync()
        return item
    }

    @Synchronized
    fun getQueueItems(): List<QueueItem> {
        val jsonStr = prefs.getString(KEY_QUEUE_ITEMS, "[]") ?: "[]"
        val list = mutableListOf<QueueItem>()
        try {
            val array = JSONArray(jsonStr)
            for (i in 0 until array.length()) {
                val obj = array.getJSONObject(i)
                list.add(
                    QueueItem(
                        eventId = obj.getString("eventId"),
                        sourceApp = obj.getString("sourceApp"),
                        originalText = obj.getString("originalText"),
                        sentAt = obj.getString("sentAt"),
                        previewOnly = obj.getBoolean("previewOnly"),
                        retryCount = obj.optInt("retryCount", 0),
                        lastError = if (obj.has("lastError") && !obj.isNull("lastError")) obj.getString("lastError") else null,
                        isTerminal = obj.optBoolean("isTerminal", false)
                    )
                )
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return list
    }

    @Synchronized
    private fun saveQueueItems(items: List<QueueItem>) {
        val array = JSONArray()
        for (item in items) {
            val obj = JSONObject()
            obj.put("eventId", item.eventId)
            obj.put("sourceApp", item.sourceApp)
            obj.put("originalText", item.originalText)
            obj.put("sentAt", item.sentAt)
            obj.put("previewOnly", item.previewOnly)
            obj.put("retryCount", item.retryCount)
            item.lastError?.let { obj.put("lastError", it) }
            obj.put("isTerminal", item.isTerminal)
            array.put(obj)
        }
        prefs.edit().putString(KEY_QUEUE_ITEMS, array.toString()).apply()
    }

    @Synchronized
    fun dequeue(eventId: String) {
        val current = getQueueItems().filterNot { it.eventId == eventId }
        saveQueueItems(current)
    }

    @Synchronized
    fun clearAll() {
        prefs.edit().putString(KEY_QUEUE_ITEMS, "[]").remove(KEY_LAST_GLOBAL_ERROR).apply()
    }

    fun getLastGlobalError(): String? {
        return prefs.getString(KEY_LAST_GLOBAL_ERROR, null)
    }

    fun setLastGlobalError(error: String?) {
        if (error != null) {
            prefs.edit().putString(KEY_LAST_GLOBAL_ERROR, error).apply()
        } else {
            prefs.edit().remove(KEY_LAST_GLOBAL_ERROR).apply()
        }
    }

    @Synchronized
    fun markError(eventId: String, error: String, isTerminal: Boolean = false) {
        val current = getQueueItems().map {
            if (it.eventId == eventId) {
                it.copy(
                    retryCount = it.retryCount + 1,
                    lastError = error,
                    isTerminal = isTerminal
                )
            } else {
                it
            }
        }
        setLastGlobalError(error)
        saveQueueItems(current)
    }

    @Synchronized
    fun incrementRetry(eventId: String) {
        val current = getQueueItems().map {
            if (it.eventId == eventId) {
                it.copy(retryCount = it.retryCount + 1)
            } else {
                it
            }
        }
        saveQueueItems(current)
    }

    @Synchronized
    fun sync(apiClient: ApiClient? = null): Int {
        val items = getQueueItems()
        var syncedCount = 0
        val token = getDeviceToken()

        for (item in items) {
            if (item.retryCount >= MAX_RETRIES || item.isTerminal) {
                // Keep exhausted items for diagnostics/manual retry; never silently lose raw text.
                continue
            }

            if (apiClient != null && !token.isNullOrEmpty()) {
                try {
                    val response = apiClient.analyzeWriting(
                        deviceToken = token,
                        eventId = item.eventId, // Preserves exact same eventId across retries
                        sourceApp = item.sourceApp,
                        originalText = item.originalText,
                        sentAt = item.sentAt, // Preserves exact same sentAt across retries
                        previewOnly = item.previewOnly
                    )
                    if (response.accepted) {
                        dequeue(item.eventId)
                        syncedCount++
                    } else {
                        val status = response.statusCode ?: 0
                        val reason = response.rejectionReason ?: ""

                        val is401Permanent = status == 401 || reason.startsWith("HTTP 401") ||
                                status == 400 || reason.startsWith("HTTP 400") ||
                                status == 403 || reason.startsWith("HTTP 403") ||
                                status == 422 || reason.startsWith("HTTP 422")

                        val is409Replay = status == 409 || reason.startsWith("HTTP 409")

                        val isRetryable = status == 408 || status == 429 || reason.startsWith("HTTP 429") ||
                                (status in 500..599) || reason.contains("HTTP 5") ||
                                status == 0

                        if (status in 200..299) {
                            // A semantic rejection (for example, not prose) was processed successfully.
                            dequeue(item.eventId)
                            syncedCount++
                        } else if (is409Replay) {
                            // 409 Conflict / replay: event already processed or in progress on server -> dequeue item
                            dequeue(item.eventId)
                            syncedCount++
                        } else if (is401Permanent) {
                            // Permanent client error (400, 401, 403, 422) -> mark terminal with status
                            markError(item.eventId, reason.ifEmpty { "HTTP $status Client Error" }, isTerminal = true)
                            dequeue(item.eventId)
                        } else if (isRetryable) {
                            // Transient error (408, 429 rate limit, 5xx server error) -> increment retry with bounded backoff
                            markError(item.eventId, reason.ifEmpty { "HTTP $status Transient Error" }, isTerminal = false)
                        } else {
                            markError(item.eventId, reason.ifEmpty { "HTTP $status Error" }, isTerminal = false)
                        }
                    }
                } catch (e: Exception) {
                    markError(item.eventId, e.message ?: "Network error", isTerminal = false)
                }
            } else {
                // Missing runtime dependencies are not delivery. Preserve the durable item.
                continue
            }
        }
        return syncedCount
    }
}
