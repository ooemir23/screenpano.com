package com.screenpano.tv.data.prefs

import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import android.provider.Settings

/**
 * Cihazın kalıcı ayarları. Dosya ve anahtar adları eski Java sürümüyle (ve 2.4–3.0 APK'larıyla) aynıdır:
 * değiştirilirse güncellenen kutular eşleşmesini kaybeder.
 */
class TvPreferences(context: Context) {
    private val app = context.applicationContext
    private val prefs = app.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)

    /** Ortam: "live" (varsayılan) ya da "test" (test sunucusu). Her ortamın kendi cihaz anahtarı vardır (iki sunucuda ayrı kayıt). */
    fun isTest(): Boolean = prefs.getString(KEY_ENV, "live") == "test"
    fun setTest(on: Boolean) { prefs.edit().putString(KEY_ENV, if (on) "test" else "live").commit() }

    // canlı anahtar eski adıyla durur (güncellenen kutular eşleşmesini kaybetmesin)
    private fun tokenKey() = if (isTest()) KEY_DEVICE_TOKEN_TEST else KEY_DEVICE_TOKEN
    fun getDeviceToken(): String = prefs.getString(tokenKey(), "") ?: ""

    fun saveDeviceToken(t: String?) {
        prefs.edit().putString(tokenKey(), t ?: "").apply()
    }

    /** Kutunun kimliği (ANDROID_ID): panelde cihazı ayırt etmek için. */
    @SuppressLint("HardwareIds")
    fun getHardwareId(): String = try {
        Settings.Secure.getString(app.contentResolver, Settings.Secure.ANDROID_ID) ?: ""
    } catch (_: Exception) {
        ""
    }

    /** Marka ve model (panelde "hangi cihaz" diye gösterilir). */
    fun getModel(): String = "${Build.MANUFACTURER} ${Build.MODEL}".trim().take(60)

    companion object {
        const val PREF_NAME = "tv"
        const val KEY_DEVICE_TOKEN = "deviceToken"
        const val KEY_DEVICE_TOKEN_TEST = "deviceToken_test"
        const val KEY_ENV = "env"
    }
}
