package com.screenpano.tv.ui.nativeui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorFilter
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RadialGradient
import android.graphics.Shader
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import coil.load
import com.screenpano.tv.data.model.TvState
import org.json.JSONObject
import java.util.Locale
import kotlin.math.max
import kotlin.math.min

/**
 * Büyük maç duyurusu, "arena" tasarımı (sayfadaki d-arena ile aynı yerleşim; animasyonsuz). Zamanlamayı sayfa yönetir.
 * Diğer tasarımlar sayfada çizilmeye devam eder (BigArenaView.supports).
 */
class BigArenaView(context: Context) : FrameLayout(context) {
    companion object { fun supports(style: String) = style in setOf("arena", "uyum", "stadyum", "bant", "sayac", "poster", "duello", "turnuva", "matchday", "neonarena") }

    private var data: JSONObject? = null
    private var st: TvState? = null
    private val trTR = Locale("tr", "TR")
    /** org.json, JSON null'ı "null" metni olarak verir; boş say. */
    private fun JSONObject.str(k: String): String = if (isNull(k)) "" else optString(k).let { if (it == "null") "" else it }

    private var tickRun: Runnable? = null
    /** Geri sayım gibi yavaş güncellemeler için: f() false dönerse yavaşlar (30 sn), görünmezken durur. */
    internal fun startTick(f: () -> Boolean) {
        tickRun?.let { removeCallbacks(it) }
        val r = object : Runnable { override fun run() { if (!isShown) { tickRun = null; return }; val fast = f(); postDelayed(this, if (fast) 1000L else 30_000L) } }
        tickRun = r; postDelayed(r, 1000L)
    }
    override fun onDetachedFromWindow() { tickRun?.let { removeCallbacks(it) }; tickRun = null; super.onDetachedFromWindow() }
    fun bind(d: JSONObject, s: TvState) { data = d; st = s; if (width > 0 && height > 0) build() }
    override fun onSizeChanged(w: Int, h: Int, ow: Int, oh: Int) { super.onSizeChanged(w, h, ow, oh); if (data != null && w > 0 && h > 0) build() }

    // ---- renk yardımcıları ----
    private fun hex(v: String?): Int? {
        val t = (v ?: "").removePrefix("#")
        return if (Regex("^[0-9a-fA-F]{6}$").matches(t)) Color.parseColor("#$t") else null
    }
    private fun mix(a: Int, b: Int, t: Float): Int = Color.argb(
        (Color.alpha(a) * (1 - t) + Color.alpha(b) * t).toInt(), (Color.red(a) * (1 - t) + Color.red(b) * t).toInt(),
        (Color.green(a) * (1 - t) + Color.green(b) * t).toInt(), (Color.blue(a) * (1 - t) + Color.blue(b) * t).toInt())
    private fun al(c: Int, a: Float) = Color.argb((a * 255).toInt(), Color.red(c), Color.green(c), Color.blue(c))

    private fun teamPair(name: String, c1: String?, c2: String?, raw1: String?, raw2: String?): Pair<Int, Int> {
        val n = name.lowercase(trTR)
        if (n.contains("galatasaray")) return Color.parseColor("#c9082a") to Color.parseColor("#ffb800")
        if (n.contains("fenerbah")) return Color.parseColor("#123690") to Color.parseColor("#ffdd00")
        if (n.contains("beşiktaş") || n.contains("besiktas")) return Color.parseColor("#22252c") to Color.parseColor("#e2e8f0")
        if (n.contains("trabzon")) return Color.parseColor("#800f34") to Color.parseColor("#29a8ff")
        val p = hex(c1) ?: hex(raw1) ?: Color.parseColor("#12307f")
        val cands = listOfNotNull(hex(c2), hex(raw2), hex(raw1)).filter { it != p }
        return p to (cands.firstOrNull() ?: mix(p, Color.parseColor("#ffd24c"), 0.55f))
    }

