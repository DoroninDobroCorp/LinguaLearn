package com.factory.lingualearn.settings

import android.content.Context
import android.content.SharedPreferences
import com.factory.lingualearn.devices.EncryptedTokenStorage

class PrivacyConsentManager(
    context: Context,
    customPrefs: SharedPreferences? = null
) {

    private val prefs: SharedPreferences = customPrefs ?: EncryptedTokenStorage.getEncryptedSharedPreferences(context, "lingualearn_privacy_prefs")

    companion object {
        private const val KEY_CAPTURE_PAUSED = "capture_paused"
        private const val KEY_CONSENT_GIVEN = "consent_given"
        private const val KEY_DENIED_APPS = "denied_apps"
    }

    fun isCapturePaused(): Boolean {
        return prefs.getBoolean(KEY_CAPTURE_PAUSED, false)
    }

    fun setCapturePaused(paused: Boolean) {
        prefs.edit().putBoolean(KEY_CAPTURE_PAUSED, paused).apply()
    }

    fun isConsentGiven(): Boolean {
        return prefs.getBoolean(KEY_CONSENT_GIVEN, true)
    }

    fun setConsentGiven(consent: Boolean) {
        prefs.edit().putBoolean(KEY_CONSENT_GIVEN, consent).apply()
    }

    fun getDeniedApps(): Set<String> {
        return prefs.getStringSet(KEY_DENIED_APPS, setOf("com.bank.app", "com.passwordmanager.app")) ?: emptySet()
    }

    fun isAppDenied(packageName: String): Boolean {
        val denied = getDeniedApps()
        return denied.contains(packageName) || packageName.contains("bank") || packageName.contains("password") || packageName.contains("vault")
    }

    fun addDeniedApp(packageName: String) {
        val current = getDeniedApps().toMutableSet()
        current.add(packageName)
        prefs.edit().putStringSet(KEY_DENIED_APPS, current).apply()
    }
}
