package com.factory.lingualearn.devices

import android.content.Context
import android.content.SharedPreferences
import com.factory.lingualearn.auth.AuthManager
import com.factory.lingualearn.ime.net.ApiClient

data class DeviceTokenInfo(
    val id: String,
    val deviceName: String,
    val token: String,
    val createdAt: String
)

class DeviceTokenManager(val context: Context) {

    private val prefs: SharedPreferences = EncryptedTokenStorage.getEncryptedSharedPreferences(context, "lingualearn_device_prefs")
    private val authManager = AuthManager(context)

    companion object {
        private const val KEY_ACTIVE_DEVICE_TOKEN = "active_device_token"
        private const val KEY_ACTIVE_DEVICE_ID = "active_device_id"
        private const val KEY_DEVICE_NAME = "active_device_name"
    }

    fun getActiveDeviceToken(): String? {
        return prefs.getString(KEY_ACTIVE_DEVICE_TOKEN, null) ?: authManager.getDeviceToken()
    }

    fun getActiveDeviceId(): String? {
        return prefs.getString(KEY_ACTIVE_DEVICE_ID, null) ?: authManager.getActiveDeviceId()
    }

    fun getActiveDeviceName(): String? {
        return prefs.getString(KEY_DEVICE_NAME, "Android Client IME")
    }

    fun saveActiveToken(token: String, tokenId: String, deviceName: String) {
        prefs.edit()
            .putString(KEY_ACTIVE_DEVICE_TOKEN, token)
            .putString(KEY_ACTIVE_DEVICE_ID, tokenId)
            .putString(KEY_DEVICE_NAME, deviceName)
            .apply()
        authManager.saveDeviceToken(token, tokenId)
    }

    fun createRealDeviceToken(
        deviceName: String,
        sessionToken: String?,
        baseUrl: String = authManager.getApiBaseUrl()
    ): DeviceTokenInfo? {
        val tokenToUse = sessionToken ?: authManager.getSessionToken() ?: ""
        val client = ApiClient(baseUrl = baseUrl)
        val res = client.createDeviceToken(tokenToUse, deviceName)

        if (res.success && !res.token.isNullOrEmpty()) {
            val id = res.tokenId ?: "1"
            saveActiveToken(res.token, id, deviceName)
            return DeviceTokenInfo(
                id = id,
                deviceName = deviceName,
                token = res.token,
                createdAt = res.createdAt ?: java.time.Instant.now().toString()
            )
        }
        return null
    }

    fun revokeActiveDeviceToken(
        sessionToken: String? = null,
        baseUrl: String = authManager.getApiBaseUrl()
    ): Boolean {
        val tokenId = getActiveDeviceId()
        val tokenToUse = sessionToken ?: authManager.getSessionToken() ?: ""

        if (!tokenId.isNullOrEmpty()) {
            val client = ApiClient(baseUrl = baseUrl)
            client.revokeDeviceToken(tokenToUse, tokenId)
        }

        prefs.edit().clear().apply()
        authManager.saveDeviceToken("")
        return true
    }
}

