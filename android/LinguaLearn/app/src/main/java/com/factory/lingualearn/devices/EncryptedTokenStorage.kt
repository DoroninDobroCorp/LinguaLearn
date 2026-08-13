package com.factory.lingualearn.devices

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

object EncryptedTokenStorage {

    private var testOverridePrefs: SharedPreferences? = null

    fun setTestOverride(prefs: SharedPreferences?) {
        testOverridePrefs = prefs
    }

    @Throws(IllegalStateException::class)
    fun getEncryptedSharedPreferences(context: Context, name: String): SharedPreferences {
        if (testOverridePrefs != null) {
            return testOverridePrefs!!
        }
        return try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            EncryptedSharedPreferences.create(
                context,
                name,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            throw IllegalStateException(
                "EncryptedTokenStorage failed to initialize for '$name': fail-closed without plaintext fallback",
                e
            )
        }
    }
}
