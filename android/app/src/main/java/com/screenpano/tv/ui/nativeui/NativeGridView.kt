package com.screenpano.tv.ui.nativeui

import android.content.Context
import android.view.View
import android.view.ViewGroup
import com.screenpano.tv.data.model.TvState
import kotlin.math.min

/**
 * Sunucudaki 24x24 ızgara düzenini yerel olarak yerleştirir. Yalnız yerel karşılığı yazılmış widget'lar
 * çizilir; diğer hücreleri sayfa (WebView) çizmeye devam eder. Güvenli alan payları sayfadakiyle aynı mantıkla
 * uygulanır: içerik oranı bozulmadan küçülür ve görünen alanın ortasına kaydırılır.
 */
const val NATIVE_TICKER = false
/** Medya döngüsü (video/foto/afiş sırası) yerel: "Yerel ekran" açık + düzende medya kutusu varsa. */
const val NATIVE_MEDIA = true

class NativeGridView(context: Context) : ViewGroup(context) {
    private var state: TvState? = null
    private val cells = LinkedHashMap<String, View>()
    private var goal: GoalView? = null

    /** Gol kartı bilgi panelinin üstüne konur; yerel bilgi paneli yoksa false (sayfa çizer). */
    fun goalShow(d: org.json.JSONObject): Boolean {
        val host = cells["info#1"] ?: return false
        val g = goal ?: GoalView(context).also { goal = it; addView(it) }
        g.bind(d, (if (height > 0) height else resources.displayMetrics.heightPixels) / 100f)
        g.visibility = View.VISIBLE; g.alpha = 0f; g.bringToFront(); g.animate().alpha(1f).setDuration(350).start()
        requestLayout(); return true
    }
    fun goalHide() { goal?.let { it.animate().cancel(); it.visibility = View.GONE } }

    /** Şu an yerel çizilen widget türleri (sayfa bu hücreleri gizler). */
    val nativeTypes: List<String> get() = cells.keys.map { it.substringBefore('#') }.distinct()

    private fun create(type: String): View? = when (type) {
        // kayan bant: yerel animasyon WebView'i her karede yeniden birleştirdiği için (Box R'da 49→32 fps) WebView kalktıktan
        // sonra açılacak; o zamana kadar sayfa çizer
        "ticker" -> if (NATIVE_TICKER) TickerWidget(context) else null
        "clock" -> ClockWidget(context)
        "logo" -> LogoWidget(context)
        "rates" -> RatesWidget(context)
        "reviews" -> ReviewsWidget(context)
        "menu" -> MenuWidget(context)
        "text" -> TextWidget(context)
        "image" -> ImageWidget(context)
        "info" -> InfoWidget(context)
        "qr" -> QrWidget(context)
        else -> null
    }

    private fun scale(s: TvState, W: Float, H: Float): FloatArray {
        var ox = 0f; var oy = 0f; var k = 1f
        if (s.safe.any) {
            val x0 = W * s.safe.l / 100f; val y0 = H * s.safe.t / 100f
            val w = W * (1 - (s.safe.l + s.safe.r) / 100f); val h = H * (1 - (s.safe.t + s.safe.b) / 100f)
            k = min(w / W, h / H)
            ox = x0 + (w - k * W) / 2f; oy = y0 + (h - k * H) / 2f
        }
        return floatArrayOf(ox, oy, k)
    }

    fun setState(s: TvState) {
        state = s
        val keep = HashSet<String>()
        val seen = HashMap<String, Int>()
        val vh = (if (height > 0) height else resources.displayMetrics.heightPixels) * scale(s, 1f, 1f)[2] / 100f
        for (w in s.widgets) { // aynı türden birden çok widget (QR kartı) olabilir: tür + sıra anahtarı
            val key = w.type + "#" + (seen.merge(w.type, 1, Int::plus) ?: 1)
            val v = cells[key] ?: create(w.type)?.also { cells[key] = it; addView(it) } ?: continue
            keep.add(key)
            (v as NativeWidget).bind(w, s, vh)
        }
        for (v in cells.values) if (v is QrWidget) v.bringToFront() // QR kartları diğer widget'ların üstünde
        for (k in cells.keys.toList()) if (k !in keep) { val v = cells.remove(k); (v as? NativeWidget)?.release(); removeView(v) }
        requestLayout()
    }

    /** Yerel ekran kapatılınca tüm widget'ları (animasyonlar ve zamanlayıcılarıyla) bırakır. */
    fun clear() {
        goal?.let { removeView(it); goal = null }
        for (v in cells.values) { (v as? NativeWidget)?.release(); removeView(v) }
        cells.clear(); state = null
    }

    override fun onMeasure(wSpec: Int, hSpec: Int) {
        setMeasuredDimension(MeasureSpec.getSize(wSpec), MeasureSpec.getSize(hSpec))
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        val s = state ?: return
        val W = (r - l).toFloat(); val H = (b - t).toFloat()
        val sc = scale(s, W, H)
        // sayfadaki #app ızgarasıyla birebir: kenar boşluğu (1.2vw / 1.8vh) ve hücre aralığı (.9vw / 1.4vh) hesaba katılır
        val k = sc[2]
        val padX = W * 0.012f; val padY = H * 0.018f; val fine = if (s.cols > 24) 0.5f else 1f; val gapX = W * 0.009f * fine; val gapY = H * 0.014f * fine
        val tw = (W - 2 * padX - (s.cols - 1) * gapX) / s.cols; val th = (H - 2 * padY - (s.rows - 1) * gapY) / s.rows
        val seen = HashMap<String, Int>()
        for (w in s.widgets) {
            val c = cells[w.type + "#" + (seen.merge(w.type, 1, Int::plus) ?: 1)] ?: continue
            val x = sc[0] + k * (padX + w.x * (tw + gapX)); val y = sc[1] + k * (padY + w.y * (th + gapY))
            val pw = (k * (w.w * tw + (w.w - 1) * gapX)).toInt(); val ph = (k * (w.h * th + (w.h - 1) * gapY)).toInt()
            c.measure(MeasureSpec.makeMeasureSpec(pw, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(ph, MeasureSpec.EXACTLY))
            c.layout(x.toInt(), y.toInt(), x.toInt() + pw, y.toInt() + ph)
        }
        goal?.let { g -> cells["info#1"]?.let { h ->
            g.measure(MeasureSpec.makeMeasureSpec(h.width, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(h.height, MeasureSpec.EXACTLY))
            g.layout(h.left, h.top, h.right, h.bottom)
        } }
        // QR kartları: ortası düştüğü widget'ın (yoksa tüm ekranın) dışına taşmasın
        seen.clear()
        for (w in s.widgets) {
            val key = w.type + "#" + (seen.merge(w.type, 1, Int::plus) ?: 1)
            val q = cells[key] as? QrWidget ?: continue
            val cx = (q.left + q.right) / 2f; val cy = (q.top + q.bottom) / 2f
            var host: View? = null
            for ((k, v) in cells) if (!k.startsWith("qr#") && cx >= v.left && cx <= v.right && cy >= v.top && cy <= v.bottom) { host = v; break }
            val hl = host?.left?.toFloat() ?: 0f; val ht = host?.top?.toFloat() ?: 0f
            val hr = host?.right?.toFloat() ?: W; val hb = host?.bottom?.toFloat() ?: H
            q.nudge(hl, ht, hr, hb, H * 0.012f)
        }
    }
}