    private fun leagueColors(league: String, derby: Boolean): Pair<Int, Int> = when (league) {
        "Süper Lig" -> "#e30a17" to "#ffd478"; "Avrupa Ligi" -> "#ff6b00" to "#ffb800"; "Konferans Ligi" -> "#00d65b" to "#a8ff78"
        "Şampiyonlar Ligi", "Şampiyonlar Ligi Eleme" -> "#1a5cff" to "#ffe08a"
        else -> if (derby) "#e30a17" to "#ffd478" else "#1a5cff" to "#ffe08a"
    }.let { Color.parseColor(it.first) to Color.parseColor(it.second) }

    private fun leagueLogo(m: JSONObject): String {
        val ll = m.str("ll"); if (ll.isNotEmpty()) return ll
        return when (m.str("league")) {
            "Süper Lig" -> "/logo/l-18.png?v=2"; "Şampiyonlar Ligi", "Şampiyonlar Ligi Eleme" -> "/logo/l-2.png?v=2"
            "Avrupa Ligi" -> "/logo/l-2310.png?v=2"; "Konferans Ligi" -> "/logo/l-20296.png?v=2"
            else -> if (m.optBoolean("derby")) "/logo/l-18.png?v=2" else "/logo/l-2.png?v=2"
        }
    }

    /** CSS clip-path: polygon karşılığı çokgen zemin (dolgu + kenar). */
    private class Poly(private val pts: (Int, Int) -> FloatArray, private val top: Int, private val bottom: Int, private val stroke: Int, private val sw: Float) : Drawable() {
        private val fill = Paint(Paint.ANTI_ALIAS_FLAG); private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
        override fun draw(c: Canvas) {
            val w = bounds.width(); val h = bounds.height(); if (w <= 0 || h <= 0) return
            val p = pts(w, h); val path = Path(); path.moveTo(p[0], p[1]); var i = 2; while (i < p.size) { path.lineTo(p[i], p[i + 1]); i += 2 }; path.close()
            fill.shader = LinearGradient(0f, 0f, 0f, h.toFloat(), top, bottom, Shader.TileMode.CLAMP)
            line.color = stroke; line.strokeWidth = sw * 2; line.strokeJoin = Paint.Join.MITER
            c.save(); c.clipPath(path); c.drawPath(path, fill); c.drawPath(path, line); c.restore()
        }
        override fun setAlpha(a: Int) {}
        override fun setColorFilter(f: ColorFilter?) {}
        @Suppress("OVERRIDE_DEPRECATION") override fun getOpacity() = PixelFormat.TRANSLUCENT
    }

