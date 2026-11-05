package com.screenpano.tv.ui

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Base64
import android.util.Log
import android.view.KeyEvent
import android.view.PixelCopy
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ImageView
import coil.load
import coil.request.ImageRequest
import androidx.annotation.OptIn
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import com.screenpano.tv.BuildConfig
import com.screenpano.tv.data.net.ApiClient
import com.screenpano.tv.data.net.TvWebSocket
import com.screenpano.tv.ui.nativeui.MediaEngine
import com.screenpano.tv.ui.nativeui.MediaHost
import com.screenpano.tv.ui.nativeui.NATIVE_MEDIA
import com.screenpano.tv.ui.nativeui.NativeGridView
import com.screenpano.tv.ui.nativeui.PosterView
import com.screenpano.tv.data.model.TvState
import com.screenpano.tv.data.net.TrafficService
import com.screenpano.tv.data.prefs.TvPreferences
import com.screenpano.tv.databinding.ActivityMainBinding
import com.screenpano.tv.player.MediaCache
import com.screenpano.tv.receiver.UpdateProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@OptIn(UnstableApi::class)
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: TvPreferences
    private val apiClient = ApiClient()
    private val trafficService = TrafficService()

    private var exoPlayer: ExoPlayer? = null
    private val handler = Handler(Looper.getMainLooper())
    private var trafficJob: Job? = null
    private var lastTrafficJson: String? = null
    private var isUpdating = false

    // Yerel ekran (deneysel): panelden kutu başına açılır. Kapalıyken hiçbir şey değişmez, sayfa çizmeye devam eder.
    private var nativeGrid: NativeGridView? = null
    private var tvSocket: TvWebSocket? = null
    private var lastTvState: TvState? = null
    private var posterView: PosterView? = null
    private var lastBounds: IntArray? = null
    private var mediaKind = "" // yerel medya motorunda en son gösterilen: video | photo
    private var mediaFirstFrame: (() -> Unit)? = null
    private val mediaEngine = MediaEngine(object : MediaHost {
        override fun playVideo(url: String, startMs: Long) = mediaPlayVideo(url, startMs)
        override fun showPhoto(url: String, done: (Boolean) -> Unit) = mediaShowPhoto(url, done)
        override fun showPoster(item: JSONObject, lang: String, done: (Boolean) -> Unit) = mediaShowPoster(item, lang, done)
        override fun release() = mediaRelease()
        override fun pageBoundary(cb: (String?) -> Unit) {
            binding.webView.evaluateJavascript("window.__mediaBoundary?window.__mediaBoundary():'none'") { r -> cb(r?.trim('"')) }
        }
        override fun report(id: String, sec: Int) { tvSocket?.send(JSONObject().put("type", "play").put("id", id).put("sec", sec)) }
        override fun online(): Boolean = tvSocket?.connected == true
    })

    private val baseUrl = BuildConfig.BASE_URL.trimEnd('/')
    private val tvUrl = "$baseUrl/tv"

    private val reloadTask = Runnable {
        binding.webView.loadUrl(tvUrl)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or WindowManager.LayoutParams.FLAG_FULLSCREEN)

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        hideSystemUi()

        prefs = TvPreferences(this)

        initExoPlayer()
        setupWebView()
        startTrafficPolling()
        startNativeChannel()

        binding.webView.loadUrl(tvUrl)
    }

    /** Sunucuyla yerel bağlantı: durum iletisini alır, panelde "Yerel ekran" açıksa ızgarayı gösterir. */
    private fun startNativeChannel() {
        tvSocket = TvWebSocket(
            baseUrl = baseUrl,
            tokenProvider = { prefs.getDeviceToken() },
            onState = { st ->
                lastTvState = st
                val mediaOn = NATIVE_MEDIA && st.nativeWidgets && st.blocked == null && st.widgets.any { it.type == "media" }
                binding.webView.evaluateJavascript("window.__nativeMedia=$mediaOn;", null)
                mediaEngine.setState(st, mediaOn)
                if (st.nativeWidgets) {
                    val g = nativeGrid ?: NativeGridView(this).also {
                        it.isClickable = false; it.isFocusable = false
                        binding.rootContainer.addView(it, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                        nativeGrid = it
                    }
                    g.visibility = View.VISIBLE
                    g.setState(st)
                    hideWebCells(g.nativeTypes + "poster")
                } else {
                    nativeGrid?.let { it.clear(); it.visibility = View.GONE }
                    hideWebCells(emptyList())
                }
            },
            onSync = { m -> mediaEngine.onSync(m) },
        ).also { it.start() }
    }

    // Yerel çizilen hücreleri sayfa gizler (sayfa yenilenince yeniden bildirilir)
    private var webHidden: List<String> = emptyList()
    private fun hideWebCells(types: List<String>) {
        webHidden = types
        val arr = types.joinToString(",") { "\"$it\"" }
        binding.webView.evaluateJavascript("window.__nativeCells&&window.__nativeCells([$arr])", null)
    }

    private fun initExoPlayer() {
        val renderersFactory = DefaultRenderersFactory(this)
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_OFF)
            .setEnableDecoderFallback(true)

        val dataSourceFactory = MediaCache.buildCacheDataSourceFactory(this)
        val mediaSourceFactory = DefaultMediaSourceFactory(dataSourceFactory)

        // zayıf kutuda hızlı başlama: 1 sn veri yeter, en çok 20 sn önden indir
        val loadControl = androidx.media3.exoplayer.DefaultLoadControl.Builder()
            .setBufferDurationsMs(20_000, 20_000, 1_000, 2_000)
            .build()

        exoPlayer = ExoPlayer.Builder(this, renderersFactory)
            .setMediaSourceFactory(mediaSourceFactory)
            .setLoadControl(loadControl)
            .build()
            .apply {
                volume = 0f
                repeatMode = Player.REPEAT_MODE_OFF
                playWhenReady = true

                addListener(object : Player.Listener {
                    override fun onPlaybackStateChanged(playbackState: Int) {
                        if (playbackState == Player.STATE_ENDED) {
                            val currentPos = exoPlayer?.currentPosition ?: 0L
                            val duration = exoPlayer?.duration ?: 0L
                            Log.d(TAG, "ExoPlayer video bitti: pos=$currentPos ms, dur=$duration ms")
                            if (duration > 1000L && currentPos >= (duration - 1500L)) {
                                notifyVideoEnded()
                            }
                        }
                    }

                    override fun onPlayerError(error: PlaybackException) {
                        Log.e(TAG, "ExoPlayer hatası: ${error.message}", error)
                        notifyVideoEnded() // sayfa ilk 3 sn'de gelen bitişi yok saymaz, kısa bir süre sonra sıradakine geçer
                    }

                    // yeni videonun ilk karesi yüzeyde: sayfa ancak şimdi şeffaflaşır (eski kare ya da siyah görünmez)
                    override fun onRenderedFirstFrame() {
                        mediaFirstFrame?.invoke()
                        binding.webView.post {
                            binding.webView.evaluateJavascript("window.__exoStarted && window.__exoStarted();", null)
                        }
                    }
                })
            }

        binding.playerView.player = exoPlayer
        binding.playerView.useController = false
        binding.playerView.visibility = View.VISIBLE // hep açık: yüzey bir kez oluşur, saklanmaz
    }

    private fun notifyVideoEnded() {
        mediaEngine.onVideoEnded()
        binding.webView.post {
            binding.webView.evaluateJavascript("window.__exoEnded && window.__exoEnded();", null)
        }
    }

    private fun setupWebView() {
        val web = binding.webView
        web.setBackgroundColor(Color.TRANSPARENT)
        web.setLayerType(View.LAYER_TYPE_NONE, null)
        web.isFocusable = true
        web.isFocusableInTouchMode = true
        web.isClickable = true
        web.requestFocus()

        val s = web.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.mediaPlaybackRequiresUserGesture = false
        s.loadWithOverviewMode = true
        s.useWideViewPort = true
        s.setSupportZoom(false)
        s.builtInZoomControls = false
        s.displayZoomControls = false
        s.cacheMode = WebSettings.LOAD_DEFAULT

        web.addJavascriptInterface(NativeBridge(), "TVNative")

        web.webChromeClient = object : WebChromeClient() {
            override fun getDefaultVideoPoster(): Bitmap {
                return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
            }
            override fun getVideoLoadingProgressView(): View {
                return View(this@MainActivity)
            }
        }

        web.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                handler.removeCallbacks(reloadTask)
                pushTraffic()
                if (webHidden.isNotEmpty()) hideWebCells(webHidden)
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && request?.isForMainFrame == true) {
                    handler.removeCallbacks(reloadTask)
                    handler.postDelayed(reloadTask, 15000)
                }
            }

            @Suppress("DEPRECATION")
            override fun onReceivedError(view: WebView?, errorCode: Int, description: String?, failingUrl: String?) {
                handler.removeCallbacks(reloadTask)
                handler.postDelayed(reloadTask, 15000)
            }
        }
    }

    private fun startTrafficPolling() {
        trafficJob?.cancel()
        trafficJob = lifecycleScope.launch {
            while (isActive) {
                val data = trafficService.fetchIbbTraffic()
                if (data != null) {
                    val j = JSONObject().apply {
                        put("all", data.all)
                        put("asia", data.asia)
                        put("europe", data.europe)
                        put("ts", data.timestamp)
                    }
                    lastTrafficJson = j.toString()
                    pushTraffic()
                }
                delay(120000)
            }
        }
    }

    private fun pushTraffic() {
        val j = lastTrafficJson ?: return
        binding.webView.post {
            binding.webView.evaluateJavascript("window.__nativeTraffic && window.__nativeTraffic($j);", null)
        }
    }

    // ---- yerel medya motoru: ekran katmanları ----
    private fun ensurePoster(): PosterView {
        return posterView ?: PosterView(this).also {
            it.visibility = View.GONE
            binding.rootContainer.addView(it, binding.rootContainer.indexOfChild(binding.webView), FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            posterView = it
            lastBounds?.let { b ->
                val p = it.layoutParams as FrameLayout.LayoutParams
                p.leftMargin = b[0]; p.topMargin = b[1]; p.width = b[2]; p.height = b[3]; it.layoutParams = p
            }
        }
    }

    private fun pageTransparent(on: Boolean) {
        binding.webView.evaluateJavascript("document.documentElement.classList.toggle('exo-on',$on);", null)
    }

    /** Video dışı bir şey görünürken eski videonun son karesi kenar boşluğunda kalmasın. */
    private fun dropVideoLater(token: Int) {
        handler.postDelayed({ if (token == mediaTok && mediaKind != "video") { exoPlayer?.pause(); binding.playerView.visibility = View.INVISIBLE } }, 450)
    }
    private var mediaTok = 0

    private fun mediaPlayVideo(url: String, startMs: Long) {
        val tk = ++mediaTok
        val wasVideo = mediaKind == "video"
        mediaKind = "video"
        binding.playerView.visibility = View.VISIBLE
        var shown = false
        val reveal = {
            if (!shown && tk == mediaTok) {
                shown = true
                binding.imageView.visibility = View.GONE; binding.imageView.setImageDrawable(null)
                posterView?.visibility = View.GONE
                pageTransparent(true)
            }
        }
        mediaFirstFrame = reveal
        if (wasVideo) reveal()
        else handler.postDelayed({ reveal() }, 2500)
        try {
            val full = if (url.startsWith("http")) url else "$baseUrl$url"
            exoPlayer?.setMediaItem(MediaItem.fromUri(Uri.parse(full)), true)
            exoPlayer?.seekTo(if (startMs > 300) startMs else 0L)
            exoPlayer?.prepare(); exoPlayer?.play()
        } catch (e: Exception) { Log.e(TAG, "Medya videosu açılamadı", e); notifyVideoEnded() }
    }

    private fun mediaShowPhoto(url: String, done: (Boolean) -> Unit) {
        val tk = ++mediaTok
        val full = if (url.startsWith("http")) url else "$baseUrl$url"
        val iv = binding.imageView
        val fade = mediaKind.isNotEmpty()
        iv.scaleType = ImageView.ScaleType.FIT_CENTER
        iv.visibility = View.VISIBLE
        iv.load(full) {
            crossfade(if (fade) 350 else 0)
            allowHardware(true)
            listener(
                onSuccess = { _, _ ->
                    if (tk == mediaTok) {
                        val prevVideo = mediaKind == "video"
                        mediaKind = "photo"
                        posterView?.visibility = View.GONE
                        pageTransparent(true)
                        if (prevVideo) dropVideoLater(tk) else exoPlayer?.pause()
                        done(true)
                    }
                },
                onError = { _, r -> Log.w(TAG, "Medya fotoğrafı yüklenemedi: ${r.throwable.message}"); if (tk == mediaTok) done(false) }
            )
        }
    }

    private fun mediaShowPoster(item: JSONObject, lang: String, done: (Boolean) -> Unit) {
        val st = lastTvState
        if (st == null) { done(false); return }
        val tk = ++mediaTok
        try {
            val pv = ensurePoster()
            binding.imageView.visibility = View.GONE
            pv.visibility = View.VISIBLE
            pv.bind(item, st, lang.ifEmpty { "tr" })
            val wait = if (item.optString("image").isNotEmpty() || item.has("books")) 450L else 150L
            handler.postDelayed({
                if (tk == mediaTok) {
                    val prevVideo = mediaKind == "video"
                    mediaKind = "photo"
                    binding.imageView.setImageDrawable(null)
                    pageTransparent(true)
                    if (prevVideo) dropVideoLater(tk) else exoPlayer?.pause()
                    done(true)
                }
            }, wait)
        } catch (e: Exception) { Log.w(TAG, "Medya afişi çizilemedi: ${e.message}"); done(false) }
    }

    private fun mediaRelease() {
        ++mediaTok; mediaKind = ""; mediaFirstFrame = null
        exoPlayer?.pause()
        binding.imageView.visibility = View.GONE; binding.imageView.setImageDrawable(null)
        posterView?.visibility = View.GONE
        pageTransparent(false)
    }

    private inner class NativeBridge {

        @JavascriptInterface
        fun isNative(): Boolean = true

        @JavascriptInterface
        fun hasExoPlayer(): Boolean = true

        /** Sayfa bunu görünce ilk kare haberini (window.__exoStarted) bekler. */
        @JavascriptInterface
        fun hasFirstFrameEvent(): Boolean = true

        /** Tema kenar rengi: video oynarken sayfa şeffaflaştığında arkada bu renk görünür. */
        @JavascriptInterface
        fun setBackdrop(color: String) {
            val c = try { Color.parseColor(color) } catch (_: Exception) { return }
            handler.post { binding.root.setBackgroundColor(c) }
        }

        @JavascriptInterface
        fun playExo(url: String, durationSec: Int) {
            playExoWithSeek(url, durationSec, 0L)
        }

        @JavascriptInterface
        fun playExoWithSeek(url: String, durationSec: Int, startPositionMs: Long) {
            handler.post {
                binding.playerView.visibility = View.VISIBLE
                val fullUrl = if (url.startsWith("http")) url else "$baseUrl$url"
                Log.d(TAG, "ExoPlayer ile oynatılıyor: $fullUrl (süre: $durationSec s, offset: $startPositionMs ms)")
                try {
                    val mediaItem = MediaItem.fromUri(Uri.parse(fullUrl))
                    exoPlayer?.setMediaItem(mediaItem, true)
                    if (startPositionMs > 300) {
                        exoPlayer?.seekTo(startPositionMs)
                    } else {
                        exoPlayer?.seekTo(0L)
                    }
                    exoPlayer?.prepare()
                    exoPlayer?.play()
                } catch (e: Exception) {
                    Log.e(TAG, "ExoPlayer oynatılamadı", e)
                    notifyVideoEnded()
                }
            }
        }

        @JavascriptInterface
        fun stopExo() {
            handler.post {
                // sadece duraklat: yüzey ve son kare kalır — bir sonraki video yüzey yeniden doğmadan anında başlar
                exoPlayer?.pause()
            }
        }

        @JavascriptInterface
        fun hideExo() {
            handler.post {
                exoPlayer?.pause()
                // Yüzeyi gizle: YouTube ve iframe katmanları donanım SurfaceView çakışması olmadan pürüzsüz oynar.
                // Not: gizlenen SurfaceView'in yüzeyi Android'de bırakılır; sonraki video yüzeyi yeniden oluşturur.
                binding.playerView.visibility = View.INVISIBLE
            }
        }

        @JavascriptInterface
        fun seekExo(positionMs: Long) {
            handler.post {
                try {
                    exoPlayer?.seekTo(positionMs)
                } catch (e: Exception) {
                    Log.e(TAG, "ExoPlayer seekTo error", e)
                }
            }
        }

        @JavascriptInterface
        fun updateBounds(leftPx: Int, topPx: Int, widthPx: Int, heightPx: Int) {
            handler.post {
                if (widthPx > 0 && heightPx > 0) {
                    lastBounds = intArrayOf(leftPx, topPx, widthPx, heightPx)
                    // video ve fotoğraf katmanları birlikte konumlanır
                    for (v in listOfNotNull<View>(binding.playerView, binding.imageView, posterView)) {
                        val params = v.layoutParams as FrameLayout.LayoutParams
                        if (params.leftMargin != leftPx || params.topMargin != topPx ||
                            params.width != widthPx || params.height != heightPx) {
                            params.leftMargin = leftPx
                            params.topMargin = topPx
                            params.width = widthPx
                            params.height = heightPx
                            v.layoutParams = params
                        }
                    }
                }
            }
        }

        /** Sayfa bunu görünce fotoğrafları da yerel katmanda gösterir ve hazır haberini (window.__imgShown) bekler. */
        @JavascriptInterface
        fun hasImageEvent(): Boolean = true

        /** Eski köprü (3.0–3.1 sayfaları için): geçişsiz gösterir. */
        @JavascriptInterface
        fun showImage(url: String) = showImage2(url, false)

        /**
         * Fotoğrafı yerel katmanda gösterir: görüntü arka planda, ekrandaki alan boyutunda donanım bitmap'ine
         * çözülür (1080p doku yüklemesi WebView'in GPU hattından çıkar). Görüntü hazır olunca sayfaya
         * window.__imgShown() ile haber verilir; sayfa ancak o zaman şeffaflaşır.
         * fade: önceki içerik de yerel katmandaysa (video/fotoğraf) yumuşak geçiş yapılır.
         */
        @JavascriptInterface
        fun showImage2(url: String, fade: Boolean) {
            handler.post {
                val fullUrl = if (url.startsWith("http")) url else "$baseUrl$url"
                val iv = binding.imageView
                posterView?.visibility = View.GONE // afişten fotoğrafa: afiş fotoğrafın üstünde kalmasın
                iv.scaleType = ImageView.ScaleType.FIT_CENTER
                iv.visibility = View.VISIBLE
                iv.load(fullUrl) {
                    crossfade(if (fade) 350 else 0)
                    allowHardware(true)
                    listener(
                        onSuccess = { _, _ ->
                            binding.webView.evaluateJavascript("window.__imgShown && window.__imgShown(${JSONObject.quote(url)});", null)
                        },
                        onError = { _, r ->
                            Log.w(TAG, "Fotoğraf yüklenemedi: $fullUrl - ${r.throwable.message}")
                            binding.webView.evaluateJavascript("window.__imgFailed && window.__imgFailed(${JSONObject.quote(url)});", null)
                        }
                    )
                }
            }
        }

        /** Yerel fotoğraf kalkar; görüntü de bırakılır (sonraki fotoğraf eskisinin üstünden değil boştan belirir). */
        @JavascriptInterface
        fun hideImage() {
            handler.post {
                binding.imageView.visibility = View.GONE
                binding.imageView.setImageDrawable(null)
                posterView?.visibility = View.GONE
            }
        }

        /** Sıradaki fotoğraf önceden ekran boyutunda çözülür: geçiş anında bellekten anında gelir. */
        @JavascriptInterface
        fun preloadImage(url: String) {
            val fullUrl = if (url.startsWith("http")) url else "$baseUrl$url"
            val req = ImageRequest.Builder(this@MainActivity).data(fullUrl).allowHardware(true).build()
            coil.Coil.imageLoader(this@MainActivity).enqueue(req)
        }

        /** Afiş yerel PosterView ile çizilir (APK 3.9+); durum henüz gelmediyse sayfa web afişine döner. */
        @JavascriptInterface
        fun showPoster(json: String, lang: String) {
            handler.post {
                val st = lastTvState
                if (st == null) { binding.webView.evaluateJavascript("window.__imgFailed && window.__imgFailed('poster');", null); return@post }
                try {
                    val o = JSONObject(json)
                    val pv = posterView ?: PosterView(this@MainActivity).also {
                        it.visibility = View.GONE
                        binding.rootContainer.addView(it, binding.rootContainer.indexOfChild(binding.webView), FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                        posterView = it
                    }
                    binding.imageView.visibility = View.GONE
                    pv.visibility = View.VISIBLE
                    pv.bind(o, st, lang.ifEmpty { "tr" })
                    val wait = if (o.optString("image").isNotEmpty() || o.has("books")) 450L else 150L // görseller yüklenirken sayfa açılmasın
                    handler.postDelayed({ binding.webView.evaluateJavascript("window.__imgShown && window.__imgShown('poster');", null) }, wait)
                } catch (e: Exception) {
                    Log.w(TAG, "Afiş çizilemedi: ${e.message}")
                    binding.webView.evaluateJavascript("window.__imgFailed && window.__imgFailed('poster');", null)
                }
            }
        }

        /** Yerel medya motoru: sayfa araya girenleri bitirdi, sıradaki içerik. */
        @JavascriptInterface
        fun mediaResume() { handler.post { mediaEngine.resume() } }

        @JavascriptInterface
        fun mediaLang(lang: String) { handler.post { mediaEngine.setLang(lang) } }

        @JavascriptInterface
        fun hasNativeMedia(): Boolean = NATIVE_MEDIA

        @JavascriptInterface
        fun getToken(): String = prefs.getDeviceToken()

        @JavascriptInterface
        fun saveToken(t: String?) {
            prefs.saveDeviceToken(t)
        }

        @JavascriptInterface
        fun versionName(): String = BuildConfig.VERSION_NAME

        @JavascriptInterface
        fun versionCode(): Int = BuildConfig.VERSION_CODE

        @JavascriptInterface
        fun hwId(): String = prefs.getHardwareId()

        @JavascriptInterface
        fun model(): String = prefs.getModel()

        /**
         * Uzaktan durum izleme: ekranın küçük bir görüntüsü (960 px genişlik, JPEG, data: adresi).
         * Pencere kopyası yerel video katmanını (SurfaceView) içermez; video oynuyorsa önce o kopyalanır,
         * pencere (sayfa) üstüne bindirilir — panelde videonun yerinde boşluk görünmez.
         */
        @JavascriptInterface
        fun snapshot(): String {
            val out = arrayOf("")
            val done = CountDownLatch(1)
            runOnUiThread {
                try {
                    val w = binding.root.width
                    val h = binding.root.height
                    if (w <= 0 || h <= 0) { done.countDown(); return@runOnUiThread }
                    val k = (960f / w).coerceAtMost(1f)
                    val tw = (w * k).toInt().coerceAtLeast(1)
                    val th = (h * k).toInt().coerceAtLeast(1)
                    val finish = { b: Bitmap ->
                        val stream = ByteArrayOutputStream()
                        b.compress(Bitmap.CompressFormat.JPEG, 70, stream)
                        b.recycle()
                        out[0] = "data:image/jpeg;base64," + Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
                    }
                    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                        val b = Bitmap.createBitmap(tw, th, Bitmap.Config.RGB_565)
                        val c = Canvas(b); c.scale(k, k); binding.root.draw(c)
                        finish(b); done.countDown(); return@runOnUiThread
                    }
                    val result = Bitmap.createBitmap(tw, th, Bitmap.Config.ARGB_8888)
                    val canvas = Canvas(result)
                    canvas.drawColor((binding.root.background as? android.graphics.drawable.ColorDrawable)?.color ?: Color.BLACK)
                    val copyWindow = {
                        val win = Bitmap.createBitmap(tw, th, Bitmap.Config.ARGB_8888)
                        PixelCopy.request(window, win, { res ->
                            try {
                                if (res == PixelCopy.SUCCESS) canvas.drawBitmap(win, 0f, 0f, null)
                                win.recycle()
                                finish(result)
                            } catch (_: Throwable) {}
                            done.countDown()
                        }, handler)
                    }
                    val sv = binding.playerView.videoSurfaceView as? android.view.SurfaceView
                    val pv = binding.playerView
                    if (sv != null && pv.visibility == View.VISIBLE && exoPlayer?.isPlaying == true && sv.width > 0 && sv.height > 0 && sv.holder.surface.isValid) {
                        val vb = Bitmap.createBitmap((sv.width * k).toInt().coerceAtLeast(1), (sv.height * k).toInt().coerceAtLeast(1), Bitmap.Config.ARGB_8888)
                        PixelCopy.request(sv, vb, { res ->
                            try {
                                if (res == PixelCopy.SUCCESS) {
                                    val loc = IntArray(2); sv.getLocationInWindow(loc)
                                    canvas.drawBitmap(vb, loc[0] * k, loc[1] * k, null)
                                }
                                vb.recycle()
                            } catch (_: Throwable) {}
                            copyWindow()
                        }, handler)
                    } else copyWindow()
                } catch (_: Throwable) {
                    out[0] = ""
                    done.countDown()
                }
            }
            try { done.await(3, TimeUnit.SECONDS) } catch (_: InterruptedException) {}
            return out[0]
        }

        @JavascriptInterface
        fun installUpdate(url: String) {
            runOnUiThread {
                startUpdate(url)
            }
        }
    }

    private fun updateStatus(msg: String) {
        handler.post {
            binding.webView.evaluateJavascript(
                "window.__updateStatus && window.__updateStatus(${JSONObject.quote(msg)});",
                null
            )
        }
    }

    private fun startUpdate(url: String) {
        if (isUpdating) return
        val curHost = binding.webView.url?.split("/tv")?.getOrNull(0) ?: baseUrl
        if (!url.startsWith("$baseUrl/") && !url.startsWith("$curHost/")) {
            updateStatus("Geçersiz güncelleme adresi")
            return
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !packageManager.canRequestPackageInstalls()) {
            updateStatus("Açılan ekranda bu uygulama için izni açıp geri dönün, sonra tekrar OK'a basın")
            val i = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName"))
            startActivity(i)
            return
        }

        isUpdating = true
        updateStatus("İndiriliyor…")

        lifecycleScope.launch(Dispatchers.IO) {
            val targetApk = UpdateProvider.apkFile(this@MainActivity)
            val res = apiClient.downloadFile(url, targetApk) { percent ->
                if (percent % 10 == 0) updateStatus("İndiriliyor %$percent…")
            }

            withContext(Dispatchers.Main) {
                isUpdating = false
                res.onSuccess {
                    launchInstaller(targetApk)
                }.onFailure { err ->
                    updateStatus("İndirilemedi: ${err.message}")
                }
            }
        }
    }

    private fun launchInstaller(f: File) {
        try {
            val contentUri = Uri.parse("content://$packageName.update/update.apk")
            val intent = Intent(Intent.ACTION_VIEW).apply {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    setDataAndType(contentUri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                } else {
                    setDataAndType(Uri.fromFile(f), "application/vnd.android.package-archive")
                }
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                val resInfoList = packageManager.queryIntentActivities(intent, 0)
                for (resolveInfo in resInfoList) {
                    val pkg = resolveInfo.activityInfo.packageName
                    grantUriPermission(pkg, contentUri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
            }

            startActivity(intent)
            updateStatus("Yükleme ekranında \"Yükle\" seçeneğini onaylayın")
        } catch (e: Exception) {
            updateStatus("Yükleyici açılamadı: ${e.message}")
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        when (keyCode) {
            KeyEvent.KEYCODE_MENU,
            KeyEvent.KEYCODE_SETTINGS,
            KeyEvent.KEYCODE_INFO,
            KeyEvent.KEYCODE_HELP,
            KeyEvent.KEYCODE_WINDOW,
            KeyEvent.KEYCODE_PROG_RED -> {
                binding.webView.evaluateJavascript("window.__menu && window.__menu();", null)
                return true
            }
            KeyEvent.KEYCODE_F5 -> {
                binding.webView.reload()
                return true
            }
            KeyEvent.KEYCODE_BACK -> {
                binding.webView.evaluateJavascript("(window.__menuClose ? (window.__menuClose(), 1) : 0)", null)
                return true
            }
        }
        return super.onKeyDown(keyCode, event)
    }

    private fun hideSystemUi() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            window.decorView.systemUiVisibility = (
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            or View.SYSTEM_UI_FLAG_FULLSCREEN
                            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    )
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            hideSystemUi()
            binding.webView.requestFocus()
        }
    }

    override fun onResume() {
        super.onResume()
        binding.webView.onResume()
        binding.webView.requestFocus()
        exoPlayer?.play()
    }

    override fun onPause() {
        exoPlayer?.pause()
        binding.webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        trafficJob?.cancel()
        tvSocket?.stop()
        handler.removeCallbacksAndMessages(null)
        exoPlayer?.release()
        exoPlayer = null
        binding.webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val TAG = "MainActivity"
    }
}
