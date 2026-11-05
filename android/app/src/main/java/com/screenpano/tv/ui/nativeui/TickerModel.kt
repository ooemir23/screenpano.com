package com.screenpano.tv.ui.nativeui

import android.graphics.Color
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.TextPaint
import android.text.style.BackgroundColorSpan
import android.text.style.MetricAffectingSpan
import com.screenpano.tv.data.model.TvState
import org.json.JSONArray
import org.json.JSONObject
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt

/** Bir yazı parçası için boyut, renk, kalınlık ve harf aralığı. */
class RunSpan(private val px: Float, private val color: Int, private val bold: Boolean, private val ls: Float) : MetricAffectingSpan() {
    override fun updateDrawState(tp: TextPaint) { apply(tp); tp.color = color }
    override fun updateMeasureState(tp: TextPaint) = apply(tp)
    private fun apply(tp: TextPaint) {
        tp.textSize = px
        tp.letterSpacing = ls
        tp.isFakeBoldText = bold
    }
}

/** Kayan bantta gösterilecek bir bölüm: etiket + öğeler. */
class TickerPlan(val label: String, val items: List<CharSequence>, val seg: Boolean, val segCount: Int, val isInfo: Boolean, val key: String)

/**
 * public/tv.html içindeki setTicker / infoItems mantığının karşılığı. Canlı maç varken bant lig → bilgiler → lig …
 * bölümleriyle döner (her bölüm şeritte bir kez kayar); maç yokken sonuçlar → sıradaki maçlar → son dakika → haberler.
 */
class TickerModel {
    var tickSeg = 0
    var tickInfoPos = 0
    private val nf = { d: Int -> NumberFormat.getNumberInstance(Locale("tr", "TR")).apply { minimumFractionDigits = d; maximumFractionDigits = d } }

