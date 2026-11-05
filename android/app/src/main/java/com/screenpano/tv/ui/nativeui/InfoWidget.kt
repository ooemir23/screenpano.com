package com.screenpano.tv.ui.nativeui

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.TextUtils
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
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import kotlin.math.max
import kotlin.math.min

/**
 * "Maçlar ve bilgi sayfaları" widget'ı: maçlar, puan durumu, nöbetçi eczane, son dakika, gündem, kitap, vizyon,
 * tarihte bugün ve trafik haritası sayfaları; 12 sn'de bir, sunucu saatine göre tüm ekranlarda aynı sayfa.
 * Gol duyurusu (#goal) sayfada kalır.
 */
class InfoWidget(context: Context) : LinearLayout(context), NativeWidget {
    private class Pg(val type: String, val items: List<JSONObject>, val part: Int = 1, val parts: Int = 1, val league: String = "", val date: String = "")

    private val main = Handler(Looper.getMainLooper())
    private val head = LinearLayout(context)
    private val title = TextView(context)
    private val dots = TextView(context)
    private val body = FrameLayout(context)
    private var st: TvState? = null
    private var vh = 10f
    private var vw = 17f
    private var pages: List<Pg> = emptyList()
    private var sig = ""
    private var shown = -1
    private var pal: Palette? = null
    private val trTR = Locale("tr", "TR")

    private val tick = object : Runnable {
        override fun run() { showCurrent(); main.postDelayed(this, 12_000L - NativeEnv.now() % 12_000L + 30L) }
    }

    init {
        orientation = VERTICAL
        head.orientation = HORIZONTAL; head.gravity = Gravity.CENTER_VERTICAL
        title.includeFontPadding = false; title.setSingleLine(true); title.ellipsize = TextUtils.TruncateAt.END
        dots.includeFontPadding = false
        head.addView(title, LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
        head.addView(dots, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT))
        addView(head, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
        addView(body, LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f))
        body.clipChildren = true
    }

    override fun bind(w: WidgetSpec, s: TvState, vh: Float) {
        st = s; this.vh = vh
        val dm = resources.displayMetrics
        vw = vh * dm.widthPixels.toFloat() / dm.heightPixels.toFloat()
        pal = Palette(s)
        (head.layoutParams as LayoutParams).bottomMargin = (vh * 1.6f).toInt()
        head.setPadding((vw * 0.3f).toInt(), 0, (vw * 0.3f).toInt(), 0)
        val r = s.raw
        val ns = listOf("matches", "standings", "showStandings", "pharmacies", "showPharmacy", "breaking", "showBreaking", "news", "showNews", "books", "showBooks", "movies", "showMovies", "onThisDay", "showOnThisDay", "mapAt", "theme")
            .joinToString("~") { r.opt(it)?.toString() ?: "" } + "|" + width + "x" + height
        if (ns != sig) { sig = ns; shown = -1; rebuild() }
        main.removeCallbacks(tick); tick.run()
    }

    override fun release() { main.removeCallbacks(tick) }

    override fun onSizeChanged(w: Int, h: Int, ow: Int, oh: Int) {
        super.onSizeChanged(w, h, ow, oh)
        if (st != null && (w != ow || h != oh)) { sig = ""; post { st?.let { bind(WidgetSpec("info", 0, 0, 1, 1, null), it, vh) } } }
    }

    // ---------- sayfa listesi ----------
    private fun list(a: JSONArray?): List<JSONObject> { val o = ArrayList<JSONObject>(); if (a != null) for (i in 0 until a.length()) a.optJSONObject(i)?.let { o.add(it) }; return o }
    private fun items(o: JSONObject?): List<JSONObject> = list(o?.optJSONArray("items"))

