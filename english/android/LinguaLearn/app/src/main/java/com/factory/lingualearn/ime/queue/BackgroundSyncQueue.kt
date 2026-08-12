package com.factory.lingualearn.ime.queue

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

data class QueueItem(
    val eventId: String,
    val sourceApp: String,
    val originalText: String,
    val sentAt: String,
    val previewOnly: Boolean,
    val retryCount: Int = 0
)

class BackgroundSyncQueue(private val context: Context) {

    private val prefs: SharedPreferences = context.getSharedPreferences("lingualearn_sync_queue", Context.MODE_PRIVATE)

    companion object {
        private const val KEY_QUEUE_ITEMS = "queue_items"
        private const val KEY_DEVICE_TOKEN = "device_token"
    }

    fun setDeviceToken(deviceToken: String) {
        prefs.edit().putString(KEY_DEVICE_TOKEN, deviceToken).apply()
    }

    fun getDeviceToken(): String? {
        return prefs.getString(KEY_DEVICE_TOKEN, null)
    }

    @Synchronized
    fun enqueue(sourceApp: String, originalText: String, previewOnly: Boolean = false): QueueItem {
        val item = QueueItem(
            eventId = UUID.randomUUID().toString(),
            sourceApp = sourceApp,
            originalText = originalText,
            sentAt = java.time.Instant.now().toString(),
            previewOnly = previewOnly
        )

        val currentQueue = getQueueItems().toMutableList()
        currentQueue.add(item)
        saveQueueItems(currentQueue)
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

    fun sync(): Int {
        val items = getQueueItems()
        var syncedCount = 0
        for (item in items) {
            // Mock sync execution
            dequeue(item.eventId)
            syncedCount++
        }
        return syncedCount
    }
}
