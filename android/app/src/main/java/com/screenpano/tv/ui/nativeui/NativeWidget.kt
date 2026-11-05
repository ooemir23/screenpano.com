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
class Palette(s: TvState) {
    private val th = s.theme
    private fun mix(a: Int, b: Int, t: Float): Int = Color.rgb(
        (Color.red(a) * (1 - t) + Color.red(b) * t).toInt(),
        (Color.green(a) * (1 - t) + Color.green(b) * t).toInt(),
        (Color.blue(a) * (1 - t) + Color.blue(b) * t).toInt(),
    )
    val edge = th.bg
    val accent = th.accent
    val accent2 = th.accent2
    val al = mix(th.accent2, Color.WHITE, 0.55f)
    val ad = mix(th.accent, Color.BLACK, 0.5f)
    val white = th.text
    val mute = mix(th.text, th.bg, 0.42f)
    val live = Color.parseColor("#ff4d4d")
    fun a(c: Int, alpha: Float): Int = Color.argb((alpha * 255).toInt(), Color.red(c), Color.green(c), Color.blue(c))
}
