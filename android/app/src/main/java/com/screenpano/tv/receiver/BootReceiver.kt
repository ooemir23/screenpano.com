package com.screenpano.tv.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.screenpano.tv.ui.MainActivity

/**
 * Cihaz açılınca ekranı başlatır. Android 10+ arka plandan Activity başlatmayı engeller;
 * "diğer uygulamaların üzerinde gösterme" izni verilmişse bu engel kalkar (izin eşleştirme ekranında bir kez istenir).
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val a = intent.action ?: return
        if (!a.endsWith("BOOT_COMPLETED") && !a.endsWith("QUICKBOOT_POWERON") && !a.endsWith("MY_PACKAGE_REPLACED")) return // güncelleme kurulunca da uygulama kendiliğinden açılır
        val i = Intent(context, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
        }
        try { context.startActivity(i) } catch (_: Exception) {}
    }
}
