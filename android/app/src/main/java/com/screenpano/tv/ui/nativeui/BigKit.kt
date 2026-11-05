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
import kotlin.math.min

/** Büyük maç tasarımlarının ortak yerel araçları (renkler, çizim görünümü, arma/halka, üst ve alt bloklar). Animasyon yok. */
internal object BigColors {
    fun hex(v: String?): Int? {
        val t = (v ?: "").removePrefix("#")
        return if (Regex("^[0-9a-fA-F]{6}$").matches(t)) Color.parseColor("#$t") else null
    }
    fun mix(a: Int, b: Int, t: Float): Int = Color.argb(
        (Color.alpha(a) * (1 - t) + Color.alpha(b) * t).toInt(), (Color.red(a) * (1 - t) + Color.red(b) * t).toInt(),
        (Color.green(a) * (1 - t) + Color.green(b) * t).toInt(), (Color.blue(a) * (1 - t) + Color.blue(b) * t).toInt())
    fun al(c: Int, a: Float) = Color.argb((a * 255).toInt().coerceIn(0, 255), Color.red(c), Color.green(c), Color.blue(c))
    fun teamPair(name: String, c1: String?, c2: String?, raw1: String?, raw2: String?): Pair<Int, Int> {
        val n = name.lowercase(Locale("tr", "TR"))
        if (n.contains("galatasaray")) return Color.parseColor("#c9082a") to Color.parseColor("#ffb800")
        if (n.contains("fenerbah")) return Color.parseColor("#123690") to Color.parseColor("#ffdd00")
        if (n.contains("beşiktaş") || n.contains("besiktas")) return Color.parseColor("#22252c") to Color.parseColor("#e2e8f0")
        if (n.contains("trabzon")) return Color.parseColor("#800f34") to Color.parseColor("#29a8ff")
        val p = hex(c1) ?: hex(raw1) ?: Color.parseColor("#12307f")
        val cands = listOfNotNull(hex(c2), hex(raw2), hex(raw1)).filter { it != p }
        return p to (cands.firstOrNull() ?: mix(p, Color.parseColor("#ffd24c"), 0.55f))
    }
    fun leagueColors(league: String, derby: Boolean): Pair<Int, Int> = when (league) {
        "Süper Lig" -> "#e30a17" to "#ffd478"; "Avrupa Ligi" -> "#ff6b00" to "#ffb800"; "Konferans Ligi" -> "#00d65b" to "#a8ff78"
        "Şampiyonlar Ligi", "Şampiyonlar Ligi Eleme" -> "#1a5cff" to "#ffe08a"
        else -> if (derby) "#e30a17" to "#ffd478" else "#1a5cff" to "#ffe08a"
    }.let { Color.parseColor(it.first) to Color.parseColor(it.second) }
}

internal fun JSONObject.str(k: String): String = if (isNull(k)) "" else optString(k).let { if (it == "null") "" else it }

/** Kendini bir işlevle çizen görünüm (ışıma, ızgara, çokgen alanlar). */
internal class DrawView(context: Context, private val fn: (Canvas, Float, Float) -> Unit) : View(context) {
    override fun onDraw(c: Canvas) { fn(c, width.toFloat(), height.toFloat()) }
}

internal object G {
    private val p = Paint(Paint.ANTI_ALIAS_FLAG)
    private val screen = PorterDuffXfermode(PorterDuff.Mode.SCREEN)
    /** Elips biçimli radyal ışıma. */
    fun ell(c: Canvas, cx: Float, cy: Float, rx: Float, ry: Float, colors: IntArray, pos: FloatArray?, screenMode: Boolean = false) {
        if (rx <= 0f || ry <= 0f) return
        c.save(); c.translate(cx, cy); c.scale(1f, ry / rx)
        p.shader = RadialGradient(0f, 0f, rx, colors, pos, Shader.TileMode.CLAMP); p.xfermode = if (screenMode) screen else null
        c.drawCircle(0f, 0f, rx, p); c.restore(); p.xfermode = null; p.shader = null
    }
    fun lin(c: Canvas, x0: Float, y0: Float, x1: Float, y1: Float, colors: IntArray, pos: FloatArray?, l: Float, t: Float, r: Float, b: Float) {
        p.shader = LinearGradient(x0, y0, x1, y1, colors, pos, Shader.TileMode.CLAMP); c.drawRect(l, t, r, b, p); p.shader = null
    }
    fun poly(c: Canvas, pts: FloatArray, shader: Shader?, color: Int = 0) {
        val path = Path(); path.moveTo(pts[0], pts[1]); var i = 2; while (i < pts.size) { path.lineTo(pts[i], pts[i + 1]); i += 2 }; path.close()
        p.shader = shader; if (shader == null) p.color = color; c.drawPath(path, p); p.shader = null
    }
    fun gradient(x0: Float, y0: Float, x1: Float, y1: Float, colors: IntArray, pos: FloatArray? = null) = LinearGradient(x0, y0, x1, y1, colors, pos, Shader.TileMode.CLAMP)
}

