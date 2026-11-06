package com.screenpano.tv.ui.nativeui

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import coil.load
import com.screenpano.tv.data.model.TvState
import com.screenpano.tv.data.model.WidgetSpec
import org.json.JSONObject
import java.nio.ByteBuffer
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * "Hava ve piyasalar" widget'ı: hava durumu + 3'lü kur satırı (8 sn'de bir USD/EUR/ALTIN ↔ BIST/BITCOIN/STERLİN).
 * QR seçeneği açıksa sayfalar döner: 1) hava+piyasa, sonrası seçili QR'lar (1-2 yan yana, 3+ tek tek), 12 sn'de bir.
 * Geçişler anlık: sürekli animasyon yok, yalnız zamanlayıcı değişince bir kez çizilir.
 */
class RatesWidget(context: Context) : LinearLayout(context), NativeWidget {
    private val main = Handler(Looper.getMainLooper())
    private var vh = 10f
    private var st: TvState? = null
    private var props: JSONObject? = null
    private var rateIdx = 0
    private var viewIdx = 0
    private var sig = ""
    // zamanlayıcılar sunucu saatine hizalı: tüm ekranlar aynı anda aynı sayfayı/kur grubunu gösterir
    private fun aligned(period: Long): Long = period - NativeEnv.now() % period + 30L
    private val rateTick = object : Runnable { override fun run() { rateIdx = (NativeEnv.now() / 8000L).toInt(); renderMain(); main.postDelayed(this, aligned(8000L)) } }
    private val viewTick = object : Runnable { override fun run() { viewIdx = (NativeEnv.now() / 12000L).toInt(); renderViews(); main.postDelayed(this, aligned(12000L)) } }
    private var wifiRunnable: Runnable? = null

    private val nf = { d: Int -> NumberFormat.getNumberInstance(Locale("tr", "TR")).apply { minimumFractionDigits = d; maximumFractionDigits = d } }
    private fun f(x: Double?, d: Int = 2): String = if (x == null || x == 0.0 || x.isNaN()) "--" else nf(d).format(x)
    private fun JSONObject.num(k: String): Double? = if (has(k) && !isNull(k)) optDouble(k).takeIf { !it.isNaN() } else null

    private val content = LinearLayout(context).apply { orientation = VERTICAL; gravity = Gravity.CENTER_VERTICAL }

