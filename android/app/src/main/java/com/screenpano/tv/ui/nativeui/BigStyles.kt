package com.screenpano.tv.ui.nativeui

import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/** Büyük maç tasarımları (yerel, animasyonsuz): sayfadaki d-<ad> tasarımlarının aynı yerleşimi. */
private const val GOLD = "#f4c04f"
private fun gold() = Color.parseColor(GOLD)
private val MATCH = -1
private val WRAP = -2

private fun BigCtx.vignette(topA: Float = 0.75f, botA: Float = 0.88f) = DrawView(ctx) { c, W, H ->
    G.ell(c, W * 0.5f, H * 0.5f, W * 0.8f, H * 0.8f, intArrayOf(0, 0, Color.argb(153, 0, 0, 0)), floatArrayOf(0f, 0.5f, 1f))
    G.lin(c, 0f, 0f, 0f, H, intArrayOf(Color.argb((topA * 255).toInt(), 0, 0, 0), 0, 0, Color.argb((botA * 255).toInt(), 0, 0, 0)), floatArrayOf(0f, 0.26f, 0.62f, 1f), 0f, 0f, W, H)
}

/** Takım rengiyle ışıyan iki yan ışıma (duello / turnuva / sayaç). */
private fun BigCtx.sideGlows(cy: Float, rxF: Float, ryF: Float, strong: Boolean) = DrawView(ctx) { c, W, H ->
    val a = if (strong) 0.94f else 0.85f
    G.ell(c, W * 0.15f, H * cy, W * rxF, H * ryF, intArrayOf(BigColors.al(c1, a), BigColors.al(c1b, 0.6f), 0), floatArrayOf(0f, 0.48f, 0.72f))
    G.ell(c, W * 0.85f, H * cy, W * rxF, H * ryF, intArrayOf(BigColors.al(c2, a), BigColors.al(c2b, 0.6f), 0), floatArrayOf(0f, 0.48f, 0.72f))
    G.ell(c, W * 0.5f, H * 0.55f, W * 0.3f, H * 0.6f, intArrayOf(Color.argb(56, 255, 190, 90), 0), floatArrayOf(0f, 0.7f))
}

private fun BigCtx.discCrest(size: Int, col: Int, url: String, team: String, bg: Int, border: Int, bw: Float, pct: Float = 0.74f): FrameLayout {
    val f = FrameLayout(ctx)
    f.background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(bg); setStroke(maxOf(1, (bw * u).toInt()), border) }
    f.addView(crest(url, team, col, size, pct), flp(size, size, Gravity.CENTER))
    return f
}

// ---------------------------------------------------------------- 1) Stadyum
internal fun buildStadyum(k: BigCtx) {
    val u = k.u; val v = k.v
    v.setBackgroundColor(Color.parseColor("#05060a"))
    v.addView(DrawView(k.ctx) { c, W, H ->
        G.poly(c, floatArrayOf(0f, 0f, W * 0.58f, 0f, W * 0.42f, H, 0f, H), G.gradient(0f, 0f, W * 0.62f, H * 0.4f, intArrayOf(BigColors.mix(k.c1, Color.WHITE, 0.08f), k.c1, BigColors.mix(k.c1, Color.BLACK, 0.7f)), floatArrayOf(0f, 0.25f, 0.75f)))
        G.poly(c, floatArrayOf(W * 0.58f, 0f, W, 0f, W, H, W * 0.42f, H), G.gradient(W, H, W * 0.38f, H * 0.6f, intArrayOf(BigColors.mix(k.c2, Color.WHITE, 0.08f), k.c2, BigColors.mix(k.c2, Color.BLACK, 0.7f)), floatArrayOf(0f, 0.25f, 0.75f)))
        G.poly(c, floatArrayOf(W * 0.5775f, 0f, W * 0.5825f, 0f, W * 0.4225f, H, W * 0.4175f, H), G.gradient(0f, 0f, 0f, H, intArrayOf(0, Color.argb(230, 255, 244, 201), Color.argb(230, 232, 177, 60), 0), floatArrayOf(0.14f, 0.3f, 0.8f, 1f)))
        val beam = Color.argb(26, 255, 255, 255)
        G.poly(c, floatArrayOf(W * 0.5f, 0f, W * 0.30f, H * 0.95f, W * 0.40f, H * 0.95f), null, beam)
        G.poly(c, floatArrayOf(W * 0.5f, 0f, W * 0.46f, H * 0.95f, W * 0.54f, H * 0.95f), null, Color.argb(20, 255, 255, 255))
        G.poly(c, floatArrayOf(W * 0.5f, 0f, W * 0.60f, H * 0.95f, W * 0.70f, H * 0.95f), null, beam)
    }, FrameLayout.LayoutParams(MATCH, MATCH))
    if (k.hp.isNotEmpty()) v.addView(k.img(k.hp).also { it.alpha = 0.9f }, k.flp((k.pw * 0.38f).toInt(), (k.ph * 0.84f).toInt(), Gravity.START or Gravity.BOTTOM))
    if (k.ap.isNotEmpty()) v.addView(k.img(k.ap).also { it.alpha = 0.9f }, k.flp((k.pw * 0.38f).toInt(), (k.ph * 0.84f).toInt(), Gravity.END or Gravity.BOTTOM))
    v.addView(k.vignette(0f, 0.8f), FrameLayout.LayoutParams(MATCH, MATCH))
    val (root, body) = k.column()
    body.addView(k.top(), k.lp(MATCH, WRAP))
    val mid = LinearLayout(k.ctx).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
    fun team(col: Int, url: String, n: String): LinearLayout = LinearLayout(k.ctx).apply {
        orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL
        val size = (24 * u).toInt()
        val ring = FrameLayout(k.ctx)
        ring.addView(View(k.ctx).apply { background = GradientDrawable().apply { shape = GradientDrawable.OVAL; gradientType = GradientDrawable.RADIAL_GRADIENT; gradientRadius = size * 0.8f; colors = intArrayOf(BigColors.al(col, 0.75f), BigColors.al(col, 0.3f), 0) } }, k.flp((size * 1.5f).toInt(), (size * 1.5f).toInt(), Gravity.CENTER))
        ring.addView(k.discCrest(size, col, url, n, Color.argb(34, 255, 255, 255), Color.argb(56, 255, 255, 255), 0.35f), k.flp(size, size, Gravity.CENTER))
        addView(ring, k.lp((size * 1.5f).toInt(), (size * 1.3f).toInt()))
        addView(k.name(n), k.lp(MATCH, WRAP).also { it.topMargin = (1.8f * u).toInt() })
    }
    mid.addView(team(k.c1, k.hl, k.home), k.lp(0, WRAP).also { it.weight = 1f })
    val vs = LinearLayout(k.ctx).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL }
    vs.addView(k.tv("VS", 5.4f * u, Color.parseColor("#ffe9a8"), italic = true, shadow = true))
    vs.addView(k.tv(k.tm, 9.5f * u, Color.WHITE, shadow = true).apply { setSingleLine(true) }, k.lp(WRAP, WRAP).also { it.topMargin = (1.4f * u).toInt() })
    vs.addView(k.dayPill(), k.lp(WRAP, WRAP).also { it.topMargin = (1.4f * u).toInt() })
    mid.addView(vs, k.lp(WRAP, WRAP).also { it.leftMargin = (2 * k.w).toInt(); it.rightMargin = (2 * k.w).toInt() })
    mid.addView(team(k.c2, k.al, k.away), k.lp(0, WRAP).also { it.weight = 1f })
    body.addView(mid, k.lp(MATCH, 0).also { it.weight = 1f })
    root.addView(k.end(), k.lp(MATCH, WRAP))
}