/** Çokgen (paralelkenar vb.) zemin: dolgu degradesi + isteğe bağlı kenar çizgisi. */
internal class PolyBg(
    private val pts: (Int, Int) -> FloatArray, private val colors: IntArray, private val horizontal: Boolean = false,
    private val stroke: Int = 0, private val sw: Float = 0f
) : Drawable() {
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG); private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    override fun draw(c: Canvas) {
        val w = bounds.width(); val h = bounds.height(); if (w <= 0 || h <= 0) return
        val p = pts(w, h); val path = Path(); path.moveTo(p[0], p[1]); var i = 2; while (i < p.size) { path.lineTo(p[i], p[i + 1]); i += 2 }; path.close()
        fill.shader = if (horizontal) LinearGradient(0f, 0f, w.toFloat(), 0f, colors, null, Shader.TileMode.CLAMP) else LinearGradient(0f, 0f, 0f, h.toFloat(), colors, null, Shader.TileMode.CLAMP)
        c.drawPath(path, fill)
        if (sw > 0f && stroke != 0) { line.color = stroke; line.strokeWidth = sw * 2; c.save(); c.clipPath(path); c.drawPath(path, line); c.restore() }
    }
    override fun setAlpha(a: Int) {}
    override fun setColorFilter(f: ColorFilter?) {}
    @Suppress("OVERRIDE_DEPRECATION") override fun getOpacity() = PixelFormat.TRANSLUCENT
}

/** Tek satırlık metinler üst kutu dar ölçülünce sağdan kesilmesin: gereken genişlikten küçük ölçülmez (kısaltma istenenlerde ellipsize açıkken uygulanmaz). */
internal class FitText(context: Context) : TextView(context) {
    override fun onMeasure(w: Int, h: Int) {
        super.onMeasure(w, h)
        if (ellipsize != null || maxLines > 1 || MeasureSpec.getMode(w) == MeasureSpec.EXACTLY) return
        val t = text?.toString() ?: return
        if (t.contains('\n')) return
        // Harf aralığı bazı sürümlerde ölçüme girmiyor; sondaki harf kesilmesin diye ekle
        val need = (paint.measureText(t) + letterSpacing * textSize * t.length + paddingLeft + paddingRight + shadowRadius * 2 + 2).toInt()
        if (measuredWidth < need) setMeasuredDimension(need, measuredHeight)
    }
}

internal class BigCtx(val v: FrameLayout, d: JSONObject, val s: TvState) {
    val ctx: Context = v.context
    val m: JSONObject = d.optJSONObject("m") ?: JSONObject()
    val cfg: JSONObject = d.optJSONObject("cfg") ?: JSONObject()
    val pw = v.width.toFloat(); val ph = v.height.toFloat()
    val u = min(ph, pw * 9f / 16f) / 100f; val w = pw / 100f
    private val tr = Locale("tr", "TR")
    fun up(t: String) = t.uppercase(tr)
    val home = m.str("home"); val away = m.str("away")
    private val tp1 = BigColors.teamPair(home, m.str("hc"), m.str("hc2"), m.str("hcol"), m.str("hcol2"))
    private val tp2 = BigColors.teamPair(away, m.str("ac"), m.str("ac2"), m.str("acol"), m.str("acol2"))
    val c1 = tp1.first; val c1b = tp1.second; val c2 = tp2.first; val c2b = tp2.second
    val derby = m.optBoolean("derby")
    private val lcs = BigColors.leagueColors(m.str("league"), derby)
    val lc1 = lcs.first; val lc2 = lcs.second
    val league = up(m.str("league"))
    val kick = if (derby) "BÜYÜK DERBİ" else "AVRUPA GECESİ"
    val dayTxt = d.optString("dayTxt"); val dayName = d.optString("dayName"); val tm = d.optString("tm")
    val venue = m.str("venue")
    val ts = m.optLong("ts")
    val llogo: String = m.str("ll").ifEmpty {
        when (m.str("league")) {
            "Süper Lig" -> "/logo/l-18.png?v=2"; "Şampiyonlar Ligi", "Şampiyonlar Ligi Eleme" -> "/logo/l-2.png?v=2"
            "Avrupa Ligi" -> "/logo/l-2310.png?v=2"; "Konferans Ligi" -> "/logo/l-20296.png?v=2"
            else -> if (derby) "/logo/l-18.png?v=2" else "/logo/l-2.png?v=2"
        }
    }
    val brandLogo: String = s.raw.optJSONObject("brand")?.str("logo") ?: ""
    val note: String = cfg.str("note")
    val infos: List<String> = run {
        val a = cfg.optJSONArray("info"); val icons = listOf("📍", "🎮", "💨"); val l = ArrayList<String>()
        if (a != null) for (i in 0 until a.length()) { val t = a.optString(i); if (t.isNotEmpty() && t != "null") l.add(icons[l.size % 3] + " " + t) }
        l
    }
    val hl = m.str("hl"); val al = m.str("al"); val hp = m.str("hp"); val ap = m.str("ap")

