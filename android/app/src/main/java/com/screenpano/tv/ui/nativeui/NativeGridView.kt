package com.screenpano.tv.ui.nativeui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.view.View
import android.view.ViewGroup
import com.screenpano.tv.data.model.TvState
import com.screenpano.tv.data.model.WidgetSpec
import kotlin.math.min

/**
 * Sunucudaki 24x24 ızgara düzenini yerel olarak yerleştirir. Her widget bir alt görünümdür; henüz yerel
 * karşılığı olmayan widget'lar yer tutucu çizer (faz 0). Güvenli alan payları sayfadakiyle aynı mantıkla
 * uygulanır: içerik oranı bozulmadan küçülür ve görünen alanın ortasına kaydırılır.
 */
class NativeGridView(context: Context) : ViewGroup(context) {
    private var state: TvState? = null
    private val cells = HashMap<String, WidgetCell>()

    fun setState(s: TvState) {
        state = s
        // faz 0: yer tutucular şeffaf; asıl görüntü sayfa/ExoPlayer katmanlarından gelmeye devam eder
        // aynı türden widget'ı yeniden kullan (ekran titremesin); kalmayanları çıkar
        val keep = HashSet<String>()
        val seen = HashMap<String, Int>()
        for (w in s.widgets) { // aynı türden birden çok widget (QR kartı) olabilir: tür + sıra anahtarı
            val key = w.type + "#" + (seen.merge(w.type, 1, Int::plus) ?: 1)
            keep.add(key)
            cells.getOrPut(key) { WidgetCell(context).also { addView(it) } }.bind(w, s)
        }
        for (k in cells.keys.toList()) if (k !in keep) removeView(cells.remove(k))
        requestLayout()
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        val s = state ?: return
        val W = (r - l).toFloat(); val H = (b - t).toFloat()
        // güvenli alan: sayfadaki applySafe ile aynı hesap
        var ox = 0f; var oy = 0f; var k = 1f
        if (s.safe.any) {
            val x0 = W * s.safe.l / 100f; val y0 = H * s.safe.t / 100f
            val w = W * (1 - (s.safe.l + s.safe.r) / 100f); val h = H * (1 - (s.safe.t + s.safe.b) / 100f)
            k = min(w / W, h / H)
            ox = x0 + (w - k * W) / 2f; oy = y0 + (h - k * H) / 2f
        }
        val cw = W * k / s.cols; val ch = H * k / s.rows
        val seen = HashMap<String, Int>()
        for (w in s.widgets) {
            val c = cells[w.type + "#" + (seen.merge(w.type, 1, Int::plus) ?: 1)] ?: continue
            val x = ox + w.x * cw; val y = oy + w.y * ch
            c.measure(MeasureSpec.makeMeasureSpec((w.w * cw).toInt(), MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec((w.h * ch).toInt(), MeasureSpec.EXACTLY))
            c.layout(x.toInt(), y.toInt(), (x + w.w * cw).toInt(), (y + w.h * ch).toInt())
        }
    }

    /** Faz 0 yer tutucusu: kutunun çerçevesini ve türünü çizer. */
    private class WidgetCell(context: Context) : View(context) {
        private var spec: WidgetSpec? = null
        private var accent = 0; private var text = 0
        private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 3f }
        private val label = Paint(Paint.ANTI_ALIAS_FLAG)
        private val rect = RectF()

        fun bind(w: WidgetSpec, s: TvState) { spec = w; accent = s.theme.accent; text = s.theme.text; invalidate() }

        override fun onDraw(c: Canvas) {
            val w = spec ?: return
            stroke.color = accent
            rect.set(4f, 4f, width - 4f, height - 4f)
            c.drawRoundRect(rect, 14f, 14f, stroke)
            label.color = text
            label.textSize = (height * 0.12f).coerceIn(16f, 40f)
            c.drawText("${w.type}  ${w.w}x${w.h}", 16f, 16f + label.textSize, label)
        }
    }
}
