package com.screenpano.tv.ui.nativeui

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
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
import java.util.Locale
import kotlin.math.max

/**
 * "QR kart" widget'ı: seçili QR'ı (ya da hepsini 12 sn'de bir sırayla) gösterir. "Her zaman üstte" kapalıysa
 * panelde seçilen içerik türlerinde (video, foto, afiş, gol, büyük maç, kampanya, fragman) gizlenir.
 * Sayfa, ekrandaki bağlamı NativeEnv.ctx ile bildirir.
 */
class QrWidget(context: Context) : FrameLayout(context), NativeWidget {
    private val main = Handler(Looper.getMainLooper())
    private val content = LinearLayout(context)
    private var st: TvState? = null
    private var vh = 10f
    private var selected = ""
    private var sizeKey = "auto" // QR boyutu: xs | s | auto | l | xl | box (kutuya sığdır)
    private var tf = 1f // etiket yazı çarpanı
    private var ef = 1f // etkin çarpan (klasik tasarımda kutuya sığdırırken QR ile birlikte ölçeklenir)
    private var look = "classic" // tasarım: classic | card (temaya uyumlu kart) | soft (çerçevesiz)
    private var props: JSONObject? = null
    private var curQs = 0 // çizilen QR kenarı (px)
    private var style = "below" // yerleşim: below (etiket altta) | right / left (dikey etiket yanda) | plain (yalnız QR)
    private var idx = 0
    private var cur: JSONObject? = null
    private var phase = 0
    private val ctxListener: () -> Unit = { applyVisibility() }

    private val rotate = object : Runnable {
        override fun run() { if (list().size > 1) { idx++; draw() }; main.postDelayed(this, 12_000L) }
    }

    init {
        clipChildren = false; clipToPadding = false
        content.orientation = LinearLayout.VERTICAL; content.gravity = Gravity.CENTER_HORIZONTAL
        addView(content, LayoutParams(10, 10, Gravity.CENTER))
        NativeEnv.ctxListeners.add(ctxListener)
    }

    private fun list(): List<JSONObject> {
        val a = st?.raw?.optJSONArray("qrs") ?: return emptyList()
        val all = (0 until a.length()).mapNotNull { a.optJSONObject(it) }
        val pick = if (selected.isNotEmpty()) all.firstOrNull { it.optString("id") == selected } else null
        return if (pick != null) listOf(pick) else all
    }

    // Dikey hiza: kutu ekranın alt yarısındaysa kart kutunun altına, üst yarısındaysa üstüne yaslanır (kayan bant vb. ile aynı çizgide dursun)
    private var bottomHalf = false
    override fun bind(w: WidgetSpec, s: TvState, vh: Float) {
        bottomHalf = w.y + w.h / 2f > s.rows / 2f
        (content.layoutParams as LayoutParams).gravity = Gravity.CENTER_HORIZONTAL or (if (bottomHalf) Gravity.BOTTOM else Gravity.TOP)
        val sig = s.raw.optJSONArray("qrs")?.toString()
        val newSel = w.props?.optString("qr") ?: ""
        val newStyle = (w.props?.optString("style") ?: "").let { if (it in setOf("right", "left", "plain")) it else "below" }
        val newSize = (w.props?.optString("size") ?: "").let { if (it in setOf("xs", "s", "l", "xl", "box")) it else "auto" }
        val newTf = when (w.props?.optString("text")) { "s" -> 0.8f; "l" -> 1.35f; else -> 1f }
        val newLook = (w.props?.optString("look") ?: "").let { if (it == "card" || it == "soft") it else "classic" }
        val changed = sig != st?.raw?.optJSONArray("qrs")?.toString() || newSel != selected || vh != this.vh || newStyle != style || newSize != sizeKey || newTf != tf || newLook != look
        st = s; this.vh = vh; selected = newSel; style = newStyle; sizeKey = newSize; tf = newTf; look = newLook; props = w.props
        if (changed) { idx = 0; draw() }
        main.removeCallbacks(rotate); main.postDelayed(rotate, 12_000L)
    }

