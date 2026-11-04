package com.screenpano.tv.player

import android.content.Context
import android.net.Uri
import android.util.Log
import android.view.View
import android.widget.ImageView
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem as ExoMediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import coil.load
import com.screenpano.tv.data.model.MediaItem
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(UnstableApi::class)
class ExoPlayerManager(
    private val context: Context,
    private val playerView: PlayerView,
    private val imageView: ImageView,
    private val onMediaStarted: (MediaItem) -> Unit,
    private val onMediaEnded: (MediaItem, Long) -> Unit
) {
    private var exoPlayer: ExoPlayer? = null
    private var playlist: List<MediaItem> = emptyList()
    private var currentIndex = 0
    private var defaultImageSec = 8
    private var timerJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.Main + Job())
    private var itemStartTime = 0L

    init {
        initPlayer()
    }

    private fun initPlayer() {
        val renderersFactory = DefaultRenderersFactory(context)
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_OFF)
            .setEnableDecoderFallback(true)

        val dataSourceFactory = MediaCache.buildCacheDataSourceFactory(context)
        val mediaSourceFactory = DefaultMediaSourceFactory(dataSourceFactory)

        exoPlayer = ExoPlayer.Builder(context, renderersFactory)
            .setMediaSourceFactory(mediaSourceFactory)
            .build()
            .apply {
                volume = 0f // TV menü panosu genellikle sessiz video oynatır
                repeatMode = Player.REPEAT_MODE_OFF
                playWhenReady = true

                addListener(object : Player.Listener {
                    override fun onPlaybackStateChanged(playbackState: Int) {
                        when (playbackState) {
                            Player.STATE_ENDED -> {
                                onCurrentItemFinished()
                            }
                            Player.STATE_READY -> {
                                Log.d(TAG, "ExoPlayer hazır: oynatılıyor")
                            }
                            else -> {}
                        }
                    }

                    override fun onPlayerError(error: PlaybackException) {
                        Log.e(TAG, "ExoPlayer oynatma hatası: ${error.message}", error)
                        // Hata durumunda ekran kilitlenmesin, 2 sn sonra bir sonraki medyaya geç
                        scope.launch {
                            delay(2000)
                            next()
                        }
                    }
                })
            }

        playerView.player = exoPlayer
        playerView.useController = false
    }

    fun setPlaylist(items: List<MediaItem>, defaultImageSeconds: Int) {
        val filtered = items.filter { it.url.isNotBlank() }
        this.defaultImageSec = if (defaultImageSeconds in 3..60) defaultImageSeconds else 8

        val wasEmpty = playlist.isEmpty()
        playlist = filtered

        if (playlist.isEmpty()) {
            stop()
            playerView.visibility = View.GONE
            imageView.visibility = View.VISIBLE
            return
        }

        if (wasEmpty || currentIndex >= playlist.size) {
            currentIndex = 0
            playCurrent()
        }
    }

    private fun playCurrent() {
        timerJob?.cancel()
        if (playlist.isEmpty()) return
        if (currentIndex !in playlist.indices) currentIndex = 0

        val item = playlist[currentIndex]
        itemStartTime = System.currentTimeMillis()
        onMediaStarted(item)

        val isVideo = item.type.equals("video", ignoreCase = true) ||
                item.url.endsWith(".mp4", ignoreCase = true) ||
                item.url.endsWith(".m3u8", ignoreCase = true) ||
                item.url.endsWith(".webm", ignoreCase = true)

        if (isVideo) {
            imageView.visibility = View.GONE
            playerView.visibility = View.VISIBLE

            try {
                val mediaItem = ExoMediaItem.fromUri(Uri.parse(item.url))
                exoPlayer?.setMediaItem(mediaItem)
                exoPlayer?.prepare()
                exoPlayer?.play()
            } catch (e: Exception) {
                Log.e(TAG, "Video başlatılamadı: ${item.url}", e)
                scope.launch {
                    delay(2000)
                    next()
                }
            }
        } else {
            // Görsel / Afiş / Poster
            exoPlayer?.stop()
            playerView.visibility = View.GONE
            imageView.visibility = View.VISIBLE

            imageView.load(item.url) {
                crossfade(400)
                listener(
                    onError = { _, result ->
                        Log.w(TAG, "Görsel yüklenemedi: ${item.url} - ${result.throwable.message}")
                    }
                )
            }

            val durationSec = item.duration ?: defaultImageSec
            timerJob = scope.launch {
                delay(durationSec * 1000L)
                onCurrentItemFinished()
            }
        }
    }

    private fun onCurrentItemFinished() {
        if (playlist.isEmpty()) return
        val item = playlist.getOrNull(currentIndex)
        val elapsedSec = (System.currentTimeMillis() - itemStartTime) / 1000
        if (item != null) {
            onMediaEnded(item, elapsedSec)
        }
        next()
    }

    fun next() {
        if (playlist.isEmpty()) return
        currentIndex = (currentIndex + 1) % playlist.size
        playCurrent()
    }

    fun getCurrentItem(): MediaItem? {
        return playlist.getOrNull(currentIndex)
    }

    fun pause() {
        timerJob?.cancel()
        exoPlayer?.pause()
    }

    fun resume() {
        if (playlist.isNotEmpty()) {
            playCurrent()
        }
    }

    fun stop() {
        timerJob?.cancel()
        exoPlayer?.stop()
    }

    fun release() {
        timerJob?.cancel()
        exoPlayer?.release()
        exoPlayer = null
    }

    companion object {
        private const val TAG = "ExoPlayerManager"
    }
}
