package com.screenpano.tv.data.net

import android.os.Handler
import android.os.Looper
import com.screenpano.tv.data.model.TvState
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Sunucunun /ws kanalına kutunun kendisi bağlanır (sayfadaki bağlantıdan bağımsız). Gelen "state" ve
 * "sync_media" iletilerini ana iş parçacığında dinleyicilere verir; kopunca 2→30 sn aralıkla yeniden dener.
 */
class TvWebSocket(
    private val baseUrl: String,
    private val tokenProvider: () -> String,
    private val onState: (TvState) -> Unit,
    private val onSync: (JSONObject) -> Unit,
    private val onMessage: (String, JSONObject) -> Unit = { _, _ -> },
) {
    /**
     * Sayfa köprüsü (APK 3.19.1+): sayfa kendi WebSocket'ini açmaz, bu bağlantıyı paylaşır. Her ham ileti ana iş parçacığında
     * buraya verilir; sayfa yeni yüklendiğinde son version/state/sync_media iletileri yeniden oynatılır (replay()).
     */
    var onRaw: ((String) -> Unit)? = null
    var onOpenEvt: (() -> Unit)? = null
    var onCloseEvt: (() -> Unit)? = null
    @Volatile private var lastVersion: String? = null
    @Volatile private var lastState: String? = null
    @Volatile private var lastSync: String? = null
    fun replay(f: (String) -> Unit) { lastVersion?.let(f); lastState?.let(f); lastSync?.let(f) }
    fun sendRaw(text: String) { ws?.send(text) }
    /** Token yeni kaydedildi: beklemeden bağlan. */
    fun kick() { if (stopped || ws != null) return; main.removeCallbacks(retry); backoff = 2_000L; open() }
    /** Bağlantıyı bırakıp hemen yeniden kur (token değişti / sayfa istedi). */
    fun reconnect() { if (stopped) return; val w = ws; ws = null; isOpen = false; w?.cancel(); main.post { onCloseEvt?.invoke() }; main.removeCallbacks(retry); backoff = 2_000L; open() }

    private val http = OkHttpClient.Builder()
        .pingInterval(25, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()
    private val main = Handler(Looper.getMainLooper())
    private var ws: WebSocket? = null
    private var stopped = true
    private var backoff = 2_000L
    private val retry = Runnable { open() }

    fun start() { stopped = false; open() }

    fun stop() {
        stopped = true
        main.removeCallbacks(retry)
        ws?.cancel(); ws = null
    }

    val connected get() = ws != null && isOpen
    @Volatile private var isOpen = false

    fun send(o: JSONObject) { ws?.send(o.toString()) }

    private fun open() {
        if (stopped) return
        val token = tokenProvider()
        if (token.isEmpty()) { schedule(); return } // henüz giriş yapılmadı: sayfa token'ı kaydedince tutar
        val url = baseUrl.replaceFirst("https://", "wss://").replaceFirst("http://", "ws://") + "/ws?device=" + java.net.URLEncoder.encode(token, "UTF-8")
        ws = http.newWebSocket(Request.Builder().url(url).build(), object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) { backoff = 2_000L; isOpen = true; main.post { onOpenEvt?.invoke() } }

            override fun onMessage(webSocket: WebSocket, text: String) {
                val o = try { JSONObject(text) } catch (_: Exception) { return }
                val type = o.optString("type")
                when (type) { "version" -> lastVersion = text; "state" -> lastState = text; "sync_media" -> lastSync = text; "auth" -> { lastState = null; lastVersion = null } }
                onRaw?.let { cb -> main.post { if (ws === webSocket) cb(text) } }
                // ayrıştırmayı bağlantı iş parçacığında yap, sonucu ana iş parçacığına ilet
                when (type) {
                    "state" -> {
                        val st = o.optJSONObject("state")?.let { try { TvState.parse(it) } catch (_: Exception) { null } } ?: return
                        main.post { onState(st) }
                    }
                    "sync_media" -> main.post { onSync(o) }
                    else -> main.post { onMessage(type, o) }
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { if (ws === webSocket) { isOpen = false; ws = null; main.post { onCloseEvt?.invoke() }; schedule() } }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) { if (ws === webSocket) { isOpen = false; ws = null; main.post { onCloseEvt?.invoke() }; schedule() } }
        })
    }

    private fun schedule() {
        if (stopped) return
        main.removeCallbacks(retry)
        main.postDelayed(retry, backoff)
        backoff = (backoff * 2).coerceAtMost(30_000L)
    }
}