// ---------------------------------------------------------------- 2) Yayın bandı
internal fun buildBant(k: BigCtx) {
    val u = k.u; val w = k.w; val v = k.v; val goldC = gold()
    v.setBackgroundColor(Color.parseColor("#07080c"))
    v.addView(DrawView(k.ctx) { c, W, H ->
        G.ell(c, W * 0.12f, H * 0.35f, W * 0.55f, H * 0.7f, intArrayOf(BigColors.al(k.c1, 0.55f), 0), floatArrayOf(0f, 1f))
        G.ell(c, W * 0.88f, H * 0.35f, W * 0.55f, H * 0.7f, intArrayOf(BigColors.al(k.c2, 0.55f), 0), floatArrayOf(0f, 1f))
        G.lin(c, 0f, H * 0.48f, 0f, H, intArrayOf(0, Color.argb(199, 0, 0, 0)), null, 0f, H * 0.48f, W, H)
    }, FrameLayout.LayoutParams(MATCH, MATCH))
    // üst orta: marka + başlık
    val head = LinearLayout(k.ctx).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL }
    head.addView(k.top(leagueLine = false), k.lp(WRAP, WRAP))
    v.addView(head, FrameLayout.LayoutParams(MATCH, WRAP, Gravity.TOP).also { it.topMargin = (3 * u).toInt() })
    // alt skorbord
    val bar = LinearLayout(k.ctx).apply { orientation = LinearLayout.VERTICAL }
    val tag = LinearLayout(k.ctx).apply { orientation = LinearLayout.HORIZONTAL }
    val cut = 1.2f * u
    tag.addView(k.tv(k.up(k.kick), 1.9f * u, Color.parseColor("#1a110a"), spacing = 0.2f).apply {
        setPadding((1.8f * u).toInt(), (0.7f * u).toInt(), (2.8f * u).toInt(), (0.7f * u).toInt()); setSingleLine(true)
        background = PolyBg({ ww, hh -> floatArrayOf(0f, 0f, ww.toFloat(), 0f, ww - cut, hh.toFloat(), 0f, hh.toFloat()) }, intArrayOf(Color.parseColor("#ffd877"), Color.parseColor("#e0a12e")))
    }, k.lp(WRAP, WRAP))
    val lg = listOf(if (!k.derby) k.league else "", k.up(k.s.brandName)).filter { it.isNotEmpty() }.joinToString(" · ")
    tag.addView(k.tv(lg, 1.9f * u, Color.WHITE, spacing = 0.2f).apply {
        setPadding((2.4f * u).toInt(), (0.7f * u).toInt(), (2 * u).toInt(), (0.7f * u).toInt()); setSingleLine(true)
        background = PolyBg({ ww, hh -> floatArrayOf(cut, 0f, ww.toFloat(), 0f, ww - cut, hh.toFloat(), 0f, hh.toFloat()) }, intArrayOf(Color.argb(240, 10, 11, 15), Color.argb(240, 10, 11, 15)))
    }, k.lp(WRAP, WRAP).also { it.leftMargin = (-cut).toInt() })
    bar.addView(tag, k.lp(WRAP, WRAP))
    val row = LinearLayout(k.ctx).apply { orientation = LinearLayout.HORIZONTAL }
    fun side(col: Int, url: String, n: String, home: Boolean): LinearLayout = LinearLayout(k.ctx).apply {
        orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
        setPadding((2.4f * u).toInt(), 0, (2.4f * u).toInt(), 0)
        background = GradientDrawable(if (home) GradientDrawable.Orientation.LEFT_RIGHT else GradientDrawable.Orientation.RIGHT_LEFT, intArrayOf(BigColors.mix(col, Color.BLACK, 0.55f), col))
        val cr = k.crest(url, n, col, (9 * u).toInt(), 1f)
        val nm = k.tv(k.up(n), min(4.4f * u, 2.5f * w), Color.WHITE, shadow = true).apply { setSingleLine(true); ellipsize = TextUtils.TruncateAt.END; gravity = if (home) Gravity.END else Gravity.START }
        if (home) { addView(cr, k.lp((9 * u).toInt(), (9 * u).toInt())); addView(nm, k.lp(0, WRAP).also { it.weight = 1f; it.leftMargin = (1.8f * u).toInt() }) }
        else { addView(nm, k.lp(0, WRAP).also { it.weight = 1f; it.rightMargin = (1.8f * u).toInt() }); addView(cr, k.lp((9 * u).toInt(), (9 * u).toInt())) }
    }
    row.addView(side(k.c1, k.hl, k.home, true), k.lp(0, MATCH).also { it.weight = 1f })
    val center = LinearLayout(k.ctx).apply {
        orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
        background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(Color.parseColor("#17181e"), Color.parseColor("#0a0a0d")))
    }
    center.addView(View(k.ctx).apply { setBackgroundColor(goldC) }, k.lp(max(1, (0.4f * u).toInt()), MATCH))
    val ct = LinearLayout(k.ctx).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setPadding((3.2f * u).toInt(), 0, (3.2f * u).toInt(), 0) }
    ct.addView(k.tv(k.tm, 6.2f * u, Color.WHITE).apply { setSingleLine(true) })
    ct.addView(k.tv(k.up(k.dayTxt), 1.7f * u, goldC, spacing = 0.18f).apply { setSingleLine(true) }, k.lp(WRAP, WRAP).also { it.topMargin = (0.6f * u).toInt() })
    center.addView(ct, k.lp(WRAP, MATCH))
    center.addView(View(k.ctx).apply { setBackgroundColor(goldC) }, k.lp(max(1, (0.4f * u).toInt()), MATCH))
    row.addView(center, k.lp(WRAP, MATCH))
    row.addView(side(k.c2, k.al, k.away, false), k.lp(0, MATCH).also { it.weight = 1f })
    bar.addView(row, k.lp(MATCH, (13 * u).toInt()))
    if (k.note.isNotEmpty() || k.infos.isNotEmpty()) {
        val tick = LinearLayout(k.ctx).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; setBackgroundColor(Color.argb(240, 10, 11, 15)); setPadding((2 * u).toInt(), (1 * u).toInt(), (2 * u).toInt(), (1 * u).toInt()) }
        if (k.note.isNotEmpty()) tick.addView(k.tv(k.note, 2.1f * u, Color.WHITE).apply { gravity = Gravity.CENTER })
        if (k.infos.isNotEmpty()) tick.addView(k.tv(k.infos.joinToString("        ") { k.up(it) }, 1.9f * u, Color.argb(230, 255, 255, 255), spacing = 0.06f).apply { gravity = Gravity.CENTER }, k.lp(WRAP, WRAP).also { it.topMargin = (0.5f * u).toInt() })
        bar.addView(View(k.ctx).apply { setBackgroundColor(goldC) }, k.lp(MATCH, max(1, (0.25f * u).toInt())))
        bar.addView(tick, k.lp(MATCH, WRAP))
    }
    v.addView(bar, FrameLayout.LayoutParams(MATCH, WRAP, Gravity.BOTTOM).also { it.leftMargin = (3 * w).toInt(); it.rightMargin = (3 * w).toInt(); it.bottomMargin = (4 * u).toInt() })
}

