package com.screenpano.tv.ui.nativeui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.Shader
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
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
import kotlin.math.roundToInt

/**
 * Hazır afişler (public/posters.js şablonlarının yerel karşılığı). Yazı boyutu 1em = min(genişlik/64, yükseklik/34),
 * yani 1920x1080'de yaklaşık 30 px; şablonlardaki em oranları aynen korunur.
 * Panel önizlemesi hâlâ posters.js (HTML) ile çizilir; yeni bir şablon eklendiğinde iki tarafa da eklenir.
 */
class PosterView(context: Context) : FrameLayout(context) {
    private var item: JSONObject? = null
    private var pal: Palette? = null
    private var lang = "tr"
    private var em = 30f
    private var built = ""

    fun bind(item: JSONObject, s: TvState, lang: String = "tr") {
        this.item = item; pal = Palette(s); this.lang = lang
        built = ""
        rebuild()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (w > 0 && h > 0) { built = ""; rebuild() }
    }

    // ---- veri ----
    private val defaults = mapOf(
        "happy" to mapOf("title" to "Happy Hour", "sub" to "17:00 – 19:00", "note" to "Tüm kokteyllerde %30 indirim"),
        "kahvalti" to mapOf("title" to "Serpme Kahvaltı", "price" to "450 ₺", "sub" to "Hafta sonu 09:00 – 13:00", "note" to "Sınırsız çay ile"),
        "indirim" to mapOf("badge" to "%20", "title" to "Tüm tatlılarda indirim", "sub" to "Bu hafta boyunca", "note" to ""),
        "yeni" to mapOf("badge" to "Yeni", "title" to "Fıstıklı Latte", "price" to "145 ₺", "sub" to "Antep fıstığı, espresso, süt köpüğü"),
        "gunun" to mapOf("title" to "Günün Menüsü", "body" to "Mercimek çorbası\nTavuk sote, pilav\nSalata\nAyran", "price" to "280 ₺"),
        "muzik" to mapOf("title" to "Canlı Müzik", "sub" to "Cuma 21:00", "note" to "Akustik gece · rezervasyon önerilir"),
        "etkinlik" to mapOf("badge" to "Bu akşam", "title" to "Maç Gecesi", "sub" to "Dev ekranda canlı yayın", "note" to "Masanızı ayırtın"),
        "wifi" to mapOf("title" to "Ücretsiz Wi-Fi", "sub" to "Ağ: Kafe_Misafir", "note" to "Şifre: hosgeldiniz"),
        "tesekkur" to mapOf("title" to "Bizi tercih ettiğiniz için teşekkürler", "sub" to "@isletmeniz", "note" to "Paylaşımlarınızda bizi etiketleyin"),
        "kitap" to mapOf("badge" to "Yeni çıkan kitap", "title" to "", "sub" to "", "note" to ""),
        "insta" to mapOf("title" to "", "sub" to "", "note" to ""),
    )

    private fun field(k: String): String {
        val it = item ?: return ""
        val tpl = it.optString("tpl").let { t -> if (defaults.containsKey(t)) t else "happy" }
        val tr = it.optJSONObject("i18n")?.optJSONObject(lang)
        val trv = tr?.optString(k)?.takeIf { v -> v.isNotEmpty() && v != "null" }
        if (trv != null) return trv
        val fields = it.optJSONObject("fields")
        val own = fields?.let { f -> if (f.has(k) && !f.isNull(k)) f.optString(k) else null }
        return own ?: defaults[tpl]?.get(k) ?: ""
    }

    // ---- çizim yardımcıları ----
    private fun px(e: Float) = e * em
    private fun tv(text: String, sizeEm: Float, color: Int, bold: Int = 600, lines: Int = 0, alpha: Float = 1f): TextView = TextView(context).apply {
        this.text = text; setTextSize(TypedValue.COMPLEX_UNIT_PX, px(sizeEm)); setTextColor(color); includeFontPadding = false
        typeface = Typeface.create(Typeface.DEFAULT, if (bold >= 700) Typeface.BOLD else Typeface.NORMAL)
        if (lines > 0) { maxLines = lines; ellipsize = TextUtils.TruncateAt.END }
        this.alpha = alpha; setLineSpacing(0f, 1.0f)
    }

