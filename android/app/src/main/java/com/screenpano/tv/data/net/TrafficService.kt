package com.screenpano.tv.data.net

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import kotlin.math.roundToInt

data class TrafficData(val all: Int, val asia: Int, val europe: Int, val timestamp: Long)

/**
 * İBB trafik endeksi. İBB'nin servisi Türkiye dışındaki sunuculara kapalı olduğu için endeksi kutu
 * kendisi çeker ve sayfaya window.__nativeTraffic(...) ile verir.
 */
class TrafficService {
    private val http = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    suspend fun fetchIbbTraffic(): TrafficData? = withContext(Dispatchers.IO) {
        try {
            val req = Request.Builder().url(IBB_URL)
                .header("Accept", "application/json")
                .header("User-Agent", "ScreenPano-TV (Android)")
                .build()
            http.newCall(req).execute().use { r ->
                if (!r.isSuccessful) return@withContext null
                val body = r.body?.string()?.trim() ?: return@withContext null
                val all: Double; val asia: Double; val europe: Double
                if (body.startsWith("{")) { // JSON: {"TI":9,"TI_An":4,"TI_Av":13}
                    val j = JSONObject(body)
                    all = j.getDouble("TI"); asia = j.getDouble("TI_An"); europe = j.getDouble("TI_Av")
                } else { // XML: <TI>9</TI><TI_An>4</TI_An><TI_Av>13</TI_Av>
                    all = tag(body, "TI") ?: return@withContext null
                    asia = tag(body, "TI_An") ?: return@withContext null
                    europe = tag(body, "TI_Av") ?: return@withContext null
                }
                TrafficData(all.roundToInt(), asia.roundToInt(), europe.roundToInt(), System.currentTimeMillis())
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun tag(s: String, name: String): Double? =
        Regex("<$name[^>]*>\\s*([0-9.,]+)\\s*</$name>", RegexOption.IGNORE_CASE)
            .find(s)?.groupValues?.get(1)?.replace(',', '.')?.toDoubleOrNull()

    companion object {
        const val IBB_URL = "https://api.ibb.gov.tr/tkmservices/api/TrafficData/v1/TrafficIndex_Sc1_Cont"
    }
}
