package com.screenpano.tv.data.model

import android.graphics.Color
import org.json.JSONObject

/** Izgaradaki bir kutu: (x, y) sol üst hücre, (w, h) hücre sayısı. */
data class WidgetSpec(val type: String, val x: Int, val y: Int, val w: Int, val h: Int, val props: JSONObject?)

data class ThemeSpec(val bg: Int, val accent: Int, val accent2: Int, val text: Int, val font: String, val plate: Boolean)

/** Ekran kenar payları (% olarak): TV görüntüyü keserse içerik küçültülüp ortalanır. */
data class SafeSpec(val l: Float, val r: Float, val t: Float, val b: Float) {
    val any get() = l + r + t + b > 0f
}

/**
 * Sunucunun WebSocket'ten gönderdiği durum (server/state.js publicState). Tanınmayan alanlar yok sayılır:
 * sunucu yeni alan eklediğinde eski uygulama bozulmaz. Ham JSON `raw` içinde durur; widget'lar kendi
 * alanlarını buradan okur.
 */
class TvState private constructor(
    val raw: JSONObject,
    val cols: Int,
    val rows: Int,
    val widgets: List<WidgetSpec>,
    val theme: ThemeSpec,
    val safe: SafeSpec,
    val brandName: String,
    val blocked: String?,
    val nativeWidgets: Boolean,
) {
    companion object {
        fun parse(o: JSONObject): TvState {
            val lay = o.optJSONObject("layout")
            val ws = ArrayList<WidgetSpec>()
            lay?.optJSONArray("widgets")?.let { a ->
                for (i in 0 until a.length()) {
                    val w = a.optJSONObject(i) ?: continue
                    ws.add(WidgetSpec(w.optString("type"), w.optInt("x"), w.optInt("y"), w.optInt("w", 1).coerceAtLeast(1), w.optInt("h", 1).coerceAtLeast(1), w.optJSONObject("props")))
                }
            }
            val th = o.optJSONObject("theme")
            fun col(k: String, def: String) = try { Color.parseColor(th?.optString(k)?.takeIf { it.isNotEmpty() } ?: def) } catch (_: Exception) { Color.parseColor(def) }
            val sf = o.optJSONObject("safe")
            fun sv(k: String) = (sf?.optDouble(k, 0.0) ?: 0.0).toFloat().coerceIn(0f, 20f)
            return TvState(
                raw = o,
                cols = lay?.optInt("cols", 24)?.coerceAtLeast(1) ?: 24,
                rows = lay?.optInt("rows", 24)?.coerceAtLeast(1) ?: 24,
                widgets = ws,
                theme = ThemeSpec(col("bg", "#151717"), col("accent", "#d4a64a"), col("accent2", "#8a6a2a"), col("text", "#ffffff"), th?.optString("font") ?: "", th?.optBoolean("plate", false) ?: false),
                safe = SafeSpec(sv("L"), sv("R"), sv("T"), sv("B")),
                brandName = o.optJSONObject("brand")?.optString("name") ?: "",
                blocked = if (o.isNull("blocked")) null else o.optString("blocked"),
                nativeWidgets = o.optBoolean("nativeWidgets", false),
            )
        }
    }
}
