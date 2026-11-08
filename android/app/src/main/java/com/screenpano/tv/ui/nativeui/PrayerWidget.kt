package com.screenpano.tv.ui.nativeui

import android.content.Context
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.widget.FrameLayout
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

/** "Namaz vakitleri / güneş" widget'ı (sayfadaki .wxw[data-k=prayer]): 6 vakit ya da gün doğumu/batımı, sıradaki vakit vurgulu. */
class PrayerWidget(context: Context) : LinearLayout(context), NativeWidget {
    private val tr = Locale("tr", "TR")
    private val main = Handler(Looper.getMainLooper())
    private val names = listOf("İmsak", "Güneş", "Öğle", "İkindi", "Akşam", "Yatsı")
    private val keys = listOf("fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha")
    private var sun = false
    private var raw: org.json.JSONObject? = null
    private var pal: Palette? = null
    private var vhPx = 0f
    private var sig = ""
    private val head = TextView(context).apply { gravity = Gravity.CENTER; setSingleLine(true); includeFontPadding = false; typeface = Typeface.DEFAULT_BOLD }
    private val grid = LinearLayout(context).apply { orientation = VERTICAL }
    private class Cell(val box: LinearLayout, val label: TextView, val value: TextView)
    private val cells = ArrayList<Cell>()
    private var cols = 0
    private val tick = object : Runnable {
        override fun run() { refresh(); main.postDelayed(this, 60_000L - (System.currentTimeMillis() % 60_000L) + 50L) }
    }

    init {
        orientation = VERTICAL; gravity = Gravity.CENTER
        addView(head, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
        addView(grid, LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f))
    }

    private fun dur(ms: Long): String { val m = max(0L, Math.round(ms / 60000.0)); val h = m / 60; return (if (h > 0) "$h sa " else "") + (m % 60) + " dk" }

    override fun bind(w: WidgetSpec, s: TvState, vh: Float) {
        pal = Palette(s, w.props?.optString("tint"))
        vhPx = vh; sun = w.props?.optString("mode") == "sun"
        raw = s.raw.optJSONObject("prayer")
        background = BoxSkin.bg(pal!!, vh, w.props)
        setPadding((vh * 1f).toInt(), (vh * 1f).toInt(), (vh * 1f).toInt(), (vh * 1f).toInt())
        sig = ""
        main.removeCallbacks(tick); tick.run()
    }