// ---------------------------------------------------------------- 3) Geri sayım
internal fun buildSayac(k: BigCtx) {
    val u = k.u; val w = k.w; val v = k.v
    v.setBackgroundColor(Color.parseColor("#06070b"))
    v.addView(DrawView(k.ctx) { c, W, H ->
        G.ell(c, W * 0.10f, H * 0.44f, W * 0.58f, H * 0.88f, intArrayOf(k.c1, BigColors.al(k.c1b, 0.65f), 0), floatArrayOf(0f, 0.48f, 0.74f))
        G.ell(c, W * 0.90f, H * 0.44f, W * 0.58f, H * 0.88f, intArrayOf(k.c2, BigColors.al(k.c2b, 0.65f), 0), floatArrayOf(0f, 0.48f, 0.74f))
        val step = 6 * u; val p = android.graphics.Paint().apply { color = Color.argb(10, 255, 255, 255); strokeWidth = 1f }
        var x = 0f; while (x < W) { c.drawLine(x, 0f, x, H, p); x += step }
        var y = 0f; while (y < H) { c.drawLine(0f, y, W, y, p); y += step }
    }, FrameLayout.LayoutParams(MATCH, MATCH))
    val (root, body) = k.column()
    body.addView(k.top(), k.lp(MATCH, WRAP))
    val mid = LinearLayout(k.ctx).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER }
    val vsrow = LinearLayout(k.ctx).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
    fun team(col: Int, col2: Int, url: String, n: String): LinearLayout = LinearLayout(k.ctx).apply {
        orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL
        val size = (29 * u).toInt()
        val inner = k.crest(url, n, col, size, 0.82f)
        val o = k.orb(size, col, col2, inner, BigColors.mix(col2, Color.WHITE, 0.25f), 0.32f)
        addView(o, k.lp((size * 1.5f).toInt(), (size * 1.3f).toInt()))
        addView(k.name(n), k.lp(MATCH, WRAP).also { it.topMargin = (1.4f * u).toInt() })
    }
    vsrow.addView(team(k.c1, k.c1b, k.hl, k.home), k.lp(0, WRAP).also { it.weight = 1f })
    vsrow.addView(k.tv("VS", 5.2f * u, Color.parseColor("#ffe28a"), spacing = 0.1f, shadow = true), k.lp(WRAP, WRAP).also { it.leftMargin = (2.4f * w).toInt(); it.rightMargin = (2.4f * w).toInt() })
    vsrow.addView(team(k.c2, k.c2b, k.al, k.away), k.lp(0, WRAP).also { it.weight = 1f })
    mid.addView(vsrow, k.lp(MATCH, WRAP))
    // geri sayım kutuları
    val cd = LinearLayout(k.ctx).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
    val nums = ArrayList<TextView>(); val labels = ArrayList<TextView>()
    for (i in 0 until 3) {
        if (i > 0) cd.addView(k.tv(":", 8f * u, Color.argb(90, 255, 255, 255)), k.lp(WRAP, WRAP).also { it.leftMargin = (0.8f * w).toInt(); it.rightMargin = (0.8f * w).toInt(); it.topMargin = (1.2f * u).toInt() })
        val col = LinearLayout(k.ctx).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL }
        val nb = k.tv("00", min(10.5f * u, 6.8f * w), Color.WHITE).apply {
            gravity = Gravity.CENTER; minWidth = (16 * u).toInt(); setPadding((1.5f * u).toInt(), (1.1f * u).toInt(), (1.5f * u).toInt(), (1.1f * u).toInt())
            background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(Color.parseColor("#20222b"), Color.parseColor("#16171e"))).apply { cornerRadius = 1.5f * u; setStroke(1, Color.argb(31, 255, 255, 255)) }
        }
        val lb = k.tv("", 1.9f * u, gold(), spacing = 0.26f)
        col.addView(nb); col.addView(lb, k.lp(WRAP, WRAP).also { it.topMargin = (0.8f * u).toInt() })
        nums.add(nb); labels.add(lb); cd.addView(col, k.lp(WRAP, WRAP))
    }
    mid.addView(cd, k.lp(WRAP, WRAP).also { it.topMargin = (2.6f * u).toInt() })
    mid.addView(k.tv(k.dayName.ifEmpty { k.dayTxt } + " · " + k.tm, 2.8f * u, Color.argb(235, 255, 255, 255), bold = true, spacing = 0.06f).apply { gravity = Gravity.CENTER }, k.lp(WRAP, WRAP).also { it.topMargin = (1.4f * u).toInt() })
    body.addView(mid, k.lp(MATCH, 0).also { it.weight = 1f })
    root.addView(k.end(), k.lp(MATCH, WRAP))
    fun upd() {
        val s = max(0L, (k.ts - System.currentTimeMillis()) / 1000); val d = s / 86400; val hh = s % 86400 / 3600; val mm = s % 3600 / 60
        val parts = if (d > 0) listOf(d to "GÜN", hh to "SAAT", mm to "DAKİKA") else listOf(hh to "SAAT", mm to "DAKİKA", s % 60 to "SANİYE")
        for (i in 0 until 3) { nums[i].text = "%02d".format(parts[i].first); labels[i].text = parts[i].second }
    }
    upd()
    (v as? BigArenaView)?.startTick { upd(); k.ts - System.currentTimeMillis() < 86_400_000L }
}