    fun px(f: Float) = f.toInt()
    fun lp(w: Int, h: Int) = LinearLayout.LayoutParams(w, h)
    fun flp(w: Int, h: Int, g: Int = Gravity.NO_GRAVITY) = FrameLayout.LayoutParams(w, h, g)

    fun tv(t: String, size: Float, color: Int, bold: Boolean = true, italic: Boolean = false, spacing: Float = 0f, shadow: Boolean = false): TextView = FitText(ctx).apply {
        text = t; includeFontPadding = false; setTextColor(color); setTextSize(TypedValue.COMPLEX_UNIT_PX, size)
        typeface = Typeface.create(Typeface.DEFAULT, if (bold && italic) Typeface.BOLD_ITALIC else if (bold) Typeface.BOLD else if (italic) Typeface.ITALIC else Typeface.NORMAL)
        if (spacing != 0f) letterSpacing = spacing
        if (shadow) setShadowLayer(u * 0.8f, 0f, u * 0.4f, Color.argb(200, 0, 0, 0))
    }

    fun img(url: String, fit: ImageView.ScaleType = ImageView.ScaleType.FIT_CENTER): ImageView = ImageView(ctx).apply {
        scaleType = fit; if (url.isNotEmpty()) load(NativeEnv.url(url)) { crossfade(false) }
    }

    private fun ini(t: String): String {
        val ws = t.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
        return up(if (ws.size > 1) ws.take(2).joinToString("") { it.take(1) } else (ws.firstOrNull() ?: "?").take(3))
    }

    /** Arma (yoksa takım renginde baş harfli rozet), size×size içinde %pct kaplar. */
    fun crest(url: String, team: String, col: Int, size: Int, pct: Float = 0.82f): View {
        val box = FrameLayout(ctx); val inner = (size * pct).toInt()
        if (url.isNotEmpty()) box.addView(img(url), flp(inner, inner, Gravity.CENTER))
        else {
            val mono = FrameLayout(ctx).apply {
                background = GradientDrawable().apply { shape = GradientDrawable.OVAL; gradientType = GradientDrawable.RADIAL_GRADIENT; gradientRadius = inner * 0.7f; setGradientCenter(0.35f, 0.3f)
                    colors = intArrayOf(BigColors.mix(col, Color.WHITE, 0.7f), col, BigColors.mix(col, Color.BLACK, 0.4f)); setStroke(maxOf(1, (0.35f * u).toInt()), Color.argb(90, 255, 255, 255)) }
            }
            mono.addView(tv(ini(team), inner * 0.3f, Color.WHITE, shadow = true).apply { gravity = Gravity.CENTER }, flp(-2, -2, Gravity.CENTER))
            box.addView(mono, flp(inner, inner, Gravity.CENTER))
        }
        return box
    }

