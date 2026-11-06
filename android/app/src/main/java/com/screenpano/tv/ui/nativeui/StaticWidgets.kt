package com.screenpano.tv.ui.nativeui

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
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
import com.screenpano.tv.BuildConfig
import com.screenpano.tv.data.model.TvState
import com.screenpano.tv.data.model.WidgetSpec
import kotlin.math.max
import kotlin.math.min

/** Sunucudan gelen göreli adresleri (/uploads/...) tam adrese çevirir. */
object NativeEnv {
    /** Sunucu saati - kutu saati (ms); sunucu iletilerinden güncellenir. Sayfa döngüleri tüm ekranlarda aynı anda dönsün. */
    @Volatile var srvOff = 0L
    fun now(): Long = System.currentTimeMillis() + srvOff
    /** Ekrandaki bağlam (sayfa bildirir): goal | big | camp | trailer | video | image | poster | boş. */
    @Volatile var ctx: String = ""
        private set
    val ctxListeners = HashSet<() -> Unit>()
    fun updateCtx(c: String) { if (c != ctx) { ctx = c; ArrayList(ctxListeners).forEach { it() } } }
    /** Bağlı sunucu (canlı ya da test); MainActivity ortama göre ayarlar. */
    @Volatile var base: String = BuildConfig.BASE_URL.trimEnd('/')
    fun url(u: String): String = if (u.startsWith("http")) u else base + (if (u.startsWith("/")) u else "/$u")
}

/** "Logo" widget'ı: görsel varsa logo (koyu logolar için açık zeminli plaka), yoksa işletme adı. */
class LogoWidget(context: Context) : FrameLayout(context), NativeWidget {
    private val img = ImageView(context)
    private val name = TextView(context)
    private var lastLogo: String? = "\u0000"
    private var lastName = ""

