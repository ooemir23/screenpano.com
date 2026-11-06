package com.screenpano.tv.ui.nativeui

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.animation.LinearInterpolator
import android.widget.LinearLayout
import android.widget.TextView
import com.screenpano.tv.data.model.TvState
import com.screenpano.tv.data.model.WidgetSpec
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.max

/** Şerit alanı: içeriği kırpar, yanlarda kararma verir; içerik ölçüsü sınırsızdır. */
private class Viewport(context: Context) : ViewGroup(context) {
    var edge = Color.BLACK
    private val paint = Paint()
    init { setWillNotDraw(false); clipChildren = true }

    override fun onMeasure(wSpec: Int, hSpec: Int) {
        val w = MeasureSpec.getSize(wSpec); val h = MeasureSpec.getSize(hSpec)
        for (i in 0 until childCount) getChildAt(i).measure(MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(h, MeasureSpec.EXACTLY))
        setMeasuredDimension(w, h)
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        for (i in 0 until childCount) { val c = getChildAt(i); c.layout(0, 0, c.measuredWidth, b - t) }
    }

    private var shL: LinearGradient? = null
    private var shR: LinearGradient? = null
    private var shKey = 0L
    override fun dispatchDraw(canvas: Canvas) {
        super.dispatchDraw(canvas)
        val fw = width * 0.024f
        val key = width.toLong() * 31 + edge
        if (key != shKey || shL == null) {
            shKey = key
            val a = Color.argb(0, Color.red(edge), Color.green(edge), Color.blue(edge))
            shL = LinearGradient(0f, 0f, fw, 0f, edge, a, Shader.TileMode.CLAMP)
            shR = LinearGradient(width - fw, 0f, width.toFloat(), 0f, a, edge, Shader.TileMode.CLAMP)
        }
        paint.shader = shL; canvas.drawRect(0f, 0f, fw, height.toFloat(), paint)
        paint.shader = shR; canvas.drawRect(width - fw, 0f, width.toFloat(), height.toFloat(), paint)
    }
}

/**
 * "Kayan bant" widget'ı: solda saat kutusu (isteğe bağlı), etiket ve sağa doğru kayan şerit.
 * Şerit translationX animasyonuyla kayar (yeniden çizim yok, GPU'da kayar). Bölüm modunda içerik bir kez kayar
 * ve bitince sıradaki bölüme geçilir; diğerlerinde kesintisiz döner.
 */
class TickerWidget(context: Context) : LinearLayout(context), NativeWidget {
    private val model = TickerModel()
    private val main = Handler(Looper.getMainLooper())
    private val clockBox = LinearLayout(context)
    private val clockTime = TextView(context)
    private val clockDate = TextView(context)
    private val label = TextView(context)
    private val view = Viewport(context)
    private val track = VTrack(context)
    private var anim: ValueAnimator? = null
    private var state: TvState? = null
    private var vh = 10f
    private var lastKey = ""
    private var plan: TickerPlan? = null
    private var showClock = true
    private var fmtTime = SimpleDateFormat("HH:mm", Locale("tr", "TR"))
    private val fmtDate = SimpleDateFormat("d MMMM EEEE", Locale("tr", "TR"))
    private val clockTick = object : Runnable {
        override fun run() {
            val d = Date()
            clockTime.text = fmtTime.format(d)
            clockDate.text = fmtDate.format(d).uppercase(Locale("tr", "TR"))
            main.postDelayed(this, 60_000L - (System.currentTimeMillis() % 60_000L) + 50L)
        }
    }

    init {
        orientation = HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        clockBox.orientation = VERTICAL
        clockBox.gravity = Gravity.CENTER
        clockTime.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        clockDate.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        clockTime.includeFontPadding = false; clockDate.includeFontPadding = false
        clockBox.addView(clockTime); clockBox.addView(clockDate)
        label.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        label.gravity = Gravity.CENTER_VERTICAL
        label.includeFontPadding = false
        view.addView(track)
        addView(clockBox); addView(label); addView(view, LayoutParams(0, LayoutParams.MATCH_PARENT, 1f))
    }

