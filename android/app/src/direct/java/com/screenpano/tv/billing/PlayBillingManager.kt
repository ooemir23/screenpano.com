package com.screenpano.tv.billing

import android.app.Activity
import org.json.JSONArray
import org.json.JSONObject

/**
 * Web / doğrudan APK ("direct") sürümü için boş Billing yöneticisi.
 * Bu sürümde Google Play Billing kütüphanesi bulunmaz; ödemeler web panelinden (PayTR / iyzico) yapılır.
 */
class PlayBillingManager(
    @Suppress("UNUSED_PARAMETER") private val activity: Activity,
    @Suppress("UNUSED_PARAMETER") private val onEvent: (String, JSONObject) -> Unit
) {
    fun start() {}
    fun registerAndQueryCatalog(
        @Suppress("UNUSED_PARAMETER") subsCsv: String,
        @Suppress("UNUSED_PARAMETER") inAppCsv: String = ""
    ) {}
    fun queryProducts(@Suppress("UNUSED_PARAMETER") productIds: List<String>) {}
    fun launchSubscription(
        @Suppress("UNUSED_PARAMETER") productId: String,
        @Suppress("UNUSED_PARAMETER") basePlanId: String,
        @Suppress("UNUSED_PARAMETER") tenantId: String,
        @Suppress("UNUSED_PARAMETER") addonKey: String = ""
    ) {}
    fun launchPurchase(
        @Suppress("UNUSED_PARAMETER") productId: String,
        @Suppress("UNUSED_PARAMETER") basePlanId: String,
        @Suppress("UNUSED_PARAMETER") productType: String,
        @Suppress("UNUSED_PARAMETER") tenantId: String,
        @Suppress("UNUSED_PARAMETER") addonKey: String = ""
    ) {}
    fun consumePurchase(@Suppress("UNUSED_PARAMETER") purchaseToken: String) {}
    fun activeEntitlementsJson(): String = JSONObject().put("keys", JSONArray()).put("items", JSONArray()).toString()
    fun queryActivePurchases() {}
    fun release() {}
}