    private fun rebuild() {
        val s = st ?: return
        val r = s.raw
        val bh = body.height; val bw = body.width
        if (bh <= 0 || bw <= 0) { post { if (body.height > 0) { sig = ""; st?.let { bind(WidgetSpec("info", 0, 0, 1, 1, null), it, vh) } } }; return }
        val out = ArrayList<Pg>()
        val matches = list(r.optJSONArray("matches"))
        val leagues = LinkedHashMap<String, ArrayList<JSONObject>>()
        for (m in matches) leagues.getOrPut(m.optString("league")) { ArrayList() }.add(m)
        val showSt = r.optBoolean("showStandings", true)
        val standings = r.optJSONObject("standings")
        val trows = max(5, ((bh - 3.3f * vh) / (2.9f * vh)).toInt())
        for ((lg, ms) in leagues) {
            for (ch in paginate(ms, bw, bh) { matchCard(it) }) out.add(Pg("league", ch, league = lg))
            val rows = if (showSt) list(standings?.optJSONArray(lg)) else emptyList()
            if (rows.isNotEmpty()) {
                val parts = (rows.size + trows - 1) / trows; val per = (rows.size + parts - 1) / parts
                for (i in 0 until parts) out.add(Pg("table", rows.subList(i * per, min(rows.size, (i + 1) * per)), i + 1, parts, lg))
            }
        }
        fun add(type: String, o: JSONObject?, on: Boolean, cap: Int = 99, date: String = "", fn: (JSONObject) -> View) {
            val its = items(o).take(cap)
            if (!on || its.isEmpty()) return
            val ch = paginate(its, bw, bh, fn)
            ch.forEachIndexed { i, c -> out.add(Pg(type, c, i + 1, ch.size, date = date)) }
        }
        add("pharm", r.optJSONObject("pharmacies"), r.optBoolean("showPharmacy", true)) { pharmCard(it, (r.optJSONObject("pharmacies")?.optJSONArray("districts")?.length() ?: 0) > 1) }
        add("breaking", r.optJSONObject("breaking"), r.optBoolean("showBreaking", false), 8) { newsCard(it, true) }
        add("news", r.optJSONObject("news"), r.optBoolean("showNews", true)) { newsCard(it, false) }
        add("books", r.optJSONObject("books"), r.optBoolean("showBooks", true)) { bookCard(it) }
        add("movies", r.optJSONObject("movies"), r.optBoolean("showMovies", true)) { movieCard(it) }
        add("otd", r.optJSONObject("onThisDay"), r.optBoolean("showOnThisDay", true), date = r.optJSONObject("onThisDay")?.optString("date") ?: "") { dayCard(it) }
        if (out.none { it.type != "table" }) out.add(0, Pg("empty", emptyList()))
        if (r.optInt("mapAt", 0) > 0) out.add(Pg("traffic", emptyList()))
        pages = out
    }

    private fun paginate(its: List<JSONObject>, bw: Int, bh: Int, fn: (JSONObject) -> View): List<List<JSONObject>> {
        val gap = vh.toInt()
        val res = ArrayList<List<JSONObject>>(); var cur = ArrayList<JSONObject>(); var used = 0
        for (it in its) {
            val v = fn(it)
            v.measure(MeasureSpec.makeMeasureSpec(bw, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED))
            val h = v.measuredHeight
            val need = h + if (cur.isNotEmpty()) gap else 0
            if (cur.isNotEmpty() && used + need > bh) { res.add(cur); cur = ArrayList(); used = 0 }
            used += h + if (cur.isNotEmpty()) gap else 0
            cur.add(it)
        }
        if (cur.isNotEmpty()) res.add(cur)
        return res
    }

