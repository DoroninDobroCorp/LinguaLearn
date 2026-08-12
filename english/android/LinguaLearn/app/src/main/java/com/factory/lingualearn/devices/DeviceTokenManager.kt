package com.factory.lingualearn.devices

import android.content.Context
import android.content.SharedPreferences
import java.util.UUID

data class DeviceTokenInfo(
    val id: String,
    val deviceName: String,
    val token: String,
    val createdAt: String
)

class DeviceTokenManager(context: Context) {

    private val prefs: SharedPreferences = context.getSharedPreferences("lingualearn_device_prefs", Context.MODE_PRIVATE)

    companion object {
        private const val KEY_ACTIVE_DEVICE_TOKEN = "active_device_token"
        private const val KEY_DEVICE_NAME = "active_device_name"
    }

    fun getActiveDeviceToken(): String? {
        return prefs.getString(KEY_ACTIVE_DEVICE_TOKEN, null)
    }

    fun generateDeviceToken(deviceName: String): DeviceTokenInfo {
        val rawToken = "ll_dev_" + UUID.randomUUID().toString().replace("-", "")
        val id = UUID.randomUUID().toString()
        val createdAt = java.time.Instant.now().toString()

        prefs.edit()
            .putString(KEY_ACTIVE_DEVICE_TOKEN, rawToken)
            .putString(KEY_DEVICE_NAME, deviceName)
            .apply()

        return DeviceTokenInfo(
            id = id,
            deviceName = deviceName,
            token = rawToken,
            createdAt = createdAt
        )
    }

    fun revokeActiveDeviceToken() {
        prefs.edit().clear().apply()
    }
}