// ---------------------------------------------------------------- 4) Poster
internal fun buildPoster(k: BigCtx) {
    val u = k.u; val w = k.w; val v = k.v; val goldC = gold()
    v.setBackgroundColor(Color.parseColor("#0b0a09"))
    v.addView(DrawView(k.ctx) { c, W, H ->
        G.poly(c, floatArrayOf(0f, 0f, W * 0.5f, 0f, W * 0.44f, H, 0f, H), null, BigColors.mix(k.c1, Color.BLACK, 0.25f))
        G.poly(c, floatArrayOf(W * 0.5f, 0f, W, 0f, W, H, W * 0.44f, H), null, BigColors.mix(k.c2, Color.BLACK, 0.25f))
        G.ell(c, W * 0.5f, H * 0.45f, W * 0.7f, H * 0.7f, intArrayOf(Color.argb(38, 0, 0, 0), Color.argb(199, 0, 0, 0)), floatArrayOf(0f, 1f))
    }, FrameLayout.LayoutParams(MATCH, MATCH))
    v.addView(View(k.ctx).apply { background = GradientDrawable().apply { setColor(0); setStroke(max(1, (0.2f * u).toInt()), BigColors.al(goldC, 0.7f)) } },
        FrameLayout.LayoutParams(MATCH, MATCH).also { val m = (2.2f * u).toInt(); it.setMargins(m, m, m, m) })
    val (root, body) = k.column(padTop = 5f, padSide = 6f)
    body.addView(k.top(), k.lp(MATCH, WRAP))
    val mid = LinearLayout(k.ctx).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER }
    val post = LinearLayout(k.ctx).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
    fun disc(col: Int, url: String, n: String): View {
        val s = (21 * u).toInt()
        val f = FrameLayout(k.ctx).apply { background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.argb(15, 255, 255, 255)); setStroke(max(1, (0.3f * u).toInt()), BigColors.al(goldC, 0.6f)) } }
        f.addView(k.crest(url, n, col, s, if (url.isEmpty()) 0.84f else 0.68f), k.flp(s, s, Gravity.CENTER))
        return FrameLayout(k.ctx).also { it.addView(f, k.flp(s, s, Gravity.CENTER)) }
    }
    post.addView(disc(k.c1, k.hl, k.home), k.lp((22 * u).toInt(), (22 * u).toInt()))
    val stack = LinearLayout(k.ctx).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL }
    fun big(t: String) = k.tv(k.up(t), if (t.length > 11) min(7.4f * u, 4.8f * w) else min(10.5f * u, 6.6f * w), Color.WHITE, shadow = true).apply { gravity = Gravity.CENTER; maxLines = 2; ellipsize = TextUtils.TruncateAt.END }
    stack.addView(big(k.home), k.lp(MATCH, WRAP))
    stack.addView(TextView(k.ctx).apply { text = "vs"; includeFontPadding = false; setTextColor(goldC); setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, 5.4f * u); typeface = Typeface.create(Typeface.SERIF, Typeface.ITALIC) }, k.lp(WRAP, WRAP).also { it.topMargin = (0.6f * u).toInt(); it.bottomMargin = (0.6f * u).toInt() })
    stack.addView(big(k.away), k.lp(MATCH, WRAP))
    post.addView(stack, k.lp(0, WRAP).also { it.weight = 1f; it.leftMargin = (3 * w).toInt(); it.rightMargin = (3 * w).toInt() })
    post.addView(disc(k.c2, k.al, k.away), k.lp((22 * u).toInt(), (22 * u).toInt()))
    mid.addView(post, k.lp(MATCH, WRAP))
    val info = LinearLayout(k.ctx).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER; setPadding((3 * w).toInt(), (1.2f * u).toInt(), (3 * w).toInt(), (1.2f * u).toInt()) }
    val sepW = (2.6f * w).toInt()
    fun sep() = View(k.ctx).apply { setBackgroundColor(BigColors.al(goldC, 0.45f)) }
    info.addView(k.tv(k.up(k.dayName.ifEmpty { k.dayTxt }), 2.5f * u, Color.WHITE, spacing = 0.2f))
    info.addView(sep(), k.lp(1, (6 * u).toInt()).also { it.leftMargin = sepW; it.rightMargin = sepW })
    info.addView(k.tv(k.tm, 6.4f * u, goldC))
    if (k.dayTxt != k.dayName && k.dayName.isNotEmpty()) {
        info.addView(sep(), k.lp(1, (6 * u).toInt()).also { it.leftMargin = sepW; it.rightMargin = sepW })
        info.addView(k.tv(k.up(k.dayTxt), 2.5f * u, Color.WHITE, spacing = 0.2f))
    }
    mid.addView(View(k.ctx).apply { setBackgroundColor(BigColors.al(goldC, 0.45f)) }, k.lp(MATCH, 1).also { it.topMargin = (3 * u).toInt() })
    mid.addView(info, k.lp(MATCH, WRAP))
    mid.addView(View(k.ctx).apply { setBackgroundColor(BigColors.al(goldC, 0.45f)) }, k.lp(MATCH, 1))
    body.addView(mid, k.lp(MATCH, 0).also { it.weight = 1f })
    body.addView(k.end(plain = true), k.lp(MATCH, WRAP))
    body.addView(View(k.ctx), k.lp(MATCH, (4.6f * u).toInt()))
}

