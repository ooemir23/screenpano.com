package com.screenpano.tv.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.screenpano.tv.ui.MainActivity

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val i = Intent(context, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            context.startActivity(i)
        } catch (_: Exception) {}
    }
}