    /** Veriden o anki hücre listesini üretir: (ad, saat, sıradaki mi). */
    private fun model(): Pair<String, List<Triple<String, String, Boolean>>> {
        val r = raw ?: return Pair("", emptyList())
        val tz = TimeZone.getTimeZone(r.optString("tz", "Europe/Istanbul"))
        val days = r.optJSONArray("days") ?: return Pair("", emptyList())
        val kf = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = tz }
        val tf = SimpleDateFormat("HH:mm", tr).apply { timeZone = tz }
        val now = Date(); val key = kf.format(now)
        var di = -1
        for (i in 0 until days.length()) if (days.optJSONObject(i)?.optString("date") == key) di = i
        if (di < 0) return Pair("", emptyList())
        val t = days.getJSONObject(di).optJSONObject("t") ?: return Pair("", emptyList())
        fun at(o: org.json.JSONObject?, k: String) = o?.optLong(k, 0L) ?: 0L
        fun f(ms: Long) = tf.format(Date(ms))
        if (sun) {
            val rise = at(t, "sunrise"); val set = at(t, "maghrib")
            return Pair("Gün uzunluğu: ${dur(set - rise)}", listOf(Triple("Gün doğumu", f(rise), false), Triple("Gün batımı", f(set), false)))
        }
        val nowMs = now.time
        var nx = keys.indexOfFirst { at(t, it) > nowMs }
        val nextAt = if (nx >= 0) at(t, keys[nx]) else at(days.optJSONObject(di + 1)?.optJSONObject("t"), "fajr")
        if (nx < 0) nx = 0
        val head = if (nextAt > 0) "Sıradaki: ${names[nx]} · ${dur(nextAt - nowMs)}" else ""
        return Pair(head, keys.mapIndexed { j, k -> Triple(names[j], f(at(t, k)), j == nx) })
    }

    private fun refresh() {
        val p = pal ?: return
        val (h, list) = model()
        val nsig = h + "|" + list.joinToString(",") { it.second + if (it.third) "*" else "" }
        if (nsig == sig) return
        sig = nsig
        head.text = h; head.setTextColor(p.accent2); head.visibility = if (h.isEmpty()) GONE else VISIBLE
        grid.removeAllViews(); cells.clear(); cols = 0
        list.forEach { (n, v, nx) ->
            val label = TextView(context).apply { text = n; setTextColor(p.a(p.white, 0.75f)); gravity = Gravity.CENTER; setSingleLine(true); includeFontPadding = false; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD) }
            val value = TextView(context).apply { text = v; setTextColor(p.white); gravity = Gravity.CENTER; setSingleLine(true); includeFontPadding = false; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD) }
            if (nx) label.setTextColor(p.accent2)
            val box = LinearLayout(context).apply {
                orientation = VERTICAL; gravity = Gravity.CENTER; addView(label); addView(value)
                if (nx) background = GradientDrawable().apply { cornerRadius = vhPx * 0.9f; setColor(p.a(p.accent2, 0.22f)); setStroke(max(1, (vhPx * 0.12f).toInt()), p.a(p.accent2, 0.6f)) }
            }
            cells.add(Cell(box, label, value))
        }
        post { layoutCells() }
    }

    /** Sütun sayısı en-boy oranına göre seçilir (sayfadaki fitX ile aynı), yazılar sığana kadar küçülür. */
    private fun layoutCells() {
        val w = width.toFloat(); val hh = height.toFloat() - paddingTop - paddingBottom; val ww = w - paddingLeft - paddingRight
        if (w <= 0 || hh <= 0 || cells.isEmpty()) return
        val n = cells.size; val asp = ww / hh
        cols = if (n == 2) (if (asp > 1.6f) 2 else 1) else (if (asp > 2.6f) 6 else if (asp > 1.1f) 3 else 2)
        val rows = (n + cols - 1) / cols
        head.setTextSize(TypedValue.COMPLEX_UNIT_PX, max(7f, min(hh * 0.11f, ww / (max(8, head.text.length) * 0.55f))))
        grid.removeAllViews()
        for (r in 0 until rows) {
            val row = LinearLayout(context).apply { orientation = HORIZONTAL }
            for (c in 0 until cols) {
                val i = r * cols + c
                if (i < n) row.addView(cells[i].box, LayoutParams(0, LayoutParams.MATCH_PARENT, 1f).apply { val m = (vhPx * 0.3f).toInt(); setMargins(m, m, m, m) })
                else row.addView(FrameLayout(context), LayoutParams(0, LayoutParams.MATCH_PARENT, 1f))
            }
            grid.addView(row, LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f))
        }
        val ch = (hh - (if (head.visibility == VISIBLE) head.textSize * 1.2f else 0f) - hh * 0.1f) / rows
        val cw = ww / cols - ww * 0.02f
        val nl = max(4, cells.maxOf { it.label.text.length }).toFloat()
        val v0 = max(6f, min(ch * 0.4f, cw / 4.2f)); val l0 = max(6f, min(ch * 0.2f, cw / (nl * 0.6f)))
        var k = 1f
        for (q in 0 until 14) {
            for (c in cells) {
                c.value.setTextSize(TypedValue.COMPLEX_UNIT_PX, v0 * k); c.label.setTextSize(TypedValue.COMPLEX_UNIT_PX, l0 * k)
            }
            val fits = cells.all { c ->
                max(c.label.paint.measureText(c.label.text.toString()), c.value.paint.measureText(c.value.text.toString())) <= cw * 0.95f &&
                    c.label.textSize + c.value.textSize <= ch * 0.95f
            }
            if (fits || k < 0.3f) break
            k *= 0.9f
        }
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) { super.onSizeChanged(w, h, oldw, oldh); post { layoutCells() } }
    override fun release() { main.removeCallbacks(tick) }
    override fun onDetachedFromWindow() { main.removeCallbacks(tick); super.onDetachedFromWindow() }
}