// ---------------------------------------------------------------- 5) Düello / 6) Turnuva
private fun buildDuelTour(k: BigCtx, tour: Boolean) {
    val u = k.u; val w = k.w; val v = k.v; val goldC = gold(); val warm = Color.parseColor("#ffcf6e")
    v.setBackgroundColor(Color.parseColor(if (tour) "#05060a" else "#070709"))
    v.addView(k.sideGlows(if (tour) 0.46f else 0.58f, if (tour) 0.50f else 0.46f, if (tour) 0.78f else 0.76f, tour), FrameLayout.LayoutParams(MATCH, MATCH))
    if (!tour) v.addView(DrawView(k.ctx) { c, W, H -> G.ell(c, W * 0.5f, H * 0.55f, W * 0.13f, H * 0.6f, intArrayOf(Color.argb(97, 255, 214, 140), 0), floatArrayOf(0f, 0.7f), true) }, FrameLayout.LayoutParams(MATCH, MATCH))
    // oyuncu fotoğrafı ya da dev arma
    fun side(photo: String, col: Int, col2: Int, url: String, team: String, left: Boolean) {
        val g = (if (left) Gravity.START else Gravity.END)
        if (photo.isNotEmpty()) v.addView(k.img(photo), k.flp((k.pw * 0.47f).toInt(), (k.ph * 0.92f).toInt(), g or Gravity.BOTTOM).also { if (left) it.leftMargin = (k.pw * 0.02f).toInt() else it.rightMargin = (k.pw * 0.02f).toInt() })
        else {
            val size = ((if (tour) 50 else 34) * u).toInt()
            val o = k.orb(size, col, col2, k.crest(url, team, col, size, if (tour) 0.82f else 0.78f), BigColors.mix(col2, Color.WHITE, 0.3f), if (tour) 0.28f else 0.3f, 1.55f)
            v.addView(o, k.flp((size * 1.55f).toInt(), (size * 1.55f).toInt(), g or Gravity.TOP).also {
                it.topMargin = (k.ph * (if (tour) 0.14f else 0.24f) - size * 0.275f).toInt()
                val off = (k.pw * (if (tour) 0.042f else 0.07f) - size * 0.275f).toInt(); if (left) it.leftMargin = off else it.rightMargin = off })
        }
    }
    side(k.hp, k.c1, k.c1b, k.hl, k.home, true); side(k.ap, k.c2, k.c2b, k.al, k.away, false)
    if (tour) {
        // orta sahne: lig logosu + (fotoğraf varsa) arma kürecikleri
        val ss = (30 * u).toInt(); val cs = (21 * u).toInt()
        val mid = LinearLayout(k.ctx).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        fun cr(col: Int, url: String, n: String) = k.discCrest(cs, col, url, n, Color.argb(120, 10, 13, 20), Color.argb(97, 255, 255, 255), 0.24f, 0.82f)
        if (k.hp.isNotEmpty() || k.ap.isNotEmpty()) mid.addView(cr(k.c1, k.hl, k.home), k.lp(cs, cs))
        val stage = k.discCrest(ss, Color.WHITE, k.llogo, "", Color.argb(250, 12, 15, 24), Color.argb(217, 255, 212, 125), 0.32f, 0.82f)
        mid.addView(stage, k.lp(ss, ss).also { it.leftMargin = (3.2f * u).toInt(); it.rightMargin = (3.2f * u).toInt() })
        if (k.hp.isNotEmpty() || k.ap.isNotEmpty()) mid.addView(cr(k.c2, k.al, k.away), k.lp(cs, cs))
        v.addView(DrawView(k.ctx) { c, W, H -> G.lin(c, W * 0.23f, 0f, W * 0.77f, 0f, intArrayOf(0, Color.argb(190, 255, 212, 128), Color.WHITE, Color.argb(190, 255, 212, 128), 0), floatArrayOf(0f, 0.28f, 0.5f, 0.72f, 1f), W * 0.23f, H * 0.39f - 1f, W * 0.77f, H * 0.39f + 1f) }, FrameLayout.LayoutParams(MATCH, MATCH))
        v.addView(mid, FrameLayout.LayoutParams(WRAP, WRAP, Gravity.TOP or Gravity.CENTER_HORIZONTAL).also { it.topMargin = (k.ph * 0.39f - ss / 2f).toInt() })
    }
    v.addView(k.vignette(0.75f, 0.88f), FrameLayout.LayoutParams(MATCH, MATCH))
    val (root, body) = k.column()
    // üst blok
    val top = LinearLayout(k.ctx).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL }
    top.addView(k.brand(), k.brandLp())
    val lea = (if (tour) "⚽ " else "") + k.league.ifEmpty { k.kick }
    top.addView(k.tv(lea, (if (tour) 2.7f else 2.8f) * u, Color.WHITE, spacing = if (tour) 0.28f else 0.3f, shadow = true).apply {
        if (tour) { setPadding((2.2f * w).toInt(), (0.55f * u).toInt(), (2.2f * w).toInt(), (0.55f * u).toInt()); background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(Color.argb(224, 20, 24, 36), Color.argb(240, 8, 10, 16))).apply { cornerRadius = 99f * u; setStroke(max(1, (0.18f * u).toInt()), Color.argb(166, 255, 212, 125)) } }
    }, k.lp(WRAP, WRAP).also { it.topMargin = (1 * u).toInt() })
    if (!tour && (k.hp.isNotEmpty() || k.ap.isNotEmpty())) {
        val row = LinearLayout(k.ctx).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val cs = (14 * u).toInt()
        row.addView(k.crest(k.hl, k.home, k.c1, cs), k.lp(cs, cs))
        row.addView(k.crest(k.llogo, "", Color.WHITE, (22 * u).toInt(), 0.84f), k.lp((22 * u).toInt(), (22 * u).toInt()).also { it.leftMargin = (2.4f * u).toInt(); it.rightMargin = (2.4f * u).toInt() })
        row.addView(k.crest(k.al, k.away, k.c2, cs), k.lp(cs, cs))
        top.addView(row, k.lp(WRAP, WRAP).also { it.topMargin = (0.6f * u).toInt() })
    } else if (!tour) top.addView(k.crest(k.llogo, "", Color.WHITE, (22 * u).toInt(), 0.84f), k.lp((22 * u).toInt(), (22 * u).toInt()).also { it.topMargin = (0.6f * u).toInt() })
    val where = listOf(k.venue, k.tm).filter { it.isNotEmpty() }
    if (where.isNotEmpty()) {
        val sp = android.text.SpannableStringBuilder()
        where.forEachIndexed { i, t -> if (i > 0) sp.append(" · "); val st = sp.length; sp.append(t); if (i > 0) sp.setSpan(android.text.style.ForegroundColorSpan(warm), st, sp.length, 0) }
        top.addView(k.tv("", (if (tour) 3.1f else 3.4f) * u, Color.WHITE, shadow = true).apply {
            text = sp
            if (tour) { setPadding((1.8f * w).toInt(), (0.4f * u).toInt(), (1.8f * w).toInt(), (0.4f * u).toInt()); background = GradientDrawable().apply { setColor(Color.argb(184, 6, 8, 14)); cornerRadius = 0.9f * u; setStroke(1, Color.argb(36, 255, 255, 255)) } }
        }, k.lp(WRAP, WRAP).also { it.topMargin = (0.5f * u).toInt() })
    }
    body.addView(top, k.lp(MATCH, WRAP))
    body.addView(View(k.ctx), k.lp(MATCH, 0).also { it.weight = 1f })
    // alt blok: karşılaşma satırı + gün
    val bot = LinearLayout(k.ctx).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL }
    val sz = min(6.4f * u, 3.8f * w)
    val match = LinearLayout(k.ctx).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
    match.addView(k.tv(k.up(k.home), sz, Color.WHITE, shadow = true).apply { gravity = Gravity.END; setSingleLine(true); ellipsize = TextUtils.TruncateAt.END }, k.lp(0, WRAP).also { it.weight = 1f })
    if (tour) match.addView(k.tv("×", 3.2f * u, Color.parseColor("#140d04")).apply { gravity = Gravity.CENTER
        background = GradientDrawable().apply { shape = GradientDrawable.OVAL; gradientType = GradientDrawable.RADIAL_GRADIENT; gradientRadius = 4 * u; setGradientCenter(0.35f, 0.3f); colors = intArrayOf(Color.parseColor("#ffe79e"), Color.parseColor("#d98a1c"), Color.parseColor("#784204")); setStroke(max(1, (0.22f * u).toInt()), Color.WHITE) } }, k.lp((5.8f * u).toInt(), (5.8f * u).toInt()).also { it.leftMargin = (1.6f * u).toInt(); it.rightMargin = (1.6f * u).toInt() })
    else match.addView(k.tv("×", sz, warm), k.lp(WRAP, WRAP).also { it.leftMargin = (1.2f * u).toInt(); it.rightMargin = (1.2f * u).toInt() })
    match.addView(k.tv(k.up(k.away), sz, Color.WHITE, shadow = true).apply { gravity = Gravity.START; setSingleLine(true); ellipsize = TextUtils.TruncateAt.END }, k.lp(0, WRAP).also { it.weight = 1f })
    if (tour) match.background = GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, intArrayOf(0, Color.argb(224, 14, 18, 28), 0)).also { match.setPadding((2.6f * w).toInt(), (1.1f * u).toInt(), (2.6f * w).toInt(), (1.1f * u).toInt()) }
    bot.addView(match, k.lp(MATCH, WRAP))
    bot.addView(k.dayPill(), k.lp(WRAP, WRAP).also { it.topMargin = (1.2f * u).toInt(); it.bottomMargin = (1.4f * u).toInt() })
    body.addView(bot, k.lp(MATCH, WRAP))
    root.addView(k.end(), k.lp(MATCH, WRAP))
}
internal fun buildDuello(k: BigCtx) = buildDuelTour(k, false)
internal fun buildTurnuva(k: BigCtx) = buildDuelTour(k, true)

