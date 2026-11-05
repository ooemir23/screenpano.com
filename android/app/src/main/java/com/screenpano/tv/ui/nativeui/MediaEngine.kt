package com.screenpano.tv.ui.nativeui

import android.os.Handler
import android.os.Looper
import com.screenpano.tv.data.model.TvState
import org.json.JSONObject
import java.util.Calendar
import java.util.TimeZone

/** Medya motorunun ekrana dokunan tarafı (MainActivity uygular). Hepsi ana iş parçacığında çağrılır. */
interface MediaHost {
    fun playVideo(url: String, startMs: Long)
    fun showPhoto(url: String, done: (Boolean) -> Unit)
    fun showPoster(item: JSONObject, lang: String, done: (Boolean) -> Unit)
    /** Yerel medya katmanları kalkar; sayfa yeniden opak olur. */
    fun release()
    /** Sayfanın medya sınırında çalışmasını ister (kampanya / büyük maç / fragman kararı). Dönüş: "go" | "hold" | null. */
    fun pageBoundary(cb: (String?) -> Unit)
    fun report(id: String, sec: Int)
    fun current(id: String)
    fun online(): Boolean
}

/**
 * Yerel medya döngüsü (APK 3.10+): sunucunun gönderdiği medya listesini kendi sırasıyla oynatır;
 * zamanlama kuralı, süre sayacı ve sunucu saatiyle hizalama burada. Araya giren duyurular (kampanya,
 * büyük maç, fragman) sayfada kalır: içerik bitince sayfaya sorulur, sayfa "go" derse sıradakine geçilir,
 * "hold" derse sayfa işi bitince resume() çağırır.
 */
class MediaEngine(private val h: MediaHost) {
    private val handler = Handler(Looper.getMainLooper())
    var running = false; private set
    private var list: List<JSONObject> = emptyList()
    private var sig = ""
    private var idx = 0
    private var cur: JSONObject? = null
    private var curJson = ""
    private var startedAt = 0L
    private var waiting = false
    private var aligned = false
    private var tz = "Europe/Istanbul"
    private var imageSec = 10
    private var lang = "tr"
    private var tok = 0
    private val endTask = Runnable { boundary() }

    fun currentId(): String? = cur?.optString("id")

    fun setLang(l: String) {
        lang = l.ifEmpty { "tr" }
        val c = cur ?: return
        if (c.optString("type") == "poster" && !waiting) h.showPoster(c, lang) { }
    }

    /** Durum geldi: açıksa listeyi günceller; kapalıysa durur. */
    fun setState(st: TvState, on: Boolean) {
        if (!on) { stop(); return }
        tz = st.raw.optString("tz").ifEmpty { tz }
        imageSec = st.raw.optInt("imageSeconds", 10).coerceAtLeast(1)
        val arr = st.raw.optJSONArray("videos")
        val l = ArrayList<JSONObject>()
        if (arr != null) for (i in 0 until arr.length()) arr.optJSONObject(i)?.let { if (schActive(it.optJSONObject("sch"))) l.add(it) }
        val s = l.joinToString("|") { it.toString() }
        if (running && s == sig) return
        sig = s; list = l
        val wasRunning = running
        running = true
        if (l.isEmpty()) { cancelEnd(); cur = null; waiting = false; ++tok; h.release(); return }
        val c = cur
        val k = if (c == null) -1 else l.indexOfFirst { it.optString("id") == c.optString("id") }
        if (k >= 0) {
            idx = k
            val now = l[k].toString()
            if (now != curJson && !waiting) { // aynı içerik, değişen metin / süre: yeniden çiz, sayaç sürer
                val el = System.currentTimeMillis() - startedAt
                show(l[k], el, keepClock = true)
            }
            curJson = now
        } else if (!wasRunning || c == null || !waiting) {
            idx = idx.coerceAtMost(l.size - 1)
            aligned = false
            show(l[idx], 0)
        }
    }

    fun stop() {
        if (!running) return
        running = false; waiting = false; cur?.let { report(it) }; cur = null; sig = ""; ++tok
        cancelEnd(); h.release()
    }

    /** Sunucudan medya senkron iletisi (her ~4 sn). */
    fun onSync(m: JSONObject) {
        if (!running || list.isEmpty() || waiting) return
        val id = m.optString("id")
        val target = list.indexOfFirst { it.optString("id") == id }
        if (target < 0) return
        val c = cur
        val first = !aligned
        val now = System.currentTimeMillis()
        if (c != null && c.optString("id") == id) { aligned = true; return }
        if (!first) {
            if (now - startedAt < 4000) return
            if (c != null && c.optString("type") == "video" && now - startedAt < durMs(c) - 1500) return
        }
        aligned = true
        idx = target
        show(list[target], m.optLong("elapsed", 0L).coerceAtLeast(0L))
    }

