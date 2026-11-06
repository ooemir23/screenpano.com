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
import android.view.Gravity
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
import android.widget.LinearLayout
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
import com.screenpano.tv.receiver.UpdateBus
import com.screenpano.tv.R
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
    private var campView: com.screenpano.tv.ui.nativeui.CampView? = null
    private var bigView: com.screenpano.tv.ui.nativeui.BigArenaView? = null
    private var lastBounds: IntArray? = null
    private var mediaFlag = false
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
        override fun current(id: String) { binding.webView.evaluateJavascript("window.__setCur&&window.__setCur(" + JSONObject.quote(id) + ")", null) }
        override fun online(): Boolean = tvSocket?.connected == true
    })

    // ortama göre (canlı / test): onCreate'te NativeEnv.base ayarlanır
    private val baseUrl: String get() = com.screenpano.tv.ui.nativeui.NativeEnv.base
    private val tvUrl: String get() = "$baseUrl/tv"

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
        com.screenpano.tv.ui.nativeui.NativeEnv.base = (if (prefs.isTest()) BuildConfig.TEST_URL else BuildConfig.BASE_URL).trimEnd('/')
        if (prefs.isTest()) showTestTag()

        initExoPlayer()
        setupWebView()
        startTrafficPolling()
        startNativeChannel()

        binding.webView.loadUrl(tvUrl)
        // Test ortamında sayfa 45 sn içinde hazır olmazsa (sunucu yok / hata sayfası) canlıya dön
        if (prefs.isTest()) handler.postDelayed(readyWatch, 45000)
        askAutostartOnce()
    }

    /** T3: medya kutusu doldurma: "auto" (oran yakınsa kırparak doldurur, çok farklıysa tamamı görünür), "cover", "contain". */
    @Volatile private var mediaFit = "auto"
    private fun wantCover(w: Int, h: Int, bw: Int, bh: Int): Boolean {
        if (mediaFit == "cover") return true
        return false // "auto" ve "contain": tamamı görünür, boşluğu bulanık dolgu doldurur
    }
    /** Tamamı görünen fotoğrafın boşluklarına, kendi renklerinden küçük (64 px) ve bulanık bir arka plan koyar; hazır olunca cb çağrılır. */
    private fun applyBackdrop(iv: ImageView, url: String, cb: () -> Unit) {
        if (iv.scaleType != ImageView.ScaleType.FIT_CENTER) { iv.background = null; cb(); return }
        val b = lastBounds
        val bw = if (iv.width > 0) iv.width else (b?.get(2) ?: binding.rootContainer.width)
        val bh = if (iv.height > 0) iv.height else (b?.get(3) ?: binding.rootContainer.height)
        if (bw <= 0 || bh <= 0) { iv.background = null; cb(); return }
        val w = 64; val h = maxOf(8, 64 * bh / bw)
        var called = false
        val once = { if (!called) { called = true; cb() } }
        val req = ImageRequest.Builder(this).data(url).size(w, h)
            .precision(coil.size.Precision.EXACT).scale(coil.size.Scale.FILL).allowHardware(false)
            .target(
                onSuccess = { d ->
                    d.mutate().colorFilter = android.graphics.PorterDuffColorFilter(0x99000000.toInt(), android.graphics.PorterDuff.Mode.SRC_OVER)
                    iv.background = d; once()
                },
                onError = { iv.background = null; once() }
            ).build()
        coil.Coil.imageLoader(this).enqueue(req)
        handler.postDelayed({ once() }, 600) // dolgu gecikirse fotoğrafı bekletme
    }
    private fun fitImage(iv: ImageView, d: android.graphics.drawable.Drawable?) {
        if (d == null) return
        iv.scaleType = if (wantCover(d.intrinsicWidth, d.intrinsicHeight, iv.width, iv.height)) ImageView.ScaleType.CENTER_CROP else ImageView.ScaleType.FIT_CENTER
    }

    private var testFails = 0
    private var lastLoadFailed = false
    @Volatile private var pageIsReady = false
    private val readyWatch = Runnable { if (prefs.isTest() && !pageIsReady) fallbackToLive() }

    /** Test sunucusu açılmıyorsa canlıya dön (ortam kaydı silinir, uygulama yeniden kurulur). */
    private fun fallbackToLive() {
        testFails = 0; prefs.setTest(false); handler.post { recreate() }
    }
    /** Test sunucusuna ulaşılamıyorsa (kurulmamış/kapalı) ekran takılı kalmasın: 3 başarısız yüklemeden sonra canlıya döner. */
    private fun noteMainFail() {
        lastLoadFailed = true
        showStatus(true)
        if (!prefs.isTest()) return
        if (++testFails >= 2) fallbackToLive()
    }

    /** T11: sayfa açılamazsa WebView'in hata sayfası yerine marka uyumlu durum ekranı (yeniden deneme sürer). */
    private var statusView: View? = null
    private fun showStatus(on: Boolean) = handler.post {
        if (!on) { statusView?.let { binding.rootContainer.removeView(it) }; statusView = null; return@post }
        if (statusView != null) return@post
        val vh = resources.displayMetrics.heightPixels / 100f
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setBackgroundColor(Color.parseColor("#121414")); isClickable = true
            addView(ImageView(this@MainActivity).apply { setImageResource(R.mipmap.ic_launcher) }, LinearLayout.LayoutParams((vh * 12).toInt(), (vh * 12).toInt()).apply { bottomMargin = (vh * 3).toInt() })
            addView(android.widget.TextView(this@MainActivity).apply { text = "Sunucuya ulaşılamıyor"; setTextColor(Color.WHITE); setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, vh * 4.2f); typeface = android.graphics.Typeface.DEFAULT_BOLD; gravity = Gravity.CENTER })
            addView(android.widget.TextView(this@MainActivity).apply {
                text = "İnternet bağlantısını kontrol edin. Ekran 15 saniyede bir kendiliğinden yeniden dener." + if (prefs.isTest()) "\nTest ortamındasınız: canlı ortama dönmek için kumandada Menü tuşuna basın." else ""
                setTextColor(Color.parseColor("#AAB2B2")); setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, vh * 2.4f); gravity = Gravity.CENTER; setLineSpacing(0f, 1.3f)
            }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = (vh * 2).toInt() })
        }
        binding.rootContainer.addView(box, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        statusView = box
    }

    /** Test ortamındayken her ekranın (yerel katmanlar dahil) üstünde küçük kırmızı etiket: müşteri ekranı unutulmasın. */
    private fun showTestTag() {
        val tag = android.widget.TextView(this).apply {
            text = "TEST ORTAMI"; setTextColor(Color.WHITE); setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 11f)
            typeface = android.graphics.Typeface.DEFAULT_BOLD; letterSpacing = 0.1f
            setPadding(18, 6, 18, 6); setBackgroundColor(Color.argb(230, 214, 38, 42)); isClickable = false; isFocusable = false
        }
        binding.rootContainer.addView(tag, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.START))
        tag.bringToFront(); tag.elevation = 1000f
    }

    /** Android 10+ açılışta kendiliğinden başlama: izin yoksa yalnız eşleştirme ekranındayken (içerik yokken) bir kez sorulur. */
    private fun askAutostartOnce() {
        if (Build.VERSION.SDK_INT < 29 || android.provider.Settings.canDrawOverlays(this)) return
        if (prefs.getDeviceToken().isNotEmpty()) return
        val sp = getSharedPreferences("sp_misc", MODE_PRIVATE)
        if (sp.getBoolean("overlay_asked", false)) return
        sp.edit().putBoolean("overlay_asked", true).apply()
        try {
            startActivity(Intent(android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION, android.net.Uri.parse("package:$packageName")))
        } catch (_: Exception) { /* bazı TV yazılımlarında bu ayar ekranı yok */ }
    }

    /** Sunucuyla yerel bağlantı: durum iletisini alır, panelde "Yerel ekran" açıksa ızgarayı gösterir. */
    private fun startNativeChannel() {
        tvSocket = TvWebSocket(
            baseUrl = baseUrl,
            tokenProvider = { prefs.getDeviceToken() },
            onState = { st ->
                lastTvState = st
                val mediaOn = NATIVE_MEDIA && st.nativeWidgets && st.blocked == null && st.widgets.any { it.type == "media" }
                mediaFlag = mediaOn
                binding.webView.evaluateJavascript("window.__nativeMedia=$mediaOn;", null)
                mediaEngine.setState(st, mediaOn)
                if (st.nativeWidgets) {
                    val g = nativeGrid ?: NativeGridView(this).also {
                        it.isClickable = false; it.isFocusable = false
                        binding.rootContainer.addView(it, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                        nativeGrid = it
                    }
                    g.visibility = if (overlayOn) View.INVISIBLE else View.VISIBLE
                    g.setState(st)
                    hideWebCells(g.nativeTypes + "poster")
                } else {
                    nativeGrid?.let { it.clear(); it.visibility = View.GONE }
                    hideWebCells(emptyList())
                }
            },
            onSync = { m ->
                val st = m.optLong("serverTime", 0L); if (st > 0) com.screenpano.tv.ui.nativeui.NativeEnv.srvOff = st - System.currentTimeMillis()
                mediaEngine.onSync(m)
            },
        ).also { it.start() }
        // sayfa köprüsü: iletiler sayfaya aynen aktarılır (sayfa wsAttach() ile bağlanınca)
        tvSocket?.onRaw = { text -> if (pageWs) toPage("window.__wsIn&&window.__wsIn(" + jsStr(text) + ")") }
        tvSocket?.onOpenEvt = { if (pageWs) toPage("window.__wsEvt&&window.__wsEvt('open')") }
        tvSocket?.onCloseEvt = { if (pageWs) toPage("window.__wsEvt&&window.__wsEvt('close')") }
    }
    @Volatile private var pageWs = false
    private fun toPage(js: String) { try { binding.webView.evaluateJavascript(js, null) } catch (_: Exception) {} }
    /** JS dizgi değişmezi (U+2028/2029 satır sonu sayılır, kaçırılır). */
    private fun jsStr(s: String) = JSONObject.quote(s).replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")

    // Yerel çizilen hücreleri sayfa gizler (sayfa yenilenince yeniden bildirilir)
    private var overlayOn = false
    private var brkView: android.widget.LinearLayout? = null
    private var webHidden: List<String> = emptyList()
    private fun hideWebCells(types: List<String>) {
        webHidden = types
        try { getSharedPreferences("native_cells", MODE_PRIVATE).edit().putString("list", types.joinToString(",")).apply() } catch (_: Exception) {}
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

                    override fun onVideoSizeChanged(videoSize: androidx.media3.common.VideoSize) {
                        val pv = binding.playerView
                        pv.resizeMode = if (wantCover(videoSize.width, videoSize.height, pv.width, pv.height)) androidx.media3.ui.AspectRatioFrameLayout.RESIZE_MODE_ZOOM else androidx.media3.ui.AspectRatioFrameLayout.RESIZE_MODE_FIT
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
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                lastLoadFailed = false
            }

            override fun onReceivedHttpError(view: WebView?, request: WebResourceRequest?, errorResponse: android.webkit.WebResourceResponse?) {
                if (request?.isForMainFrame == true && (errorResponse?.statusCode ?: 0) >= 400) noteMainFail()
            }

            override fun onReceivedSslError(view: WebView?, handler: android.webkit.SslErrorHandler?, error: android.net.http.SslError?) {
                handler?.cancel()
                noteMainFail()
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                // Hata sayfası da "bitti" sayılır: sayacı yalnız hatasız yüklemede sıfırla
                if (!lastLoadFailed && url != null && url.startsWith("http")) { testFails = 0; showStatus(false) }
                handler.removeCallbacks(reloadTask)
                pushTraffic()
                if (webHidden.isNotEmpty()) hideWebCells(webHidden)
                if (mediaFlag) { // sayfa yenilendi: bayrak ve (yerel katman görünüyorsa) saydamlık yeniden bildirilir
                    view?.evaluateJavascript("window.__nativeMedia=true;", null)
                    if (mediaKind.isNotEmpty()) pageTransparent(true)
                    mediaEngine.currentId()?.let { id -> view?.evaluateJavascript("window.__setCur&&window.__setCur(" + JSONObject.quote(id) + ")", null) }
                }
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && request?.isForMainFrame == true) {
                    noteMainFail()
                    handler.removeCallbacks(reloadTask)
                    handler.postDelayed(reloadTask, 15000)
                }
            }

            @Suppress("DEPRECATION")
            override fun onReceivedError(view: WebView?, errorCode: Int, description: String?, failingUrl: String?) {
                // Eski (API 21-22) sürüm alt kaynak (görsel vb.) hatalarını da bildirir: yalnız ana sayfa hatasında yeniden yükle
                if (failingUrl != null && view?.url != null && failingUrl != view.url) return
                noteMainFail()
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
    private val PHOTO_FADE_MS = 800L // web geçişiyle aynı süre: kısa geçiş keskin görünür

    // ---- Fotoğraf geçişi: iki katman (A altta, B üstte), yalnız alpha animasyonu (GPU'yu yormaz) ----
    // Yeni fotoğraf B'ye gelirse B eskinin üstünde açılır; A'ya gelirse eski (B) sönerek altındaki yeniyi gösterir.
    // Böylece geçiş boyunca ekran hiç kararmaz (iki yarı saydam katmanın toplamındaki "parlama/çukur" olmaz),
    // ölçek modu da geçiş başlamadan ayarlandığı için görüntü ortada zıplamaz.
    private var photoTop = false
    private val photoB: ImageView by lazy {
        ImageView(this).apply {
            visibility = View.GONE; scaleType = ImageView.ScaleType.FIT_CENTER; isClickable = false; isFocusable = false
            val a = binding.imageView
            val lp = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            lastBounds?.let { b -> lp.leftMargin = b[0]; lp.topMargin = b[1]; lp.width = b[2]; lp.height = b[3] }
            binding.rootContainer.addView(this, binding.rootContainer.indexOfChild(a) + 1, lp)
            val rr = resources.displayMetrics.heightPixels * 0.0139f // sayfadaki köşe yuvarlaklığıyla aynı
            outlineProvider = object : android.view.ViewOutlineProvider() {
                override fun getOutline(view: View, o: android.graphics.Outline) { o.setRoundRect(0, 0, view.width, view.height, rr) }
            }
            clipToOutline = true
        }
    }
    private fun resetPhoto(v: ImageView) { v.animate().cancel(); v.visibility = View.GONE; v.setImageDrawable(null); v.background = null; v.alpha = 1f }
    /** Her iki fotoğraf katmanını anında temizler. */
    private fun clearPhotos() { resetPhoto(binding.imageView); if (photoBInit) resetPhoto(photoB); photoTop = false }
    private var photoBInit = false

    /** Görünen fotoğrafları yumuşakça kaldırır (fotoğraftan videoya geçişte keskin kesme olmasın). */
    private fun fadePhotosOut(ms: Long) {
        val vs = listOf(binding.imageView).plus(if (photoBInit) listOf(photoB) else emptyList()).filter { it.visibility == View.VISIBLE }
        if (vs.isEmpty()) return
        vs.forEach { v -> v.animate().cancel(); v.animate().alpha(0f).setDuration(ms).withEndAction { resetPhoto(v) }.start() }
        photoTop = false
    }

    /**
     * url'yi boştaki katmana çözer; hazır olunca (ve valid() hâlâ doğruysa) eskinin yerine yumuşakça getirir.
     * ok: ölçü modu ayarlanmış, gösterim başlamış; err: yüklenemedi.
     */
    private fun showPhotoSwap(full: String, fadeMs: Long, valid: () -> Boolean, ok: () -> Unit, err: (Throwable?) -> Unit) {
        photoBInit = true
        val a = binding.imageView; val b = photoB
        val target = if (photoTop) a else b
        val old = if (photoTop) b else a
        val toTop = target === b
        target.animate().cancel()
        target.visibility = View.INVISIBLE
        target.load(full) {
            allowHardware(true)
            listener(
                onSuccess = { _, r ->
                    if (!valid()) { return@listener }
                    fitImage(target, r.drawable)
                    applyBackdrop(target, full) {
                    if (!valid()) { return@applyBackdrop }
                    val oldVisible = old.visibility == View.VISIBLE && old.drawable != null
                    old.animate().cancel()
                    if (fadeMs <= 0L) {
                        target.alpha = 1f; target.visibility = View.VISIBLE
                        if (oldVisible) resetPhoto(old)
                    } else if (!oldVisible) {
                        target.alpha = 0f; target.visibility = View.VISIBLE
                        target.animate().alpha(1f).setDuration(fadeMs).setInterpolator(android.view.animation.AccelerateDecelerateInterpolator()).start()
                    } else if (toTop) {
                        // yeni üstte açılır, eski altta tam opak kalır; bitince eski kaldırılır
                        target.alpha = 0f; target.visibility = View.VISIBLE
                        target.animate().alpha(1f).setDuration(fadeMs).setInterpolator(android.view.animation.AccelerateDecelerateInterpolator())
                            .withEndAction { resetPhoto(old) }.start()
                    } else {
                        // yeni altta hazır; eskisi (üstte) sönerek onu gösterir
                        target.alpha = 1f; target.visibility = View.VISIBLE
                        old.animate().alpha(0f).setDuration(fadeMs).setInterpolator(android.view.animation.AccelerateDecelerateInterpolator())
                            .withEndAction { resetPhoto(old) }.start()
                    }
                    photoTop = toTop
                    ok()
                    }
                },
                onError = { _, r -> target.visibility = View.GONE; err(r.throwable) }
            )
        }
    }

    private fun mediaPlayVideo(url: String, startMs: Long) {
        val tk = ++mediaTok
        val wasVideo = mediaKind == "video"
        mediaKind = "video"
        binding.playerView.visibility = View.VISIBLE
        var shown = false
        val reveal = {
            if (!shown && tk == mediaTok) {
                shown = true
                if (wasVideo) clearPhotos() else fadePhotosOut(350)
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
        val fade = mediaKind.isNotEmpty()
        showPhotoSwap(full, if (fade) PHOTO_FADE_MS else 0L, { tk == mediaTok }, {
            val prevVideo = mediaKind == "video"
            mediaKind = "photo"
            posterView?.visibility = View.GONE
            pageTransparent(true)
            if (prevVideo) dropVideoLater(tk) else exoPlayer?.pause()
            done(true)
        }, { t -> Log.w(TAG, "Medya fotoğrafı yüklenemedi: ${t?.message}"); if (tk == mediaTok) done(false) })
    }

    private fun mediaShowPoster(item: JSONObject, lang: String, done: (Boolean) -> Unit) {
        val st = lastTvState
        if (st == null) { done(false); return }
        val tk = ++mediaTok
        try {
            val pv = ensurePoster()
            clearPhotos()
            pv.visibility = View.VISIBLE
            pv.bind(item, st, lang.ifEmpty { "tr" })
            val wait = if (item.optString("image").isNotEmpty() || item.has("books")) 450L else 150L
            handler.postDelayed({
                if (tk == mediaTok) {
                    val prevVideo = mediaKind == "video"
                    mediaKind = "photo"
                    clearPhotos()
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
        clearPhotos()
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

        /** Sayfadaki tam ekran katman (uzaktan kumanda menüsü) açıkken yerel widget'lar arkada görünmesin. */
        @JavascriptInterface
        fun overlay(on: Boolean) { handler.post { overlayOn = on; nativeGrid?.visibility = if (on) View.INVISIBLE else View.VISIBLE } }

        /** Son dakika bildirim bandı: yerel çizilir, yerel widget'ların üstünde, opak zeminli. */
        @JavascriptInterface
        fun brkShow(title: String, source: String) = brkDraw(title, source, 0.02f)

        /** Aynı bant; sağ kenarı logoya binmesin diye sayfa, genişliğin kaçta kaçının boş kalacağını bildirir (APK 3.22+). */
        @JavascriptInterface
        fun brkShowR(title: String, source: String, right: Double) = brkDraw(title, source, right.toFloat().coerceIn(0.02f, 0.6f))

        private fun brkDraw(title: String, source: String, rightFrac: Float) {
            handler.post {
                try {
                    val H = resources.displayMetrics.heightPixels.toFloat(); val W = resources.displayMetrics.widthPixels.toFloat()
                    val vh = H / 100f
                    brkView?.let { binding.rootContainer.removeView(it) }
                    val bar = android.widget.LinearLayout(this@MainActivity).apply {
                        orientation = android.widget.LinearLayout.HORIZONTAL; gravity = android.view.Gravity.CENTER_VERTICAL
                        setPadding((W * 0.016f).toInt(), (vh * 1.6f).toInt(), (W * 0.016f).toInt(), (vh * 1.6f).toInt())
                        background = android.graphics.drawable.GradientDrawable().apply { setColor(android.graphics.Color.parseColor("#140606")); cornerRadius = vh * 1.4f; setStroke(maxOf(2, (vh * 0.3f).toInt()), android.graphics.Color.parseColor("#d6262a")) }
                        elevation = vh * 2f
                    }
                    fun tx(t: String, sizeVh: Float, color: Int, bold: Boolean) = android.widget.TextView(this@MainActivity).apply {
                        text = t; setTextColor(color); setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, vh * sizeVh); includeFontPadding = false
                        typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, if (bold) android.graphics.Typeface.BOLD else android.graphics.Typeface.NORMAL)
                    }
                    val chip = tx("SON DAKİKA", 2.1f, android.graphics.Color.WHITE, true).apply {
                        letterSpacing = 0.12f; setPadding((W * 0.012f).toInt(), (vh * 0.8f).toInt(), (W * 0.012f).toInt(), (vh * 0.8f).toInt())
                        background = android.graphics.drawable.GradientDrawable().apply { setColor(android.graphics.Color.parseColor("#d6262a")); cornerRadius = vh * 0.8f }
                    }
                    bar.addView(chip)
                    val head = tx(title, 2.9f, android.graphics.Color.WHITE, true).apply { maxLines = 2; ellipsize = android.text.TextUtils.TruncateAt.END; setLineSpacing(0f, 1.05f) }
                    bar.addView(head, android.widget.LinearLayout.LayoutParams(0, -2, 1f).apply { leftMargin = (W * 0.014f).toInt(); rightMargin = (W * 0.014f).toInt() })
                    if (source.isNotEmpty()) bar.addView(tx(source, 1.5f, android.graphics.Color.parseColor("#ffb0b0"), true))
                    val lp = FrameLayout.LayoutParams(-1, -2).apply { leftMargin = (W * 0.02f).toInt(); rightMargin = (W * rightFrac).toInt(); topMargin = (vh * 2f).toInt() }
                    binding.rootContainer.addView(bar, lp); bar.bringToFront()
                    bar.alpha = 0f; bar.translationY = -vh * 6; bar.animate().alpha(1f).translationY(0f).setDuration(450).start()
                    brkView = bar
                } catch (e: Exception) { Log.w(TAG, "Son dakika bandı çizilemedi: ${e.message}") }
            }
        }

        @JavascriptInterface
        fun brkHide() {
            handler.post {
                val v = brkView ?: return@post
                v.animate().alpha(0f).translationY(-v.height.toFloat()).setDuration(400).withEndAction { binding.rootContainer.removeView(v); if (brkView === v) brkView = null }.start()
            }
        }

        /** Sayfa açılırken son bilinen yerel hücre listesi: eski web widget'ları ilk karede bile çizilmesin. */
        @JavascriptInterface
        fun nativeCellsPref(): String = try { getSharedPreferences("native_cells", MODE_PRIVATE).getString("list", "") ?: "" } catch (_: Exception) { "" }

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

        /** Video, fotoğraf ve afiş katmanının köşeleri sayfadaki gibi yuvarlak (1.39vh). */
        private fun roundCorners(v: View) {
            if (v.clipToOutline) return
            val r = resources.displayMetrics.heightPixels * 0.0139f
            v.outlineProvider = object : android.view.ViewOutlineProvider() {
                override fun getOutline(view: View, o: android.graphics.Outline) { o.setRoundRect(0, 0, view.width, view.height, r) }
            }
            v.clipToOutline = true
        }

        @JavascriptInterface
        fun updateBounds(leftPx: Int, topPx: Int, widthPx: Int, heightPx: Int) {
            handler.post {
                if (widthPx > 0 && heightPx > 0) {
                    lastBounds = intArrayOf(leftPx, topPx, widthPx, heightPx)
                    // video ve fotoğraf katmanları birlikte konumlanır
                    for (v in listOfNotNull<View>(binding.playerView, binding.imageView, if (photoBInit) photoB else null, posterView)) {
                        roundCorners(v)
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
                    // büyük maç duyurusu ve kampanya kartı da aynı alanı (kenar payıyla) izler; sayfa düzeni sonradan oturunca kaymasın
                    val ins = (resources.displayMetrics.heightPixels * 0.006f).toInt()
                    for (v in listOfNotNull<View>(bigView, campView)) {
                        val p = v.layoutParams as FrameLayout.LayoutParams
                        val nl = leftPx + ins; val nt = topPx + ins; val nw = widthPx - 2 * ins; val nh = heightPx - 2 * ins
                        if (p.leftMargin != nl || p.topMargin != nt || p.width != nw || p.height != nh) {
                            p.leftMargin = nl; p.topMargin = nt; p.width = nw; p.height = nh; v.layoutParams = p
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
                posterView?.visibility = View.GONE // afişten fotoğrafa: afiş fotoğrafın üstünde kalmasın
                showPhotoSwap(fullUrl, if (fade) PHOTO_FADE_MS else 0L, { true }, {
                    binding.webView.evaluateJavascript("window.__imgShown && window.__imgShown(${JSONObject.quote(url)});", null)
                }, { t ->
                    Log.w(TAG, "Fotoğraf yüklenemedi: $fullUrl - ${t?.message}")
                    binding.webView.evaluateJavascript("window.__imgFailed && window.__imgFailed(${JSONObject.quote(url)});", null)
                })
            }
        }

        /** Yerel fotoğraf kalkar; görüntü de bırakılır (sonraki fotoğraf eskisinin üstünden değil boştan belirir). */
        @JavascriptInterface
        fun hideImage() {
            handler.post {
                clearPhotos()
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
                    clearPhotos()
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

        /** Kampanya kartı yerel çizilir (APK 3.13+); zamanlamayı sayfa yönetir. */
        @JavascriptInterface
        fun campShow(json: String) {
            handler.post {
                val st = lastTvState ?: return@post
                try {
                    val cv = campView ?: com.screenpano.tv.ui.nativeui.CampView(this@MainActivity).also {
                        it.visibility = View.GONE
                        binding.rootContainer.addView(it, binding.rootContainer.indexOfChild(binding.webView), FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                        campView = it
                    }
                    lastBounds?.let { b ->
                        val ins = (resources.displayMetrics.heightPixels * 0.006f).toInt()
                        val p = cv.layoutParams as FrameLayout.LayoutParams
                        p.leftMargin = b[0] + ins; p.topMargin = b[1] + ins; p.width = b[2] - 2 * ins; p.height = b[3] - 2 * ins; cv.layoutParams = p
                    }
                    cv.bind(JSONObject(json), st)
                    cv.alpha = 0f; cv.visibility = View.VISIBLE
                    cv.animate().alpha(1f).setDuration(900).start()
                } catch (e: Exception) { Log.w(TAG, "Kampanya çizilemedi: ${e.message}") }
            }
        }

        @JavascriptInterface
        fun campHide() { handler.post { campView?.let { it.animate().cancel(); it.visibility = View.GONE } } }

        @JavascriptInterface
        fun hasNativeCamp(): Boolean = true

        /** Gol kartı bilgi panelinin üstünde yerel çizilir (APK 3.15+). Sayfa yalnız html.nat-info varken çağırır. */
        @JavascriptInterface
        fun goalShow(json: String) { handler.post { try { nativeGrid?.goalShow(JSONObject(json)) } catch (e: Exception) { Log.w(TAG, "Gol kartı çizilemedi: ${e.message}") } } }

        @JavascriptInterface
        fun goalHide() { handler.post { nativeGrid?.goalHide() } }

        /** Büyük maç duyurusu (APK 3.14+): şimdilik yalnız "arena" tasarımı yerel; sayfa diğerlerini kendisi çizer. */
        @JavascriptInterface
        fun hasNativeBig(style: String): Boolean = com.screenpano.tv.ui.nativeui.BigArenaView.supports(style)

        @JavascriptInterface
        fun bigShow(json: String) {
            handler.post {
                val st = lastTvState ?: return@post
                try {
                    val bv = bigView ?: com.screenpano.tv.ui.nativeui.BigArenaView(this@MainActivity).also {
                        it.visibility = View.GONE
                        binding.rootContainer.addView(it, binding.rootContainer.indexOfChild(binding.webView), FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                        bigView = it
                    }
                    lastBounds?.let { b ->
                        val ins = (resources.displayMetrics.heightPixels * 0.006f).toInt()
                        val p = bv.layoutParams as FrameLayout.LayoutParams
                        p.leftMargin = b[0] + ins; p.topMargin = b[1] + ins; p.width = b[2] - 2 * ins; p.height = b[3] - 2 * ins; bv.layoutParams = p
                    }
                    val first = bv.visibility != View.VISIBLE
                    bv.bind(JSONObject(json), st)
                    if (first) { bv.alpha = 0f; bv.visibility = View.VISIBLE; bv.animate().alpha(1f).setDuration(900).start() }
                } catch (e: Exception) { Log.w(TAG, "Büyük maç çizilemedi: ${e.message}") }
            }
        }

        @JavascriptInterface
        fun bigHide() { handler.post { bigView?.let { it.animate().cancel(); it.visibility = View.GONE } } }

        /** Yerel medya motoru: sayfa araya girenleri bitirdi, sıradaki içerik. */
        @JavascriptInterface
        fun mediaResume() { handler.post { mediaEngine.resume() } }

        @JavascriptInterface
        fun mediaLang(lang: String) { handler.post { mediaEngine.setLang(lang) } }

        @JavascriptInterface
        fun hasNativeMedia(): Boolean = NATIVE_MEDIA

        /** Sayfa ekrandaki bağlamı bildirir (gol / büyük maç / kampanya / fragman / medya türü): QR kartı buna göre gizlenir. */
        @JavascriptInterface
        fun qrCtx(ctx: String) { handler.post { com.screenpano.tv.ui.nativeui.NativeEnv.updateCtx(ctx) } }

        @JavascriptInterface
        fun getToken(): String = prefs.getDeviceToken()

        @JavascriptInterface
        fun saveToken(t: String?) {
            val old = prefs.getDeviceToken()
            prefs.saveDeviceToken(t)
            if ((t ?: "") != old) handler.post { tvSocket?.reconnect() } // yeni/silinen token: yerel bağlantı hemen buna göre kurulur
        }

        /** Tek bağlantı: sayfa kendi WebSocket'ini açmaz, yerel bağlantıya bağlanır (ağ, sunucu ve bellek yükü yarıya iner). */
        @JavascriptInterface
        fun wsAttach() {
            handler.post {
                pageWs = true
                val s = tvSocket ?: return@post
                if (s.connected) toPage("window.__wsEvt&&window.__wsEvt('open')")
                s.replay { text -> toPage("window.__wsIn&&window.__wsIn(" + jsStr(text) + ")") }
            }
        }

        @JavascriptInterface
        fun wsSend(text: String) { tvSocket?.sendRaw(text) }

        @JavascriptInterface
        fun wsReconnect() { handler.post { tvSocket?.reconnect() } }

        /** CPU / RAM / grafik belleği / GPU adı (JSON); panelde Cihazlar kartında görünür. */
        @JavascriptInterface
        fun sysInfo(): String = try { SysStats.json(this@MainActivity) } catch (_: Throwable) { "{}" }

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
            val shot = java.util.concurrent.atomic.AtomicReference<Bitmap?>(null)
            val done = CountDownLatch(1)
            runOnUiThread {
                try {
                    val w = binding.root.width
                    val h = binding.root.height
                    if (w <= 0 || h <= 0) { done.countDown(); return@runOnUiThread }
                    val k = (960f / w).coerceAtMost(1f)
                    val tw = (w * k).toInt().coerceAtLeast(1)
                    val th = (h * k).toInt().coerceAtLeast(1)
                    // JPEG sıkıştırma ve Base64 ana iş parçacığında yapılmaz (zayıf kutuda kare atlatıyordu): çağıran köprü iş parçacığında yapılır
                    val finish = { b: Bitmap -> shot.set(b) }
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
            val b = shot.getAndSet(null) ?: return out[0]
            return try {
                val stream = ByteArrayOutputStream()
                b.compress(Bitmap.CompressFormat.JPEG, 70, stream)
                "data:image/jpeg;base64," + Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
            } catch (_: Throwable) { "" } finally { b.recycle() }
        }

        /** "live" ya da "test": ekran şu an hangi sunucuya bağlı. */
        @JavascriptInterface
        fun env(): String = if (prefs.isTest()) "test" else "live"

        /** Canlı ↔ test sunucusu: ortam kaydedilir, uygulama yeniden kurulur (her ortamın kendi giriş anahtarı saklanır). */
        /** T3: medya kutusunun doldurma biçimi (sayfa durum gelince bildirir). */
        @JavascriptInterface
        fun mediaFit(m: String) { mediaFit = if (m == "cover" || m == "contain") m else "auto" }

        /** Sayfa gerçekten açıldı (tv.html başlangıçta çağırır): test ortamı geri dönüş sayacı iptal. */
        @JavascriptInterface
        fun pageReady() { pageIsReady = true; handler.removeCallbacks(readyWatch) }

        @JavascriptInterface
        fun switchEnv() {
            runOnUiThread {
                prefs.setTest(!prefs.isTest())
                recreate()
            }
        }

        /** Açılışta kendiliğinden başlayabilir mi: "ok", "izin-yok" (Android 10+ izin verilmemiş). */
        @JavascriptInterface
        fun bootStatus(): String = if (Build.VERSION.SDK_INT < 29 || android.provider.Settings.canDrawOverlays(this@MainActivity)) "ok" else "izin-yok"

        @JavascriptInterface
        fun installUpdate(url: String) {
            runOnUiThread {
                startUpdate(url, 0)
            }
        }

        /** Aynı işlem; sunucudaki sürüm kodu da bildirilir: indirilmiş uygun APK varsa yeniden indirilmez (APK 3.23+). */
        @JavascriptInterface
        fun installUpdateV(url: String, versionCode: Int) {
            runOnUiThread {
                startUpdate(url, versionCode)
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

    /** Bekleyen güncelleme: "bilinmeyen kaynak" izni için ayar ekranına gidildiyse, dönüşte kendiliğinden devam eder (tekrar basmaya gerek kalmaz). */
    private var pendingUpdate: Pair<String, Int>? = null

    /** İndirilmiş APK'nın sürüm kodu; okunamazsa -1. */
    private fun apkVersionCode(f: File): Long {
        return try {
            val info = packageManager.getPackageArchiveInfo(f.absolutePath, 0) ?: return -1L
            if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
        } catch (e: Throwable) { -1L }
    }

    private fun startUpdate(url: String, wantCode: Int) {
        if (isUpdating) return
        val curHost = binding.webView.url?.split("/tv")?.getOrNull(0) ?: baseUrl
        if (!url.startsWith("$baseUrl/") && !url.startsWith("$curHost/")) {
            updateStatus("Geçersiz güncelleme adresi")
            return
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !packageManager.canRequestPackageInstalls()) {
            pendingUpdate = Pair(url, wantCode)
            updateStatus("Açılan ekranda bu uygulama için izni açıp geri dönün; güncelleme kendiliğinden devam edecek")
            val i = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName"))
            startActivity(i)
            return
        }

        // Daha önce indirilmiş (tam) ve yeni sürümü taşıyan APK varsa yeniden indirmeden doğrudan yükleyiciyi aç
        val targetApk = UpdateProvider.apkFile(this)
        if (targetApk.exists() && targetApk.length() > 0) {
            val have = apkVersionCode(targetApk)
            val cur = try { BuildConfig.VERSION_CODE.toLong() } catch (e: Throwable) { 0L }
            val usable = have > cur && (wantCode <= 0 || have == wantCode.toLong())
            if (usable) { updateStatus("İndirilmiş sürüm hazır, yükleme ekranı açılıyor…"); launchInstaller(targetApk); return }
        }

        isUpdating = true
        updateStatus("İndiriliyor…")

        lifecycleScope.launch(Dispatchers.IO) {
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
        // önce PackageInstaller oturumu (içerik adresi/izin devri gerektirmez); olmazsa eski ACTION_VIEW yoluna düşer
        UpdateBus.onStatus = { msg -> updateStatus(msg) }
        try {
            com.screenpano.tv.receiver.UpdateInstaller.install(this, f)
            updateStatus("Yükleme ekranı hazırlanıyor…")
            return
        } catch (e: Throwable) {
            Log.w(TAG, "Oturumlu yükleme başlamadı, eski yola düşülüyor: ${e.message}")
        }
        launchInstallerView(f)
    }

    private fun launchInstallerView(f: File) {
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
                // Test ortamında sayfa açılmadıysa menü tuşu canlıya döndürür (kurtarma)
                if (prefs.isTest() && !pageIsReady) { fallbackToLive(); return true }
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
        // izin ekranından dönüldü: izin verildiyse güncelleme kaldığı yerden devam eder, verilmediyse nedenini söyler
        pendingUpdate?.let { p ->
            pendingUpdate = null
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || packageManager.canRequestPackageInstalls()) startUpdate(p.first, p.second)
            else updateStatus("İzin verilmedi: güncelleme için “Bu kaynaktan izin ver” seçeneği açık olmalı")
        }
        binding.webView.onResume()
        binding.webView.requestFocus()
        if (playOnResume) exoPlayer?.play() // yalnız duraklatılmadan önce oynuyorsa (durdurulmuş video arka planda oynamasın)
    }

    private var playOnResume = false
    override fun onPause() {
        playOnResume = exoPlayer?.playWhenReady == true
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
