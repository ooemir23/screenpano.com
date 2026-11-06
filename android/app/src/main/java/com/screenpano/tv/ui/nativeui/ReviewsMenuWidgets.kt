package com.screenpano.tv.ui.nativeui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.TextUtils
import android.text.style.StrikethroughSpan
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import com.screenpano.tv.data.model.TvState
import com.screenpano.tv.data.model.WidgetSpec
import org.json.JSONObject
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone
import kotlin.math.max
import kotlin.math.min

private fun cardBg(p: Palette, vh: Float) = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(p.a(p.accent2, 0.14f), p.a(Color.WHITE, 0.03f))).apply {
    cornerRadius = 1.3f * vh; setStroke(max(1, (vh * 0.1f).toInt()), p.a(p.accent2, 0.35f))
}

/** "Google yorumları" şeridi: 10 sn'de bir sıradaki yorum (sunucu saatine göre, tüm ekranlarda aynı). */
class ReviewsWidget(context: Context) : LinearLayout(context), NativeWidget {
    private val main = Handler(Looper.getMainLooper())
    private val g = TextView(context)
    private val stars = TextView(context)
    private val quote = TextView(context)
    private val who = TextView(context)
    private var st: TvState? = null
    private var vh = 10f
    private val tick = object : Runnable {
        override fun run() { show(); val now = System.currentTimeMillis(); main.postDelayed(this, 10_000L - now % 10_000L + 20L) }
    }

    init {
        orientation = HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
        for (t in listOf(g, stars, quote, who)) { t.includeFontPadding = false }
        quote.maxLines = 2; quote.ellipsize = TextUtils.TruncateAt.END
        who.setSingleLine(true); who.ellipsize = TextUtils.TruncateAt.END; who.gravity = Gravity.END
        addView(g); addView(stars); addView(quote, LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f)); addView(who)
    }

    override fun bind(w: WidgetSpec, s: TvState, vh: Float) {
        st = s; this.vh = vh
        val p = Palette(s)
        background = cardBg(p, vh)
        setPadding((vh * 2.9f).toInt(), 0, (vh * 2.9f).toInt(), 0)
        quote.setTextSize(TypedValue.COMPLEX_UNIT_PX, vh * 2.3f); quote.setTextColor(p.white)
        stars.setTextSize(TypedValue.COMPLEX_UNIT_PX, vh * 3.2f); stars.setTextColor(Color.parseColor("#f5b73b")); stars.letterSpacing = 0.1f
        who.setTextSize(TypedValue.COMPLEX_UNIT_PX, vh * 1.8f); who.setTextColor(p.accent2); who.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        who.maxWidth = (resources.displayMetrics.widthPixels * 0.16f).toInt()
        for (t in listOf(stars, quote, who)) (t.layoutParams as LayoutParams).leftMargin = (vh * 2.5f).toInt()
        main.removeCallbacks(tick); tick.run()
    }

    private fun show() {
        val s = st ?: return
        val p = Palette(s)
        val arr = s.raw.optJSONArray("reviews")
        if (arr == null || arr.length() == 0) { visibility = INVISIBLE; return }
        visibility = VISIBLE
        val idx = ((System.currentTimeMillis() / 1000) / 10 % arr.length()).toInt()
        val r = arr.optJSONObject(idx) ?: return
        val gr = s.raw.optJSONObject("googleRating")
        val head = SpannableStringBuilder("Google").apply {
            setSpan(RunSpan(vh * 2.8f, Color.parseColor("#4285f4"), true, 0.02f), 0, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            append("\n")
            val sub = if (gr != null) String.format(Locale("tr", "TR"), "%s ★ · %d yorum", gr.optString("rating").replace('.', ','), gr.optInt("count")) else "Yorumlar"
            val a = length; append(sub.uppercase(Locale("tr", "TR"))); setSpan(RunSpan(vh * 1.1f, p.mute, false, 0.2f), a, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
        g.text = head; g.gravity = Gravity.CENTER; g.setTextColor(p.white)
        val rt = r.optInt("rating").coerceIn(0, 5)
        stars.text = "★".repeat(rt) + "☆".repeat(5 - rt)
        quote.text = "“" + r.optString("text") + "”"
        who.text = r.optString("author")
    }

    override fun release() { main.removeCallbacksAndMessages(null) }
    override fun onDetachedFromWindow() { release(); super.onDetachedFromWindow() }
}

/** Noktalı ayraç çizgisi (ürün adı ile fiyat arasında). */
private class DotsView(context: Context, color: Int, private val px: Float) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color; strokeWidth = px; style = Paint.Style.STROKE; pathEffect = DashPathEffect(floatArrayOf(px, px * 2.2f), 0f) }
    override fun onDraw(c: Canvas) { val y = height - px; c.drawLine(0f, y, width.toFloat(), y, paint) }
}

