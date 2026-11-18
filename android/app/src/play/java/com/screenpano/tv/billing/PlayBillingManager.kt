package com.screenpano.tv.billing

import android.app.Activity
import android.util.Log
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.ConsumeParams
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * Google Play Billing yöneticisi (yalnız "play" flavor'ında derlenir).
 * 1) Ana paket aboneliklerini ("baslangic", "pro" — aylık/yıllık),
 * 2) İleride eklenecek modüler ek özellik aylık aboneliklerini (ProductType.SUBS, örn. "addon_*"),
 * 3) Tek seferlik uygulama içi satın alımları (ProductType.INAPP)
 * tek bir dinamik katalog üzerinden yönetir.
 */
class PlayBillingManager(
    private val activity: Activity,
    private val onEvent: (String, JSONObject) -> Unit
) : PurchasesUpdatedListener {

    private var billingClient: BillingClient? = null
    private val subsCache = ConcurrentHashMap<String, ProductDetails>()
    private val inAppCache = ConcurrentHashMap<String, ProductDetails>()
    private val registeredSubs = linkedSetOf("baslangic", "pro", "tahmin_ligi")
    private val registeredInApps = linkedSetOf<String>()
    private val activeEntitlements = ConcurrentHashMap<String, JSONObject>()

    fun start() {
        if (billingClient?.isReady == true) return
        val client = BillingClient.newBuilder(activity)
            .setListener(this)
            .enablePendingPurchases(
                PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()
            )
            .build()
        billingClient = client
        client.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    queryCatalog(registeredSubs.toList(), registeredInApps.toList())
                    queryActivePurchases()
                } else {
                    Log.w(TAG, "Billing kurulum hatası: ${result.debugMessage}")
                }
            }

            override fun onBillingServiceDisconnected() {
                Log.w(TAG, "Billing bağlantısı koptu")
            }
        })
    }

    /**
     * Sunucudan veya web arayüzünden gelen yeni aylık ek özellik aboneliklerini (SUBS)
     * ve tek seferlik ürünleri (INAPP) dinamik olarak kataloğa ekler ve fiyatlarını sorgular.
     */
    fun registerAndQueryCatalog(subsCsv: String, inAppCsv: String = "") {
        subsCsv.split(',').map { it.trim() }.filter { it.isNotEmpty() }.forEach { registeredSubs.add(it) }
        inAppCsv.split(',').map { it.trim() }.filter { it.isNotEmpty() }.forEach { registeredInApps.add(it) }
        queryCatalog(registeredSubs.toList(), registeredInApps.toList())
    }

    fun queryProducts(productIds: List<String>) {
        productIds.filter { it.isNotBlank() }.forEach { registeredSubs.add(it) }
        queryCatalog(registeredSubs.toList(), registeredInApps.toList())
    }

    fun queryCatalog(subIds: List<String>, inAppIds: List<String>) {
        val client = billingClient ?: return
        if (!client.isReady) { start(); return }

        if (subIds.isNotEmpty()) {
            val subProducts = subIds.map { id ->
                QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(id)
                    .setProductType(BillingClient.ProductType.SUBS)
                    .build()
            }
            val subParams = QueryProductDetailsParams.newBuilder().setProductList(subProducts).build()
            client.queryProductDetailsAsync(subParams) { result, detailsResult ->
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    val arr = JSONArray()
                    for (d in detailsResult.productDetailsList) {
                        subsCache[d.productId] = d
                        val plans = JSONArray()
                        d.subscriptionOfferDetails?.forEach { offer ->
                            val phases = JSONArray()
                            offer.pricingPhases.pricingPhaseList.forEach { ph ->
                                phases.put(
                                    JSONObject()
                                        .put("formattedPrice", ph.formattedPrice)
                                        .put("priceMicros", ph.priceAmountMicros)
                                        .put("currency", ph.priceCurrencyCode)
                                        .put("billingPeriod", ph.billingPeriod)
                                )
                            }
                            plans.put(
                                JSONObject()
                                    .put("basePlanId", offer.basePlanId)
                                    .put("offerId", offer.offerId ?: "")
                                    .put("offerToken", offer.offerToken)
                                    .put("tags", JSONArray(offer.offerTags))
                                    .put("phases", phases)
                            )
                        }
                        arr.put(
                            JSONObject()
                                .put("productId", d.productId)
                                .put("productType", "subs")
                                .put("title", d.title)
                                .put("description", d.description)
                                .put("plans", plans)
                        )
                    }
                    onEvent("products", JSONObject().put("items", arr))
                }
            }
        }

        if (inAppIds.isNotEmpty()) {
            val inAppProducts = inAppIds.map { id ->
                QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(id)
                    .setProductType(BillingClient.ProductType.INAPP)
                    .build()
            }
            val inAppParams = QueryProductDetailsParams.newBuilder().setProductList(inAppProducts).build()
            client.queryProductDetailsAsync(inAppParams) { result, detailsResult ->
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    val arr = JSONArray()
                    for (d in detailsResult.productDetailsList) {
                        inAppCache[d.productId] = d
                        val oneTime = d.oneTimePurchaseOfferDetails
                        arr.put(
                            JSONObject()
                                .put("productId", d.productId)
                                .put("productType", "inapp")
                                .put("title", d.title)
                                .put("description", d.description)
                                .put("formattedPrice", oneTime?.formattedPrice ?: "")
                                .put("priceMicros", oneTime?.priceAmountMicros ?: 0L)
                                .put("currency", oneTime?.priceCurrencyCode ?: "")
                        )
                    }
                    onEvent("inapp_products", JSONObject().put("items", arr))
                }
            }
        }
    }

    /**
     * Ana paket aboneliği veya aylık ek özellik aboneliği (SUBS) satın alma akışını başlatır.
     */
    fun launchSubscription(productId: String, basePlanId: String, tenantId: String, addonKey: String = "") {
        launchPurchase(productId, basePlanId, "subs", tenantId, addonKey)
    }

    /**
     * Hem aylık abonelikler (productType = "subs") hem de tek seferlik özellikler (productType = "inapp")
     * için ortak satın alma başlatıcısı.
     * - tenantId -> obfuscatedAccountId (işletme / org kimliği)
     * - addonKey -> obfuscatedProfileId (ek özellik anahtarı veya hedef şube/cihaz kimliği)
     */
    fun launchPurchase(
        productId: String,
        basePlanId: String,
        productType: String,
        tenantId: String,
        addonKey: String = ""
    ) {
        val client = billingClient
        if (client == null || !client.isReady) {
            onEvent("error", JSONObject().put("message", "Google Play Store bağlantısı hazır değil"))
            start()
            return
        }

        val isInApp = productType.equals("inapp", ignoreCase = true)
        val details = if (isInApp) inAppCache[productId] else subsCache[productId]
        if (details == null) {
            if (isInApp) registeredInApps.add(productId) else registeredSubs.add(productId)
            queryCatalog(registeredSubs.toList(), registeredInApps.toList())
            onEvent("error", JSONObject().put("message", "Ürün bilgisi yükleniyor, lütfen tekrar deneyin: $productId"))
            return
        }

        val productParamsBuilder = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(details)

        if (!isInApp) {
            val offer = details.subscriptionOfferDetails?.firstOrNull {
                basePlanId.isEmpty() || it.basePlanId == basePlanId
            } ?: details.subscriptionOfferDetails?.firstOrNull()

            if (offer == null) {
                onEvent("error", JSONObject().put("message", "Uygun abonelik planı bulunamadı: $productId ($basePlanId)"))
                return
            }
            productParamsBuilder.setOfferToken(offer.offerToken)
        }

        val flowBuilder = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(listOf(productParamsBuilder.build()))

        if (tenantId.isNotBlank()) {
            flowBuilder.setObfuscatedAccountId(tenantId)
        }
        if (addonKey.isNotBlank()) {
            flowBuilder.setObfuscatedProfileId(addonKey)
        }

        activity.runOnUiThread {
            client.launchBillingFlow(activity, flowBuilder.build())
        }
    }

    fun queryActivePurchases() {
        val client = billingClient ?: return
        if (!client.isReady) return

        val subsParams = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.SUBS)
            .build()
        client.queryPurchasesAsync(subsParams) { result, purchases ->
            if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                for (p in purchases) handlePurchase(p, "subs")
                emitEntitlements()
            }
        }

        val inAppParams = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.INAPP)
            .build()
        client.queryPurchasesAsync(inAppParams) { result, purchases ->
            if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                for (p in purchases) handlePurchase(p, "inapp")
                emitEntitlements()
            }
        }
    }

    /** Tüketilebilir (tekrar satın alınabilir) tek seferlik ürünleri tüketir. */
    fun consumePurchase(purchaseToken: String) {
        val client = billingClient ?: return
        val params = ConsumeParams.newBuilder().setPurchaseToken(purchaseToken).build()
        client.consumeAsync(params) { result, token ->
            if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                onEvent("consumed", JSONObject().put("purchaseToken", token))
            }
        }
    }

    fun activeEntitlementsJson(): String {
        val arr = JSONArray()
        activeEntitlements.values.forEach { arr.put(it) }
        return JSONObject()
            .put("keys", JSONArray(activeEntitlements.keys.toList()))
            .put("items", arr)
            .toString()
    }

    private fun emitEntitlements() {
        val arr = JSONArray()
        activeEntitlements.values.forEach { arr.put(it) }
        onEvent(
            "entitlements",
            JSONObject()
                .put("keys", JSONArray(activeEntitlements.keys.toList()))
                .put("items", arr)
        )
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
        if (result.responseCode == BillingClient.BillingResponseCode.OK && purchases != null) {
            for (p in purchases) handlePurchase(p, "auto")
            emitEntitlements()
        } else if (result.responseCode != BillingClient.BillingResponseCode.USER_CANCELED) {
            onEvent(
                "error",
                JSONObject()
                    .put("code", result.responseCode)
                    .put("message", result.debugMessage)
            )
        }
    }

    private fun handlePurchase(purchase: Purchase, sourceType: String) {
        if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED) return
        val payload = JSONObject()
            .put("purchaseToken", purchase.purchaseToken)
            .put("orderId", purchase.orderId ?: "")
            .put("packageName", purchase.packageName)
            .put("productType", sourceType)
            .put("products", JSONArray(purchase.products))
            .put("autoRenewing", purchase.isAutoRenewing)
            .put("purchaseTime", purchase.purchaseTime)
            .put("accountId", purchase.accountIdentifiers?.obfuscatedAccountId ?: "")
            .put("addonKey", purchase.accountIdentifiers?.obfuscatedProfileId ?: "")
            .put("acknowledged", purchase.isAcknowledged)

        for (prodId in purchase.products) {
            activeEntitlements[prodId] = payload
        }
        onEvent("purchase", payload)

        if (!purchase.isAcknowledged) {
            val ack = AcknowledgePurchaseParams.newBuilder()
                .setPurchaseToken(purchase.purchaseToken)
                .build()
            billingClient?.acknowledgePurchase(ack) { res ->
                if (res.responseCode != BillingClient.BillingResponseCode.OK) {
                    Log.w(TAG, "Satın alma onaylanamadı: ${res.debugMessage}")
                }
            }
        }
    }

    fun release() {
        try { billingClient?.endConnection() } catch (_: Throwable) {}
        billingClient = null
    }

    companion object {
        private const val TAG = "PlayBilling"
    }
}
