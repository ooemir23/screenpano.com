package com.screenpano.tv.ui.nativeui

import android.content.Context
import android.graphics.Typeface
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import com.screenpano.tv.data.model.TvState
import com.screenpano.tv.data.model.WidgetSpec
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.max
import kotlin.math.min

/** "Döviz çevirici" widget'ı (sayfadaki .wxw[data-k=converter]): "100 USD → 5.015,75 ₺" satırları. */
class ConverterWidget(context: Context) : LinearLayout(context), NativeWidget {
    private class Row(val label: TextView, val value: TextView, val line: LinearLayout)
    private val tr = Locale("tr", "TR")
    private val rows = ArrayList<Row>()
    private var sig = ""

    init { orientation = VERTICAL; gravity = Gravity.CENTER }

    private fun fmt(v: Double, dg: Int): String = NumberFormat.getNumberInstance(tr).apply { minimumFractionDigits = dg; maximumFractionDigits = dg }.format(v)

    override fun bind(w: WidgetSpec, s: TvState, vh: Float) {
        val p = Palette(s, w.props?.optString("tint"))
        background = BoxSkin.bg(p, vh, w.props)
        setPadding((vh * 1f).toInt(), (vh * 1f).toInt(), (vh * 1f).toInt(), (vh * 1f).toInt())
        val r = s.raw.optJSONObject("rates")
        val amt = w.props?.optString("amount")?.replace(',', '.')?.toDoubleOrNull()?.takeIf { it > 0 } ?: 100.0
        val rate = mapOf("USD" to r?.optDouble("usd"), "EUR" to r?.optDouble("eur"), "GBP" to r?.optDouble("gbp"), "XAU" to r?.optDouble("gold"))
        val list = (w.props?.optString("currencies").orEmpty().ifEmpty { "USD,EUR,GBP" }).split(",").map { it.trim() }.filter { rate.containsKey(it) }.take(4)
        val ad = if (amt % 1.0 != 0.0) 2 else 0
        val data = list.map { c ->
            val v = rate[c] ?: 0.0
            val lbl = if (c == "XAU") "${fmt(amt, ad)} gr altın" else "${fmt(amt, ad)} $c"
            Pair(lbl, if (v > 0 && !v.isNaN()) fmt(amt * v, if (amt * v >= 1e6) 0 else 2) + " ₺" else "—")
        }
        val nsig = data.joinToString("|") { it.first + it.second } + p.accent2
        if (nsig != sig) {
            sig = nsig; removeAllViews(); rows.clear()
            data.forEachIndexed { i, (l, v) ->
                val label = TextView(context).apply { text = l; setTextColor(p.accent2); setSingleLine(true); includeFontPadding = false; typeface = Typeface.DEFAULT_BOLD }
                val value = TextView(context).apply { text = v; setTextColor(p.white); setSingleLine(true); includeFontPadding = false; gravity = Gravity.END; typeface = Typeface.DEFAULT_BOLD }
                val line = LinearLayout(context).apply {
                    orientation = HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding((vh * 0.6f).toInt(), 0, (vh * 0.6f).toInt(), 0)
                    addView(label, LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f)); addView(value, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT))
                }
                addView(line, LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f))
                if (i < data.size - 1) addView(View(context).apply { setBackgroundColor(p.a(p.accent2, 0.25f)) }, LayoutParams(LayoutParams.MATCH_PARENT, max(1, (vh * 0.1f).toInt())))
                rows.add(Row(label, value, line))
            }
        }
        post { fit() }
    }

    private fun fit() {
        val w = width.toFloat() - paddingLeft - paddingRight; val h = height.toFloat() - paddingTop - paddingBottom
        if (w <= 0 || h <= 0 || rows.isEmpty()) return
        val rh = h / rows.size * 0.8f; var k = 1f
        for (q in 0 until 14) {
            for (r in rows) {
                r.value.setTextSize(TypedValue.COMPLEX_UNIT_PX, max(6f, min(rh * 0.5f, w / 9f) * k))
                r.label.setTextSize(TypedValue.COMPLEX_UNIT_PX, max(6f, min(rh * 0.3f, w / 14f) * k))
            }
            val fits = rows.all { r -> r.label.paint.measureText(r.label.text.toString()) + r.value.paint.measureText(r.value.text.toString()) + w * 0.06f <= w }
            if (fits || k < 0.3f) break
            k *= 0.9f
        }
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) { super.onSizeChanged(w, h, oldw, oldh); post { fit() } }
    override fun release() {}
}
