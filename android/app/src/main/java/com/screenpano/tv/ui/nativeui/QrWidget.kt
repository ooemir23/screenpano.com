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

    override fun bind(w: WidgetSpec, s: TvState, vh: Float) {
        val sig = s.raw.optJSONArray("qrs")?.toString()
        val newSel = w.props?.optString("qr") ?: ""
        val newStyle = (w.props?.optString("style") ?: "").let { if (it in setOf("right", "left", "plain")) it else "below" }
        val changed = sig != st?.raw?.optJSONArray("qrs")?.toString() || newSel != selected || vh != this.vh || newStyle != style
        st = s; this.vh = vh; selected = newSel; style = newStyle
        if (changed) { idx = 0; draw() }
        main.removeCallbacks(rotate); main.postDelayed(rotate, 12_000L)
    }

    private fun draw() {
        val s = st ?: return
        val p = Palette(s)
        val l = list()
        val q = if (l.isEmpty()) null else l[idx % l.size]
        cur = q
        content.removeAllViews(); phase = 0
        main.removeCallbacks(wifi)
        if (q == null) {
            val t = TextView(context).apply { text = "Panelden QR kod ekleyin"; setTextColor(p.mute); setTextSize(TypedValue.COMPLEX_UNIT_PX, vh * 2f) }
            content.addView(t); setSize((vh * 17f).toInt(), (vh * 4f).toInt()); applyVisibility(); return
        }
        val qs = (s.raw.optDouble("qrSize", 17.0).toFloat() * vh).toInt()
        val box = FrameLayout(context)
        val pad = max(1, (vh * 0.4f).toInt())
        box.setPadding(pad, pad, pad, pad)
        box.background = GradientDrawable().apply { setColor(Color.WHITE); cornerRadius = vh; setStroke(max(1, (vh * 0.18f).toInt()), p.a(p.accent2, 0.85f)) }
        val iv = ImageView(context).apply { scaleType = ImageView.ScaleType.FIT_CENTER }
        box.addView(iv, LayoutParams(-1, -1))
        val svg = q.optString("svg")
        if (svg.isNotEmpty()) iv.load(ByteBuffer.wrap(svg.toByteArray())) { crossfade(false) }
        val side = style == "right" || style == "left"
        content.orientation = if (side) LinearLayout.HORIZONTAL else LinearLayout.VERTICAL
        content.gravity = if (side) Gravity.CENTER_VERTICAL else Gravity.CENTER_HORIZONTAL
        (label.parent as? ViewGroup)?.removeView(label)
        label.rotation = 0f; label.minimumWidth = 0
        if (style == "plain") { content.addView(box, LinearLayout.LayoutParams(qs, qs)); setSize(qs, qs); applyVisibility(); return }
        val wf = q.optString("marquee").isNotEmpty()
        val lh = (vh * 5.4f).toInt()
        val gap = (vh * 0.8f).toInt()
        if (side) {
            // dikey etiket: kutu QR yüksekliğinde yatay çizilir, 90° (sağda) / 270° (solda) döndürülür
            label.text = ""; setLabel(q.optString("label"), p.white, qs, p)
            label.background = GradientDrawable().apply { setColor(Color.argb(235, 10, 8, 6)); cornerRadius = vh * 2f; setStroke(max(2, (vh * 0.25f).toInt()), p.al) }
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
            setSize(qs + gap + lh, qs)
        } else {
            content.addView(box, LinearLayout.LayoutParams(qs, qs))
            val lw = if (wf) qs else (qs + (vh * 8f).toInt())
            label.text = ""; setLabel(q.optString("label"), p.white, lw, p)
            label.background = GradientDrawable().apply { setColor(Color.argb(235, 10, 8, 6)); cornerRadius = vh * 2f; setStroke(max(2, (vh * 0.25f).toInt()), p.al) }
            content.addView(label, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, lh).also { it.topMargin = gap })
            label.minimumWidth = if (wf) qs else 0
            setSize(max(qs, lw), qs + lh + gap)
        }
        if (wf) main.postDelayed(wifi, 4000)
        applyVisibility()
    }

    private val label: TextView by lazy {
        TextView(context).apply { includeFontPadding = false; gravity = Gravity.CENTER; setSingleLine(true); typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD); letterSpacing = 0.1f }
    }

    private fun setLabel(t: String, color: Int, maxW: Int, p: Palette) {
        label.text = t.uppercase(Locale("tr", "TR")); label.setTextColor(color)
        label.setPadding((vh * 1.2f).toInt(), 0, (vh * 1.2f).toInt(), 0)
        var px = vh * 2.3f
        label.setTextSize(TypedValue.COMPLEX_UNIT_PX, px)
        val avail = maxW - (vh * 2.4f)
        while (px > vh * 1.6f && label.paint.measureText(label.text.toString()) > avail) { px -= vh * 0.1f; label.setTextSize(TypedValue.COMPLEX_UNIT_PX, px) }
    }

    private val wifi: Runnable = object : Runnable {
        override fun run() {
            val q = cur ?: return; val s = st ?: return; val p = Palette(s)
            phase = phase xor 1
            val qs = (s.raw.optDouble("qrSize", 17.0).toFloat() * vh).toInt()
            if (phase == 1) { setLabel(q.optString("marquee"), p.al, qs, p); label.letterSpacing = 0.04f }
            else { setLabel(q.optString("label"), p.white, qs, p); label.letterSpacing = 0.1f }
            main.postDelayed(this, if (phase == 1) 7000L else 4000L)
        }
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
        val cx = width / 2f; val cy = height / 2f
        val myL = left.toFloat(); val myT = top.toFloat()
        val L = myL + cx - lp.width / 2f; val T = myT + cy - lp.height / 2f
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
