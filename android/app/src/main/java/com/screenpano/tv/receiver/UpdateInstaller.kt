package com.screenpano.tv.receiver

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import java.io.File

/** Yükleyici sonuçlarının ana ekrana bildirimi (menüde görünen durum satırı için). */
object UpdateBus {
    @Volatile var onStatus: ((String) -> Unit)? = null
}

/**
 * APK'yı PackageInstaller oturumuyla kurar: dosya, içerik adresi ve izin devri olmadan doğrudan sistem yükleyiciye yazılır.
 * (Eski yol — ACTION_VIEW + içerik adresi — bazı kutularda ilk denemede yükleme ekranını açmıyordu.)
 * Onay ekranı sonuç alıcısından açılır.
 */
object UpdateInstaller {
    const val ACTION = "com.screenpano.tv.INSTALL_RESULT"

    /** Oturumu açıp yazar ve gönderir; hata olursa istisna fırlatır (çağıran eski yola düşer). */
    fun install(ctx: Context, apk: File) {
        val pi = ctx.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        params.setAppPackageName(ctx.packageName)
        val id = pi.createSession(params)
        val session = pi.openSession(id)
        try {
            apk.inputStream().use { input ->
                session.openWrite("update.apk", 0, apk.length()).use { out ->
                    input.copyTo(out)
                    session.fsync(out)
                }
            }
            val intent = Intent(ctx, InstallResultReceiver::class.java).setAction(ACTION).setPackage(ctx.packageName)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
            val pending = PendingIntent.getBroadcast(ctx, id, intent, flags)
            session.commit(pending.intentSender)
        } catch (e: Throwable) {
            try { session.abandon() } catch (_: Throwable) { }
            throw e
        } finally {
            try { session.close() } catch (_: Throwable) { }
        }
    }
}

/** Sistem yükleyicisinin sonucu: onay gerekiyorsa onay ekranını açar, hata olursa nedenini menüye yazar. */
class InstallResultReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (val st = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                if (confirm != null) {
                    confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    try { context.startActivity(confirm); UpdateBus.onStatus?.invoke("Yükleme ekranında \"Yükle\" seçeneğini onaylayın") }
                    catch (e: Exception) { UpdateBus.onStatus?.invoke("Yükleyici açılamadı: ${e.message}") }
                }
            }
            PackageInstaller.STATUS_SUCCESS -> UpdateBus.onStatus?.invoke("Yüklendi, uygulama yeniden açılıyor…")
            else -> {
                val msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "kod $st"
                UpdateBus.onStatus?.invoke("Yüklenemedi: $msg")
            }
        }
    }
}