// ---------------------------------------------------------------- 7) Matchday
internal fun buildMatchday(k: BigCtx) {
    val u = k.u; val w = k.w; val v = k.v; val goldC = gold(); val g2 = Color.parseColor("#ffe28a")
    v.setBackgroundColor(Color.parseColor("#040805"))
    v.addView(k.img("/site/bg-matchday.jpg", ImageView.ScaleType.CENTER_CROP), FrameLayout.LayoutParams(MATCH, MATCH))
    v.addView(DrawView(k.ctx) { c, W, H ->
        G.ell(c, W * 0.14f, H * 0.44f, W * 0.46f, H * 0.52f, intArrayOf(BigColors.al(k.c1, 0.88f), BigColors.al(k.c1b, 0.66f), 0), floatArrayOf(0f, 0.45f, 0.76f), true)
        G.ell(c, W * 0.86f, H * 0.44f, W * 0.46f, H * 0.52f, intArrayOf(BigColors.al(k.c2, 0.88f), BigColors.al(k.c2b, 0.66f), 0), floatArrayOf(0f, 0.45f, 0.76f), true)
        G.ell(c, W * 0.5f, H * 0.54f, W * 0.32f, H * 0.40f, intArrayOf(Color.argb(140, 255, 205, 95), Color.argb(46, 255, 160, 40), 0), floatArrayOf(0f, 0.52f, 0.78f))
        G.lin(c, 0f, H, 0f, 0f, intArrayOf(Color.argb(209, 2, 6, 3), Color.argb(64, 4, 12, 6), 0, Color.argb(120, 2, 5, 10)), floatArrayOf(0f, 0.28f, 0.65f, 1f), 0f, 0f, W, H)
    }, FrameLayout.LayoutParams(MATCH, MATCH))
    val root = LinearLayout(k.ctx).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; setPadding((3.8f * w).toInt(), (2 * u).toInt(), (3.8f * w).toInt(), (2.2f * u).toInt()) }
    v.addView(root, FrameLayout.LayoutParams(MATCH, MATCH))
    // üst: marka rozeti + turnuva barı
    if (k.brandLogo.isNotEmpty()) root.addView(LinearLayout(k.ctx).apply {
        gravity = Gravity.CENTER; setPadding((1.4f * w).toInt(), (0.35f * u).toInt(), (1.4f * w).toInt(), (0.35f * u).toInt())
        background = GradientDrawable().apply { setColor(Color.argb(209, 10, 14, 22)); cornerRadius = 0.9f * u; setStroke(1, Color.argb(71, 255, 255, 255)) }
        addView(k.img(k.brandLogo), k.lp((18 * k.w).toInt(), (3.6f * u).toInt()))
    }, k.lp(WRAP, (4.4f * u).toInt()))
    val hud = LinearLayout(k.ctx).apply {
        orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding((2.2f * w).toInt(), (0.7f * u).toInt(), (2.2f * w).toInt(), (0.7f * u).toInt())
        val cut = 1.6f * u
        background = PolyBg({ ww, hh -> floatArrayOf(cut, 0f, ww - cut, 0f, ww.toFloat(), hh.toFloat(), 0f, hh.toFloat()) }, intArrayOf(Color.argb(242, 42, 56, 82), Color.argb(250, 16, 22, 36), Color.argb(250, 8, 12, 22)), false, BigColors.al(goldC, 0.7f), 0.2f * u)
    }
    fun wing() = FrameLayout(k.ctx).apply {
        background = GradientDrawable().apply { shape = GradientDrawable.OVAL; gradientType = GradientDrawable.RADIAL_GRADIENT; gradientRadius = 5 * u; colors = intArrayOf(Color.parseColor("#1e2b45"), Color.parseColor("#080d18")); setStroke(max(1, (0.2f * u).toInt()), Color.argb(204, 255, 220, 140)) }
        addView(k.img(k.llogo), k.flp((6.2f * u).toInt(), (6.2f * u).toInt(), Gravity.CENTER))
    }
    hud.addView(wing(), k.lp((7.6f * u).toInt(), (7.6f * u).toInt()))
    val hm = LinearLayout(k.ctx).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL }
    hm.addView(k.tv(k.league.ifEmpty { k.kick }, 3f * u, Color.WHITE, spacing = 0.18f, shadow = true).apply { setSingleLine(true) })
    hm.addView(k.tv(k.dayTxt + " · " + k.tm, 2.35f * u, g2, spacing = 0.14f, shadow = true).apply { setSingleLine(true) }, k.lp(WRAP, WRAP).also { it.topMargin = (0.35f * u).toInt() })
    hud.addView(hm, k.lp(WRAP, WRAP).also { it.leftMargin = (3 * w).toInt(); it.rightMargin = (3 * w).toInt() })
    hud.addView(wing(), k.lp((7.6f * u).toInt(), (7.6f * u).toInt()))
    root.addView(hud, k.lp(WRAP, WRAP).also { it.topMargin = (0.6f * u).toInt() })
    // orta saha
    val stage = LinearLayout(k.ctx).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
    fun zone(photo: String, col: Int, col2: Int, url: String, n: String): View {
        val zs = (41 * u).toInt()
        val f = FrameLayout(k.ctx)
        if (photo.isNotEmpty()) f.addView(k.img(photo), k.flp(zs, zs, Gravity.CENTER))
        else { val rs = (36 * u).toInt(); f.addView(k.orb(rs, col, col2, k.crest(url, n, col, rs, 0.86f), Color.argb(235, 255, 222, 135), 0.38f, 1.12f), k.flp((zs * 1.1f).toInt(), (zs * 1.1f).toInt(), Gravity.CENTER)) }
        return f
    }
    val zs = (41 * u).toInt()
    stage.addView(zone(k.hp, k.c1, k.c1b, k.hl, k.home), k.lp(0, zs).also { it.weight = 1f })
    stage.addView(FrameLayout(k.ctx).also { it.addView(k.img(k.llogo), k.flp((24 * u).toInt(), (24 * u).toInt(), Gravity.CENTER)) }, k.lp((27 * u).toInt(), (27 * u).toInt()))
    stage.addView(zone(k.ap, k.c2, k.c2b, k.al, k.away), k.lp(0, zs).also { it.weight = 1f })
    root.addView(stage, k.lp(MATCH, 0).also { it.weight = 1f; it.topMargin = (0.4f * u).toInt(); it.bottomMargin = (0.4f * u).toInt() })
    // alt şerit: EV SAHİBİ · VS · DEPLASMAN
    val lower = LinearLayout(k.ctx).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
    val dark = Color.parseColor("#090d16")
    fun banner(role: String, n: String, col: Int, col2: Int, sub: String): LinearLayout = LinearLayout(k.ctx).apply {
        orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL
        addView(k.tv(role, 1.85f * u, Color.WHITE, spacing = 0.26f, shadow = true))
        addView(k.tv(k.up(n), if (n.length > 13) min(3.9f * u, 2.5f * w) else min(5.1f * u, 3.2f * w), Color.WHITE, spacing = 0.05f, shadow = true).apply {
            gravity = Gravity.CENTER; setSingleLine(true); ellipsize = TextUtils.TruncateAt.END; setPadding((2.2f * w).toInt(), (1.05f * u).toInt(), (2.2f * w).toInt(), (1.05f * u).toInt())
            background = PolyBg({ ww, hh -> floatArrayOf(ww * 0.04f, 0f, ww.toFloat(), 0f, ww * 0.96f, hh.toFloat(), 0f, hh.toFloat()) }, intArrayOf(BigColors.mix(col, dark, 0.18f), Color.argb(245, 14, 19, 30), BigColors.mix(col2, dark, 0.32f)), true, Color.argb(89, 255, 255, 255), 0.15f * u)
        }, k.lp(MATCH, WRAP).also { it.topMargin = (0.45f * u).toInt() })
        if (sub.isNotEmpty()) addView(k.tv(k.up(sub), 1.9f * u, Color.parseColor("#f3ead2"), spacing = 0.16f, shadow = true).apply { setSingleLine(true) }, k.lp(WRAP, WRAP).also { it.topMargin = (0.45f * u).toInt() })
    }
    lower.addView(banner("EV SAHİBİ", k.home, k.c1, k.c1b, k.venue), k.lp(0, WRAP).also { it.weight = 1f })
    lower.addView(k.tv("VS", 5.2f * u, Color.parseColor("#f5bd42"), spacing = 0.06f, shadow = true), k.lp(WRAP, WRAP).also { it.leftMargin = (1.6f * w).toInt(); it.rightMargin = (1.6f * w).toInt() })
    lower.addView(banner("DEPLASMAN", k.away, k.c2, k.c2b, k.venue.ifEmpty { k.tm }), k.lp(0, WRAP).also { it.weight = 1f })
    root.addView(lower, k.lp(MATCH, WRAP).also { it.bottomMargin = (1 * u).toInt() })
    // en alt: büyük maç etiketi + not
    val foot = k.note.ifEmpty { k.infos.joinToString(" · ") { it.removePrefix("📍 ").removePrefix("🎮 ").removePrefix("💨 ") } }.ifEmpty { "REZERVASYON YAPTIRMAYI UNUTMAYIN!" }
    val fh = LinearLayout(k.ctx).apply {
        orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER; setPadding((4 * w).toInt(), (0.75f * u).toInt(), (4 * w).toInt(), (0.75f * u).toInt())
        background = PolyBg({ ww, hh -> floatArrayOf(ww * 0.03f, 0f, ww * 0.97f, 0f, ww.toFloat(), hh.toFloat(), 0f, hh.toFloat()) }, intArrayOf(Color.argb(242, 26, 32, 44), Color.argb(250, 9, 12, 18)), false, Color.argb(191, 255, 220, 140), 0.22f * u)
    }
    fh.addView(k.tv(if (k.derby) "BÜYÜK DERBİ" else "BÜYÜK MAÇ", 2.2f * u, g2, spacing = 0.22f))
    fh.addView(View(k.ctx).apply { setBackgroundColor(Color.argb(115, 255, 220, 140)) }, k.lp(1, (3 * u).toInt()).also { it.leftMargin = (2 * w).toInt(); it.rightMargin = (2 * w).toInt() })
    fh.addView(k.tv(k.up(foot), 2.5f * u, Color.WHITE, spacing = 0.08f, shadow = true).apply { setSingleLine(true); ellipsize = TextUtils.TruncateAt.END })
    root.addView(fh, k.lp((k.pw * 0.82f).toInt(), WRAP))
}