/**
 * "Fiyat tarifesi" widget'ı: kategori başlıkları ve ürün-fiyat satırları; sığmayan satırlar sayfalara bölünür
 * (genişliğe göre 1-3 sütun) ve 12 sn'de bir sıradaki sayfaya geçilir. Zamanlanmış kategoriler yayın saatinde açılıp kapanır.
 */
class MenuWidget(context: Context) : LinearLayout(context), NativeWidget {
    private val main = Handler(Looper.getMainLooper())
    private val title = TextView(context)
    private val pg = TextView(context)
    private val body = LinearLayout(context)
    private val head = LinearLayout(context)
    private val line = View(context)
    private var st: TvState? = null
    private var vh = 10f
    private var key = ""
    private var dirty = true
    private var pages: List<List<List<Row>>> = emptyList()
    private var ncol = 1
    private var idx = 0
    private var p: Palette? = null
    private var currency = "₺"
    private var lastW = 0; private var lastH = 0

    private class Row(val cat: String?, val name: String = "", val desc: String = "", val price: String = "", val was: String = "")

    private val rotate = object : Runnable { override fun run() { idx++; showPage(); main.postDelayed(this, 12_000) } }
    private val recheck = object : Runnable { override fun run() { markDirty(); main.postDelayed(this, 30_000) } }