    // ---------- gösterim ----------
    private fun showCurrent() {
        val s = st ?: return
        if (pages.isEmpty()) { rebuild(); if (pages.isEmpty()) return }
        val idx = ((NativeEnv.now() / 1000) / 12 % pages.size).toInt()
        if (idx == shown) return
        shown = idx
        val pg = pages[idx]
        val p = pal ?: Palette(s)
        setTitle(pg, p)
        dots.text = ""
        if (pages.size > 6) { dots.setTextSize(TypedValue.COMPLEX_UNIT_PX, vh * 1.3f); dots.setTextColor(p.mute); dots.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD); dots.letterSpacing = 0.12f; dots.text = "${idx + 1} / ${pages.size}" }
        else if (pages.size > 1) { // sayfa noktaları
            dots.setTextSize(TypedValue.COMPLEX_UNIT_PX, vh * 1.6f)
            val sb = SpannableStringBuilder()
            for (i in pages.indices) { val a = sb.length; sb.append(if (i == idx) "●" else "○"); sb.setSpan(RunSpan(vh * 1.6f, if (i == idx) p.accent2 else p.a(Color.WHITE, 0.3f), false, 0.1f), a, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) }
            dots.text = sb
        }
        body.removeAllViews()
        when (pg.type) {
            "traffic" -> body.addView(trafficView(s), FrameLayout.LayoutParams(-1, -1))
            "table" -> body.addView(tableView(pg, p), FrameLayout.LayoutParams(-1, -1))
            else -> {
                val col = LinearLayout(context); col.orientation = VERTICAL
                for ((i, it) in pg.items.withIndex()) {
                    val v = when (pg.type) {
                        "league" -> matchCard(it); "pharm" -> pharmCard(it, (s.raw.optJSONObject("pharmacies")?.optJSONArray("districts")?.length() ?: 0) > 1)
                        "breaking" -> newsCard(it, true); "news" -> newsCard(it, false); "books" -> bookCard(it); "movies" -> movieCard(it); "otd" -> dayCard(it); else -> View(context)
                    }
                    col.addView(v, LayoutParams(-1, -2).also { lp -> if (i > 0) lp.topMargin = vh.toInt() })
                }
                if (pg.type == "empty") col.addView(emptyCard(), LayoutParams(-1, -2))
                body.addView(col, FrameLayout.LayoutParams(-1, -1))
            }
        }
    }

    private fun setTitle(pg: Pg, p: Palette) {
        fun part() = if (pg.parts > 1) " ${pg.part}/${pg.parts}" else ""
        val (main, em) = when (pg.type) {
            "empty", "league" -> (if (pg.type == "empty") "Maçlar" else pg.league) to ""
            "traffic" -> "Canlı Trafik" to ""
            "movies" -> "Vizyona Giriyor" to "BU HAFTA" + part()
            "books" -> "Yeni Çıkan Kitaplar" to (if (pg.parts > 1) "${pg.part}/${pg.parts}" else "D&R")
            "breaking" -> "Son Dakika" to (if (pg.parts > 1) "${pg.part}/${pg.parts}" else "CANLI")
            "news" -> "Gündem" to "TÜRKİYE" + part()
            "pharm" -> {
                val d = st?.raw?.optJSONObject("pharmacies")?.optJSONArray("districts")
                "Nöbetçi Eczaneler" to ((0 until (d?.length() ?: 0)).joinToString(" · ") { d!!.optString(it) }.uppercase(trTR) + part())
            }
            "otd" -> {
                val dd = pg.date.split("-")
                val months = arrayOf("Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık")
                "Tarihte Bugün" to (if (dd.size == 3) (dd[2].toIntOrNull() ?: 0).toString() + " " + months[((dd[1].toIntOrNull() ?: 1) - 1).coerceIn(0, 11)].uppercase(trTR) else "") + (if (pg.parts > 1) " · ${pg.part}/${pg.parts}" else "")
            }
            "table" -> pg.league to ("PUAN DURUMU" + part())
            else -> "" to ""
        }
        val sb = SpannableStringBuilder(main.uppercase(trTR))
        sb.setSpan(RunSpan(vh * 1.7f, p.a(Color.parseColor("#E5E5E5"), 1f), false, 0.32f), 0, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        if (em.isNotEmpty()) { val a = sb.length; sb.append("  ").append(em); sb.setSpan(RunSpan(vh * 1.25f, p.accent2, true, 0.2f), a, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) }
        title.text = sb
    }

    // ---------- kartlar ----------
    private fun tv(t: CharSequence?, size: Float, color: Int, bold: Boolean = false): TextView = TextView(context).apply {
        text = t ?: ""; includeFontPadding = false; setTextSize(TypedValue.COMPLEX_UNIT_PX, vh * size); setTextColor(color)
        typeface = Typeface.create(Typeface.DEFAULT, if (bold) Typeface.BOLD else Typeface.NORMAL)
    }

    private fun cardView(vert: Boolean = true, pv: Float = 1.2f, ph: Float = 0.9f): LinearLayout = LinearLayout(context).apply {
        orientation = if (vert) VERTICAL else HORIZONTAL
        val p = pal
        background = GradientDrawable().apply { cornerRadius = vh * 1.11f; setColor(Color.argb(12, 255, 255, 255)); setStroke(max(1, (vh * 0.1f).toInt()), Color.argb(23, 255, 255, 255)) }
        setPadding((vw * ph).toInt(), (vh * pv).toInt(), (vw * ph).toInt(), (vh * pv).toInt())
    }

    private fun logoView(url: String, w: Float, h: Float, crop: Boolean = false, round: Float = 0f): ImageView = ImageView(context).apply {
        scaleType = if (crop) ImageView.ScaleType.CENTER_CROP else ImageView.ScaleType.FIT_CENTER
        if (round > 0f) { background = GradientDrawable().apply { setColor(Color.parseColor("#222222")); cornerRadius = vh * round }; clipToOutline = true }
        layoutParams = LinearLayout.LayoutParams((vh * w).toInt(), (vh * h).toInt())
        if (url.isNotEmpty()) load(NativeEnv.url(url)) { crossfade(false) }
    }

    private fun teamBox(name: String, logo: String, lose: Boolean, p: Palette): LinearLayout = LinearLayout(context).apply {
        orientation = VERTICAL; gravity = Gravity.CENTER_HORIZONTAL
        addView(logoView(logo, 5.4f, 5.4f))
        val n = tv(name, 1.6f, if (lose) p.mute else Color.parseColor("#FBFBFB"), !lose)
        n.gravity = Gravity.CENTER; n.maxLines = 2; n.ellipsize = TextUtils.TruncateAt.END
        addView(n, LayoutParams(-1, -2).also { it.topMargin = (vh * 0.5f).toInt() })
    }

    private fun matchCard(m: JSONObject): View {
        val p = pal ?: Palette(st!!)
        val c = cardView(true, 1.7f, 0.8f)
        val hasScore = m.has("hs") && !m.isNull("hs")
        val hs = m.optString("hs").toIntOrNull(); val a = m.optString("as").toIntOrNull()
        val fin = m.optBoolean("final"); val live = m.optBoolean("live")
        val hw = hasScore && hs != null && a != null && hs > a; val aw = hasScore && hs != null && a != null && a > hs
        val row = LinearLayout(context); row.orientation = HORIZONTAL; row.gravity = Gravity.CENTER_VERTICAL
        val mid = LinearLayout(context); mid.orientation = VERTICAL; mid.gravity = Gravity.CENTER_HORIZONTAL
        if (live) mid.addView(pill("CANLI " + m.optString("clock"), p.live, p.a(p.live, 0.16f)))
        else if (fin && hasScore) mid.addView(pill("MS", p.accent2, p.a(p.accent2, 0.3f)))
        if (hasScore) {
            val sc = tv(m.optString("hs") + " - " + m.optString("as"), 3.6f, if (fin) p.accent2 else Color.parseColor("#FBFBFB"), true)
            mid.addView(sc)
        } else {
            val day = m.optString("day"); val tm = (if (day.isNotEmpty() && day != "Bugün") "$day " else "") + m.optString("time")
            val t = tv(tm, 2.3f, Color.parseColor("#FBFBFB"), true)
            t.background = GradientDrawable().apply { setColor(Color.argb(20, 255, 255, 255)); cornerRadius = vh * 2f }
            t.setPadding((vw * 0.9f).toInt(), (vh * 0.7f).toInt(), (vw * 0.9f).toInt(), (vh * 0.7f).toInt())
            mid.addView(t)
        }
        row.addView(teamBox(m.optString("home"), m.optString("hl"), fin && aw, p), LayoutParams(0, -2, 1f))
        row.addView(mid, LayoutParams(-2, -2).also { it.leftMargin = (vw * 0.5f).toInt(); it.rightMargin = (vw * 0.5f).toInt() })
        row.addView(teamBox(m.optString("away"), m.optString("al"), fin && hw, p), LayoutParams(0, -2, 1f))
        c.addView(row, LayoutParams(-1, -2))
        val ch = m.optString("channel")
        if (ch.isNotEmpty()) {
            val t = tv("📺 $ch", 1.15f, p.accent2, true); t.gravity = Gravity.END; t.setSingleLine(true); t.ellipsize = TextUtils.TruncateAt.END
            c.addView(t, LayoutParams(-1, -2).also { it.topMargin = (vh * 0.4f).toInt() })
        }
        return c
    }

    private fun pill(t: String, color: Int, bg: Int): TextView = tv(t, 1.15f, color, true).apply {
        background = GradientDrawable().apply { setColor(bg); cornerRadius = vh * 2f }
        setPadding((vw * 0.6f).toInt(), (vh * 0.25f).toInt(), (vw * 0.6f).toInt(), (vh * 0.25f).toInt())
        layoutParams = LinearLayout.LayoutParams(-2, -2).also { it.bottomMargin = (vh * 0.5f).toInt() }
    }

    private fun emptyCard(): View {
        val c = cardView()
        c.addView(tv("Yakında maç yok", 2.2f, Color.parseColor("#E5E5E5"), true))
        return c
    }

    private fun tableView(pg: Pg, p: Palette): View {
        val col = LinearLayout(context); col.orientation = VERTICAL
        val colsW = floatArrayOf(2.6f, 0f, 2.9f, 2.9f, 2.9f, 2.9f, 4f, 4f)
        fun row(cells: List<View>, hPx: Int, bg: Int, top: Boolean = false): LinearLayout = LinearLayout(context).apply {
            orientation = HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
            setPadding((vw * 0.6f).toInt(), 0, (vw * 0.6f).toInt(), 0)
            if (bg != 0) background = GradientDrawable().apply { setColor(bg); cornerRadius = vh * 0.74f }
            cells.forEachIndexed { i, v -> addView(v, if (colsW[i] == 0f) LayoutParams(0, -2, 1f) else LayoutParams((vh * colsW[i]).toInt(), -2)) }
            layoutParams = LayoutParams(-1, hPx).also { it.topMargin = if (top) 0 else (vh * 0.25f).toInt() }
        }
        fun cellText(t: String, size: Float, color: Int, bold: Boolean, left: Boolean = false) = tv(t, size, color, bold).apply { gravity = if (left) Gravity.START else Gravity.CENTER; if (left) { setSingleLine(true); ellipsize = TextUtils.TruncateAt.END } }
        val hdr = listOf("#", "Takım", "O", "G", "B", "M", "AV", "P").mapIndexed { i, t -> cellText(t, 1.15f, p.mute, true, i == 1) as View }
        col.addView(row(hdr, (vh * 3f).toInt(), 0, true))
        val avail = body.height - (vh * 3f).toInt()
        val n = pg.items.size
        val rh = ((avail - n * vh * 0.25f) / max(1, n)).coerceIn(vh * 2.65f, vh * 4.8f).toInt()
        pg.items.forEachIndexed { i, r ->
            val teamCell = LinearLayout(context).apply {
                orientation = HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
                addView(logoView(r.optString("logo"), 2.1f, 2.1f))
                addView(tv(r.optString("name"), 1.45f, Color.parseColor("#FBFBFB"), true).apply { setSingleLine(true); ellipsize = TextUtils.TruncateAt.END }, LayoutParams(-2, -2).also { it.leftMargin = (vw * 0.6f).toInt() })
            }
            val top1 = r.optInt("rank") == 1
            val cells = listOf(
                cellText(r.optString("rank"), 1.45f, if (top1) p.accent2 else p.mute, true),
                teamCell,
                cellText(r.optString("gp"), 1.45f, Color.parseColor("#E5E5E5"), false), cellText(r.optString("w"), 1.45f, Color.parseColor("#E5E5E5"), false),
                cellText(r.optString("d"), 1.45f, Color.parseColor("#E5E5E5"), false), cellText(r.optString("l"), 1.45f, Color.parseColor("#E5E5E5"), false),
                cellText(r.optString("gd"), 1.45f, Color.parseColor("#E5E5E5"), false), cellText(r.optString("pts"), 1.45f, Color.parseColor("#FBFBFB"), true),
            )
            val bg = if (top1) p.a(p.accent2, 0.22f) else if (i % 2 == 0) Color.argb(9, 255, 255, 255) else Color.argb(17, 255, 255, 255)
            col.addView(row(cells, rh, bg))
        }
        return col
    }

    private fun ago(iso: String): String {
        if (iso.length < 19) return ""
        val t = try { SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.parse(iso.substring(0, 19))?.time ?: return "" } catch (_: Exception) { return "" }
        val m = ((System.currentTimeMillis() - t) / 60000).toInt()
        return if (m < 0) "" else if (m < 1) "az önce" else if (m < 60) "$m dk önce" else if (m < 1440) "${m / 60} saat önce" else "${m / 1440} gün önce"
    }

    private fun newsCard(n: JSONObject, brk: Boolean): View {
        val p = pal ?: Palette(st!!)
        val c = cardView(true, 1.2f, 0.9f)
        if (brk) c.setPadding(c.paddingLeft + (vh * 0.5f).toInt(), c.paddingTop, c.paddingRight, c.paddingBottom)
        val t = tv(n.optString("title"), 2.6f, Color.parseColor("#FBFBFB"), true); t.maxLines = 3; t.ellipsize = TextUtils.TruncateAt.END; t.setLineSpacing(0f, 1.1f)
        c.addView(t)
        val meta = SpannableStringBuilder()
        if (brk) { meta.append("SON DAKİKA"); meta.setSpan(android.text.style.BackgroundColorSpan(Color.parseColor("#d6262a")), 0, meta.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE); meta.setSpan(android.text.style.ForegroundColorSpan(Color.WHITE), 0, meta.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE); meta.append("  ") }
        meta.append(n.optString("source").uppercase(trTR))
        val ag = if (n.optString("date").isNotEmpty()) ago(n.optString("date")) else ""
        if (ag.isNotEmpty()) meta.append(" · " + ag.uppercase(trTR))
        val m = tv(meta, 1.7f, p.accent2, true); m.letterSpacing = 0.08f
        c.addView(m, LayoutParams(-1, -2).also { it.topMargin = (vh * 0.6f).toInt() })
        if (brk) (c.background as GradientDrawable).setStroke(max(1, (vh * 0.1f).toInt()), Color.parseColor("#d6262a"))
        return c
    }

    private fun pharmCard(ph: JSONObject, showDistrict: Boolean): View {
        val p = pal ?: Palette(st!!)
        val c = cardView(true, 1.2f, 0.9f)
        c.addView(tv(ph.optString("name"), 1.9f, Color.parseColor("#FBFBFB"), true))
        val a = tv(ph.optString("address"), 1.5f, Color.parseColor("#E5E5E5")); a.maxLines = 2; a.ellipsize = TextUtils.TruncateAt.END
        c.addView(a, LayoutParams(-1, -2).also { it.topMargin = (vh * 0.4f).toInt() })
        val sb = SpannableStringBuilder()
        val d = ph.optString("phone").replace(Regex("\\D"), "")
        if (d.isNotEmpty()) sb.append("☎ " + (if (Regex("^0\\d{10}$").matches(d)) "${d.substring(0, 4)} ${d.substring(4, 7)} ${d.substring(7, 9)} ${d.substring(9)}" else ph.optString("phone")))
        if (showDistrict && ph.optString("district").isNotEmpty()) { val s0 = sb.length; sb.append("   " + ph.optString("district").uppercase(trTR)); sb.setSpan(RunSpan(vh * 1.3f, p.mute, false, 0.12f), s0, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) }
        val t = tv(sb, 1.75f, p.accent2, true); t.letterSpacing = 0.05f
        c.addView(t, LayoutParams(-1, -2).also { it.topMargin = (vh * 0.5f).toInt() })
        return c
    }

    private fun bookCard(b: JSONObject): View {
        val p = pal ?: Palette(st!!)
        val c = cardView(false, 0.8f, 0.9f); c.gravity = Gravity.CENTER_VERTICAL
        if (b.optString("image").isNotEmpty()) c.addView(logoView(b.optString("image"), 10f, 15f, true, 0.6f).also { (it.layoutParams as LayoutParams).rightMargin = (vw * 0.9f).toInt() })
        val col = LinearLayout(context); col.orientation = VERTICAL
        val t = tv(b.optString("title"), 2.8f, Color.parseColor("#FBFBFB"), true); t.maxLines = 3; t.ellipsize = TextUtils.TruncateAt.END
        col.addView(t)
        if (b.optString("author").isNotEmpty()) col.addView(tv(b.optString("author"), 2.1f, p.accent2, true).apply { setSingleLine(true); ellipsize = TextUtils.TruncateAt.END }, LayoutParams(-1, -2).also { it.topMargin = (vh * 0.5f).toInt() })
        if (b.optString("publisher").isNotEmpty()) col.addView(tv(b.optString("publisher"), 1.8f, p.a(Color.WHITE, 0.7f)).apply { setSingleLine(true); ellipsize = TextUtils.TruncateAt.END }, LayoutParams(-1, -2).also { it.topMargin = (vh * 0.2f).toInt() })
        c.addView(col, LayoutParams(0, -2, 1f))
        return c
    }

    private fun movieCard(m: JSONObject): View {
        val p = pal ?: Palette(st!!)
        val c = cardView(false, 0.9f, 1f); c.gravity = Gravity.CENTER_VERTICAL
        if (m.optString("poster").isNotEmpty()) c.addView(logoView(m.optString("poster"), 10f, 15f, true, 0.6f).also { (it.layoutParams as LayoutParams).rightMargin = (vw * 1.1f).toInt() })
        val col = LinearLayout(context); col.orientation = VERTICAL
        val t = tv(m.optString("title"), 3f, Color.parseColor("#FBFBFB"), true); t.maxLines = 2; t.ellipsize = TextUtils.TruncateAt.END
        col.addView(t)
        val dd = m.optString("date").split("-")
        val months = arrayOf("Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık")
        val ds = if (dd.size == 3) (dd[2].toIntOrNull() ?: 0).toString() + " " + months[((dd[1].toIntOrNull() ?: 1) - 1).coerceIn(0, 11)] else ""
        val rt = m.optString("rating")
        col.addView(tv(ds + (if (rt.isNotEmpty() && rt != "0") " · ★ " + rt.replace('.', ',') else ""), 2.1f, p.accent2, true), LayoutParams(-1, -2).also { it.topMargin = (vh * 0.7f).toInt() })
        c.addView(col, LayoutParams(0, -2, 1f))
        return c
    }

    private fun dayCard(e: JSONObject): View {
        val p = pal ?: Palette(st!!)
        val c = cardView(false, 1.2f, 0.9f); c.gravity = Gravity.TOP
        val y = tv(e.optString("year"), 4.2f, p.accent2, true); y.minWidth = (vh * 10f).toInt()
        c.addView(y, LayoutParams(-2, -2))
        val t = tv(e.optString("text"), 2.4f, Color.parseColor("#FBFBFB")); t.maxLines = 6; t.ellipsize = TextUtils.TruncateAt.END; t.setLineSpacing(0f, 1.1f)
        c.addView(t, LayoutParams(0, -2, 1f).also { it.leftMargin = (vw * 1f).toInt() })
        return c
    }

    private fun trafficView(s: TvState): View {
        val fl = FrameLayout(context)
        fl.background = GradientDrawable().apply { setColor(Color.parseColor("#15181b")); cornerRadius = vh * 1.48f; setStroke(max(1, (vh * 0.1f).toInt()), (pal ?: Palette(s)).a((pal ?: Palette(s)).accent2, 0.55f)) }
        fl.clipToOutline = true
        val im = ImageView(context); im.scaleType = ImageView.ScaleType.CENTER_CROP
        im.load(NativeEnv.url("/traffic-map.jpg?v=" + s.raw.optInt("mapAt", 0))) { crossfade(false) }
        fl.addView(im, FrameLayout.LayoutParams(-1, -1))
        return fl
    }
}