    /** Işımalı yuvarlak arma tahtı: dış ışıma, koyu disk, ince halka. */
    fun orb(size: Int, col: Int, col2: Int, inner: View, ring: Int, ringW: Float, aura: Float = 1.5f): FrameLayout {
        val f = FrameLayout(ctx).apply { clipChildren = false }
        f.addView(View(ctx).apply { background = GradientDrawable().apply { shape = GradientDrawable.OVAL; gradientType = GradientDrawable.RADIAL_GRADIENT; gradientRadius = size * aura * 0.5f
            colors = intArrayOf(BigColors.al(col2, 0.9f), BigColors.al(col, 0.55f), 0) } }, flp((size * aura).toInt(), (size * aura).toInt(), Gravity.CENTER))
        val disc = FrameLayout(ctx).apply {
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; gradientType = GradientDrawable.RADIAL_GRADIENT; gradientRadius = size * 0.7f; setGradientCenter(0.35f, 0.28f)
                colors = intArrayOf(Color.argb(56, 255, 255, 255), BigColors.mix(col, Color.argb(230, 10, 14, 26), 0.58f), Color.argb(250, 4, 6, 12)); setStroke(maxOf(1, (ringW * u).toInt()), ring) }
        }
        disc.addView(inner, flp(size, size, Gravity.CENTER))
        f.addView(disc, flp(size, size, Gravity.CENTER))
        return f
    }

    fun brand(): View = if (brandLogo.isNotEmpty()) img(brandLogo) else tv(up(s.brandName), 2.4f * u, Color.WHITE, spacing = 0.24f, shadow = true)
    /** Marka görünümünün yerleşimi: logo kutusu sabit (40 genişlik × hU yükseklik), yazı içeriğe göre. */
    fun brandLp(hU: Float = 7.5f): LinearLayout.LayoutParams = if (brandLogo.isNotEmpty()) lp((40 * w).toInt(), (hU * u).toInt()) else lp(-2, -2)

    /** .ytop: marka, "BÜYÜK DERBİ / AVRUPA GECESİ" çizgili başlık, lig. */
    fun top(withKick: Boolean = true, leagueLine: Boolean = true): LinearLayout = LinearLayout(ctx).apply {
        orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL
        addView(brand(), brandLp())
        if (withKick) {
            val row = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            val bar = { rev: Boolean -> View(ctx).apply { background = GradientDrawable(if (rev) GradientDrawable.Orientation.RIGHT_LEFT else GradientDrawable.Orientation.LEFT_RIGHT, intArrayOf(0, Color.parseColor("#f4c04f"))) } }
            row.addView(bar(false), lp((8 * u).toInt(), maxOf(1, (0.25f * u).toInt())))
            row.addView(tv(kick, 2.3f * u, Color.parseColor("#f4c04f"), spacing = 0.38f), lp(-2, -2).also { it.leftMargin = (1.6f * u).toInt(); it.rightMargin = (1.6f * u).toInt() })
            row.addView(bar(true), lp((8 * u).toInt(), maxOf(1, (0.25f * u).toInt())))
            addView(row, lp(-2, -2).also { it.topMargin = (1 * u).toInt() })
        }
        if (leagueLine && !derby && league.isNotEmpty()) addView(tv(league, 2.6f * u, Color.WHITE, spacing = 0.3f, shadow = true), lp(-2, -2).also { it.topMargin = (1 * u).toInt() })
    }

    fun dayPill(text: String = dayTxt, size: Float = 3f): TextView = tv(up(text), size * u, Color.parseColor("#1a110a"), spacing = 0.08f).apply {
        setSingleLine(true); gravity = Gravity.CENTER
        background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(Color.parseColor("#ffd877"), Color.parseColor("#e0a12e"))).apply { cornerRadius = 5 * u }
        setPadding((2.6f * u).toInt(), (0.7f * u).toInt(), (2.6f * u).toInt(), (0.7f * u).toInt())
    }

    fun name(t: String, big: Float = 5f, small: Float = 3.8f, color: Int = Color.WHITE): TextView {
        val sm = t.length > 13
        return tv(up(t), if (sm) min(small * u, 2.6f * w) else min(big * u, 3.2f * w), color, shadow = true).apply { gravity = Gravity.CENTER; maxLines = 2; ellipsize = TextUtils.TruncateAt.END }
    }

    /** .yend: tam genişlikte not şeridi ve bilgi satırı. */
    fun end(noteSize: Float = 2.9f, plain: Boolean = false): View {
        val box = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL }
        if (note.isNotEmpty()) {
            box.addView(View(ctx).apply { setBackgroundColor(BigColors.al(Color.parseColor("#f4c04f"), 0.65f)) }, lp(-1, maxOf(1, (0.2f * u).toInt())))
            box.addView(tv(note, noteSize * u, Color.WHITE).apply {
                gravity = Gravity.CENTER; setPadding((3 * w).toInt(), (1.2f * u).toInt(), (3 * w).toInt(), (1.2f * u).toInt())
                if (!plain) background = GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, intArrayOf(Color.argb(90, 0, 0, 0), Color.argb(190, 0, 0, 0), Color.argb(90, 0, 0, 0)))
            }, lp(-1, -2))
        }
        if (infos.isNotEmpty()) box.addView(tv(infos.joinToString("        ") { up(it) }, 1.9f * u, Color.argb(225, 255, 255, 255), spacing = 0.08f).apply {
            gravity = Gravity.CENTER; setPadding((3 * w).toInt(), (1.1f * u).toInt(), (3 * w).toInt(), (1.4f * u).toInt()); if (!plain) setBackgroundColor(Color.argb(209, 0, 0, 0))
        }, lp(-1, -2))
        if (note.isEmpty() && infos.isEmpty()) box.addView(View(ctx), lp(-1, (2.4f * u).toInt()))
        return box
    }

    /** Üst + orta + alt: dikey sütun; orta ağırlıklı. */
    fun column(padTop: Float = 2.4f, padSide: Float = 3f): Pair<LinearLayout, LinearLayout> {
        val root = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL }
        val body = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; setPadding((padSide * w).toInt(), (padTop * u).toInt(), (padSide * w).toInt(), 0) }
        root.addView(body, lp(-1, 0).also { it.weight = 1f })
        v.addView(root, flp(-1, -1))
        return root to body
    }
}
