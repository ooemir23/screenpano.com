package com.screenpano.tv;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.util.Base64;
import android.graphics.Color;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * TV uygulaması: sunucudaki /tv sayfasını tam ekran web görünümünde açar.
 * Sunucu adresi derleme sırasında BuildConfig.BASE_URL ile verilir (tek APK, tüm işletmeler).
 * Giriş sonrası verilen cihaz token'ı SharedPreferences'ta saklanır; sayfa window.TVNative.getToken() ile okur.
 * İBB trafik endeksini cihazın kendisi çeker (tarayıcı/CORS engeli yok, cihaz Türkiye'de)
 * ve sayfaya window.__nativeTraffic(...) ile verir.
 */
public class MainActivity extends Activity {

    private static final String BASE_URL = BuildConfig.BASE_URL.replaceAll("/+$", "");
    private static final String TV_URL = BASE_URL + "/tv";
    private static final String IBB_URL = "https://api.ibb.gov.tr/tkmservices/api/TrafficData/v1/TrafficIndex_Sc1_Cont";
    private static final long TRAFFIC_OK_MS = 2 * 60 * 1000;     // başarılıysa 2 dk'da bir
    private static final long TRAFFIC_RETRY_MS = 30 * 1000;      // başarısızsa 30 sn sonra
    private static final long RELOAD_ON_ERROR_MS = 15 * 1000;    // bağlantı hatasında sayfayı yeniden dene

    private WebView web;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private volatile String lastTrafficJson = null;
    private boolean stopped = false;

    private final Runnable trafficTask = new Runnable() {
        @Override public void run() {
            new Thread(new Runnable() {
                @Override public void run() {
                    String json = fetchIbb();
                    if (json != null) lastTrafficJson = json;
                    final boolean ok = json != null;
                    handler.post(new Runnable() {
                        @Override public void run() {
                            pushTraffic();
                            if (!stopped) handler.postDelayed(trafficTask, ok ? TRAFFIC_OK_MS : TRAFFIC_RETRY_MS);
                        }
                    });
                }
            }).start();
        }
    };

    private final Runnable reloadTask = new Runnable() {
        @Override public void run() { if (web != null) web.loadUrl(TV_URL); }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        web.addJavascriptInterface(new Bridge(), "TVNative");
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        web.setWebChromeClient(new WebChromeClient() {
            // Android'in video yüklenirken gösterdiği varsayılan "play" simgesini kaldırır
            @Override public Bitmap getDefaultVideoPoster() {
                return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
            }
            @Override public View getVideoLoadingProgressView() {
                return new View(MainActivity.this);
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                handler.removeCallbacks(reloadTask);
                pushTraffic(); // sayfa yüklenince son İBB değerini hemen ver
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (Build.VERSION.SDK_INT >= 21 && request.isForMainFrame()) {
                    handler.removeCallbacks(reloadTask);
                    handler.postDelayed(reloadTask, RELOAD_ON_ERROR_MS);
                }
            }
            @SuppressWarnings("deprecation")
            @Override public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                handler.removeCallbacks(reloadTask);
                handler.postDelayed(reloadTask, RELOAD_ON_ERROR_MS);
            }
        });
        setContentView(web);
        hideSystemUi();
        web.loadUrl(TV_URL);
        handler.post(trafficTask);
    }

    /** İBB endeksini çeker; {"all":..,"asia":..,"europe":..,"ts":..} döner, olmazsa null. */
    private String fetchIbb() {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(IBB_URL).openConnection();
            c.setConnectTimeout(10000);
            c.setReadTimeout(10000);
            c.setRequestProperty("Accept", "application/json");
            c.setRequestProperty("User-Agent", "TVApp/2.0 (Android)");
            if (c.getResponseCode() != 200) return null;
            BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
            r.close();
            String body = sb.toString().trim();
            double all, asia, europe;
            if (body.startsWith("{")) { // JSON: {"TI":9,"TI_An":4,"TI_Av":13}
                JSONObject j = new JSONObject(body);
                all = j.getDouble("TI"); asia = j.getDouble("TI_An"); europe = j.getDouble("TI_Av");
            } else {                    // XML: <TI>9</TI><TI_An>4</TI_An><TI_Av>13</TI_Av>
                Double a = tag(body, "TI"), b = tag(body, "TI_An"), e = tag(body, "TI_Av");
                if (a == null || b == null || e == null) return null;
                all = a; asia = b; europe = e;
            }
            JSONObject out = new JSONObject();
            out.put("all", Math.round(all));
            out.put("asia", Math.round(asia));
            out.put("europe", Math.round(europe));
            out.put("ts", System.currentTimeMillis());
            return out.toString();
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static Double tag(String s, String name) {
        Matcher m = Pattern.compile("<" + name + "[^>]*>\\s*([0-9.,]+)\\s*</" + name + ">", Pattern.CASE_INSENSITIVE).matcher(s);
        return m.find() ? Double.valueOf(m.group(1).replace(',', '.')) : null;
    }

    private void pushTraffic() {
        String j = lastTrafficJson;
        if (web == null || j == null) return;
        web.evaluateJavascript("window.__nativeTraffic && window.__nativeTraffic(" + j + ");", null);
    }

    private void hideSystemUi() {
        View d = getWindow().getDecorView();
        if (Build.VERSION.SDK_INT >= 19) {
            d.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        if (stopped) { stopped = false; handler.removeCallbacks(trafficTask); handler.post(trafficTask); }
    }

    @Override protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override protected void onDestroy() {
        stopped = true;
        handler.removeCallbacksAndMessages(null);
        if (web != null) web.destroy();
        super.onDestroy();
    }

    /** Menü tuşu sayfadaki menüyü (sürüm, güncelleme kontrolü) açar/kapatır; geri tuşu menüyü kapatır ama uygulamadan çıkmaz (TV ekranı kapanmasın). */
    @Override public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_MENU || keyCode == KeyEvent.KEYCODE_SETTINGS || keyCode == KeyEvent.KEYCODE_INFO) {
            web.evaluateJavascript("(window.__menu ? (window.__menu(), 1) : 0)", new ValueCallback<String>() {
                @Override public void onReceiveValue(String v) { if (!"1".equals(v)) web.reload(); }
            });
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_F5) { web.reload(); return true; }
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            web.evaluateJavascript("(window.__menuClose ? (window.__menuClose(), 1) : 0)", null);
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    /** Sayfanın APK içinde çalıştığını anlaması için (window.TVNative). */
    private class Bridge {
        @JavascriptInterface public boolean isNative() { return true; }

        /** Cihaz token'ı: girişten sonra sayfa kaydeder, uygulama yeniden açılınca okur (şifre saklanmaz). */
        @JavascriptInterface public String getToken() {
            return getSharedPreferences("tv", MODE_PRIVATE).getString("deviceToken", "");
        }
        @JavascriptInterface public void saveToken(String t) {
            getSharedPreferences("tv", MODE_PRIVATE).edit().putString("deviceToken", t == null ? "" : t).apply();
        }

        @JavascriptInterface public String versionName() {
            try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return ""; }
        }

        /** Kurulu uygulamanın sürüm kodu (güncelleme bildirimi için). */
        @JavascriptInterface public int versionCode() {
            try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionCode; } catch (Exception e) { return 0; }
        }

        /** Cihaz kimliği: ANDROID_ID (kurulumda sabit, fabrika ayarına dönülünce değişir).
         *  MAC adresi Android 10'dan beri uygulamalara kapalı; bunun yerine bu kalıcı kimlik kullanılır. */
        @JavascriptInterface public String hwId() {
            try { return Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID); } catch (Exception e) { return ""; }
        }

        /** Kutunun marka/modeli (panelde "hangi cihaz" diye gösterilir). */
        @JavascriptInterface public String model() {
            String m = ((Build.MANUFACTURER + " " + Build.MODEL).trim());
            return m.length() > 60 ? m.substring(0, 60) : m;
        }

        /** Uzaktan durum izleme: ekranın küçük bir görüntüsü (960 px genişlik, JPEG, data: adresi). Çizim UI iş parçacığında yapılır. */
        @JavascriptInterface public String snapshot() {
            final String[] out = { "" };
            final CountDownLatch done = new CountDownLatch(1);
            runOnUiThread(new Runnable() { @Override public void run() {
                try {
                    int w = web.getWidth(), h = web.getHeight();
                    if (w > 0 && h > 0) {
                        float k = Math.min(1f, 960f / w);
                        Bitmap b = Bitmap.createBitmap(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)), Bitmap.Config.RGB_565);
                        Canvas c = new Canvas(b); c.scale(k, k); web.draw(c);
                        ByteArrayOutputStream bo = new ByteArrayOutputStream();
                        b.compress(Bitmap.CompressFormat.JPEG, 70, bo); b.recycle();
                        out[0] = "data:image/jpeg;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
                    }
                } catch (Throwable t) { out[0] = ""; }
                done.countDown();
            } });
            try { done.await(3, TimeUnit.SECONDS); } catch (InterruptedException e) { }
            return out[0];
        }

        /** Yeni APK'yı indirir ve yükleyiciyi açar. Durum, sayfadaki window.__updateStatus(metin) ile bildirilir. */
        @JavascriptInterface public void installUpdate(final String url) {
            runOnUiThread(new Runnable() { @Override public void run() { startUpdate(url); } });
        }
    }

    private volatile boolean updating = false;

    private void updateStatus(final String msg) {
        handler.post(new Runnable() { @Override public void run() {
            if (web != null) web.evaluateJavascript("window.__updateStatus && window.__updateStatus(" + JSONObject.quote(msg) + ");", null);
        } });
    }

    private void startUpdate(final String url) {
        if (updating) return;
        String curHost = web != null && web.getUrl() != null ? web.getUrl().split("/tv")[0] : BASE_URL;
        if (!url.startsWith(BASE_URL + "/") && !url.startsWith(curHost + "/")) {
            updateStatus("Geçersiz güncelleme adresi");
            return;
        }
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            // Android bu uygulamaya bir kez "bilinmeyen kaynaklardan yükleme" izni ister
            updateStatus("Açılan ekranda bu uygulama için izni açıp geri dönün, sonra tekrar OK'a basın");
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()));
            startActivity(i);
            return;
        }
        updating = true;
        updateStatus("İndiriliyor…");
        new Thread(new Runnable() {
            @Override public void run() {
                HttpURLConnection c = null;
                try {
                    File f = UpdateProvider.apkFile(MainActivity.this);
                    f.getParentFile().mkdirs();
                    File tmp = new File(f.getParentFile(), "dl.tmp");
                    c = (HttpURLConnection) new URL(url).openConnection();
                    c.setInstanceFollowRedirects(true);
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(30000);
                    if (c.getResponseCode() != 200) throw new Exception("sunucu " + c.getResponseCode());
                    InputStream in = c.getInputStream();
                    FileOutputStream out = new FileOutputStream(tmp);
                    byte[] buf = new byte[16384]; int n; long total = 0;
                    while ((n = in.read(buf)) > 0) { out.write(buf, 0, n); total += n; }
                    out.close(); in.close();
                    if (total < 20000) throw new Exception("dosya eksik");
                    if (f.exists()) f.delete();
                    if (!tmp.renameTo(f)) throw new Exception("dosya yazılamadı");
                    handler.post(new Runnable() { @Override public void run() { launchInstaller(); } });
                } catch (Exception e) {
                    updateStatus("İndirilemedi: " + e.getMessage());
                } finally {
                    if (c != null) c.disconnect();
                    updating = false;
                }
            }
        }).start();
    }

    private void launchInstaller() {
        try {
            File f = UpdateProvider.apkFile(this);
            Intent i = new Intent(Intent.ACTION_VIEW);
            if (Build.VERSION.SDK_INT >= 24) {
                i.setDataAndType(Uri.parse("content://" + getPackageName() + ".update/update.apk"), "application/vnd.android.package-archive");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } else {
                i.setDataAndType(Uri.fromFile(f), "application/vnd.android.package-archive");
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
            updateStatus("Yükleme ekranında \"Yükle\" seçeneğini onaylayın");
        } catch (Exception e) {
            updateStatus("Yükleyici açılamadı: " + e.getMessage());
        }
    }
}
