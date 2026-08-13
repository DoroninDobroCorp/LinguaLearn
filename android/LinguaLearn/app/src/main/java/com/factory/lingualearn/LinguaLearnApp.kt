package com.factory.lingualearn

import android.app.Application
import android.content.Context
import com.factory.lingualearn.auth.AuthManager
import com.factory.lingualearn.ime.queue.BackgroundSyncQueue

class LinguaLearnApp : Application() {

    companion object {
        lateinit var appContext: Context
            private set
    }

    override fun onCreate() {
        super.onCreate()
        appContext = applicationContext

        try {
            val authManager = AuthManager(applicationContext)
            val token = authManager.getDeviceToken()
            if (!token.isNullOrEmpty()) {
                val syncQueue = BackgroundSyncQueue(applicationContext)
                syncQueue.setDeviceToken(token)
                syncQueue.scheduleWorkManagerSync()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
