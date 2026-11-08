package com.screenpano.tv.ui.nativeui

import android.content.Context
import android.graphics.Typeface
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
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

/** "Dünya saatleri" widget'ı (sayfadaki .wwc): seçilen şehirlerin saati yan yana, altında dün/bugün/yarın. */
class WorldClockWidget(context: Context) : LinearLayout(context), NativeWidget {
    private class Col(val name: TextView, val time: TextView, val day: TextView, val col: LinearLayout, val tz: TimeZone)

    private val tr = Locale("tr", "TR")
    private val main = Handler(Looper.getMainLooper())
    private val cols = ArrayList<Col>()
    private var seconds = false
    private var fmt = SimpleDateFormat("HH:mm", tr)
    private val dayFmt = SimpleDateFormat("yyyyMMdd", tr)
    private val home = TimeZone.getTimeZone("Europe/Istanbul")
    private val tick = object : Runnable {
        override fun run() {
            val d = Date()
            dayFmt.timeZone = home
            val h = dayFmt.format(d)
            var changed = false
            for (c in cols) {
                fmt.timeZone = c.tz
                val t = fmt.format(d)
                dayFmt.timeZone = c.tz
                val z = dayFmt.format(d)
                val dl = if (z > h) "yarın" else if (z < h) "dün" else "bugün"
                if (c.time.text.toString() != t || c.day.text.toString() != dl) { c.time.text = t; c.day.text = dl; changed = true }
            }
            if (changed && width > 0 && height > 0) fit(width.toFloat(), height.toFloat())
            main.postDelayed(this, if (seconds) 1000L else 60_000L - (System.currentTimeMillis() % 60_000L) + 50L)
        }
    }

    init { orientation = HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }

    private fun label(c: Context, bold: Boolean): TextView = TextView(c).apply {
        typeface = Typeface.create(Typeface.DEFAULT, if (bold) Typeface.BOLD else Typeface.NORMAL)
        gravity = Gravity.CENTER; includeFontPadding = false; maxLines = 1
    }

    override fun bind(w: WidgetSpec, s: TvState, vh: Float) {
        val p = Palette(s, w.props?.optString("tint"))
        seconds = w.props?.optBoolean("seconds", false) ?: false
        fmt = SimpleDateFormat(if (seconds) "HH:mm:ss" else "HH:mm", tr)
        background = BoxSkin.bg(p, vh, w.props)
        val arr = w.props?.optJSONArray("cities")
        val ids = ArrayList<Pair<String, String>>() // saat dilimi, Türkçe ad
        if (arr != null) for (i in 0 until min(5, arr.length())) {
            val o = arr.optJSONObject(i) ?: continue
            ids.add(Pair(o.optString("tz"), o.optJSONObject("n")?.optString("tr").orEmpty().ifEmpty { o.optString("tz") }))
        }
        // şehir listesi değiştiyse sütunları yeniden kur
        if (ids.map { it.first } != cols.map { it.tz.id } || childCount == 0) {
            removeAllViews(); cols.clear()
            ids.forEachIndexed { i, (tz, nm) ->
                if (i > 0) addView(View(context), LayoutParams(max(1, (vh * 0.1f).toInt()), LayoutParams.MATCH_PARENT).apply { topMargin = (vh * 1.2f).toInt(); bottomMargin = (vh * 1.2f).toInt() })
                val name = label(context, true).apply { text = nm.uppercase(tr); letterSpacing = 0.1f }
                val time = label(context, true)
                val day = label(context, false)
                val col = LinearLayout(context).apply { orientation = VERTICAL; gravity = Gravity.CENTER; addView(name); addView(time); addView(day) }
                addView(col, LayoutParams(0, LayoutParams.MATCH_PARENT, 1f))
                cols.add(Col(name, time, day, col, TimeZone.getTimeZone(tz)))
            }
        }
        for (i in 0 until childCount) { val v = getChildAt(i); if (v !is LinearLayout) v.setBackgroundColor(p.a(p.accent2, 0.25f)) }
        for (c in cols) {
            c.name.setTextColor(p.accent2); c.time.setTextColor(p.white); c.day.setTextColor(p.a(p.white, 0.7f))
            c.time.letterSpacing = 0.02f
        }
        main.removeCallbacks(tick); tick.run()
        post { if (width > 0 && height > 0) fit(width.toFloat(), height.toFloat()) }
    }

    /** Yazılar sütuna sığana kadar ölçülür ve küçültülür (sayfadaki fitWorld ile aynı oranlar). */
    private fun fit(wPx: Float, hPx: Float) {
        if (cols.isEmpty()) return
        val zw = wPx / cols.size
        val nl = max(6, cols.maxOf { it.name.text.length }).toFloat()
        val t0 = max(6f, min(hPx * 0.4f, zw / (if (seconds) 4.9f else 3.5f)))
        val n0 = max(6f, min(hPx * 0.15f, zw / (nl * 0.78f)))
        var k = 1f
        for (q in 0 until 16) {
            for (c in cols) {
                c.name.setTextSize(TypedValue.COMPLEX_UNIT_PX, max(6f, n0 * k))
                c.time.setTextSize(TypedValue.COMPLEX_UNIT_PX, max(6f, t0 * k))
                c.day.setTextSize(TypedValue.COMPLEX_UNIT_PX, max(6f, n0 * 0.9f * k))
            }
            val fits = cols.all { c ->
                val widest = maxOf(c.name.paint.measureText(c.name.text.toString()) + c.name.letterSpacing * c.name.textSize * c.name.text.length,
                    c.time.paint.measureText(c.time.text.toString()), c.day.paint.measureText(c.day.text.toString()))
                val tall = c.name.textSize + c.time.textSize + c.day.textSize
                widest <= zw * 0.92f && tall <= hPx * 0.95f
            }
            if (fits || k < 0.25f) break
            k *= 0.9f
        }
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (w > 0 && h > 0) fit(w.toFloat(), h.toFloat())
    }

    override fun release() { main.removeCallbacks(tick) }
    override fun onDetachedFromWindow() { main.removeCallbacks(tick); super.onDetachedFromWindow() }
}
