package com.screenpano.tv.ui.nativeui

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
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
import java.nio.ByteBuffer
import kotlin.math.max

/** Kampanya kartı (tam kadraj, QR kodlu duyuru). Sayfadaki #camp ile aynı yerleşim; zamanlamayı sayfa yönetir. */
class CampView(context: Context) : FrameLayout(context) {
    // Fotoğraflı kampanya: tam ekran fotoğraf + seçilen yere konmuş QR (konum/boyut yüzde)
    private var photoQr: View? = null
    private var qx = 85f; private var qy = 75f; private var qs = 26f

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        super.onLayout(changed, l, t, r, b)
        val box = photoQr ?: return
        val w = r - l; val h = b - t
        val size = (h * qs / 100f).toInt().coerceAtLeast(1)
        val cx = (w * qx / 100f).toInt(); val cy = (h * qy / 100f).toInt()
        box.measure(MeasureSpec.makeMeasureSpec(size, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(size, MeasureSpec.EXACTLY))
        box.layout(cx - size / 2, cy - size / 2, cx + size / 2, cy + size / 2)
    }

    private fun bindPhoto(c: JSONObject) {
        photoQr = null
        val vh = resources.displayMetrics.heightPixels / 100f
        background = GradientDrawable().apply { setColor(Color.BLACK); cornerRadius = vh * 1.39f }
        clipToOutline = true
        val bgIv = ImageView(context).apply { scaleType = ImageView.ScaleType.FIT_CENTER }
        bgIv.load(NativeEnv.url(c.optString("image"))) { crossfade(false) }
        addView(bgIv, LayoutParams(-1, -1))
        qx = c.optDouble("qrX", 85.0).toFloat(); qy = c.optDouble("qrY", 75.0).toFloat(); qs = c.optDouble("qrSize", 26.0).toFloat()
        val box = FrameLayout(context).apply { background = GradientDrawable().apply { setColor(Color.WHITE); cornerRadius = vh * 1.6f } }
        val iv = ImageView(context).apply { scaleType = ImageView.ScaleType.FIT_CENTER }
        box.addView(iv, LayoutParams(-1, -1))
        box.post { val pd = (box.height * 0.06f).toInt(); box.setPadding(pd, pd, pd, pd) }
        val svg = c.optString("svg"); if (svg.isNotEmpty()) iv.load(ByteBuffer.wrap(svg.toByteArray())) { crossfade(false) }
        addView(box, LayoutParams(1, 1))
        photoQr = box
    }

    fun bind(c: JSONObject, s: TvState) {
        removeAllViews()
        if (c.optBoolean("photo") && c.optString("image").isNotEmpty()) { bindPhoto(c); return }
        photoQr = null
        val p = Palette(s)
        val dm = resources.displayMetrics
        val vh = dm.heightPixels / 100f
        val vw = dm.widthPixels / 100f

        val style = c.optString("style", "coffee")
        val bgGrad = when (style) {
            "dark" -> intArrayOf(Color.parseColor("#1e2229"), Color.parseColor("#101216"), Color.parseColor("#0a0b0e"))
            "accent" -> intArrayOf(p.ad, Color.parseColor("#10141a"), Color.parseColor("#0a0d12"))
            "sunset" -> intArrayOf(Color.parseColor("#7c2d12"), Color.parseColor("#3b110b"), Color.parseColor("#140504"))
            "emerald" -> intArrayOf(Color.parseColor("#064e3b"), Color.parseColor("#022c22"), Color.parseColor("#03130e"))
            "navy" -> intArrayOf(Color.parseColor("#1e3a8a"), Color.parseColor("#0f172a"), Color.parseColor("#030712"))
            else -> intArrayOf(p.ad, Color.parseColor("#2a1b0f"), Color.parseColor("#1a110a"))
        }
        background = GradientDrawable(GradientDrawable.Orientation.TL_BR, bgGrad).apply { cornerRadius = vh * 1.39f }
        clipToOutline = true

        val imgUrl = c.optString("image", "")
        if (imgUrl.isNotEmpty()) {
            val bgIv = ImageView(context).apply { scaleType = ImageView.ScaleType.CENTER_CROP }
            bgIv.load(NativeEnv.url(imgUrl)) { crossfade(false) }
            addView(bgIv, LayoutParams(-1, -1))
            val scrim = View(context).apply {
                setBackgroundColor(Color.argb(200, 10, 8, 7))
            }
            addView(scrim, LayoutParams(-1, -1))
        }

        val pos = c.optString("pos", "qr-right")
        val textAlign = c.optString("textAlign", "left")
        val isStack = pos == "center-stack"
        val textGravity = when (textAlign) {
            "center" -> Gravity.CENTER_HORIZONTAL
            "right" -> Gravity.END
            else -> Gravity.START
        }

        val fontName = c.optString("font", "Montserrat")
        val tf = when {
            fontName.contains("Playfair", true) -> Typeface.SERIF
            fontName.contains("Oswald", true) || fontName.contains("Bebas", true) -> Typeface.DEFAULT_BOLD
            else -> Typeface.DEFAULT
        }

        fun tv(t: String, size: Float, color: Int, bold: Boolean) = TextView(context).apply {
            text = t; setTextColor(color); setTextSize(TypedValue.COMPLEX_UNIT_PX, vh * size)
            typeface = if (bold) Typeface.create(tf, Typeface.BOLD) else tf
            gravity = textGravity
        }

        val contentWrap = LinearLayout(context).apply {
            orientation = if (isStack) LinearLayout.VERTICAL else LinearLayout.HORIZONTAL
            gravity = if (isStack) Gravity.CENTER else Gravity.CENTER_VERTICAL
            setPadding((vw * 3f).toInt(), (vh * 3f).toInt(), (vw * 3f).toInt(), (vh * 3f).toInt())
        }

        val left = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = textGravity
        }

