package com.screenpano.tv.ui.nativeui

import android.graphics.Color
import com.screenpano.tv.data.model.TvState
import com.screenpano.tv.data.model.WidgetSpec

/** Izgaradaki yerel widget'ların ortak sözleşmesi. vh: ekran yüksekliğinin %1'i (sayfadaki vh birimi). */
interface NativeWidget {
    fun bind(w: WidgetSpec, s: TvState, vh: Float)
    fun release() {}
}

/** Sayfadaki applyTheme ile aynı renk türetmeleri. */
class Palette(s: TvState, tint: String? = null) {
    private val th = s.theme
    private fun mix(a: Int, b: Int, t: Float): Int = Color.rgb(
        (Color.red(a) * (1 - t) + Color.red(b) * t).toInt(),
        (Color.green(a) * (1 - t) + Color.green(b) * t).toInt(),
        (Color.blue(a) * (1 - t) + Color.blue(b) * t).toInt(),
    )
    val edge = th.bg
    val accent = th.accent
    val accent2 = tintOf(tint) ?: th.accent2 // widget'a özel kutu rengi varsa o, yoksa tema vurgusu
    val box = th.box
    val al = mix(accent2, Color.WHITE, 0.55f)
    val ad = mix(th.accent, Color.BLACK, 0.5f)
    val white = th.text
    val mute = mix(th.text, th.bg, 0.42f)
    val live = Color.parseColor("#ff4d4d")
    fun a(c: Int, alpha: Float): Int = Color.argb((alpha * 255).toInt(), Color.red(c), Color.green(c), Color.blue(c))
    private fun tintOf(t: String?): Int? = if (t != null && Regex("#[0-9a-fA-F]{6}").matches(t)) Color.parseColor(t) else null
}

/** Widget kutularının ortak görünümü: tema stili (Palette.box) ya da kutuya özel `box` ayarı (accent | glass | dark | outline | none). */
object BoxSkin {
    fun of(p: Palette, props: org.json.JSONObject?): String = (props?.optString("box") ?: "").let { if (it in setOf("accent", "glass", "dark", "outline", "none")) it else p.box }
    fun bg(p: Palette, vh: Float, props: org.json.JSONObject?): android.graphics.drawable.GradientDrawable {
        val sw = Math.max(1, (vh * 0.1f).toInt())
        return when (of(p, props)) {
            "glass" -> android.graphics.drawable.GradientDrawable(android.graphics.drawable.GradientDrawable.Orientation.TL_BR, intArrayOf(Color.argb(209, 26, 34, 48), Color.argb(224, 14, 19, 28))).apply { cornerRadius = 2.2f * vh; setStroke(sw, Color.argb(23, 255, 255, 255)) }
            "dark" -> android.graphics.drawable.GradientDrawable().apply { setColor(Color.argb(209, 10, 12, 16)); cornerRadius = 1.3f * vh; setStroke(sw, Color.argb(26, 255, 255, 255)) }
            "outline" -> android.graphics.drawable.GradientDrawable().apply { setColor(0); cornerRadius = 1.3f * vh; setStroke(sw, p.a(p.accent2, 0.7f)) }
            "none" -> android.graphics.drawable.GradientDrawable().apply { setColor(0); cornerRadius = 1.3f * vh }
            else -> android.graphics.drawable.GradientDrawable(android.graphics.drawable.GradientDrawable.Orientation.TL_BR, intArrayOf(p.a(p.accent2, 0.14f), p.a(Color.WHITE, 0.03f))).apply { cornerRadius = 1.3f * vh; setStroke(sw, p.a(p.accent2, 0.35f)) }
        }
    }
}