    init {
        orientation = VERTICAL
        head.orientation = HORIZONTAL; head.gravity = Gravity.BOTTOM
        title.includeFontPadding = false; title.setSingleLine(true); title.ellipsize = TextUtils.TruncateAt.END
        pg.includeFontPadding = false
        head.addView(title, LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f)); head.addView(pg)
        addView(head, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
        addView(line, LayoutParams(LayoutParams.MATCH_PARENT, 1))
        body.orientation = HORIZONTAL; body.clipChildren = true
        addView(body, LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f))
    }

    override fun bind(w: WidgetSpec, s: TvState, vh: Float) {
        st = s; this.vh = vh; p = Palette(s)
        val pal = p!!
        background = cardBg(pal, vh)
        setPadding((vh * 2.5f).toInt(), (vh * 1.8f).toInt(), (vh * 2.5f).toInt(), (vh * 1.2f).toInt())
        title.setTextSize(TypedValue.COMPLEX_UNIT_PX, vh * 3f); title.setTextColor(pal.white); title.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD); title.letterSpacing = 0.12f
        pg.setTextSize(TypedValue.COMPLEX_UNIT_PX, vh * 1.5f); pg.setTextColor(pal.mute); pg.letterSpacing = 0.14f; pg.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        head.setPadding(0, 0, 0, (vh * 1.2f).toInt())
        line.setBackgroundColor(pal.a(pal.accent2, 0.5f))
        (line.layoutParams as LayoutParams).height = max(1, (vh * 0.15f).toInt())
        (line.layoutParams as LayoutParams).bottomMargin = (vh * 0.6f).toInt()
        val m = s.raw.optJSONObject("menu")
        currency = m?.optString("currency")?.takeIf { it.isNotEmpty() } ?: "₺"
        val wp = w.props
        title.text = (wp?.optString("title")?.takeIf { it.isNotEmpty() } ?: m?.optString("title")?.takeIf { it.isNotEmpty() } ?: "Fiyat Listesi").uppercase(Locale("tr", "TR"))
        markDirty()
        main.removeCallbacks(recheck); main.postDelayed(recheck, 30_000)
    }

    private fun markDirty() { dirty = true; if (body.width > 0) post { repaginate() } }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        super.onLayout(changed, l, t, r, b)
        if (body.width > 0 && (dirty || body.width != lastW || body.height != lastH)) post { repaginate() }
    }

    private fun active(sch: JSONObject?, tz: TimeZone): Boolean {
        if (sch == null) return true
        val cal = Calendar.getInstance(tz)
        val ymd = String.format(Locale.US, "%04d-%02d-%02d", cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DAY_OF_MONTH))
        val hm = String.format(Locale.US, "%02d:%02d", cal.get(Calendar.HOUR_OF_DAY), cal.get(Calendar.MINUTE))
        val dow = (cal.get(Calendar.DAY_OF_WEEK) + 5) % 7 + 1 // Pzt=1 … Paz=7
        val start = sch.optString("start"); val end = sch.optString("end"); val from = sch.optString("from"); val to = sch.optString("to")
        if (start.isNotEmpty() && ymd < start) return false
        if (end.isNotEmpty() && ymd > end) return false
        val days = sch.optJSONArray("days")?.let { a -> (0 until a.length()).map { a.optInt(it) } }
        if (from.isNotEmpty() && to.isNotEmpty()) {
            val inside = if (from < to) hm >= from && hm < to else hm >= from || hm < to
            if (!inside) return false
            val d = if (from > to && hm < to) (dow + 5) % 7 + 1 else dow
            if (days != null && d !in days) return false
        } else if (days != null && dow !in days) return false
        return true
    }

    private fun fmtPrice(pr: String): String = if (Regex("^\\d+([.,]\\d+)?$").matches(pr.trim())) "$pr $currency" else pr

    private fun rows(): List<Row> {
        val s = st ?: return emptyList()
        val tz = TimeZone.getTimeZone(s.raw.optString("tz").ifEmpty { "Europe/Istanbul" })
        val out = ArrayList<Row>()
        val cats = s.raw.optJSONObject("menu")?.optJSONArray("categories") ?: return out
        for (i in 0 until cats.length()) {
            val c = cats.optJSONObject(i) ?: continue
            if (!active(c.optJSONObject("sch"), tz)) continue
            val cn = c.optString("name"); if (cn.isNotEmpty()) out.add(Row(cn))
            val items = c.optJSONArray("items") ?: continue
            for (j in 0 until items.length()) {
                val it = items.optJSONObject(j) ?: continue
                val kcal = it.optString("kcal").takeIf { k -> k.isNotEmpty() && k != "null" }
                val desc = it.optString("desc").let { d -> if (d == "null") "" else d }
                val sub = listOfNotNull(desc.takeIf { d -> d.isNotEmpty() }, kcal?.let { k -> "🔥 $k" }).joinToString(" · ")
                val off = it.optBoolean("off")
                val was = it.optString("was").let { w -> if (off || w == "null") "" else w } // indirim saati: eski fiyat üstü çizili
                out.add(Row(null, it.optString("name"), sub, if (off) "Tükendi" else fmtPrice(it.optString("price")), if (was.isNotEmpty()) fmtPrice(was) else ""))
            }
        }
        return out
    }

    private fun rowView(r: Row): View {
        val pal = p!!
        if (r.cat != null) return TextView(context).apply {
            text = r.cat.uppercase(Locale("tr", "TR")); setTextSize(TypedValue.COMPLEX_UNIT_PX, vh * 1.75f); setTextColor(pal.accent2)
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD); letterSpacing = 0.24f; includeFontPadding = false
            setPadding(0, (vh * 1.4f).toInt(), 0, (vh * 0.5f).toInt())
        }
        val row = LinearLayout(context).apply { orientation = HORIZONTAL; setPadding(0, (vh * 0.75f).toInt(), 0, (vh * 0.75f).toInt()) }
        val nm = SpannableStringBuilder(r.name).apply {
            setSpan(RunSpan(vh * 2.5f, pal.white, true, 0f), 0, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            if (r.desc.isNotEmpty()) { append("\n"); val a = length; append(r.desc); setSpan(RunSpan(vh * 1.5f, pal.mute, false, 0f), a, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) }
        }
        row.addView(TextView(context).apply { text = nm; includeFontPadding = false }, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply { })
        row.addView(DotsView(context, Color.argb(71, 255, 255, 255), max(1f, vh * 0.2f)), LayoutParams(0, (vh * 2.2f).toInt(), 1f).apply { leftMargin = (vh * 0.6f).toInt(); rightMargin = (vh * 0.6f).toInt() })
        val pr = SpannableStringBuilder().apply {
            if (r.was.isNotEmpty()) {
                append(r.was); setSpan(RunSpan(vh * 1.8f, pal.mute, false, 0f), 0, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                setSpan(StrikethroughSpan(), 0, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE); append("  ")
            }
            val a = length; append(r.price); setSpan(RunSpan(vh * 2.6f, pal.accent2, false, 0f), a, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
        // fiyat eskisi gibi gerçek kalın yazı tipiyle (RunSpan'ın sahte kalını değil)
        row.addView(TextView(context).apply { text = pr; setTextSize(TypedValue.COMPLEX_UNIT_PX, vh * 2.6f); setTextColor(pal.accent2); typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD); includeFontPadding = false; setSingleLine(true) })
        return row
    }

    private fun repaginate() {
        val s = st ?: return
        if (body.width <= 0 || body.height <= 0 || p == null) return
        dirty = false; lastW = body.width; lastH = body.height
        val all = rows()
        val k = all.joinToString("¦") { (it.cat ?: "") + "|" + it.name + "|" + it.desc + "|" + it.price + "|" + it.was } + "#" + lastW + "x" + lastH + "#" + title.text + currency
        if (k == key) return
        key = k
        main.removeCallbacks(rotate)
        if (all.isEmpty()) {
            pages = emptyList(); body.removeAllViews(); pg.text = ""
            body.addView(TextView(context).apply { text = "Panelde Fiyat Listesi bölümünden ürün ekleyin."; setTextColor(p!!.mute); setTextSize(TypedValue.COMPLEX_UNIT_PX, vh * 2f); setPadding(0, (vh * 2f).toInt(), 0, 0) })
            return
        }
        val sw = resources.displayMetrics.widthPixels
        val gap = sw * 0.02f
        val W = body.width.toFloat()
        ncol = if (W > sw * 0.42f) (if (W > sw * 0.75f) 3 else 2) else 1
        val colW = ((W - gap * (ncol - 1)) / ncol).toInt()
        val hs = all.map { r ->
            val v = rowView(r)
            v.measure(MeasureSpec.makeMeasureSpec(colW, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED))
            v.measuredHeight
        }
        val outPages = ArrayList<List<List<Row>>>()
        var page = ArrayList<ArrayList<Row>>().apply { add(ArrayList()) }
        var col = 0; var used = 0
        all.forEachIndexed { i, r ->
            val need = if (r.cat != null) hs[i] + (hs.getOrNull(i + 1) ?: 0) else hs[i] // kategori başlığı sütunun dibinde yalnız kalmasın
            if (used + need > body.height && page[col].isNotEmpty()) {
                col++; used = 0
                if (col >= ncol) { outPages.add(page); page = ArrayList<ArrayList<Row>>().apply { add(ArrayList()) }; col = 0 } else page.add(ArrayList())
            }
            page[col].add(r); used += hs[i]
        }
        outPages.add(page)
        pages = outPages
        if (idx >= pages.size) idx = 0
        showPage()
        if (pages.size > 1) main.postDelayed(rotate, 12_000)
    }

    private fun showPage() {
        if (pages.isEmpty()) return
        val n = pages.size
        val pgData = pages[idx % n]
        pg.text = if (n > 1) "${idx % n + 1} / $n" else ""
        body.removeAllViews()
        val gap = (resources.displayMetrics.widthPixels * 0.02f).toInt()
        for (c in 0 until ncol) {
            val colView = LinearLayout(context).apply { orientation = VERTICAL }
            pgData.getOrNull(c)?.forEach { colView.addView(rowView(it), LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)) }
            body.addView(colView, LayoutParams(0, LayoutParams.MATCH_PARENT, 1f).apply { if (c > 0) leftMargin = gap })
        }
    }

    override fun release() { main.removeCallbacksAndMessages(null) }
    override fun onDetachedFromWindow() { release(); super.onDetachedFromWindow() }
}
