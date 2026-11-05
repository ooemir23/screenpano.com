package com.screenpano.tv.ui.nativeui

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
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
    fun bind(c: JSONObject, s: TvState) {
        removeAllViews()
        val p = Palette(s)
        val dm = resources.displayMetrics
        val vh = dm.heightPixels / 100f
        val vw = dm.widthPixels / 100f
        background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(p.ad, Color.parseColor("#2a1b0f"), Color.parseColor("#1a110a"))).apply { cornerRadius = vh * 1.39f }
        clipToOutline = true
        val row = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding((vw * 3f).toInt(), (vh * 3f).toInt(), (vw * 3f).toInt(), (vh * 3f).toInt()) }
        fun tv(t: String, size: Float, color: Int, bold: Boolean) = TextView(context).apply {
            text = t; setTextColor(color); setTextSize(TypedValue.COMPLEX_UNIT_PX, vh * size)
            typeface = Typeface.create(Typeface.DEFAULT, if (bold) Typeface.BOLD else Typeface.NORMAL)
        }
        val left = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_VERTICAL }
        left.addView(tv("☕", 12f, Color.WHITE, false))
        left.addView(tv(c.optString("headline"), 4.6f, Color.WHITE, true).apply { setLineSpacing(0f, 1.05f) }, LinearLayout.LayoutParams(-1, -2).also { it.topMargin = (vh * 2f).toInt() })
        left.addView(tv("★★★★★", 4f, Color.parseColor("#ffc53d"), false).apply { letterSpacing = 0.1f }, LinearLayout.LayoutParams(-2, -2).also { it.topMargin = (vh * 2f).toInt() })
        left.addView(tv(c.optString("sub"), 3.1f, p.al, true), LinearLayout.LayoutParams(-1, -2).also { it.topMargin = (vh * 2f).toInt() })
        val note = c.optString("note")
        if (note.isNotEmpty()) left.addView(tv(note, 2f, Color.parseColor("#e5d6c3"), false).apply {
            background = GradientDrawable().apply { setColor(Color.argb(20, 255, 255, 255)); cornerRadius = vh * 1.2f; setStroke(max(1, (vh * 0.1f).toInt()), Color.argb(150, 243, 207, 158), vh * 0.6f, vh * 0.4f) }
            setPadding((vw * 1.4f).toInt(), (vh * 1.2f).toInt(), (vw * 1.4f).toInt(), (vh * 1.2f).toInt())
        }, LinearLayout.LayoutParams(-1, -2).also { it.topMargin = (vh * 2f).toInt() })
        row.addView(left, LinearLayout.LayoutParams(0, -2, 1f))
        val right = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL }
        val qs = (vh * 30f).toInt()
        val box = FrameLayout(context).apply {
            val pad = (vh * 1.2f).toInt(); setPadding(pad, pad, pad, pad)
            background = GradientDrawable().apply { setColor(Color.WHITE); cornerRadius = vh * 2.4f; setStroke(max(1, (vh * 0.5f).toInt()), p.accent2) }
        }
        val iv = ImageView(context).apply { scaleType = ImageView.ScaleType.FIT_CENTER }
        box.addView(iv, LayoutParams(-1, -1))
        val svg = c.optString("svg"); if (svg.isNotEmpty()) iv.load(ByteBuffer.wrap(svg.toByteArray())) { crossfade(false) }
        right.addView(box, LinearLayout.LayoutParams(qs, qs))
        right.addView(tv(c.optString("qrLabel"), 2.2f, Color.WHITE, true).apply { gravity = Gravity.CENTER; maxWidth = (vh * 32f).toInt(); letterSpacing = 0.06f }, LinearLayout.LayoutParams(-2, -2).also { it.topMargin = (vh * 1.6f).toInt() })
        right.addView(tv("QR KODU TELEFONUNUZLA OKUTUN", 1.6f, p.al, false).apply { gravity = Gravity.CENTER; letterSpacing = 0.1f }, LinearLayout.LayoutParams(-2, -2).also { it.topMargin = (vh * 0.5f).toInt() })
        row.addView(right, LinearLayout.LayoutParams(-2, -2).also { it.leftMargin = (vw * 4f).toInt() })
        addView(row, LayoutParams(-1, -1))
    }
}