    private fun draw() {
        val s = st ?: return
        val p = Palette(s, props?.optString("tint"))
        val l = list()
        val q = if (l.isEmpty()) null else l[idx % l.size]
        cur = q
        content.removeAllViews(); phase = 0
        main.removeCallbacks(wifi)
        if (q == null) {
            val t = TextView(context).apply { text = "Panelden QR kod ekleyin"; setTextColor(p.mute); setTextSize(TypedValue.COMPLEX_UNIT_PX, vh * 2f) }
            content.addView(t); setSize((vh * 17f).toInt(), (vh * 4f).toInt()); applyVisibility(); return
        }
        val side = style == "right" || style == "left"
        val plain = style == "plain"
        val fixed = mapOf("xs" to 10f, "s" to 13.5f, "auto" to 17f, "l" to 21f, "xl" to 26f)[sizeKey]
        val boxOk = sizeKey == "box" && width > 0 && height > 0
        var s1 = 1f
        val qs: Int
        if (look == "classic") {
            if (boxOk) { // etiket ve yazı QR ile orantılı ölçeklenir
                val k = 1f + 0.318f * tf; val g = vh * 0.8f; val u = 17f * vh
                s1 = (if (plain) minOf(width, height) / u else if (side) minOf((width - g) / (u * k), height / u) else minOf(width / u, (height - g) / (u * k))).coerceIn(0.3f, 3f)
                qs = (u * s1).toInt()
            } else qs = ((fixed ?: 17f) * vh).toInt()
        } else {
            val pf = if (look == "card") 0.14f else 0f; val lf = if (plain) 0f else 0.13f * tf + 0.05f
            qs = if (boxOk) (if (side) minOf(width / (1 + pf + lf), height / (1 + pf)) else minOf(width / (1 + pf), height / (1 + pf + lf))).toInt().coerceAtLeast((5f * vh).toInt())
                 else ((fixed ?: 17f) * vh).toInt()
        }
        ef = tf * s1; curQs = qs
        val box = FrameLayout(context)
        val iv = ImageView(context).apply { scaleType = ImageView.ScaleType.FIT_CENTER }
        box.addView(iv, LayoutParams(-1, -1))
        val svg = q.optString("svg")
        if (svg.isNotEmpty()) iv.load(ByteBuffer.wrap(svg.toByteArray())) { crossfade(false) }
        if (look == "classic") {
            val pad = max(1, (vh * 0.4f).toInt())
            box.setPadding(pad, pad, pad, pad)
            box.background = GradientDrawable().apply { setColor(Color.WHITE); cornerRadius = vh; setStroke(max(1, (vh * 0.18f).toInt()), p.a(p.accent2, 0.85f)) }
        } else {
            val pad = max(1, (qs * 0.035f).toInt())
            box.setPadding(pad, pad, pad, pad)
            box.background = GradientDrawable().apply { setColor(Color.WHITE); cornerRadius = qs * 0.06f; if (look == "soft") setStroke(max(1, (vh * 0.1f).toInt()), Color.argb(100, 255, 255, 255)) }
        }
        content.orientation = if (side) LinearLayout.HORIZONTAL else LinearLayout.VERTICAL
        content.gravity = if (side) Gravity.CENTER_VERTICAL else Gravity.CENTER_HORIZONTAL
        (label.parent as? ViewGroup)?.removeView(label)
        label.rotation = 0f; label.minimumWidth = 0
        // kart tasarımında kutu temanın kutu stilini taşır; hepsi QR boyutuyla orantılı
        val cpad = if (look == "card") (qs * 0.07f).toInt() else 0
        content.setPadding(cpad, cpad, cpad, cpad)
        content.background = if (look == "card") BoxSkin.bg(p, vh, props).also { it.cornerRadius = qs * 0.12f } else null
        if (plain) { content.addView(box, LinearLayout.LayoutParams(qs, qs)); setSize(qs + 2 * cpad, qs + 2 * cpad); applyVisibility(); return }
        val wf = q.optString("marquee").isNotEmpty()
        val lh: Int; val gap: Int
        if (look == "classic") { lh = (vh * 5.4f * ef).toInt(); gap = (vh * 0.8f).toInt() } else { lh = (qs * 0.13f * tf).toInt(); gap = (qs * 0.05f).toInt() }
        fun styleLabel() {
            if (look == "classic") {
                label.background = GradientDrawable().apply { setColor(Color.argb(235, 10, 8, 6)); cornerRadius = vh * 2f; setStroke(max(2, (vh * 0.25f).toInt()), p.al) }
            } else { label.background = null; label.setPadding(0, 0, 0, 0) }
        }
        if (side) {
            // dikey etiket: kutu QR yüksekliğinde yatay çizilir, 90° (sağda) / 270° (solda) döndürülür
            label.text = ""; setLabel(q.optString("label"), p.white, qs, p); styleLabel()
            val wrap = FrameLayout(context).also { it.clipChildren = false }
            wrap.addView(label, FrameLayout.LayoutParams(qs, lh, Gravity.CENTER))
            label.rotation = if (style == "right") 90f else 270f
            if (style == "right") {
                content.addView(box, LinearLayout.LayoutParams(qs, qs))
                content.addView(wrap, LinearLayout.LayoutParams(lh, qs).also { it.leftMargin = gap })
            } else {
                content.addView(wrap, LinearLayout.LayoutParams(lh, qs).also { it.rightMargin = gap })
                content.addView(box, LinearLayout.LayoutParams(qs, qs))
            }
            setSize(qs + gap + lh + 2 * cpad, qs + 2 * cpad)
        } else {
            content.addView(box, LinearLayout.LayoutParams(qs, qs))
            val lw = if (look != "classic" || wf) qs else (qs + (vh * 8f).toInt())
            label.text = ""; setLabel(q.optString("label"), p.white, lw, p); styleLabel()
            if (look == "classic") content.addView(label, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, lh).also { it.topMargin = gap })
            else content.addView(label, LinearLayout.LayoutParams(qs, lh).also { it.topMargin = gap })
            label.minimumWidth = if (look == "classic" && wf) qs else 0
            setSize(max(qs, lw) + 2 * cpad, qs + lh + gap + 2 * cpad)
        }
        if (wf) main.postDelayed(wifi, 4000)
        applyVisibility()
    }

    private val label: TextView by lazy {
        TextView(context).apply { includeFontPadding = false; gravity = Gravity.CENTER; setSingleLine(true); typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD); letterSpacing = 0.1f }
    }

    private fun setLabel(t: String, color: Int, maxW: Int, p: Palette) {
        label.text = t.uppercase(Locale("tr", "TR")); label.setTextColor(color)
        val classic = look == "classic"
        if (classic) label.setPadding((vh * 1.2f).toInt(), 0, (vh * 1.2f).toInt(), 0)
        val base = if (classic) vh * 2.3f * ef else curQs * 0.105f * tf
        var px = base
        label.setTextSize(TypedValue.COMPLEX_UNIT_PX, px)
        val avail = if (classic) maxW - (vh * 2.4f * ef) else maxW.toFloat()
        while (px > base * 0.55f && label.paint.measureText(label.text.toString()) > avail) { px -= base * 0.04f; label.setTextSize(TypedValue.COMPLEX_UNIT_PX, px) }
    }

    private val wifi: Runnable = object : Runnable {
        override fun run() {
            val q = cur ?: return; val s = st ?: return; val p = Palette(s, props?.optString("tint"))
            phase = phase xor 1
            val qs = curQs
            if (phase == 1) { setLabel(q.optString("marquee"), p.al, qs, p); label.letterSpacing = 0.04f }
            else { setLabel(q.optString("label"), p.white, qs, p); label.letterSpacing = 0.1f }
            main.postDelayed(this, if (phase == 1) 7000L else 4000L)
        }
    }

    override fun onSizeChanged(w: Int, h: Int, ow: Int, oh: Int) {
        super.onSizeChanged(w, h, ow, oh)
        if (sizeKey == "box" && w > 0 && h > 0 && (w != ow || h != oh) && st != null) draw()
    }

    private fun setSize(w: Int, h: Int) {
        val lp = content.layoutParams as LayoutParams
        if (lp.width != w || lp.height != h) { lp.width = w; lp.height = h; content.layoutParams = lp }
        (parent as? NativeGridView)?.requestLayout()
    }

    /** Gizleme kuralı: "her zaman üstte" kapalıysa seçilen içerik türlerinde ya da sayfa duyurularında (gol, büyük maç, kampanya, fragman) gizlenir. */
    private fun applyVisibility() {
        val q = cur ?: run { alpha = 1f; return }
        val pin = if (q.has("pin")) q.optBoolean("pin", true) else true
        val ctx = NativeEnv.ctx
        val hide = q.optJSONArray("hide")
        var inHide = false
        if (hide != null) for (i in 0 until hide.length()) if (hide.optString(i) == ctx) inHide = true
        val covered = !pin && ctx in setOf("goal", "big", "camp", "trailer")
        visibility = if (!pin && ctx.isNotEmpty() && (inHide || covered)) INVISIBLE else VISIBLE
    }

    /** Kutunun (ortası düştüğü widget ya da tüm ekran) dışına taşan içeriği içeri kaydırır. */
    fun nudge(hostL: Float, hostT: Float, hostR: Float, hostB: Float, pad: Float) {
        val lp = content.layoutParams as LayoutParams
        val cx = width / 2f
        val myL = left.toFloat(); val myT = top.toFloat()
        val L = myL + cx - lp.width / 2f; val T = if (bottomHalf) myT + height - lp.height else myT
        val R = L + lp.width; val B = T + lp.height
        val dx = if (L < hostL + pad) hostL + pad - L else if (R > hostR - pad) hostR - pad - R else 0f
        val dy = if (T < hostT + pad) hostT + pad - T else if (B > hostB - pad) hostB - pad - B else 0f
        content.translationX = dx; content.translationY = dy
    }

    override fun release() {
        main.removeCallbacksAndMessages(null)
        NativeEnv.ctxListeners.remove(ctxListener)
    }
    override fun onDetachedFromWindow() { super.onDetachedFromWindow(); main.removeCallbacks(rotate); main.removeCallbacks(wifi) }
}
