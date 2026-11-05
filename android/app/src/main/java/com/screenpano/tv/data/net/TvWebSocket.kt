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
            override fun onOpen(webSocket: WebSocket, response: Response) { backoff = 2_000L; isOpen = true }

            override fun onMessage(webSocket: WebSocket, text: String) {
                val o = try { JSONObject(text) } catch (_: Exception) { return }
                val type = o.optString("type")
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

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { if (ws === webSocket) { isOpen = false; ws = null; schedule() } }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) { if (ws === webSocket) { isOpen = false; ws = null; schedule() } }
        })
    }

    private fun schedule() {
        if (stopped) return
        main.removeCallbacks(retry)
        main.postDelayed(retry, backoff)
        backoff = (backoff * 2).coerceAtMost(30_000L)
    }
}
