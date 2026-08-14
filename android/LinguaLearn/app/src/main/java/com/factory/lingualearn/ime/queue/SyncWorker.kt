package com.factory.lingualearn.ime.queue

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.factory.lingualearn.auth.AuthManager
import com.factory.lingualearn.ime.net.ApiClient

class SyncWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val syncQueue = BackgroundSyncQueue(applicationContext)
        val authManager = AuthManager(applicationContext)
        val baseUrl = authManager.getApiBaseUrl()
        val apiClient = ApiClient(baseUrl = baseUrl)

        val token = authManager.getDeviceToken() ?: syncQueue.getDeviceToken()
        if (token.isNullOrEmpty()) {
            return Result.failure()
        }
        syncQueue.setDeviceToken(token)

        syncQueue.sync(apiClient)
        val remainingItems = syncQueue.getQueueItems()

        return if (remainingItems.isEmpty()) {
            Result.success()
        } else {
            Result.retry()
        }
    }
}