    private fun column(gap: Float = 0.35f): LinearLayout = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_VERTICAL
        showDividers = LinearLayout.SHOW_DIVIDER_MIDDLE
        dividerDrawable = GradientDrawable().apply { setSize(1, max(1, px(gap).roundToInt())) }
    }

    private fun badge(text: String): View = tv(text, 1.25f, pal!!.edge, 800).apply {
        setPadding(px(0.7f).roundToInt(), px(0.25f).roundToInt(), px(0.7f).roundToInt(), px(0.25f).roundToInt())
        background = GradientDrawable().apply { setColor(pal!!.accent2); cornerRadius = px(0.3f) }
    }

    private fun photo(url: String, scale: ImageView.ScaleType = ImageView.ScaleType.CENTER_CROP): ImageView = ImageView(context).apply {
        scaleType = scale; load(NativeEnv.url(url)) { crossfade(false) }
    }

    private fun lp(w: Int, h: Int, g: Int = Gravity.NO_GRAVITY) = LayoutParams(w, h, g)

    private fun add(v: View, w: Int = ViewGroup.LayoutParams.MATCH_PARENT, h: Int = ViewGroup.LayoutParams.MATCH_PARENT, left: Float = 0f, widthFrac: Float = 1f) {
        val W = (width * widthFrac).roundToInt()
        val params = if (widthFrac < 1f || left > 0f) LayoutParams(W, h) else LayoutParams(w, h)
        params.leftMargin = (width * left).roundToInt()
        addView(v, params)
    }

    /** Metin sütunu: rozet, başlık, fiyat, alt yazı, not (şablonun .in kutusu). */
    private fun textBlock(maxFrac: Float = 1f, center: Boolean = false, h1Em: Float = 4.2f, h1Upper: Boolean = false, subColor: Int? = null, subEm: Float = 1.6f): LinearLayout {
        val p = pal!!
        val col = column().apply {
            setPadding((width * 0.07f).roundToInt(), (height * 0.06f).roundToInt(), (width * 0.07f).roundToInt(), (height * 0.06f).roundToInt())
            if (center) gravity = Gravity.CENTER
        }
        val al = if (center) Gravity.CENTER_HORIZONTAL else Gravity.START
        fun addT(v: View) { col.addView(v, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { gravity = al }) }
        if (field("badge").isNotEmpty()) addT(badge(field("badge")))
        val title = field("title").let { if (h1Upper) it.uppercase(Locale("tr", "TR")) else it }
        addT(tv(title, h1Em, p.white, 800).apply { setLineSpacing(0f, 0.98f); gravity = if (center) Gravity.CENTER else Gravity.START })
        if (field("price").isNotEmpty()) addT(tv(field("price"), 2.6f, p.accent2, 800).apply { setSingleLine(true) })
        if (field("sub").isNotEmpty()) addT(tv(field("sub"), subEm, subColor ?: p.accent2, 600).apply { gravity = if (center) Gravity.CENTER else Gravity.START })
        if (field("note").isNotEmpty()) addT(tv(field("note"), 1.15f, p.white, 500, 0, 0.82f).apply { gravity = if (center) Gravity.CENTER else Gravity.START })
        return col
    }

    private fun gradBg(vararg colors: Int, angle: GradientDrawable.Orientation = GradientDrawable.Orientation.LEFT_RIGHT): GradientDrawable = GradientDrawable(angle, colors)

    private fun rebuild() {
        val it = item ?: return
        val p = pal ?: return
        if (width <= 0 || height <= 0) return
        val key = it.toString() + lang + width + "x" + height
        if (key == built) return
        built = key
        removeAllViews()
        em = max(1.5f, min(width / 64f, height / 34f))
        setBackgroundColor(p.edge)
        val tpl = it.optString("tpl").let { t -> if (defaults.containsKey(t)) t else "happy" }
        val image = it.optString("image").takeIf { u -> u.isNotEmpty() && u != "null" }
        val books = it.optJSONArray("books")
        when {
            tpl == "insta" -> insta(image)
            tpl == "kitap" && books != null && books.length() > 0 -> booksGrid(books)
            tpl == "kitap" -> bookSingle(image)
            tpl == "happy" -> happy()
            tpl == "indirim" -> indirim()
            tpl == "gunun" -> gunun()
            tpl == "wifi" -> wifi()
            tpl == "tesekkur" -> tesekkur()
            tpl == "muzik" -> muzik()
            else -> standard(tpl, image)
        }
    }

    // kahvaltı, yeni, etkinlik: görsel varsa arkada (kahvaltı/yeni'de sağ %58) ve soldan gölge
    private fun standard(tpl: String, image: String?) {
        val p = pal!!
        if (image != null) {
            val rightOnly = tpl == "kahvalti" || tpl == "yeni"
            if (rightOnly) add(photo(image), left = 0.42f, widthFrac = 0.58f) else add(photo(image))
            val shade = View(context)
            shade.background = if (rightOnly) gradBg(p.edge, p.edge, Color.TRANSPARENT)
            else gradBg(p.edge, p.a(Color.BLACK, 0.55f), p.a(Color.BLACK, 0.05f))
            add(shade)
        } else setBackgroundColor(p.edge)
        val maxFrac = if (image == null) 1f else if (tpl == "etkinlik") 0.70f else 0.58f
        add(textBlock(maxFrac), widthFrac = maxFrac)
    }

    private fun happy() {
        val p = pal!!
        val stripes = object : View(context) {
            private val a = Paint().apply { color = p.edge }
            private val b = Paint().apply { color = mixc(p.accent, p.edge, 0.35f) }
            override fun onDraw(c: Canvas) {
                val step = px(1.6f) * 1.4142f; var x = -height.toFloat(); var i = 0
                c.drawRect(0f, 0f, width.toFloat(), height.toFloat(), a)
                while (x < width + height) {
                    val path = Path().apply { moveTo(x, height.toFloat()); lineTo(x + step, height.toFloat()); lineTo(x + step + height, 0f); lineTo(x + height, 0f); close() }
                    if (i % 2 == 1) c.drawPath(path, b)
                    x += step; i++
                }
            }
        }
        add(stripes)
        val box = textBlock(1f, true, 5f, true, p.white, 3f).apply {
            background = GradientDrawable().apply { setColor(p.edge); cornerRadius = px(0.6f); setStroke(max(1, px(0.18f).roundToInt()), p.accent2) }
            setPadding((width * 0.08f).roundToInt(), (height * 0.05f).roundToInt(), (width * 0.08f).roundToInt(), (height * 0.05f).roundToInt())
        }
        addView(box, LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER))
    }

    private fun mixc(a: Int, b: Int, t: Float) = Color.rgb(
        (Color.red(a) * t + Color.red(b) * (1 - t)).toInt(), (Color.green(a) * t + Color.green(b) * (1 - t)).toInt(), (Color.blue(a) * t + Color.blue(b) * (1 - t)).toInt())

    private fun indirim() {
        val p = pal!!
        val big = TextView(context).apply {
            text = field("badge"); gravity = Gravity.CENTER; setTextColor(p.edge); includeFontPadding = false
            setTextSize(TypedValue.COMPLEX_UNIT_PX, px(11f)); typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD); letterSpacing = -0.06f
            setBackgroundColor(p.accent2)
        }
        addView(big, LayoutParams((width * 0.46f).roundToInt(), ViewGroup.LayoutParams.MATCH_PARENT))
        val col = textBlock(1f).apply { }
        addView(col, LayoutParams((width * 0.54f).roundToInt(), ViewGroup.LayoutParams.MATCH_PARENT).apply { leftMargin = (width * 0.46f).roundToInt() })
    }

    private fun gunun() {
        val p = pal!!
        val col = column(0.35f).apply {
            gravity = Gravity.TOP
            setPadding((width * 0.07f).roundToInt(), (height * 0.05f).roundToInt(), (width * 0.07f).roundToInt(), (height * 0.06f).roundToInt())
        }
        col.addView(tv(field("title"), 3.4f, p.white, 800).apply { setPadding(0, 0, 0, px(0.25f).roundToInt()) })
        col.addView(View(context).apply { setBackgroundColor(p.accent2) }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, max(1, px(0.08f * 3.4f).roundToInt())))
        val lines = field("body").split("\n").map { l -> l.trim() }.filter { l -> l.isNotEmpty() }.take(8)
        for (l in lines) col.addView(tv("●  $l", 1.9f, p.white, 600).apply { setPadding(0, px(0.18f).roundToInt(), 0, px(0.18f).roundToInt()) })
        col.addView(View(context), LinearLayout.LayoutParams(1, 0, 1f))
        if (field("price").isNotEmpty()) col.addView(tv(field("price"), 2.6f, p.accent2, 800), LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { gravity = Gravity.END })
        add(col)
    }

    private fun muzik() {
        val p = pal!!
        val bg = object : View(context) {
            private val paint = Paint()
            override fun onDraw(c: Canvas) {
                paint.shader = RadialGradient(width * 0.78f, height * 0.5f, max(width, height) * 0.62f, mixc(p.accent, p.edge, 0.6f), p.edge, Shader.TileMode.CLAMP)
                c.drawRect(0f, 0f, width.toFloat(), height.toFloat(), paint)
            }
        }
        add(bg)
        val wave = object : View(context) {
            private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = p.accent2 }
            override fun onDraw(c: Canvas) {
                val hs = floatArrayOf(0.52f, 0.76f, 0.46f, 1f, 0.64f, 0.82f, 0.58f)
                val bw = px(0.9f); val gap = px(0.5f); var x = 0f
                for (h in hs) { val bh = height * h * 0.7f; c.drawRoundRect(x, (height - bh) / 2f, x + bw, (height + bh) / 2f, bw / 2f, bw / 2f, paint); x += bw + gap }
            }
        }
        addView(wave, LayoutParams((px(0.9f) * 7 + px(0.5f) * 6).roundToInt(), (height * 0.6f).roundToInt(), Gravity.END or Gravity.CENTER_VERTICAL).apply { rightMargin = (width * 0.08f).roundToInt() })
        add(textBlock(0.7f), widthFrac = 0.7f)
    }

    private fun wifi() {
        val p = pal!!
        val col = column(0.35f).apply { gravity = Gravity.CENTER }
        val icon = object : View(context) {
            private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = p.accent2; style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeWidth = px(0.25f) }
            private val dot = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = p.accent2 }
            override fun onDraw(c: Canvas) {
                val cx = width / 2f; val cy = height * 0.82f
                for ((r, a) in listOf(0.78f to 1f, 0.52f to 1f, 0.26f to 1f)) {
                    val rr = height * r
                    c.drawArc(cx - rr, cy - rr, cx + rr, cy + rr, 225f, 90f, false, paint)
                }
                c.drawCircle(cx, cy, px(0.18f), dot)
            }
        }
        col.addView(icon, LinearLayout.LayoutParams(px(6f).roundToInt(), px(6f).roundToInt()).apply { gravity = Gravity.CENTER_HORIZONTAL; bottomMargin = px(0.4f).roundToInt() })
        col.addView(tv(field("title"), 4.2f, p.white, 800).apply { gravity = Gravity.CENTER }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { gravity = Gravity.CENTER_HORIZONTAL })
        if (field("sub").isNotEmpty()) col.addView(tv(field("sub"), 2.1f, p.accent2, 800), LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { gravity = Gravity.CENTER_HORIZONTAL })
        if (field("note").isNotEmpty()) col.addView(tv(field("note"), 2.1f, p.white, 800).apply {
            setPadding(px(0.6f).roundToInt(), px(0.2f).roundToInt(), px(0.6f).roundToInt(), px(0.2f).roundToInt())
            background = GradientDrawable().apply { setColor(p.a(p.accent, 0.4f)); cornerRadius = px(0.3f) }
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { gravity = Gravity.CENTER_HORIZONTAL })
        addView(col, LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER))
    }

    private fun tesekkur() {
        val p = pal!!
        add(textBlock(0.8f, true, 3.6f), widthFrac = 0.8f, left = 0.1f)
        val frame = View(context)
        frame.background = GradientDrawable().apply { setColor(Color.TRANSPARENT); cornerRadius = px(0.8f); setStroke(max(1, px(0.12f).roundToInt()), p.a(p.accent2, 0.7f)) }
        addView(frame, LayoutParams((width * 0.92f).roundToInt(), (height * 0.92f).roundToInt(), Gravity.CENTER))
    }

    private fun bookSingle(image: String?) {
        val p = pal!!
        add(object : View(context) {
            private val paint = Paint()
            override fun onDraw(c: Canvas) {
                paint.shader = RadialGradient(width * 0.25f, height * 0.5f, max(width, height) * 0.7f, mixc(p.accent, p.edge, 0.45f), p.edge, Shader.TileMode.CLAMP)
                c.drawRect(0f, 0f, width.toFloat(), height.toFloat(), paint)
            }
        })
        if (image != null) addView(photo(image, ImageView.ScaleType.FIT_CENTER), LayoutParams((width * 0.34f).roundToInt(), (height * 0.86f).roundToInt()).apply { leftMargin = (width * 0.06f).roundToInt(); topMargin = (height * 0.07f).roundToInt() })
        val col = column(0.5f).apply { setPadding(0, (height * 0.05f).roundToInt(), (width * 0.06f).roundToInt(), (height * 0.05f).roundToInt()) }
        col.addView(tv(field("title"), 3.2f, p.white, 800, 4))
        if (field("sub").isNotEmpty()) col.addView(tv(field("sub"), 1.9f, p.accent2, 600))
        if (field("note").isNotEmpty()) col.addView(tv(field("note"), 1.5f, p.white, 500, 0, 0.82f))
        addView(col, LayoutParams((width * 0.50f).roundToInt(), ViewGroup.LayoutParams.MATCH_PARENT).apply { leftMargin = (width * 0.44f).roundToInt() })
    }

    private fun booksGrid(books: org.json.JSONArray) {
        val p = pal!!
        setBackgroundColor(Color.parseColor("#141312"))
        val root = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; setPadding((width * 0.028f).roundToInt(), (height * 0.026f).roundToInt(), (width * 0.028f).roundToInt(), (height * 0.026f).roundToInt()) }
        root.addView(tv("📚 YENİ ÇIKAN KİTAPLAR", 1f, p.accent, 800).apply { letterSpacing = 0.22f }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = (height * 0.022f).roundToInt() })
        val n = min(4, books.length())
        val cols = if (n == 1) 1 else 2
        val grid = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        var i = 0
        val rowsN = (n + cols - 1) / cols
        for (r in 0 until rowsN) {
            val row = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
            for (c in 0 until cols) {
                if (i >= n) { row.addView(View(context), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f)); continue }
                row.addView(bookCard(books.optJSONObject(i++) ?: JSONObject(), books), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f).apply { if (c > 0) leftMargin = (width * 0.022f).roundToInt() })
            }
            grid.addView(row, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f).apply { if (r > 0) topMargin = (height * 0.032f).roundToInt() })
        }
        root.addView(grid, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        add(root)
    }

    private fun bookCard(b: JSONObject, books: org.json.JSONArray): View {
        val p = pal!!
        val card = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
            setPadding((width * 0.018f).roundToInt(), (height * 0.025f).roundToInt(), (width * 0.018f).roundToInt(), (height * 0.025f).roundToInt())
            background = GradientDrawable().apply { setColor(Color.parseColor("#1b1a19")); cornerRadius = px(0.7f); setStroke(1, Color.argb(18, 255, 255, 255)) }
        }
        val img = b.optString("image").takeIf { u -> u.isNotEmpty() && u != "null" }
        // kapak: kart yüksekliğini dolduran 2:3 oranlı dikdörtgen (CSS: height:100%; aspect-ratio:2/3)
        val rowsN = if (books.length() <= 2) 1 else 2
        val cardH = ((height * (1f - 0.052f - 0.022f) - px(1f) - height * 0.032f * (rowsN - 1)) / rowsN - height * 0.05f).roundToInt()
        if (img != null) card.addView(photo(img), LinearLayout.LayoutParams((cardH * 2f / 3f).roundToInt(), cardH))
        val tx = column(0.3f).apply { setPadding(px(1.0f).roundToInt(), 0, 0, 0) }
        tx.addView(tv(b.optString("title"), 1.45f, p.white, 800, 3))
        b.optString("author").takeIf { it.isNotEmpty() }?.let { tx.addView(tv(it, 1f, p.accent2, 600, 1)) }
        b.optString("publisher").takeIf { it.isNotEmpty() }?.let { tx.addView(tv(it, 0.85f, p.white, 600, 1, 0.9f)) }
        b.optString("desc").takeIf { it.isNotEmpty() }?.let { tx.addView(tv(it, 0.84f, Color.parseColor("#f3eee6"), 500, 4)) }
        card.addView(tx, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        return card
    }

    private fun insta(image: String?) {
        val p = pal!!
        setBackgroundColor(p.edge)
        if (image != null) {
            val ph = photo(image, ImageView.ScaleType.FIT_CENTER).apply { setBackgroundColor(Color.BLACK) }
            addView(ph, LayoutParams((width * 0.5625f).roundToInt(), ViewGroup.LayoutParams.MATCH_PARENT))
        }
        val col = column(0.35f).apply { setPadding((width * 0.05f).roundToInt(), (height * 0.05f).roundToInt(), (width * 0.05f).roundToInt(), (height * 0.05f).roundToInt()) }
        col.addView(tv("◎  " + field("sub"), 1.5f, p.white, 700, 1))
        col.addView(tv(field("title"), 1.45f, p.white, 500, 9, 0.92f))
        addView(col, LayoutParams((width * 0.4375f).roundToInt(), ViewGroup.LayoutParams.MATCH_PARENT).apply { leftMargin = (width * 0.5625f).roundToInt() })
    }
}
