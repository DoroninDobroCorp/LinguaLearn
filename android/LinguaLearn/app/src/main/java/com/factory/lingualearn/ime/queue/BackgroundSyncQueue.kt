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
    val retryCount: Int = 0
)

class BackgroundSyncQueue(
    private val context: Context,
    customPrefs: SharedPreferences? = null
) {

    private val prefs: SharedPreferences = customPrefs ?: EncryptedTokenStorage.getEncryptedSharedPreferences(context, "lingualearn_sync_queue")

    companion object {
        private const val KEY_QUEUE_ITEMS = "queue_items"
        private const val KEY_DEVICE_TOKEN = "device_token"
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
                        retryCount = obj.optInt("retryCount", 0)
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
            if (item.retryCount >= MAX_RETRIES) {
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

                        val isRetryable = status == 429 || reason.startsWith("HTTP 429") ||
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
                            // Permanent client error (401, 400, 403, 422) -> drop item to unblock queue
                            dequeue(item.eventId)
                        } else if (isRetryable) {
                            // Transient error (429 rate limit, 5xx server error) -> increment retry with bounded backoff
                            incrementRetry(item.eventId)
                        } else {
                            incrementRetry(item.eventId)
                        }
                    }
                } catch (e: Exception) {
                    incrementRetry(item.eventId)
                }
            } else {
                // Missing runtime dependencies are not delivery. Preserve the durable item.
                continue
            }
        }
        return syncedCount
    }
}