    /** Sayfa araya girenleri bitirdi (ya da girmeyecek): sıradaki içerik. */
    fun resume() {
        if (!running || list.isEmpty() || !waiting) return
        waiting = false; pageHolding = false
        idx = (idx + 1) % list.size
        show(list[idx], 0)
    }

    fun onVideoEnded() {
        val c = cur ?: return
        if (!running || waiting || c.optString("type") != "video") return
        val left = 3000L - (System.currentTimeMillis() - startedAt) // çok kısa video / başlarken hata: birazdan geç
        handler.removeCallbacks(endTask)
        handler.postDelayed(endTask, left.coerceAtLeast(500L))
    }

    // ---- iç ----
    private fun durMs(it: JSONObject): Long {
        val d = it.optDouble("dur", 0.0)
        val sec = if (d > 0) d else if (it.optString("type") == "video") 30.0 else imageSec.toDouble()
        return (sec * 1000).toLong()
    }

    private fun cancelEnd() = handler.removeCallbacks(endTask)

    private fun report(it: JSONObject) {
        val sec = ((System.currentTimeMillis() - startedAt) / 1000).toInt()
        if (sec >= 0) h.report(it.optString("id"), sec)
    }

    private fun show(it: JSONObject, elapsedMs: Long, keepClock: Boolean = false) {
        val prev = cur
        if (!keepClock && prev != null && prev.optString("id") != it.optString("id")) report(prev)
        cur = it; curJson = it.toString(); h.current(it.optString("id"))
        if (!keepClock) startedAt = System.currentTimeMillis() - elapsedMs
        waiting = false
        val my = ++tok
        cancelEnd()
        val dur = durMs(it)
        val type = it.optString("type")
        val online = h.online()
        val left: Long
        when (type) {
            "video" -> {
                if (!keepClock) h.playVideo(it.optString("url"), elapsedMs)
                left = maxOf(dur + 15000L, 45000L) - elapsedMs // bitiş olayı gelmezse güvenlik süresi
            }
            "poster" -> {
                h.showPoster(it, lang) { ok -> if (my == tok && !ok) handler.post { if (my == tok) boundary() } }
                left = dur + (if (online) 2500L else 0L) - elapsedMs
            }
            else -> {
                if (!keepClock || prev?.optString("url") != it.optString("url")) h.showPhoto(it.optString("url")) { ok -> if (my == tok && !ok) handler.post { if (my == tok) boundary() } }
                left = dur + (if (online) 2500L else 0L) - elapsedMs
            }
        }
        handler.postDelayed(endTask, left.coerceAtLeast(800L))
    }

    /** İçerik bitti: önce sayfaya sorulur (kampanya / büyük maç / fragman var mı). */
    private fun boundary() {
        val c = cur ?: return
        if (!running || waiting) return
        waiting = true
        cancelEnd()
        report(c)
        val my = tok
        // sayfa yanıt vermezse (henüz yüklenmedi) 4 sn sonra kendimiz sıradakine geçeriz
        h.pageBoundary { r ->
            if (my != tok) return@pageBoundary
            pageHolding = r == "hold"
            if (waiting && r != "hold" && r != "go") resume()
        }
        handler.postDelayed({ if (my == tok && waiting && !pageHolding) resume() }, 4000)
    }

    /** Sayfa araya girdi: otomatik devam kapanır; bitince resume() çağrılır. */
    @Volatile var pageHolding = false

    // ---- zamanlama kuralı (server/sched.js) ----
    private fun schActive(s: JSONObject?): Boolean {
        if (s == null) return true
        val c = Calendar.getInstance(try { TimeZone.getTimeZone(tz) } catch (_: Exception) { TimeZone.getDefault() })
        val ymd = "%04d-%02d-%02d".format(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
        val hm = "%02d:%02d".format(c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE))
        val dow = (c.get(Calendar.DAY_OF_WEEK) + 5) % 7 + 1 // Pzt=1 ... Paz=7
        val start = s.optString("start"); val end = s.optString("end")
        if (start.isNotEmpty() && ymd < start) return false
        if (end.isNotEmpty() && ymd > end) return false
        val from = s.optString("from"); val to = s.optString("to")
        val days = s.optJSONArray("days")
        fun dayOk(d: Int): Boolean { if (days == null) return true; for (i in 0 until days.length()) if (days.optInt(i) == d) return true; return false }
        if (from.isNotEmpty() && to.isNotEmpty()) {
            val inside = if (from < to) hm >= from && hm < to else hm >= from || hm < to
            if (!inside) return false
            val d = if (from > to && hm < to) (dow + 5) % 7 + 1 else dow
            if (!dayOk(d)) return false
        } else if (!dayOk(dow)) return false
        return true
    }
}