    private fun JSONObject.str(k: String): String = if (isNull(k)) "" else optString(k, "")
    private fun JSONArray?.list(): List<JSONObject> = if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }
    private fun items(o: JSONObject?): List<JSONObject> = o?.optJSONArray("items").list()

    fun advance(infoWasShown: Boolean, infoN: Int = 3) {
        if (infoWasShown) tickInfoPos += infoN
        tickSeg += 1
    }

    fun build(s: TvState, p: Palette, vh: Float): TickerPlan {
        val raw = s.raw
        val matches = raw.optJSONArray("matches").list()
        val live = matches.filter { it.optBoolean("live") }
        val fin = matches.filter { it.optBoolean("final") }
        val leagues = live.map { it.str("league") }.distinct()
        val showBrk = raw.optBoolean("showBreaking", false)
        val brk = if (showBrk) items(raw.optJSONObject("breaking")) else emptyList()
        val showNews = raw.optBoolean("showNews", true)
        val nw = if (showNews) items(raw.optJSONObject("news")) else emptyList()
        val infoAll = infoItems(s, p, vh)

        var shown: List<JSONObject> = emptyList()
        var label: String
        var info: List<CharSequence> = emptyList()
        var seg = false
        var kind: String? = null
        var segIsInfo = false
        var segCount = 1

        if (live.isNotEmpty()) {
            val segs = ArrayList<String?>()
            for (l in leagues) { segs.add(l); if (infoAll.isNotEmpty()) segs.add(null) }
            segCount = segs.size
            if (tickSeg >= segCount) tickSeg = 0
            seg = true
            val sg = segs[tickSeg]
            if (sg == null) { segIsInfo = true; label = "Güncel Bilgiler"; info = infoWindow(infoAll) }
            else {
                shown = live.filter { it.str("league") == sg }
                label = if (leagues.size > 1 || infoAll.isNotEmpty()) "Canlı · $sg" else "Canlı Skorlar"
            }
        } else {
            data class Sg(val label: String, val kind: String)
            val segs = ArrayList<Sg>()
            if (fin.isNotEmpty()) segs.add(Sg("Günün Sonuçları", "fin"))
            if (matches.isNotEmpty()) segs.add(Sg("Sıradaki Maçlar", "next"))
            if (brk.isNotEmpty()) segs.add(Sg("Son Dakika", "brk"))
            if (nw.isNotEmpty()) segs.add(Sg("Haberler", "news"))
            if (segs.size > 1) {
                segCount = segs.size
                if (tickSeg >= segCount) tickSeg = 0
                val sg = segs[tickSeg]
                seg = true; kind = sg.kind; label = sg.label
                shown = when (sg.kind) { "fin" -> fin; "next" -> matches.filter { !it.optBoolean("final") }.take(8); else -> emptyList() }
            } else if (segs.size == 1 && (segs[0].kind == "brk" || segs[0].kind == "news")) {
                kind = segs[0].kind; label = segs[0].label
            } else {
                shown = if (fin.isNotEmpty()) fin else matches.take(8)
                label = if (fin.isNotEmpty()) "Günün Sonuçları" else "Sıradaki Maçlar"
                info = if (shown.isEmpty()) infoAll else emptyList()
                if (shown.isEmpty() && info.isNotEmpty()) label = "Güncel Bilgiler"
            }
        }
        val tickerInfo = segIsInfo || (live.isEmpty() && shown.isEmpty() && kind == null && info.isNotEmpty())

        val out: List<CharSequence> = when {
            kind == "brk" -> brk.take(6).map { brkItem(it, p, vh) }
            kind == "news" -> nw.take(6).map { item("HABER", p, vh) { sb -> sb.run(t(it), p.white, vh * 2.7f); sb.run(" " + it.str("source"), p.mute, vh * 2.1f) } }
            tickerInfo -> info
            else -> {
                val brkTi = if (!tickerInfo && !seg && showBrk) brk.take(3).map { brkItem(it, p, vh) } else emptyList()
                brkTi + shown.map { matchItem(it, p, vh) }
            }
        }.ifEmpty { listOf(item("", p, vh) { sb -> sb.run("Şu an gösterilecek maç yok", p.mute, vh * 2.7f) }) }
        return TickerPlan(label, out, seg, segCount, tickerInfo, label + "|" + out.joinToString("¦") { it.toString() })
    }

    private fun t(o: JSONObject) = o.str("title")

    private fun infoWindow(all: List<CharSequence>): List<CharSequence> {
        val n = minOf(3, all.size); val st = tickInfoPos % all.size
        return List(n) { all[(st + it) % all.size] }
    }

    // ---- öğe biçimleri (.ti, .lg, .sc, .ft, .lv) ----
    private fun SpannableStringBuilder.run(text: String, color: Int, px: Float, bold: Boolean = false, ls: Float = 0f) {
        if (text.isEmpty()) return
        val st = length; append(text); setSpan(RunSpan(px, color, bold, ls), st, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }

    private fun item(tag: String, p: Palette, vh: Float, body: (SpannableStringBuilder) -> Unit): CharSequence {
        val sb = SpannableStringBuilder()
        if (tag.isNotEmpty()) { sb.run(tag.uppercase(Locale("tr", "TR")), p.accent2, vh * 1.6f, true, 0.2f); sb.append(" ") }
        body(sb)
        return sb
    }

    private fun brkItem(n: JSONObject, p: Palette, vh: Float): CharSequence {
        val sb = SpannableStringBuilder()
        sb.run("SON DAKİKA", p.live, vh * 1.6f, true, 0.2f); sb.append(" ")
        sb.run(t(n), p.white, vh * 2.7f); sb.run(" " + n.str("source"), p.mute, vh * 2.1f)
        return sb
    }

    private fun matchItem(m: JSONObject, p: Palette, vh: Float): CharSequence {
        val sb = SpannableStringBuilder()
        sb.run(m.str("league").uppercase(Locale("tr", "TR")), p.accent2, vh * 1.6f, true, 0.2f); sb.append(" ")
        sb.run(m.str("home"), p.white, vh * 2.7f); sb.append(" ")
        if (!m.isNull("hs") && m.has("hs")) {
            val st = sb.length
            sb.run(" ${m.str("hs")} - ${m.str("as")} ", p.white, vh * 2.7f, true)
            sb.setSpan(BackgroundColorSpan(p.a(Color.WHITE, 0.1f)), st, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        } else sb.run("vs", p.mute, vh * 2.1f)
        sb.append(" "); sb.run(m.str("away"), p.white, vh * 2.7f); sb.append(" ")
        when {
            m.optBoolean("live") -> sb.run("● " + m.str("clock").ifEmpty { "CANLI" }, p.live, vh * 2.1f, true)
            m.optBoolean("final") -> sb.run("MS", p.mute, vh * 2.1f)
            else -> sb.run(m.str("time"), p.mute, vh * 2.1f)
        }
        return sb
    }

    private val wmo = { c: Int ->
        when {
            c == 0 -> "Açık"; c <= 2 -> "Parçalı bulutlu"; c == 3 -> "Kapalı"; c <= 48 -> "Sisli"; c <= 57 -> "Çisenti"
            c <= 67 -> "Yağmurlu"; c <= 77 -> "Karlı"; c <= 82 -> "Sağanak"; c <= 86 -> "Kar sağanağı"; else -> "Gök gürültülü"
        }
    }
    private val months = listOf("Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık")
    private fun trDate(d: String): String { val a = d.split("-"); return if (a.size >= 3) (a[2].toIntOrNull()?.toString() ?: "") + " " + months.getOrElse((a[1].toIntOrNull() ?: 0) - 1) { "" } else "" }
    private fun fmtPhone(t: String): String { val d = t.filter { it.isDigit() }; return if (Regex("^0\\d{10}$").matches(d)) "${d.substring(0, 4)} ${d.substring(4, 7)} ${d.substring(7, 9)} ${d.substring(9)}" else t }

    /** Maç olmayan ya da araya giren "Güncel Bilgiler": hava, piyasa, haber, vizyon, kitap, tarihte bugün, eczane, puan durumu. */
    fun infoItems(s: TvState, p: Palette, vh: Float): List<CharSequence> {
        val raw = s.raw
        val cats = ArrayList<List<CharSequence>>()
        fun f(x: Double?, d: Int = 2): String = if (x == null || x == 0.0) "--" else nf(d).format(x)
        fun chg(sb: SpannableStringBuilder, v: Double?) {
            if (v == null || v.isNaN()) return
            val up = v > 0.005; val dn = v < -0.005
            sb.run(" " + (if (up) "▲" else if (dn) "▼" else "•") + String.format(Locale("tr", "TR"), "%.1f", abs(v)) + "%", if (up) Color.parseColor("#4cd98a") else if (dn) p.live else p.mute, vh * 2.1f)
        }
        fun num(o: JSONObject, k: String): Double? = if (o.has(k) && !o.isNull(k)) o.optDouble(k).takeIf { !it.isNaN() } else null
        val w = raw.optJSONObject("weather")
        if (w != null) cats.add(listOf(item("HAVA", p, vh) { sb ->
            sb.run("${s.raw.optString("city")} ${(w.optDouble("temp")).roundToInt()}° ${wmo(w.optInt("code"))} · bugün ${w.optDouble("min").roundToInt()}° / ${w.optDouble("max").roundToInt()}°", p.white, vh * 2.7f)
        }))
        val r = raw.optJSONObject("rates") ?: JSONObject()
        val mk = ArrayList<CharSequence>()
        num(r, "usd")?.let { usd -> mk.add(item("PİYASA", p, vh) { sb -> sb.run("USD ${f(usd)} ₺ · EUR ${f(num(r, "eur"))} ₺" + (num(r, "gbp")?.let { " · STERLİN ${f(it)} ₺" } ?: ""), p.white, vh * 2.7f) }) }
        num(r, "gold")?.let { gold ->
            mk.add(item("PİYASA", p, vh) { sb ->
                sb.run("ALTIN ${f(gold, 0)} ₺", p.white, vh * 2.7f); chg(sb, num(r, "goldCh"))
                num(r, "bist")?.let { sb.run(" · BIST 100 ${f(it, 0)}", p.white, vh * 2.7f); chg(sb, num(r, "bistCh")) }
                num(r, "btc")?.let { sb.run(" · BITCOIN $${f(it, 0)}", p.white, vh * 2.7f); chg(sb, num(r, "btcCh")) }
            })
        }
        cats.add(mk)
        if (raw.optBoolean("showBreaking", false)) cats.add(0, items(raw.optJSONObject("breaking")).take(3).map { brkItem(it, p, vh) })
        if (raw.optBoolean("showNews", true)) cats.add(items(raw.optJSONObject("news")).map { n -> item("HABER", p, vh) { sb -> sb.run(t(n), p.white, vh * 2.7f); sb.run(" " + n.str("source"), p.mute, vh * 2.1f) } })
        if (raw.optBoolean("showMovies", true)) cats.add(items(raw.optJSONObject("movies")).map { m -> item("VİZYONA GİRİYOR", p, vh) { sb -> sb.run(t(m) + (m.str("date").takeIf { it.isNotEmpty() }?.let { " · " + trDate(it) } ?: ""), p.white, vh * 2.7f) } })
        if (raw.optBoolean("showBooks", true)) cats.add(items(raw.optJSONObject("books")).map { b -> item("YENİ KİTAP", p, vh) { sb -> sb.run(t(b) + (b.str("author").takeIf { it.isNotEmpty() }?.let { " · $it" } ?: ""), p.white, vh * 2.7f) } })
        if (raw.optBoolean("showOnThisDay", true)) cats.add(items(raw.optJSONObject("onThisDay")).map { e -> item("TARİHTE BUGÜN", p, vh) { sb -> sb.run(e.str("year"), p.white, vh * 2.7f, true); sb.run(" " + e.str("text"), p.white, vh * 2.7f) } })
        if (raw.optBoolean("showPharmacy", true)) cats.add(items(raw.optJSONObject("pharmacies")).map { x -> item("NÖBETÇİ ECZANE", p, vh) { sb -> sb.run(x.str("name") + " · " + x.str("address") + (x.str("phone").takeIf { it.isNotEmpty() }?.let { " · ☎ " + fmtPhone(it) } ?: ""), p.white, vh * 2.7f) } })
        if (raw.optBoolean("showStandings", true)) {
            val st = raw.optJSONObject("standings")
            if (st != null) cats.add(st.keys().asSequence().toList().mapNotNull { lg ->
                val rows = st.optJSONArray(lg).list(); if (rows.isEmpty()) null
                else item("PUAN DURUMU", p, vh) { sb -> sb.run("$lg: " + rows.take(3).joinToString(" · ") { "${it.str("rank")}. ${it.str("name")} (${it.str("pts")})" }, p.white, vh * 2.7f) }
            })
        }
        val out = ArrayList<CharSequence>(); val max = cats.maxOfOrNull { it.size } ?: 0
        for (i in 0 until max) for (c in cats) if (i < c.size) out.add(c[i])
        return out
    }
}