    init {
        img.scaleType = ImageView.ScaleType.FIT_CENTER
        name.gravity = Gravity.CENTER
        name.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        name.letterSpacing = 0.06f
        name.includeFontPadding = false
        name.maxLines = 2
        name.ellipsize = TextUtils.TruncateAt.END
        addView(img, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        addView(name, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    override fun bind(w: WidgetSpec, s: TvState, vh: Float) {
        val p = Palette(s)
        val brand = s.raw.optJSONObject("brand")
        val logo = brand?.optString("logo")?.takeIf { it.isNotEmpty() && it != "null" }
        val nm = brand?.optString("name") ?: ""
        val r = 1.11f * vh
        if (logo != null) {
            name.visibility = View.GONE; img.visibility = View.VISIBLE
            // sığdırma / hizalama / iç boşluk (panelden): sayfadaki applyLogoProps ile aynı
            val pr = w.props
            val extra = when (pr?.optString("pad")) { "sm" -> vh * 1.2f; "lg" -> vh * 3f; else -> 0f }.toInt()
            img.scaleType = when (pr?.optString("fit")) {
                "cover" -> ImageView.ScaleType.CENTER_CROP
                "fill" -> ImageView.ScaleType.FIT_XY
                else -> when (pr?.optString("align")) { "left" -> ImageView.ScaleType.FIT_START; "right" -> ImageView.ScaleType.FIT_END; else -> ImageView.ScaleType.FIT_CENTER }
            }
            if (s.theme.plate) {
                background = GradientDrawable().apply { setColor(Color.argb(245, 255, 255, 255)); cornerRadius = r }
                val padV = (vh * 0.5f).toInt() + extra; val padH = (vh * 1.2f).toInt() + extra
                setPadding(padH, padV, padH, padV)
            } else { background = null; setPadding(extra, extra, extra, extra) }
            if (logo != lastLogo) { lastLogo = logo; img.load(NativeEnv.url(logo)) { crossfade(false) } }
        } else {
            lastLogo = null
            img.visibility = View.GONE; name.visibility = View.VISIBLE
            background = null; setPadding(0, 0, 0, 0)
            name.text = nm; name.setTextColor(p.white)
            if (nm != lastName) { lastName = nm; post { fit() } } else fit()
        }
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) { super.onSizeChanged(w, h, oldw, oldh); fit() }

    // sayfadaki fitWidgets ile aynı oran: yazı kutu yüksekliğine ve ad uzunluğuna göre
    private fun fit() {
        if (width <= 0 || height <= 0 || name.visibility != View.VISIBLE) return
        name.setTextSize(TypedValue.COMPLEX_UNIT_PX, max(12f, min(height * 0.42f, width / max(4f, name.text.length * 0.62f))))
    }
}

/** "Duyuru metni" widget'ı: başlık ve kısa metin. */
class TextWidget(context: Context) : LinearLayout(context), NativeWidget {
    private val title = TextView(context)
    private val body = TextView(context)

    init {
        orientation = VERTICAL
        gravity = Gravity.CENTER_VERTICAL
        title.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        title.includeFontPadding = false
        body.includeFontPadding = false
        addView(title, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
        addView(body, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
    }

    private var size = 1f
    private var hasBody = false
    private var vh = 10f

    override fun bind(w: WidgetSpec, s: TvState, vh: Float) {
        val p = Palette(s, w.props?.optString("tint")); this.vh = vh
        val pr = w.props
        val t = pr?.optString("title") ?: ""
        val b = pr?.optString("body") ?: ""
        title.text = t; body.text = b
        hasBody = b.isNotEmpty()
        body.visibility = if (hasBody) View.VISIBLE else View.GONE
        val al = when (pr?.optString("align")) { "left" -> Gravity.START; "right" -> Gravity.END; else -> Gravity.CENTER_HORIZONTAL }
        title.gravity = al; body.gravity = al
        size = when (pr?.optString("size")) { "s" -> 0.75f; "l" -> 1.3f; else -> 1f }
        title.setTextColor(p.white)
        body.setTextColor(p.white); body.alpha = 0.9f
        background = BoxSkin.bg(p, vh, w.props)
        setPadding((vh * 2.4f).toInt(), (vh * 1.6f).toInt(), (vh * 2.4f).toInt(), (vh * 1.6f).toInt())
        (body.layoutParams as LayoutParams).topMargin = (vh * 1f).toInt()
        fit()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) { super.onSizeChanged(w, h, oldw, oldh); fit() }

    private fun fit() {
        if (width <= 0 || height <= 0) return
        title.setTextSize(TypedValue.COMPLEX_UNIT_PX, max(12f, min(height * (if (hasBody) 0.24f else 0.4f), width / 9f) * size))
        body.setTextSize(TypedValue.COMPLEX_UNIT_PX, max(11f, min(height * 0.12f, width / 22f) * size))
    }
}

/** "Görsel" widget'ı: sabit afiş ya da fotoğraf (kapla ya da sığdır). */
class ImageWidget(context: Context) : FrameLayout(context), NativeWidget {
    private val img = ImageView(context)
    private val ph = TextView(context)
    private var lastUrl = "\u0000"

    init {
        addView(img, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        ph.gravity = Gravity.CENTER
        addView(ph, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        clipToOutline = true
    }

    override fun bind(w: WidgetSpec, s: TvState, vh: Float) {
        val p = Palette(s)
        val url = w.props?.optString("url") ?: ""
        val contain = w.props?.optString("fit") == "contain"
        img.scaleType = if (contain) ImageView.ScaleType.FIT_CENTER else ImageView.ScaleType.CENTER_CROP
        val r = 1.3f * vh
        background = GradientDrawable().apply { setColor(p.edge); cornerRadius = r }
        outlineProvider = object : android.view.ViewOutlineProvider() {
            override fun getOutline(v: View, o: android.graphics.Outline) { o.setRoundRect(0, 0, v.width, v.height, r) }
        }
        ph.setTextColor(p.mute); ph.setTextSize(TypedValue.COMPLEX_UNIT_PX, vh * 2f)
        if (url.isEmpty()) { img.visibility = View.GONE; ph.visibility = View.VISIBLE; ph.text = "Görsel seçilmedi"; lastUrl = "" }
        else {
            ph.visibility = View.GONE; img.visibility = View.VISIBLE
            if (url != lastUrl) { lastUrl = url; img.load(NativeEnv.url(url)) { crossfade(false) } }
        }
    }
}
