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
class NativeGridView(context: Context) : ViewGroup(context) {
    private var state: TvState? = null
    private val cells = LinkedHashMap<String, View>()

    /** Şu an yerel çizilen widget türleri (sayfa bu hücreleri gizler). */
    val nativeTypes: List<String> get() = cells.keys.map { it.substringBefore('#') }.distinct()

    private fun create(type: String): View? = when (type) {
        "ticker" -> TickerWidget(context)
        "clock" -> ClockWidget(context)
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
        for (k in cells.keys.toList()) if (k !in keep) { val v = cells.remove(k); (v as? NativeWidget)?.release(); removeView(v) }
        requestLayout()
    }

    /** Yerel ekran kapatılınca tüm widget'ları (animasyonlar ve zamanlayıcılarıyla) bırakır. */
    fun clear() {
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
        val cw = W * sc[2] / s.cols; val ch = H * sc[2] / s.rows
        val seen = HashMap<String, Int>()
        for (w in s.widgets) {
            val c = cells[w.type + "#" + (seen.merge(w.type, 1, Int::plus) ?: 1)] ?: continue
            val x = sc[0] + w.x * cw; val y = sc[1] + w.y * ch
            val pw = (w.w * cw).toInt(); val ph = (w.h * ch).toInt()
            c.measure(MeasureSpec.makeMeasureSpec(pw, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(ph, MeasureSpec.EXACTLY))
            c.layout(x.toInt(), y.toInt(), x.toInt() + pw, y.toInt() + ph)
        }
    }
}
