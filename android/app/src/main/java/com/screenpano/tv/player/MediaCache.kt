package com.screenpano.tv.player

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import java.io.File

@OptIn(UnstableApi::class)
object MediaCache {
    private const val MAX_CACHE_SIZE = 512L * 1024 * 1024 // 512 MB disk önbellek
    private var simpleCache: SimpleCache? = null

    @Synchronized
    fun init(context: Context) {
        if (simpleCache == null) {
            val cacheDir = File(context.cacheDir, "exoplayer_media_cache")
            val databaseProvider = StandaloneDatabaseProvider(context)
            val evictor = LeastRecentlyUsedCacheEvictor(MAX_CACHE_SIZE)
            simpleCache = SimpleCache(cacheDir, evictor, databaseProvider)
        }
    }

    @Synchronized
    fun getCache(): SimpleCache? = simpleCache

    fun buildCacheDataSourceFactory(context: Context): DataSource.Factory {
        val httpDataSourceFactory = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15000)
            .setReadTimeoutMs(30000)
            .setUserAgent("ScreenPano-ExoPlayer/2.2 (Android TV)")

        val upstreamFactory = DefaultDataSource.Factory(context, httpDataSourceFactory)

        val cache = simpleCache
        return if (cache != null) {
            CacheDataSource.Factory()
                .setCache(cache)
                .setUpstreamDataSourceFactory(upstreamFactory)
                .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
        } else {
            upstreamFactory
        }
    }
}