    init {
        orientation = VERTICAL
        addView(content, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    // Duyarlı ölçek: widget kutusu büyüdükçe yazılar ve simgeler orantılı büyür (referans: ~17vh yükseklik x ~42vh genişlik = 1.0)
    private var baseVh = 10f
    private var spec: WidgetSpec? = null
    private fun fitScale(): Float {
        if (width <= 0 || height <= 0) return 1f
        // içeriğe göre referans ölçü: yalnız hava ya da yalnız piyasa kutusu daha alçak/dar olabilir
        val wx = props?.optBoolean("weather", true) != false; val rt = props?.optBoolean("rates", true) != false; val qr = props?.optBoolean("qr", false) == true
        val refH = if (qr || (wx && rt)) 17f else 9f
        val refW = if (qr || wx) 42f else 30f
        return min(height / (refH * baseVh), width / (refW * baseVh)).coerceIn(0.3f, 2.6f)
    }
    override fun onSizeChanged(w: Int, h: Int, ow: Int, oh: Int) {
        super.onSizeChanged(w, h, ow, oh)
        val sp = spec; val s = st ?: return
        if (sp != null && kotlin.math.abs(baseVh * fitScale() - vh) > baseVh * 0.03f) { sig = ""; post { bind(sp, s, baseVh) } }
    }

    override fun bind(w: WidgetSpec, s: TvState, vh: Float) {
        spec = w; baseVh = vh
        this.vh = vh * fitScale(); st = s; props = w.props
        val p = Palette(s)
        background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(p.a(p.accent2, 0.16f), p.a(Color.WHITE, 0.03f))).apply {
            cornerRadius = 1.3f * vh; setStroke(max(1, (vh * 0.1f).toInt()), p.a(p.accent2, 0.35f))
        }
        setPadding((vh * 1.9f).toInt(), (vh * 1.1f).toInt(), (vh * 1.9f).toInt(), (vh * 1.1f).toInt())
        // veri ya da ayar değişmediyse zamanlayıcıları sıfırlama
        val nsig = listOf(s.raw.optJSONObject("rates"), s.raw.optJSONObject("weather"), w.props, s.raw.optJSONArray("qrs"), s.raw.optString("city"), s.theme).joinToString("|") { it.toString() }
        if (nsig == sig && content.childCount > 0) return
        sig = nsig
        rateIdx = (NativeEnv.now() / 8000L).toInt(); viewIdx = (NativeEnv.now() / 12000L).toInt()
        renderViews()
        main.removeCallbacks(rateTick); main.removeCallbacks(viewTick)
        main.postDelayed(rateTick, aligned(8000L))
        if (views().size > 1) main.postDelayed(viewTick, aligned(12000L))
    }

    private fun txt(t: CharSequence, px: Float, color: Int, bold: Boolean = false, ls: Float = 0f): TextView = FitText(context).apply {
        text = t; setTextSize(TypedValue.COMPLEX_UNIT_PX, px); setTextColor(color); includeFontPadding = false
        typeface = Typeface.create(Typeface.DEFAULT, if (bold) Typeface.BOLD else Typeface.NORMAL); letterSpacing = ls; setSingleLine(true)
    }

    private fun qrList(): List<JSONObject> {
        val s = st ?: return emptyList()
        // T4: SVG'si gelmemiş QR boş sayfa üretmesin
        val all = s.raw.optJSONArray("qrs")?.let { a -> (0 until a.length()).mapNotNull { a.optJSONObject(it) } }?.filter { it.optString("svg").isNotEmpty() } ?: emptyList()
        val ids = (props?.optString("qrs") ?: "").split(",").filter { it.isNotEmpty() }
        return if (ids.isEmpty()) all else all.filter { it.optString("id") in ids }
    }

    private fun hasMain(): Boolean = props?.optBoolean("weather", true) != false || props?.optBoolean("rates", true) != false

    /** Sayfa listesi: -1 = hava/piyasa; 0.. = QR sayfaları. */
    private fun views(): List<Int> {
        if (props?.optBoolean("qr", false) != true) return listOf(-1)
        val l = qrList()
        val pages = if (l.size <= 2) (if (l.isEmpty()) 0 else 1) else l.size
        return (if (hasMain()) listOf(-1) else emptyList()) + (0 until pages).toList()
    }

    private fun renderViews() {
        val vs = views(); if (vs.isEmpty()) { content.removeAllViews(); return }
        val v = vs[viewIdx % vs.size]
        if (v == -1) renderMain() else renderQr(v)
        // T4: sayfa boş çıktıysa (veri yok) kutu boş kalmasın: hava/piyasa sayfasına dön
        if (content.childCount == 0 && v != -1 && hasMain()) { viewIdx = vs.indexOf(-1).coerceAtLeast(0); renderMain() }
    }

    private fun renderMain() {
        val s = st ?: return
        if (views().let { it[viewIdx % it.size] } != -1) return
        val p = Palette(s)
        content.removeAllViews()
        content.gravity = Gravity.CENTER_VERTICAL
        val gap = (vh * 0.9f).toInt()
        val wx = s.raw.optJSONObject("weather")
        if (wx != null && props?.optBoolean("weather", true) != false) {
            val row = LinearLayout(context).apply { orientation = HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            val code = wx.optInt("code")
            val icon = when { code == 0 -> if (wx.optBoolean("day", true)) "☀️" else "🌙"; code <= 2 -> if (wx.optBoolean("day", true)) "⛅" else "☁️"; code == 3 -> "☁️"; code <= 48 -> "🌫️"; code <= 57 -> "🌦️"; code <= 67 -> "🌧️"; code <= 77 -> "❄️"; code <= 82 -> "🌧️"; code <= 86 -> "❄️"; else -> "⛈️" }
            val label = when { code == 0 -> "Açık"; code <= 2 -> "Parçalı bulutlu"; code == 3 -> "Kapalı"; code <= 48 -> "Sisli"; code <= 57 -> "Çisenti"; code <= 67 -> "Yağmurlu"; code <= 77 -> "Karlı"; code <= 82 -> "Sağanak"; code <= 86 -> "Kar sağanağı"; else -> "Gök gürültülü" }
            row.addView(txt(icon, vh * 4.6f, p.white))
            row.addView(txt("${wx.optDouble("temp").roundToInt()}°", vh * 4f, p.white, true), LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply { leftMargin = (vh * 1.4f).toInt() })
            val wd = LinearLayout(context).apply { orientation = VERTICAL }
            wd.addView(txt(label, vh * 1.85f, p.white, true).apply { ellipsize = android.text.TextUtils.TruncateAt.END })
            wd.addView(txt("His. ${wx.optDouble("feels").roundToInt()}° · ${wx.optDouble("wind").roundToInt()} km/s", vh * 1.8f, p.mute, false, 0.03f).apply { ellipsize = android.text.TextUtils.TruncateAt.END }, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply { topMargin = (vh * 0.3f).toInt() })
            row.addView(wd, LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f).apply { leftMargin = (vh * 1.4f).toInt() })
            val city = LinearLayout(context).apply { orientation = VERTICAL; gravity = Gravity.END }
            // uzun konum adı: pencereye sığana kadar yazı küçülür (en çok kutunun %38'i)
            val cityTv = ShrinkText(context, width * 0.38f).apply {
                text = s.raw.optString("city").uppercase(Locale("tr", "TR")); setTextSize(TypedValue.COMPLEX_UNIT_PX, vh * 1.8f); setTextColor(p.accent2); includeFontPadding = false
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD); letterSpacing = 0.06f; setSingleLine(true)
            }
            city.addView(cityTv)
            city.addView(txt("${wx.optDouble("min").roundToInt()}° / ${wx.optDouble("max").roundToInt()}°", vh * 1.8f, p.mute, false, 0.03f), LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply { topMargin = (vh * 0.3f).toInt() })
            row.addView(city)
            content.addView(row, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
        }
        if (props?.optBoolean("rates", true) != false) {
            val r = s.raw.optJSONObject("rates") ?: JSONObject()
            fun chg(v: Double?): CharSequence {
                if (v == null) return ""
                val up = v > 0.005; val dn = v < -0.005
                val str = " " + (if (up) "▲" else if (dn) "▼" else "•") + String.format(Locale("tr", "TR"), "%.1f", abs(v)) + "%"
                return SpannableStringBuilder(str).apply { setSpan(RunSpan(vh * 1.6f, if (up) Color.parseColor("#3ecf4a") else if (dn) Color.parseColor("#ff6b6b") else p.mute, true, 0f), 0, str.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) }
            }
            data class Cell(val name: String, val extra: CharSequence, val value: String, val unit: String)
            val sets = listOf(
                listOf(Cell("USD", "", f(r.num("usd")), "₺"), Cell("EUR", "", f(r.num("eur")), "₺"), Cell("ALTIN", chg(r.num("goldCh")), f(r.num("gold"), 0), "₺")),
                listOf(Cell("BIST 100", chg(r.num("bistCh")), f(r.num("bist"), 0), ""), Cell("BITCOIN", chg(r.num("btcCh")), r.num("btc")?.let { "$" + f(it, 0) } ?: "--", ""), Cell("STERLİN", "", f(r.num("gbp")), "₺")),
            )
            val row = LinearLayout(context).apply { orientation = HORIZONTAL }
            val line = LinearLayout(context).apply { setBackgroundColor(Color.argb(23, 255, 255, 255)) }
            if (wx != null && props?.optBoolean("weather", true) != false) content.addView(line, LayoutParams(LayoutParams.MATCH_PARENT, max(1, (vh * 0.1f).toInt())).apply { topMargin = gap })
            for (c in sets[rateIdx % sets.size]) {
                val col = LinearLayout(context).apply { orientation = VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; setPadding((vh * 0.3f).toInt(), 0, (vh * 0.3f).toInt(), 0) }
                val head = SpannableStringBuilder(c.name).apply { setSpan(RunSpan(vh * 1.6f, p.accent2, true, 0.06f), 0, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE); append(c.extra) }
                col.addView(TextView(context).apply { text = head; includeFontPadding = false; setSingleLine(true); gravity = Gravity.CENTER })
                val vtxt = SpannableStringBuilder(c.value).apply { setSpan(RunSpan(vh * 2.6f, p.white, true, 0f), 0, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE); if (c.unit.isNotEmpty()) { val a = length; append(" " + c.unit); setSpan(RunSpan(vh * 2f, p.mute, false, 0f), a, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) } }
                col.addView(TextView(context).apply { text = vtxt; includeFontPadding = false; setSingleLine(true); gravity = Gravity.CENTER }, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply { topMargin = (vh * 0.3f).toInt() })
                row.addView(col, LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
            }
            content.addView(row, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply { topMargin = gap; })
        }
    }

    private fun renderQr(v: Int) {
        val s = st ?: return
        val p = Palette(s)
        wifiRunnable?.let { main.removeCallbacks(it) }
        content.removeAllViews(); content.gravity = Gravity.CENTER
        val l = qrList()
        val pg = if (l.size <= 2) l else listOfNotNull(l.getOrNull(v))
        val row = LinearLayout(context).apply { orientation = HORIZONTAL; gravity = Gravity.CENTER }
        for (q in pg) {
            val col = LinearLayout(context).apply { orientation = VERTICAL; gravity = Gravity.CENTER }
            val box = FrameLayout(context)
            val iv = ImageView(context).apply { scaleType = ImageView.ScaleType.FIT_CENTER }
            val pad = (vh * 0.4f).toInt()
            box.setPadding(pad, pad, pad, pad)
            box.background = GradientDrawable().apply { setColor(Color.WHITE); cornerRadius = vh; setStroke(max(1, (vh * 0.18f).toInt()), p.a(p.accent2, 0.85f)) }
            box.addView(iv, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            val svg = q.optString("svg")
            if (svg.isNotEmpty()) iv.load(ByteBuffer.wrap(svg.toByteArray())) { crossfade(false) }
            val lbl = TextView(context).apply {
                setTextSize(TypedValue.COMPLEX_UNIT_PX, vh * 1.8f); setTextColor(Color.WHITE); includeFontPadding = false; setSingleLine(true)
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD); letterSpacing = 0.08f; gravity = Gravity.CENTER
                setPadding((vh * 1.2f).toInt(), 0, (vh * 1.2f).toInt(), 0)
                background = GradientDrawable().apply { setColor(Color.argb(235, 10, 8, 6)); cornerRadius = 2f * vh; setStroke(max(1, (vh * 0.15f).toInt()), p.al) }
                text = q.optString("label").uppercase(Locale("tr", "TR"))
            }
            col.addView(box, LayoutParams(0, 0).also { it.width = 10; it.height = 10 }) // gerçek boyut onLayout'ta
            col.addView(lbl, LayoutParams(LayoutParams.MATCH_PARENT, (vh * 3.2f).toInt()).apply { topMargin = (vh * 0.6f).toInt() })
            row.addView(col, LayoutParams(0, LayoutParams.MATCH_PARENT, 1f).apply { if (pg.size > 1) { leftMargin = (vh * 0.7f).toInt(); rightMargin = (vh * 0.7f).toInt() } })
            // QR karesi: sütun genişliğine ve (yükseklik - etiket) alanına sığan en büyük kare
            col.addOnLayoutChangeListener { _, l0, t0, r0, b0, _, _, _, _ ->
                val side = min(r0 - l0, b0 - t0 - (vh * 4f).toInt())
                val lp = box.layoutParams
                if (side > 0 && (lp.width != side || lp.height != side)) { lp.width = side; lp.height = side; box.layoutParams = lp }
            }
            // Wi-Fi: etiket ile şifre sırayla değişir (4 sn / 7 sn)
            val mq = q.optString("marquee")
            if (mq.isNotEmpty()) {
                var ph = 0
                val r = object : Runnable { override fun run() { ph = ph xor 1; lbl.text = if (ph == 1) mq else q.optString("label").uppercase(Locale("tr", "TR")); lbl.setTextColor(if (ph == 1) p.al else Color.WHITE); main.postDelayed(this, if (ph == 1) 7000L else 4000L) } }
                wifiRunnable = r; main.postDelayed(r, 4000)
            }
        }
        content.addView(row, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    override fun release() { main.removeCallbacksAndMessages(null) }
    override fun onDetachedFromWindow() { release(); super.onDetachedFromWindow() }
}


/** Tek satır yazı: verilen en büyük genişliğe sığana kadar boyutu küçültür (harf aralığı dahil), asla kesmez. */
internal class ShrinkText(context: Context, private val capPx: Float) : TextView(context) {
    private var base = 0f
    override fun onMeasure(w: Int, h: Int) {
        if (base == 0f) base = textSize
        val t = text?.toString() ?: ""
        val avail = (if (MeasureSpec.getMode(w) == MeasureSpec.UNSPECIFIED) capPx else minOf(capPx, MeasureSpec.getSize(w).toFloat())) - paddingLeft - paddingRight - 2
        var size = base
        while (size > base * 0.4f) {
            paint.textSize = size
            if (paint.measureText(t) + letterSpacing * size * t.length <= avail) break
            size *= 0.94f
        }
        setTextSize(TypedValue.COMPLEX_UNIT_PX, size)
        super.onMeasure(w, h)
        val need = (paint.measureText(t) + letterSpacing * size * t.length + paddingLeft + paddingRight + 2).toInt()
        if (measuredWidth < need) setMeasuredDimension(need, measuredHeight)
    }
}