    /** Işık / renk katmanları: lig göğü, iki takım rengi, vinyet (sayfadaki ar-lea-sky, ar-tint, ar-vig). */
    private class Glow(context: Context, val lc1: Int, val lc2: Int, val c1: Int, val c1b: Int, val c2: Int, val c2b: Int) : View(context) {
        private val p = Paint(Paint.ANTI_ALIAS_FLAG)
        private val screen = Paint(Paint.ANTI_ALIAS_FLAG).apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.SCREEN) }
        private fun ell(c: Canvas, cx: Float, cy: Float, rx: Float, ry: Float, stops: IntArray, pos: FloatArray, paint: Paint) {
            c.save(); c.translate(cx, cy); c.scale(1f, ry / rx)
            paint.shader = RadialGradient(0f, 0f, rx, stops, pos, Shader.TileMode.CLAMP)
            c.drawCircle(0f, 0f, rx, paint); c.restore()
        }
        override fun onDraw(c: Canvas) {
            val w = width.toFloat(); val h = height.toFloat()
            ell(c, w * 0.5f, h * 0.18f, w * 0.55f, h * 0.38f, intArrayOf(al(lc1, 0.62f), al(lc2, 0.28f), 0), floatArrayOf(0f, 0.48f, 1f), screen)
            ell(c, w * 0.18f, h * 0.48f, w * 0.42f, h * 0.58f, intArrayOf(al(c1, 0.85f), al(c1b, 0.5f), 0), floatArrayOf(0f, 0.44f, 0.9f), screen)
            ell(c, w * 0.82f, h * 0.48f, w * 0.42f, h * 0.58f, intArrayOf(al(c2, 0.85f), al(c2b, 0.5f), 0), floatArrayOf(0f, 0.44f, 0.9f), screen)
            // vinyet
            ell(c, w * 0.5f, h * 0.48f, w * 0.75f, h * 0.70f, intArrayOf(0, 0, Color.argb(199, 2, 4, 10)), floatArrayOf(0f, 0.35f, 1f), p)
            p.shader = LinearGradient(0f, 0f, 0f, h, intArrayOf(Color.argb(184, 2, 4, 12), 0, 0, Color.argb(224, 2, 4, 12)), floatArrayOf(0f, 0.24f, 0.72f, 1f), Shader.TileMode.CLAMP)
            c.drawRect(0f, 0f, w, h, p)
        }
        private fun al(c: Int, a: Float) = Color.argb((a * 255).toInt(), Color.red(c), Color.green(c), Color.blue(c))
    }

    private fun build() {
        val d = data ?: return; val s = st ?: return
        removeAllViews()
        val style = d.optJSONObject("cfg")?.optString("style") ?: ""
        if (style != "arena") {
            tickRun?.let { removeCallbacks(it) }; tickRun = null
            val k = BigCtx(this, d, s)
            when (style) {
                "stadyum" -> buildStadyum(k); "bant" -> buildBant(k); "sayac" -> buildSayac(k); "poster" -> buildPoster(k)
                "duello" -> buildDuello(k); "turnuva" -> buildTurnuva(k); "matchday" -> buildMatchday(k); "neonarena" -> buildNeon(k)
                else -> buildUyum(d, s)
            }
            post { requestLayout() }
            return
        }
        val m = d.optJSONObject("m") ?: return; val cfg = d.optJSONObject("cfg") ?: JSONObject()
        val W = width.toFloat(); val H = height.toFloat()
        val u = min(H, W * 9f / 16f) / 100f; val w = W / 100f
        val up = { t: String -> t.uppercase(trTR) }
        val (c1, c1b) = teamPair(m.str("home"), m.str("hc"), m.str("hc2"), m.str("hcol"), m.str("hcol2"))
        val (c2, c2b) = teamPair(m.str("away"), m.str("ac"), m.str("ac2"), m.str("acol"), m.str("acol2"))
        val (lc1, lc2) = leagueColors(m.str("league"), m.optBoolean("derby"))
        val league = up(m.str("league")); val kick = if (m.optBoolean("derby")) "BÜYÜK DERBİ" else "AVRUPA GECESİ"
        val dayTxt = d.optString("dayTxt"); val tm = d.optString("tm")
        val llogo = leagueLogo(m)
        val gold = Color.parseColor("#ffe08a")

        fun tv(t: String, size: Float, color: Int, bold: Boolean = true) = TextView(context).apply {
            text = t; includeFontPadding = false; setTextColor(color); setTextSize(TypedValue.COMPLEX_UNIT_PX, size)
            typeface = Typeface.create(Typeface.DEFAULT, if (bold) Typeface.BOLD else Typeface.NORMAL)
        }

        // arka plan görseli
        addView(ImageView(context).apply { scaleType = ImageView.ScaleType.CENTER_CROP; load(NativeEnv.url("/site/bg-arena.jpg")) { crossfade(false) } }, LayoutParams(-1, -1))
        addView(View(context).apply { setBackgroundColor(Color.argb(120, 3, 5, 12)) }, LayoutParams(-1, -1))
        addView(Glow(context, lc1, lc2, c1, c1b, c2, c2b), LayoutParams(-1, -1))

        val wrap = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL
            setPadding((4 * w).toInt(), (2.2f * u).toInt(), (4 * w).toInt(), (2.4f * u).toInt())
        }
        // üst: marka + taç
        val header = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL }
        val logo = s.raw.optJSONObject("brand")?.str("logo") ?: ""
        if (logo.isNotEmpty()) header.addView(ImageView(context).apply { scaleType = ImageView.ScaleType.FIT_CENTER; load(NativeEnv.url(logo)) { crossfade(false) } }, LinearLayout.LayoutParams((40 * w).toInt(), (9 * u).toInt()))
        else header.addView(tv(up(s.brandName), 3 * u, Color.WHITE).apply { letterSpacing = 0.24f })
        val crown = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
            val pad = (4.2f * w).toInt(); setPadding(pad + (2.2f * u).toInt(), (0.75f * u).toInt(), pad + (2.2f * u).toInt(), (0.75f * u).toInt())
            val cut = 2.2f * u
            background = Poly({ ww, hh -> floatArrayOf(cut, 0f, ww - cut, 0f, ww.toFloat(), hh / 2f, ww - cut, hh.toFloat(), cut, hh.toFloat(), 0f, hh / 2f) }, mix(lc1, Color.argb(242, 14, 20, 38), 0.68f), Color.argb(250, 6, 9, 18), lc2, 0.22f * u)
        }
        fun lg() = ImageView(context).apply { scaleType = ImageView.ScaleType.FIT_CENTER; load(NativeEnv.url(llogo)) { crossfade(false) } }
        crown.addView(lg(), LinearLayout.LayoutParams((4.4f * u).toInt(), (4.4f * u).toInt()))
        val ct = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL }
        ct.addView(tv(if (league.isNotEmpty()) league else kick, 2.7f * u, mix(Color.WHITE, lc2, 0.7f)).apply { letterSpacing = 0.26f })
        val venue = m.str("venue")
        ct.addView(tv(if (venue.isNotEmpty()) "$venue · $dayTxt" else dayTxt, 1.65f * u, Color.parseColor("#d6e4ff")).apply { letterSpacing = 0.22f }, LinearLayout.LayoutParams(-2, -2).also { it.topMargin = (0.15f * u).toInt() })
        crown.addView(ct, LinearLayout.LayoutParams(-2, -2).also { it.leftMargin = (1.8f * w).toInt(); it.rightMargin = (1.8f * w).toInt() })
        crown.addView(lg(), LinearLayout.LayoutParams((4.4f * u).toInt(), (4.4f * u).toInt()))
        header.addView(crown, LinearLayout.LayoutParams(-2, -2).also { it.topMargin = (0.6f * u).toInt() })
        wrap.addView(header, LinearLayout.LayoutParams(-1, -2))

        // sahne
        val stage = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        fun podium(role: String, name: String, crestUrl: String, photo: String, col: Int, col2: Int): LinearLayout = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL
            val orbSize = (33 * u).toInt()
            if (photo.isNotEmpty()) addView(ImageView(context).apply { scaleType = ImageView.ScaleType.FIT_CENTER; load(NativeEnv.url(photo)) { crossfade(false) } }, LinearLayout.LayoutParams(-1, (36 * u).toInt()))
            else {
                val orb = FrameLayout(context)
                // dış ışıma
                orb.addView(View(context).apply { background = GradientDrawable().apply { gradientType = GradientDrawable.RADIAL_GRADIENT; gradientRadius = orbSize * 0.8f; colors = intArrayOf(al(col, 0.9f), al(col2, 0.5f), 0); shape = GradientDrawable.OVAL } }, LayoutParams((orbSize * 1.55f).toInt(), (orbSize * 1.55f).toInt(), Gravity.CENTER))
                val disc = FrameLayout(context).apply {
                    background = GradientDrawable().apply { shape = GradientDrawable.OVAL; gradientType = GradientDrawable.RADIAL_GRADIENT; gradientRadius = orbSize * 0.75f; setGradientCenter(0.35f, 0.26f)
                        colors = intArrayOf(Color.argb(56, 255, 255, 255), mix(col, Color.argb(230, 8, 12, 24), 0.58f), Color.argb(250, 4, 6, 14)); setStroke((0.36f * u).toInt().coerceAtLeast(1), gold) }
                }
                if (crestUrl.isNotEmpty()) disc.addView(ImageView(context).apply { scaleType = ImageView.ScaleType.FIT_CENTER; load(NativeEnv.url(crestUrl)) { crossfade(false) } }, LayoutParams((orbSize * 0.82f).toInt(), (orbSize * 0.82f).toInt(), Gravity.CENTER))
                else {
                    val wds = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
                    val ini = up(if (wds.size > 1) wds.take(2).joinToString("") { it.take(1) } else (wds.firstOrNull() ?: "?").take(3))
                    disc.addView(tv(ini, orbSize * 0.32f, Color.WHITE).apply { gravity = Gravity.CENTER }, LayoutParams(-2, -2, Gravity.CENTER))
                }
                orb.addView(disc, LayoutParams(orbSize, orbSize, Gravity.CENTER))
                addView(orb, LinearLayout.LayoutParams(-2, (orbSize * 1.2f).toInt()))
            }
            val ped = LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL
                setPadding((2 * w).toInt(), (1.1f * u).toInt(), (2 * w).toInt(), (1.1f * u).toInt())
                val cut = 1.6f * u
                background = Poly({ ww, hh -> floatArrayOf(cut, 0f, ww - cut, 0f, ww.toFloat(), hh.toFloat(), 0f, hh.toFloat()) }, mix(col, Color.argb(242, 12, 16, 30), 0.52f), Color.argb(250, 6, 9, 18), gold, 0.22f * u)
            }
            ped.addView(tv(role, 1.45f * u, mix(col2, Color.WHITE, 0.25f)).apply { letterSpacing = 0.26f })
            val big = name.length <= 13
            val tname = tv(up(name), min(if (big) 5.2f * u else 4f * u, (if (big) 3.1f else 2.4f) * w), Color.WHITE).apply { setSingleLine(true); ellipsize = TextUtils.TruncateAt.END; letterSpacing = 0.04f; setShadowLayer(u * 0.5f, 0f, u * 0.4f, Color.BLACK) }
            ped.addView(tname, LinearLayout.LayoutParams(-2, -2).also { it.topMargin = (0.25f * u).toInt() })
            addView(ped, LinearLayout.LayoutParams(-1, -2).also { it.topMargin = (1.4f * u).toInt() })
        }
        stage.addView(podium("EV SAHİBİ", m.str("home"), m.str("hl"), m.str("hp"), c1, c1b), LinearLayout.LayoutParams(0, -2, 1f).also { it.rightMargin = (2 * w).toInt() })
        val center = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL }
        val coreSize = (26 * u).toInt()
        val core = FrameLayout(context).apply {
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; gradientType = GradientDrawable.RADIAL_GRADIENT; gradientRadius = coreSize * 0.75f; setGradientCenter(0.35f, 0.25f)
                colors = intArrayOf(mix(lc1, Color.argb(245, 20, 26, 44), 0.45f), Color.argb(250, 10, 14, 26), Color.parseColor("#04060c")); setStroke((0.34f * u).toInt().coerceAtLeast(1), lc2) }
        }
        core.addView(ImageView(context).apply { scaleType = ImageView.ScaleType.FIT_CENTER; load(NativeEnv.url(llogo)) { crossfade(false) } }, LayoutParams((coreSize * 0.8f).toInt(), (coreSize * 0.8f).toInt(), Gravity.CENTER))
        center.addView(core, LinearLayout.LayoutParams(coreSize, coreSize))
        center.addView(tv("VS", 3 * u, Color.parseColor("#140d04")).apply {
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD_ITALIC); letterSpacing = 0.14f
            background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(Color.parseColor("#fff0b8"), Color.parseColor("#dfa028"), Color.parseColor("#874c04"))).apply { cornerRadius = 99f * u; setStroke((0.2f * u).toInt().coerceAtLeast(1), Color.WHITE) }
            setPadding((2.2f * w).toInt(), (0.45f * u).toInt(), (2.2f * w).toInt(), (0.45f * u).toInt())
        }, LinearLayout.LayoutParams(-2, -2).also { it.topMargin = (1.4f * u).toInt() })
        val tbox = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL
            background = GradientDrawable().apply { setColor(Color.argb(235, 6, 10, 20)); cornerRadius = 1.4f * u; setStroke((0.18f * u).toInt().coerceAtLeast(1), al(lc2, 0.65f)) }
            setPadding((0.6f * w).toInt(), (0.9f * u).toInt(), (0.6f * w).toInt(), (0.9f * u).toInt())
        }
        tbox.addView(tv(tm, 5.4f * u, Color.WHITE).apply { setSingleLine(true); gravity = Gravity.CENTER; setShadowLayer(u * 2f, 0f, 0f, Color.argb(140, 255, 210, 100)) }, LinearLayout.LayoutParams(-1, -2))
        tbox.addView(tv(up(dayTxt), 2f * u, lc2).apply { setSingleLine(true); letterSpacing = 0.1f }, LinearLayout.LayoutParams(-2, -2).also { it.topMargin = (0.3f * u).toInt() })
        center.addView(tbox, LinearLayout.LayoutParams((coreSize * 1.15f).toInt(), -2).also { it.topMargin = (1.4f * u).toInt() })
        stage.addView(center, LinearLayout.LayoutParams(-2, -2))
        stage.addView(podium("DEPLASMAN", m.str("away"), m.str("al"), m.str("ap"), c2, c2b), LinearLayout.LayoutParams(0, -2, 1f).also { it.leftMargin = (2 * w).toInt() })
        wrap.addView(stage, LinearLayout.LayoutParams(-1, 0, 1f))

        // alt şerit
        val note = cfg.optString("note").ifEmpty { "REZERVASYON YAPTIRMAYI UNUTMAYIN!" }
        val footer = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL
            setPadding((3 * w).toInt(), (0.9f * u).toInt(), (3 * w).toInt(), (0.9f * u).toInt())
            background = Poly({ ww, hh -> floatArrayOf(0f, 0f, ww.toFloat(), 0f, ww.toFloat(), hh.toFloat(), 0f, hh.toFloat()) }, Color.argb(250, 12, 18, 34), Color.argb(250, 8, 12, 24), al(lc2, 0.8f), 0.22f * u)
        }
        footer.addView(tv(note, 2.8f * u, Color.WHITE).apply { gravity = Gravity.CENTER; setShadowLayer(u, 0f, u * 0.3f, Color.BLACK) })
        val infoArr = cfg.optJSONArray("info"); val icons = listOf("📍", "🎮", "💨")
        val infos = ArrayList<String>(); if (infoArr != null) for (i in 0 until infoArr.length()) { val t = infoArr.optString(i); if (t.isNotEmpty()) infos.add(icons[infos.size % 3] + " " + t) }
        if (infos.isNotEmpty()) footer.addView(tv(infos.joinToString("      "), 2f * u, lc2).apply { gravity = Gravity.CENTER }, LinearLayout.LayoutParams(-2, -2).also { it.topMargin = (0.4f * u).toInt() })
        wrap.addView(footer, LinearLayout.LayoutParams((W * 0.88f).toInt(), -2))
        addView(wrap, LayoutParams(-1, -1))
    }

    /** Varsayılan "uyum" tasarımı: iki takım rengi çapraz bölünür, ortada büyük takım adları, saat, gün ve alt şerit. */
    private fun buildUyum(d: JSONObject, s: TvState) {
        val m = d.optJSONObject("m") ?: return; val cfg = d.optJSONObject("cfg") ?: JSONObject()
        val W = width.toFloat(); val H = height.toFloat()
        val u = min(H, W * 9f / 16f) / 100f; val w = W / 100f
        val up = { t: String -> t.uppercase(trTR) }
        val c1 = hex(m.str("hc")) ?: Color.parseColor("#12307f"); val c2 = hex(m.str("ac")) ?: Color.parseColor("#2c2c30")
        val gold = Color.parseColor("#f4c04f"); val dark = Color.parseColor("#0a0a0c")
        val dayTxt = d.optString("dayTxt"); val tm = d.optString("tm")
        fun tv(t: String, size: Float, color: Int, bold: Boolean = true) = TextView(context).apply {
            text = t; includeFontPadding = false; setTextColor(color); setTextSize(TypedValue.COMPLEX_UNIT_PX, size)
            typeface = Typeface.create(Typeface.DEFAULT, if (bold) Typeface.BOLD else Typeface.NORMAL)
        }
        setBackgroundColor(dark)
        // çapraz bölünmüş renk alanları
        addView(View(context).apply { background = Poly({ ww, hh -> floatArrayOf(0f, 0f, ww * 0.57f, 0f, ww * 0.43f, hh.toFloat(), 0f, hh.toFloat()) }, c1, dark, 0, 0f) }, LayoutParams(-1, -1))
        addView(View(context).apply { background = Poly({ ww, hh -> floatArrayOf(ww * 0.57f, 0f, ww.toFloat(), 0f, ww.toFloat(), hh.toFloat(), ww * 0.43f, hh.toFloat()) }, c2, dark, 0, 0f) }, LayoutParams(-1, -1))
        addView(object : View(context) {
            private val p = Paint(Paint.ANTI_ALIAS_FLAG)
            override fun onDraw(c: Canvas) {
                val ww = width.toFloat(); val hh = height.toFloat()
                c.save(); c.translate(ww * 0.5f, 0f); c.scale(1f, (hh * 0.45f) / (ww * 0.5f))
                p.shader = RadialGradient(0f, 0f, ww * 0.5f, intArrayOf(Color.argb(56, 255, 255, 255), 0), floatArrayOf(0f, 0.7f), Shader.TileMode.CLAMP); c.drawCircle(0f, 0f, ww * 0.5f, p); c.restore()
                c.save(); c.translate(ww * 0.5f, hh); c.scale(1f, (hh * 0.6f) / ww)
                p.shader = RadialGradient(0f, 0f, ww, intArrayOf(Color.argb(217, 0, 0, 0), 0), floatArrayOf(0f, 0.7f), Shader.TileMode.CLAMP); c.drawCircle(0f, 0f, ww, p); c.restore()
            }
        }, LayoutParams(-1, -1))
        // takım görselleri
        fun side(logo: String, photo: String, left: Boolean) {
            if (photo.isNotEmpty()) {
                addView(ImageView(context).apply { scaleType = ImageView.ScaleType.FIT_END; load(NativeEnv.url(photo)) { crossfade(false) } }, LayoutParams((W * 0.46f).toInt(), (H * 0.78f).toInt(), (if (left) Gravity.START else Gravity.END) or Gravity.BOTTOM))
                if (logo.isNotEmpty()) addView(ImageView(context).apply { alpha = 0.28f; scaleType = ImageView.ScaleType.FIT_CENTER; load(NativeEnv.url(logo)) { crossfade(false) } }, LayoutParams((46 * u).toInt(), (46 * u).toInt(), (if (left) Gravity.START else Gravity.END) or Gravity.TOP).also { it.topMargin = (-4 * u).toInt() })
            } else if (logo.isNotEmpty()) {
                addView(ImageView(context).apply { scaleType = ImageView.ScaleType.FIT_CENTER; load(NativeEnv.url(logo)) { crossfade(false) } }, LayoutParams((31 * u).toInt(), (31 * u).toInt(), (if (left) Gravity.START else Gravity.END) or Gravity.TOP).also { it.topMargin = (H * 0.22f).toInt(); if (left) it.leftMargin = (W * 0.07f).toInt() else it.rightMargin = (W * 0.07f).toInt() })
            }
        }
        side(m.str("hl"), m.str("hp"), true); side(m.str("al"), m.str("ap"), false)

        val bc = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; setPadding((3 * w).toInt(), (2.4f * u).toInt(), (3 * w).toInt(), 0) }
        val top = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL }
        val logo = s.raw.optJSONObject("brand")?.str("logo") ?: ""
        if (logo.isNotEmpty()) top.addView(ImageView(context).apply { scaleType = ImageView.ScaleType.FIT_CENTER; load(NativeEnv.url(logo)) { crossfade(false) } }, LinearLayout.LayoutParams((40 * w).toInt(), (9 * u).toInt()))
        else top.addView(tv(up(s.brandName), 3 * u, Color.parseColor("#ffe9a8")).apply { letterSpacing = 0.2f })
        top.addView(tv(if (m.optBoolean("derby")) "BÜYÜK DERBİ" else "AVRUPA GECESİ", 8.6f * u, Color.parseColor("#f2c14e")).apply {
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD_ITALIC); gravity = Gravity.CENTER; setShadowLayer(u * 0.8f, 0f, u * 0.5f, Color.argb(200, 0, 0, 0))
        }, LinearLayout.LayoutParams(-2, -2).also { it.topMargin = (1.4f * u).toInt() })
        if (!m.optBoolean("derby")) top.addView(tv(up(m.str("league")), 2.3f * u, Color.parseColor("#ffe9a8")).apply { letterSpacing = 0.34f; gravity = Gravity.CENTER }, LinearLayout.LayoutParams(-2, -2).also { it.topMargin = (0.8f * u).toInt() })
        bc.addView(top, LinearLayout.LayoutParams(-1, -2))
        bc.addView(View(context), LinearLayout.LayoutParams(-1, 0, 1f))

        val btm = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL }
        val nm = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        fun nameTv(n: String) = tv(up(n), (if (n.length > 13) 5f else 7f) * u, gold).apply { gravity = Gravity.CENTER; maxLines = 2; ellipsize = TextUtils.TruncateAt.END; setShadowLayer(u, 0f, u * 0.4f, Color.BLACK) }
        nm.addView(nameTv(m.str("home")), LinearLayout.LayoutParams(0, -2, 1f))
        nm.addView(tv("VS", 3.6f * u, Color.WHITE).apply { alpha = 0.9f }, LinearLayout.LayoutParams(-2, -2).also { it.leftMargin = (2 * w).toInt(); it.rightMargin = (2 * w).toInt() })
        nm.addView(nameTv(m.str("away")), LinearLayout.LayoutParams(0, -2, 1f))
        btm.addView(nm, LinearLayout.LayoutParams(-1, -2))
        btm.addView(tv("🕘 $tm", 8.4f * u, Color.WHITE).apply { setShadowLayer(u, 0f, u * 0.4f, Color.BLACK); setSingleLine(true) }, LinearLayout.LayoutParams(-2, -2).also { it.topMargin = (1.3f * u).toInt() })
        btm.addView(tv(up(dayTxt), 3f * u, Color.parseColor("#1a110a")).apply {
            letterSpacing = 0.06f; setSingleLine(true)
            background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(Color.parseColor("#f4c04f"), Color.parseColor("#c98d22"))).apply { cornerRadius = 0.8f * u }
            setPadding((3 * w).toInt(), (0.7f * u).toInt(), (3 * w).toInt(), (0.7f * u).toInt())
        }, LinearLayout.LayoutParams(-2, -2).also { it.topMargin = (1.3f * u).toInt() })
        val note = cfg.str("note")
        if (note.isNotEmpty()) btm.addView(tv(note, 3.6f * u, Color.WHITE).apply {
            gravity = Gravity.CENTER; setBackgroundColor(Color.argb(153, 0, 0, 0)); setPadding((3 * w).toInt(), (1.3f * u).toInt(), (3 * w).toInt(), (1.3f * u).toInt())
        }, LinearLayout.LayoutParams(W.toInt(), -2).also { it.topMargin = (1.7f * u).toInt() })
        val infoArr = cfg.optJSONArray("info"); val icons = listOf("📍", "🎮", "💨")
        val infos = ArrayList<String>(); if (infoArr != null) for (i in 0 until infoArr.length()) { val t = infoArr.optString(i); if (t.isNotEmpty() && t != "null") infos.add(icons[infos.size % 3] + " " + up(t)) }
        if (infos.isNotEmpty()) btm.addView(tv(infos.joinToString("        "), 2.5f * u, Color.WHITE).apply {
            gravity = Gravity.CENTER; setBackgroundColor(Color.argb(184, 0, 0, 0)); setPadding((3 * w).toInt(), (1.2f * u).toInt(), (3 * w).toInt(), (1.4f * u).toInt()); letterSpacing = 0.06f
        }, LinearLayout.LayoutParams(W.toInt(), -2))
        else btm.addView(View(context), LinearLayout.LayoutParams(-1, (1.4f * u).toInt()))
        bc.addView(btm, LinearLayout.LayoutParams(-1, -2))
        addView(bc, LayoutParams(-1, -1))
        post { requestLayout() }
    }
}