        val emoji = c.optString("emoji", "☕")
        if (emoji.isNotEmpty() && emoji != "none") {
            left.addView(tv(emoji, 8f, Color.WHITE, false))
        }

        left.addView(tv(c.optString("headline"), if (isStack) 3.8f else 4.6f, Color.WHITE, true).apply { setLineSpacing(0f, 1.05f) }, LinearLayout.LayoutParams(-1, -2).also { it.topMargin = (vh * 1.5f).toInt() })
        left.addView(tv("★★★★★", 3.8f, Color.parseColor("#ffc53d"), false).apply { letterSpacing = 0.1f }, LinearLayout.LayoutParams(-2, -2).also { it.topMargin = (vh * 1.5f).toInt() })
        left.addView(tv(c.optString("sub"), if (isStack) 2.4f else 3.1f, p.al, true), LinearLayout.LayoutParams(-1, -2).also { it.topMargin = (vh * 1.5f).toInt() })
        val note = c.optString("note")
        if (note.isNotEmpty()) left.addView(tv(note, 2f, Color.parseColor("#e5d6c3"), false).apply {
            background = GradientDrawable().apply { setColor(Color.argb(40, 20, 20, 25)); cornerRadius = vh * 1.2f; setStroke(max(1, (vh * 0.1f).toInt()), Color.argb(150, 243, 207, 158), vh * 0.6f, vh * 0.4f) }
            setPadding((vw * 1.4f).toInt(), (vh * 1.2f).toInt(), (vw * 1.4f).toInt(), (vh * 1.2f).toInt())
        }, LinearLayout.LayoutParams(if (isStack) -2 else -1, -2).also { it.topMargin = (vh * 1.5f).toInt() })

        val right = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL }
        val qs = (vh * (if (isStack) 22f else 29f)).toInt()
        val box = FrameLayout(context).apply {
            val pad = (vh * 1.1f).toInt(); setPadding(pad, pad, pad, pad)
            background = GradientDrawable().apply { setColor(Color.WHITE); cornerRadius = vh * 2.2f; setStroke(max(1, (vh * 0.5f).toInt()), p.accent2) }
        }
        val iv = ImageView(context).apply { scaleType = ImageView.ScaleType.FIT_CENTER }
        box.addView(iv, LayoutParams(-1, -1))
        val svg = c.optString("svg"); if (svg.isNotEmpty()) iv.load(ByteBuffer.wrap(svg.toByteArray())) { crossfade(false) }
        right.addView(box, LinearLayout.LayoutParams(qs, qs))
        val ql = c.optString("qrLabel")
        if (ql.isNotEmpty()) right.addView(tv(ql, 2.2f, Color.WHITE, true).apply { gravity = Gravity.CENTER; maxWidth = (vh * 32f).toInt(); letterSpacing = 0.06f }, LinearLayout.LayoutParams(-2, -2).also { it.topMargin = (vh * 1.4f).toInt() })

        if (pos == "qr-left") {
            contentWrap.addView(right, LinearLayout.LayoutParams(-2, -2).also { it.rightMargin = (vw * 4f).toInt() })
            contentWrap.addView(left, LinearLayout.LayoutParams(0, -2, 1f))
        } else if (isStack) {
            contentWrap.addView(left, LinearLayout.LayoutParams(-1, -2))
            contentWrap.addView(right, LinearLayout.LayoutParams(-2, -2).also { it.topMargin = (vh * 2f).toInt() })
        } else {
            contentWrap.addView(left, LinearLayout.LayoutParams(0, -2, 1f))
            contentWrap.addView(right, LinearLayout.LayoutParams(-2, -2).also { it.leftMargin = (vw * 4f).toInt() })
        }
        addView(contentWrap, LayoutParams(-1, -1))
    }
}
