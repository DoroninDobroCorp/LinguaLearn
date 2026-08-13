package com.factory.lingualearn.auth

import android.content.Context
import android.content.SharedPreferences
import com.factory.lingualearn.devices.EncryptedTokenStorage

class AuthManager(val context: Context) {

    private val prefs: SharedPreferences = EncryptedTokenStorage.getEncryptedSharedPreferences(context, "lingualearn_auth_prefs")

    companion object {
        private const val KEY_SESSION_TOKEN = "session_token"
        private const val KEY_USER_EMAIL = "user_email"
        private const val KEY_DEVICE_TOKEN = "device_token"
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

    fun saveDeviceToken(deviceToken: String) {
        prefs.edit()
            .putString(KEY_DEVICE_TOKEN, deviceToken)
            .apply()
    }

    fun getSessionToken(): String? {
        return prefs.getString(KEY_SESSION_TOKEN, null)
    }

    fun getDeviceToken(): String? {
        return prefs.getString(KEY_DEVICE_TOKEN, null)
    }

    fun getUserEmail(): String? {
        return prefs.getString(KEY_USER_EMAIL, null)
    }

    fun logout() {
        prefs.edit().clear().apply()
    }
}
