package com.screenpano.tv.data.net

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Sunucuyla doğrudan konuşan küçük istemci: şimdilik yalnız güncelleme APK'sını indirir. */
class ApiClient {
    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .followRedirects(true)
        .build()

    /**
     * Dosyayı önce geçici adla indirir, tamamlanınca yerine taşır (yarım kalan indirme yükleyiciye gitmez).
     * onProgress yüzde değiştikçe çağrılır.
     */
    suspend fun downloadFile(url: String, target: File, onProgress: (Int) -> Unit): Result<File> = withContext(Dispatchers.IO) {
        runCatching {
            target.parentFile?.mkdirs()
            val tmp = File(target.parentFile, target.name + ".part")
            val req = Request.Builder().url(url).header("Cache-Control", "no-cache").build()
            http.newCall(req).execute().use { r ->
                if (!r.isSuccessful) throw IOException("HTTP ${r.code}")
                val body = r.body ?: throw IOException("boş yanıt")
                val total = body.contentLength()
                var done = 0L
                var last = -1
                body.byteStream().use { input ->
                    tmp.outputStream().use { out ->
                        val buf = ByteArray(64 * 1024)
                        while (true) {
                            val n = input.read(buf)
                            if (n < 0) break
                            out.write(buf, 0, n)
                            done += n
                            if (total > 0) {
                                val p = (done * 100 / total).toInt()
                                if (p != last) { last = p; onProgress(p) }
                            }
                        }
                    }
                }
                if (total > 0 && done != total) throw IOException("indirme yarım kaldı")
            }
            if (target.exists()) target.delete()
            if (!tmp.renameTo(target)) throw IOException("dosya yerine konamadı")
            target
        }
    }
}
