package com.screenpano.tv.ui.nativeui

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView
import com.screenpano.tv.data.model.TvState
import com.screenpano.tv.data.model.WidgetSpec
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.max
import kotlin.math.min

/** "Saat ve tarih" widget'ı (sayfadaki #wclock). */
class ClockWidget(context: Context) : LinearLayout(context), NativeWidget {
    private val time = TextView(context)
    private val date = TextView(context)
    private val main = Handler(Looper.getMainLooper())
    private var seconds = false
    private var fmtTime = SimpleDateFormat("HH:mm", Locale("tr", "TR"))
    private val fmtDate = SimpleDateFormat("d MMMM EEEE", Locale("tr", "TR"))
    private val tick = object : Runnable {
        override fun run() {
            val d = Date()
            time.text = fmtTime.format(d)
            date.text = fmtDate.format(d).uppercase(Locale("tr", "TR"))
            // saniyeli saat her saniye, değilse dakika başında güncellenir
            main.postDelayed(this, if (seconds) 1000L else 60_000L - (System.currentTimeMillis() % 60_000L) + 50L)
        }
    }

    init {
        orientation = VERTICAL
        gravity = Gravity.CENTER
        time.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        time.gravity = Gravity.CENTER
        time.includeFontPadding = false
        date.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        date.gravity = Gravity.CENTER
        date.includeFontPadding = false
        addView(time, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT))
        addView(date, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply { topMargin = 6 })
    }

    override fun bind(w: WidgetSpec, s: TvState, vh: Float) {
        val p = Palette(s)
        seconds = w.props?.optBoolean("seconds", false) ?: false
        val tz = TimeZone.getTimeZone(s.raw.optString("tz").ifEmpty { "Europe/Istanbul" })
        fmtTime = SimpleDateFormat(if (seconds) "HH:mm:ss" else "HH:mm", Locale("tr", "TR")).also { it.timeZone = tz }
        fmtDate.timeZone = tz
        background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(p.a(p.accent2, 0.14f), p.a(Color.WHITE, 0.03f))).apply {
            cornerRadius = 1.3f * vh
            setStroke(max(1, vh.toInt() / 10), p.a(p.accent2, 0.35f))
        }
        time.setTextColor(p.white)
        date.setTextColor(p.accent2)
        date.letterSpacing = 0.12f
        time.letterSpacing = 0.03f
        // yazı boyutu kutuya göre: sayfadaki fitWidgets ile aynı oranlar
        val cw = (w.w.toFloat() / s.cols) * (vh * 100f * 16f / 9f) // yaklaşık genişlik; gerçek ölçü onSizeChanged'de düzeltilir
        sizeFor(cw, w.h.toFloat() / s.rows * vh * 100f)
        main.removeCallbacks(tick); tick.run()
    }

    private fun sizeFor(wPx: Float, hPx: Float) {
        time.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, max(14f, min(hPx * 0.46f, wPx / (if (seconds) 4.6f else 3.1f))))
        date.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, max(10f, min(hPx * 0.11f, wPx / 18f)))
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (w > 0 && h > 0) sizeFor(w.toFloat(), h.toFloat())
    }

    override fun release() { main.removeCallbacks(tick) }
    override fun onDetachedFromWindow() { main.removeCallbacks(tick); super.onDetachedFromWindow() }
}