    override fun bind(w: WidgetSpec, s: TvState, vh: Float) {
        val first = state == null
        state = s; this.vh = vh
        val p = Palette(s)
        showClock = w.props?.optBoolean("clock", true) ?: true
        val tz = TimeZone.getTimeZone(s.raw.optString("tz").ifEmpty { "Europe/Istanbul" })
        fmtTime = SimpleDateFormat("HH:mm", Locale("tr", "TR")).also { it.timeZone = tz }
        fmtDate.timeZone = tz
        // alt kenara yaslıysa yalnız üst çizgi, değilse yuvarlak çerçeve (sayfadaki .edge-b kuralı)
        val edgeB = w.x == 0 && w.w >= s.cols && w.y + w.h >= s.rows
        val r = 1.3f * vh
        topLine = if (edgeB) p.a(p.accent2, 0.55f) else 0
        topLinePx = max(1, (vh * 0.1f).toInt())
        background = GradientDrawable().apply {
            setColor(p.edge)
            if (!edgeB) { cornerRadius = r; setStroke(max(1, (vh * 0.1f).toInt()), p.a(p.accent2, 0.45f)) }
        }
        view.edge = p.edge
        // saat kutusu
        clockBox.visibility = if (showClock) VISIBLE else GONE
        clockBox.background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(p.accent, p.ad)).apply { cornerRadius = 1.11f * vh; setStroke(max(1, (vh * 0.1f).toInt()), Color.argb(153, 255, 225, 185)) }
        clockBox.setPadding((vh * 2.4f).toInt(), 0, (vh * 2.4f).toInt(), 0)
        clockBox.layoutParams = LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.MATCH_PARENT).apply { setMargins((vh * 1.2f).toInt(), (vh).toInt(), 0, (vh).toInt()) }
        clockTime.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, vh * 3f); clockTime.setTextColor(Color.WHITE); clockTime.letterSpacing = 0.04f
        clockDate.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, vh * 1.8f); clockDate.setTextColor(p.al); clockDate.letterSpacing = 0.09f
        main.removeCallbacks(clockTick); if (showClock) clockTick.run()
        // etiket
        label.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, vh * 2f); label.setTextColor(p.al); label.letterSpacing = 0.12f
        label.background = GradientDrawable().apply { setColor(p.a(p.accent2, 0.16f)); cornerRadius = 1.11f * vh; setStroke(max(1, (vh * 0.1f).toInt()), p.a(p.accent2, 0.75f)) }
        label.setPadding((vh * 2f).toInt(), 0, (vh * 2f).toInt(), 0)
        label.layoutParams = LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.MATCH_PARENT).apply { setMargins((vh * 1.1f).toInt(), vh.toInt(), (vh * 1.1f).toInt(), vh.toInt()) }
        rebuild(first)
    }

    private fun rebuild(immediate: Boolean) {
        val s = state ?: return
        val p = Palette(s)
        val np = model.build(s, p, vh)
        if (np.key == lastKey) return
        lastKey = np.key
        plan = np
        val apply = { show(np, p) }
        if (immediate || !track.hasItems()) { apply(); return }
        // içerik değişince şerit söner, yenisi belirir
        view.animate().alpha(0f).setDuration(550).withEndAction { apply(); view.animate().alpha(1f).setDuration(550).start() }.start()
    }

    private fun show(pl: TickerPlan, p: Palette) {
        val old = anim; anim = null; old?.cancel()
        label.text = pl.label.uppercase(Locale("tr", "TR"))
        val vw = view.width
        val textPx = vh * 2.7f; val padPx = (vh * 2.4f).toInt()
        // sanal şerit: yalnız görünen alanın biraz önü/sonu gerçek görünüme çevrilir, kalanı yalnız sayı olarak tutulur
        val meas = TextView(context).apply { includeFontPadding = false; setSingleLine(true); setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, textPx); setPadding(padPx, 0, padPx, 0) }
        val ws = pl.items.map { t -> meas.text = t; meas.measure(MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED), MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED)); meas.measuredWidth }
        val sum = ws.sum()
        val start = if (pl.seg) (vh * 2f).toInt() else 0
        val reps = if (pl.seg) 1 else max(1, Math.ceil(vw.toDouble() / max(1, sum)).toInt()) // tek kopya kısaysa çoğalt
        val half = if (pl.seg) max(vw, start + sum) else sum * reps
        track.setup(pl.items, ws, reps, start, half, view.height, textPx, p.white, padPx, vw)
        val dist = half.toFloat()
        if (dist <= 0f) return
        // hız: ekran genişliğinin %5,5'i / sn (sayfadaki hesapla aynı), bölüm modunda en az 12 sn, değilse 20 sn
        val screenW = resources.displayMetrics.widthPixels.toFloat()
        val secs = max(if (pl.seg) 12f else 20f, dist / (screenW * 0.055f))
        val an = ValueAnimator.ofFloat(0f, dist)
        an.duration = (secs * 1000).toLong(); an.interpolator = LinearInterpolator()
        an.addUpdateListener { track.setOff(it.animatedValue as Float) }
        if (pl.seg && pl.segCount > 1) {
            // bölüm bitince sıradakine geç
            an.addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) { if (anim === an) { model.advance(pl.isInfo); lastKey = ""; rebuild(true) } }
            })
        } else {
            an.repeatCount = ValueAnimator.INFINITE
        }
        anim = an; an.start()
    }

    /** Düzen ya da veri sonradan boyutlanınca şerit yeniden kurulur. */
    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (state != null && (w != oldw || h != oldh)) { lastKey = ""; post { rebuild(true) } }
    }

    private var topLine = 0
    private var topLinePx = 1
    private val linePaint = Paint()
    override fun dispatchDraw(canvas: Canvas) {
        super.dispatchDraw(canvas)
        if (topLine != 0) { linePaint.color = topLine; canvas.drawRect(0f, 0f, width.toFloat(), topLinePx.toFloat(), linePaint) }
    }

    override fun release() { val old = anim; anim = null; old?.cancel(); main.removeCallbacks(clockTick) }
    override fun onDetachedFromWindow() { release(); super.onDetachedFromWindow() }
}

