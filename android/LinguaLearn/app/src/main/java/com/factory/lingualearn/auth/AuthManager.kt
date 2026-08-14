package com.factory.lingualearn.auth

import android.content.Context
import android.content.SharedPreferences
import com.factory.lingualearn.devices.EncryptedTokenStorage
import com.factory.lingualearn.ime.net.ApiClient
import com.factory.lingualearn.ime.queue.BackgroundSyncQueue

class AuthManager(
    val context: Context,
    customPrefs: SharedPreferences? = null
) {

    private val prefs: SharedPreferences = customPrefs ?: EncryptedTokenStorage.getEncryptedSharedPreferences(context, "lingualearn_auth_prefs")

    companion object {
        private const val KEY_SESSION_TOKEN = "session_token"
        private const val KEY_USER_EMAIL = "user_email"
        private const val KEY_DEVICE_TOKEN = "device_token"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_API_BASE_URL = "api_base_url"
    }

    fun getApiBaseUrl(): String {
        val stored = prefs.getString(KEY_API_BASE_URL, null)
        return if (!stored.isNullOrBlank()) stored else ApiClient.DEFAULT_BASE_URL
    }

    fun setApiBaseUrl(url: String) {
        val cleanUrl = url.trim().removeSuffix("/")
        if (cleanUrl.startsWith("http://") && !cleanUrl.startsWith("http://localhost") && !cleanUrl.startsWith("http://127.0.0.1") && !cleanUrl.startsWith("http://[::1]")) {
            throw IllegalArgumentException("HTTPS Enforced: API base URL must use HTTPS (got '$cleanUrl')")
        }
        prefs.edit().putString(KEY_API_BASE_URL, cleanUrl).apply()
    }

    fun isAuthenticated(): Boolean {
        return getSessionToken() != null || getDeviceToken() != null
    }

    fun saveSession(email: String, sessionToken: String) {
        prefs.edit()
            .putString(KEY_USER_EMAIL, email)
            .putString(KEY_SESSION_TOKEN, sessionToken)
            .apply()
    }

    fun saveDeviceToken(deviceToken: String, deviceId: String? = null) {
        val editor = prefs.edit().putString(KEY_DEVICE_TOKEN, deviceToken)
        if (deviceId != null) {
            editor.putString(KEY_DEVICE_ID, deviceId)
        }
        editor.apply()

        if (deviceToken.isNotEmpty()) {
            val syncQueue = BackgroundSyncQueue(context)
            syncQueue.setDeviceToken(deviceToken)
            syncQueue.scheduleWorkManagerSync()
        }
    }

    fun getSessionToken(): String? {
        return prefs.getString(KEY_SESSION_TOKEN, null)
    }

    fun getDeviceToken(): String? {
        return prefs.getString(KEY_DEVICE_TOKEN, null)
    }

    fun getActiveDeviceId(): String? {
        return prefs.getString(KEY_DEVICE_ID, null)
    }

    fun getUserEmail(): String? {
        return prefs.getString(KEY_USER_EMAIL, null)
    }

    fun logout(): Boolean {
        val sessionToken = getSessionToken()
        var serverRevoked = true
        if (!sessionToken.isNullOrEmpty()) {
            val client = ApiClient(baseUrl = getApiBaseUrl())
            serverRevoked = client.logout(sessionToken)
        }
        prefs.edit().clear().apply()
        return serverRevoked
    }
}

