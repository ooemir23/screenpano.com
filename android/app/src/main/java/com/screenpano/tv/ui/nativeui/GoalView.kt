package com.screenpano.tv.ui.nativeui

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject
import kotlin.math.min

/**
 * Gol duyurusu kartı (bilgi paneli hücresinin üstünde; animasyonsuz). Renkleri sayfa hesaplayıp yollar:
 * { league, home, away, hs, as, side, player, minute, tag, gc, gd, gc2 } (renkler "#rrggbb").
 */
class GoalView(context: Context) : FrameLayout(context) {
    private var data: JSONObject? = null
    private var vh = 0f
    fun bind(d: JSONObject, vh: Float) { data = d; this.vh = vh; if (width > 0 && height > 0) build() }
    override fun onSizeChanged(w: Int, h: Int, ow: Int, oh: Int) { super.onSizeChanged(w, h, ow, oh); if (data != null && w > 0 && h > 0) build() }

    private fun col(s: String?, def: Int): Int = try { Color.parseColor(s) } catch (_: Exception) { def }
    private fun al(c: Int, a: Float) = Color.argb((a * 255).toInt(), Color.red(c), Color.green(c), Color.blue(c))

    private fun build() {
        val d = data ?: return
        removeAllViews()
        val W = width.toFloat()
        val gc = col(d.optString("gc"), Color.parseColor("#c8963c")); val gd = col(d.optString("gd"), Color.parseColor("#4a3410")); val gc2 = col(d.optString("gc2"), Color.parseColor("#f7e7c8"))
        // vh birimi, kartın dar olduğu yerde taşmasın diye genişliğe de bağlanır
        val u = min(vh, W / 30f)
        fun tv(t: String, size: Float, color: Int, bold: Boolean = true): TextView = FitText(context).apply {
            text = t; includeFontPadding = false; setTextColor(color); setTextSize(TypedValue.COMPLEX_UNIT_PX, size)
            typeface = Typeface.create(Typeface.DEFAULT, if (bold) Typeface.BOLD else Typeface.NORMAL)
        }
        background = GradientDrawable().apply {
            gradientType = GradientDrawable.RADIAL_GRADIENT; gradientRadius = height * 1.1f; setGradientCenter(0.5f, 0f)
            colors = intArrayOf(gc, gd, Color.parseColor("#141414")); cornerRadius = 1.48f * vh; setStroke(vh.toInt().coerceAtLeast(1) / 8 + 1, al(gc2, 0.6f))
        }
        val box = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setPadding((W * 0.04f).toInt(), (2 * vh).toInt(), (W * 0.04f).toInt(), (2 * vh).toInt()) }
        box.addView(tv("⚽", 7 * u, Color.WHITE, false).apply { gravity = Gravity.CENTER }, LinearLayout.LayoutParams(-1, -2))
        box.addView(tv("GOL!", 8.5f * u, Color.WHITE).apply { letterSpacing = 0.12f; setShadowLayer(u * 2, 0f, u * 0.6f, Color.argb(130, 0, 0, 0)) }, LinearLayout.LayoutParams(-2, -2).also { it.topMargin = (0.6f * u).toInt() })
        val lg = d.optString("league")
        if (lg.isNotEmpty()) box.addView(tv(lg.uppercase(java.util.Locale("tr", "TR")), 1.5f * u, gc2, false).apply { letterSpacing = 0.3f; gravity = Gravity.CENTER })
        val teams = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL; setPadding((0.03f * W).toInt(), (1.4f * u).toInt(), (0.03f * W).toInt(), (1.4f * u).toInt())
            background = GradientDrawable().apply { setColor(Color.argb(90, 0, 0, 0)); cornerRadius = 1.3f * vh; setStroke(1, al(gc, 0.3f)) }
        }
        fun row(name: String, score: String, scoring: Boolean) = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
            setPadding((0.03f * W).toInt(), (0.45f * u).toInt(), (0.03f * W).toInt(), (0.45f * u).toInt())
            if (scoring) background = GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, intArrayOf(al(gc, 0.95f), al(gc, 0.38f), 0)).apply { cornerRadius = 1.1f * vh }
            alpha = if (scoring) 1f else 0.7f
            val n = tv((if (scoring) "⚽ " else "") + name, (if (scoring) 3.4f else 3f) * u, if (scoring) Color.WHITE else Color.parseColor("#e8dcc8"), scoring).apply { setSingleLine(true); ellipsize = TextUtils.TruncateAt.END }
            addView(n, LinearLayout.LayoutParams(0, -2, 1f))
            addView(tv(score, (if (scoring) 4.6f else 4f) * u, if (scoring) gc2 else Color.parseColor("#e8dcc8")).apply { gravity = Gravity.END }, LinearLayout.LayoutParams(-2, -2))
        }
        val side = d.optString("side")
        teams.addView(row(d.optString("home"), d.optString("hs"), side == "home"), LinearLayout.LayoutParams(-1, -2))
        teams.addView(row(d.optString("away"), d.optString("as"), side == "away"), LinearLayout.LayoutParams(-1, -2).also { it.topMargin = (0.8f * u).toInt() })
        box.addView(teams, LinearLayout.LayoutParams(-1, -2).also { it.topMargin = (2 * u).toInt() })
        box.addView(tv(d.optString("player").ifEmpty { "Gol!" }, 3.4f * u, Color.WHITE).apply { gravity = Gravity.CENTER; maxLines = 2; ellipsize = TextUtils.TruncateAt.END }, LinearLayout.LayoutParams(-1, -2).also { it.topMargin = (2.4f * u).toInt() })
        val sub = listOf(d.optString("minute"), d.optString("tag")).filter { it.isNotEmpty() }.joinToString(" · ")
        if (sub.isNotEmpty()) box.addView(tv(sub, 2.2f * u, gc2, false).apply { letterSpacing = 0.08f; gravity = Gravity.CENTER }, LinearLayout.LayoutParams(-2, -2).also { it.topMargin = (0.6f * u).toInt() })
        addView(box, LayoutParams(-1, -1))
        post { requestLayout() } // yerleşim geçişi sırasında eklenen çocuklar bir sonraki geçişte ölçülsün
    }
}