/**
 * Sonsuz şerit: öğelerin yerleşimi yalnız sayı olarak tutulur. Görünen alanın biraz önünde/arkasında kalan öğeler
 * küçük birer bitmap'e çizilir (geçince serbest bırakılır); kayarken yalnız bu bitmap'ler ondalıklı konumda çizilir (düzgün, takılmasız).
 * Şerit 'half' piksellik bir periyotla kendi üstüne sarılır.
 */
private class VTrack(context: Context) : View(context) {
    private var items: List<CharSequence> = emptyList()
    private var lefts = IntArray(0); private var wids = IntArray(0); private var txt = IntArray(0)
    private var half = 1; private var h = 0; private var vw = 0
    private var textPx = 0f; private var color = Color.WHITE; private var padPx = 0
    private var bmps = arrayOfNulls<Bitmap>(0)
    private var off = 0f
    private val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
    private val maker: TextView by lazy { TextView(context).apply { includeFontPadding = false; setSingleLine(true); gravity = Gravity.CENTER_VERTICAL } }

    fun hasItems() = lefts.isNotEmpty()

    fun setup(list: List<CharSequence>, ws: List<Int>, reps: Int, start: Int, half: Int, height: Int, textPx: Float, color: Int, padPx: Int, vw: Int) {
        for (b in bmps) b?.recycle()
        items = list; h = max(1, height); this.textPx = textPx; this.color = color; this.padPx = padPx; this.half = max(1, half); this.vw = vw
        val n = list.size * reps
        lefts = IntArray(n); wids = IntArray(n); txt = IntArray(n); bmps = arrayOfNulls(n)
        var x = start; var i = 0
        repeat(reps) { for (k in list.indices) { lefts[i] = x; wids[i] = ws[k]; txt[i] = k; x += ws[k]; i++ } }
        setOff(0f)
    }

    private fun xOf(i: Int): Float {
        var x = lefts[i] - off
        if (x < -wids[i] - vw * 0.1f) x += half
        return x
    }

    fun setOff(o: Float) {
        off = o
        val from = -vw * 0.10f; val to = vw * 1.35f // görünen alanın %10 gerisi, %35 ilerisi
        for (i in lefts.indices) {
            val x = xOf(i)
            val inWin = x < to && x + wids[i] > from
            if (inWin) { if (bmps[i] == null) bmps[i] = render(i) }
            else if (bmps[i] != null) { bmps[i]?.recycle(); bmps[i] = null }
        }
        invalidate()
    }

    private fun render(i: Int): Bitmap {
        val w = max(1, wids[i])
        val bm = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        maker.text = items[txt[i]]
        maker.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, textPx); maker.setTextColor(color); maker.setPadding(padPx, 0, padPx, 0)
        maker.measure(MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(h, MeasureSpec.EXACTLY))
        maker.layout(0, 0, w, h)
        maker.draw(Canvas(bm))
        return bm
    }

    override fun onMeasure(w: Int, hs: Int) { setMeasuredDimension(MeasureSpec.getSize(w), MeasureSpec.getSize(hs)) }

    override fun onDraw(canvas: Canvas) {
        for (i in lefts.indices) { val b = bmps[i] ?: continue; canvas.drawBitmap(b, xOf(i), 0f, paint) }
    }

    override fun onDetachedFromWindow() { for (j in bmps.indices) { bmps[j]?.recycle(); bmps[j] = null }; super.onDetachedFromWindow() }
}