// ---------------------------------------------------------------- 8) Neon arena
internal fun buildNeon(k: BigCtx) {
    val u = k.u; val w = k.w; val v = k.v
    v.setBackgroundColor(Color.parseColor("#060913"))
    v.addView(DrawView(k.ctx) { c, W, H ->
        G.lin(c, 0f, 0f, W, H, intArrayOf(Color.parseColor("#060913"), Color.parseColor("#0d1222")), null, 0f, 0f, W, H)
        val r = hypot(W * 0.88f, H * 0.5f) * 0.62f
        G.ell(c, W * 0.12f, H * 0.5f, r, r, intArrayOf(BigColors.al(k.c1, 0.55f), 0), floatArrayOf(0f, 1f))
        G.ell(c, W * 0.88f, H * 0.5f, r, r, intArrayOf(BigColors.al(k.c2, 0.55f), 0), floatArrayOf(0f, 1f))
        val p = android.graphics.Paint().apply { color = Color.argb(8, 255, 255, 255); strokeWidth = 1f }
        val step = 4 * u; var y = H * 0.55f; while (y < H) { c.drawLine(0f, y, W, y, p); y += step }
        var x = 0f; while (x < W) { c.drawLine(x, H * 0.55f, x, H, p); x += step }
    }, FrameLayout.LayoutParams(MATCH, MATCH))
    val root = LinearLayout(k.ctx).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; setPadding((5 * w).toInt(), (2.6f * u).toInt(), (5 * w).toInt(), 0) }
    v.addView(root, FrameLayout.LayoutParams(MATCH, MATCH))
    if (k.brandLogo.isNotEmpty()) root.addView(k.brand(), k.brandLp(5f))
    val cut = 14f
    val panel = LinearLayout(k.ctx).apply {
        orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding((4.5f * w).toInt(), (0.65f * u).toInt(), (4.5f * w).toInt(), (0.65f * u).toInt())
        background = PolyBg({ ww, hh -> floatArrayOf(cut, 0f, ww.toFloat(), 0f, ww - cut, hh.toFloat(), 0f, hh.toFloat()) }, intArrayOf(Color.argb(242, 12, 17, 30), Color.argb(242, 12, 17, 30)), false, Color.argb(56, 255, 255, 255), 0.2f * u)
    }
    panel.addView(k.img(k.llogo), k.lp((4.2f * u).toInt(), (4.2f * u).toInt()))
    panel.addView(k.tv(k.league.ifEmpty { k.kick }, 2.4f * u, Color.parseColor("#e8f0ff"), spacing = 0.28f).apply { setSingleLine(true) }, k.lp(WRAP, WRAP).also { it.leftMargin = (1.2f * w).toInt() })
    root.addView(panel, k.lp(WRAP, WRAP).also { it.topMargin = (0.6f * u).toInt() })
    val arena = LinearLayout(k.ctx).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
    fun card(status: String, col: Int, col2: Int, url: String, n: String): LinearLayout = LinearLayout(k.ctx).apply {
        orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL
        val cs = (36 * u).toInt()
        val wrap = FrameLayout(k.ctx).apply { clipChildren = false }
        wrap.addView(DrawView(k.ctx) { c, W, H ->
            G.ell(c, W / 2f, H / 2f, W * 0.66f, H * 0.66f, intArrayOf(BigColors.al(col, 0.7f), BigColors.al(col2, 0.35f), 0), floatArrayOf(0f, 0.55f, 1f))
            val o = floatArrayOf(W * .15f, 0f, W * .85f, 0f, W, H * .15f, W, H * .85f, W * .85f, H, W * .15f, H, 0f, H * .85f, 0f, H * .15f)
            G.poly(c, o, null, Color.argb(166, 10, 15, 28))
            val pth = android.graphics.Path(); pth.moveTo(o[0], o[1]); var i = 2; while (i < o.size) { pth.lineTo(o[i], o[i + 1]); i += 2 }; pth.close()
            val sp = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { style = android.graphics.Paint.Style.STROKE; strokeWidth = 0.32f * u * 2; color = col2 }
            c.save(); c.clipPath(pth); c.drawPath(pth, sp); c.restore()
        }, k.flp(cs, cs, Gravity.CENTER))
        wrap.addView(k.crest(url, n, col, cs, 0.8f), k.flp(cs, cs, Gravity.CENTER))
        addView(wrap, k.lp(cs, cs))
        addView(k.tv(status, 1.6f * u, col2, spacing = 0.26f), k.lp(WRAP, WRAP).also { it.topMargin = (1.4f * u).toInt() })
        val nc = 12f
        addView(k.tv(k.up(n), if (n.length > 13) min(3.6f * u, 2.4f * w) else min(4.6f * u, 3f * w), Color.WHITE, shadow = true).apply {
            gravity = Gravity.CENTER; setSingleLine(true); ellipsize = TextUtils.TruncateAt.END; setPadding((2 * w).toInt(), (1.1f * u + 0.45f * u).toInt(), (2 * w).toInt(), (1.1f * u).toInt())
            background = PolyBg({ ww, hh -> floatArrayOf(nc, 0f, ww.toFloat(), 0f, ww - nc, hh.toFloat(), 0f, hh.toFloat()) }, intArrayOf(Color.argb(242, 14, 20, 36), Color.argb(242, 14, 20, 36)), false, Color.argb(38, 255, 255, 255), 0.22f * u)
        }, k.lp(MATCH, WRAP).also { it.topMargin = (0.5f * u).toInt() })
    }
    arena.addView(card("EV SAHİBİ", k.c1, k.c1b, k.hl, k.home), k.lp(0, WRAP).also { it.weight = 1f })
    val hub = LinearLayout(k.ctx).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL }
    hub.addView(k.tv(k.tm, 5.8f * u, Color.parseColor("#ffe28a"), shadow = true).apply { setSingleLine(true) })
    hub.addView(k.dayPill(), k.lp(WRAP, WRAP).also { it.topMargin = (1.2f * u).toInt() })
    if (k.venue.isNotEmpty()) hub.addView(k.tv("🏟 " + k.venue, 2.1f * u, Color.parseColor("#b8dcff")).apply { setSingleLine(true) }, k.lp(WRAP, WRAP).also { it.topMargin = (1.2f * u).toInt() })
    arena.addView(hub, k.lp(WRAP, WRAP).also { it.leftMargin = (2.5f * w).toInt(); it.rightMargin = (2.5f * w).toInt() })
    arena.addView(card("DEPLASMAN", k.c2, k.c2b, k.al, k.away), k.lp(0, WRAP).also { it.weight = 1f })
    root.addView(arena, k.lp(MATCH, 0).also { it.weight = 1f })
    root.addView(k.end(), k.lp(MATCH, WRAP).also { it.leftMargin = (-5 * w).toInt(); it.rightMargin = (-5 * w).toInt() })
}
