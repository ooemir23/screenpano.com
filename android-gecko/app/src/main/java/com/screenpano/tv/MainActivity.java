package com.screenpano.tv;

import android.app.Activity;
import android.graphics.Bitmap;
import android.util.Base64;
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

import org.json.JSONObject;
import org.mozilla.geckoview.GeckoResult;
import org.mozilla.geckoview.GeckoRuntime;
import org.mozilla.geckoview.GeckoSession;
import org.mozilla.geckoview.GeckoSessionSettings;
import org.mozilla.geckoview.GeckoView;
import org.mozilla.geckoview.WebExtension;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * GeckoView deneme sürümü: Mozilla Gecko motoru APK'nın İÇİNDE gelir (sürüm derlemede sabit),
 * kutunun Android System WebView'i ne kadar eski olursa olsun güncel tarayıcı motoru çalışır.
 * Sayfa (sunucudaki /tv) değişmez; window.TVNative köprüsü assets/tvext uzantısıyla sağlanır.
 * Asıl WebView'li uygulama android/ klasöründedir; bu paket (com.screenpano.tvgecko) yan yana kurulur.
 */
public class MainActivity extends Activity {

    private static final String BASE_URL = BuildConfig.BASE_URL.replaceAll("/+$", "");
    private static final String TV_URL = BASE_URL + "/tv";
    private static final String IBB_URL = "https://api.ibb.gov.tr/tkmservices/api/TrafficData/v1/TrafficIndex_Sc1_Cont";
    private static final long TRAFFIC_OK_MS = 2 * 60 * 1000;
    private static final long TRAFFIC_RETRY_MS = 30 * 1000;
    private static final long RELOAD_ON_ERROR_MS = 15 * 1000;

    private GeckoView gv;
    private GeckoSession session;
    private GeckoRuntime runtime;
    private volatile String currentUri = null;
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
        @Override public void run() { if (session != null) session.loadUri(TV_URL); }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);

        gv = new GeckoView(this);
        runtime = GeckoRuntime.create(this);
        openSession(new GeckoSession());
        setContentView(gv);
        hideSystemUi();

        // sayfa köprüsü: token/sürüm/cihaz kimliği (senkron), ekran görüntüsü ve APK güncelleme
        runtime.getWebExtensionController().install("resource://android/assets/tvext/").accept(
            ext -> ext.setMessageDelegate(new WebExtension.MessageDelegate() {
                @Override public GeckoResult<Object> onMessage(String app, Object message, WebExtension.MessageSender sender) { return handleBridge(message); }
            }, "tvnative"),
            err -> android.util.Log.w("TVGecko", "uzantı kurulamadı: " + err));

        session.loadUri(TV_URL);
        handler.post(trafficTask);
    }

    private void openSession(GeckoSession s) {
        session = s;
        gv.setSession(s);
        s.open(runtime);
        s.setContentDelegate(new GeckoSession.ContentDelegate() {
            @Override public void onCrash(GeckoSession ses) { // motor çökerse oturumu tazele
                android.util.Log.w("TVGecko", "Gecko çöktü, oturum yenileniyor");
                try { ses.close(); } catch (Throwable t) {}
                openSession(new GeckoSession());
                session.loadUri(TV_URL);
            }
        });
        s.setProgressDelegate(new GeckoSession.ProgressDelegate() {
            @Override public void onPageStop(GeckoSession ses, boolean ok) {
                handler.removeCallbacks(reloadTask);
                pushTraffic();
            }
        });
        s.setNavigationDelegate(new GeckoSession.NavigationDelegate() {
            @Override public void onLocationChange(GeckoSession ses, String url, java.util.List<GeckoSession.PermissionDelegate.ContentPermission> perms, Boolean hasChanged) { currentUri = url; }
            @Override public GeckoResult<String> onLoadError(GeckoSession ses, String url, org.mozilla.geckoview.WebRequestError error) {
                handler.removeCallbacks(reloadTask);
                handler.postDelayed(reloadTask, RELOAD_ON_ERROR_MS); // bağlantı hatasında 15 sn sonra yeniden dene
                return null;
            }
        });
    }

    /** Sayfa köprüsü mesajları: info / installUpdate / snapshot. Dönen değer sayfadaki Promise'e gider. */
    private GeckoResult<Object> handleBridge(Object message) {
        try {
            JSONObject m = message instanceof JSONObject ? (JSONObject) message : null;
            if (m == null) return GeckoResult.fromValue(null);
            String cmd = m.optString("cmd", "");
            if ("info".equals(cmd)) {
                JSONObject o = new JSONObject();
                o.put("versionName", pkgVersionName());
                o.put("versionCode", pkgVersionCode());
                o.put("hwId", androidId());
                o.put("model", modelStr());
                return GeckoResult.fromValue(o);
            }
            if ("installUpdate".equals(cmd)) {
                final String url = m.optString("url", "");
                handler.post(() -> startUpdate(url));
                return GeckoResult.fromValue(null);
            }
            if ("snapshot".equals(cmd)) {
                GeckoResult<Object> res = new GeckoResult<>();
                gv.capturePixels().accept(bmp -> {
                    try {
                        if (bmp == null) { res.complete(null); return; }
                        int w = bmp.getWidth(), h = bmp.getHeight();
                        float k = Math.min(1f, 960f / Math.max(1, w));
                        Bitmap b = Bitmap.createScaledBitmap(bmp, Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)), true);
                        ByteArrayOutputStream bo = new ByteArrayOutputStream();
                        b.compress(Bitmap.CompressFormat.JPEG, 70, bo);
                        JSONObject o = new JSONObject();
                        o.put("data", "data:image/jpeg;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP));
                        res.complete(o);
                    } catch (Throwable t) { res.complete(null); }
                }, e -> res.complete(null));
                return res;
            }
        } catch (Exception e) { /* bilinmeyen komut: boş yanıt */ }
        return GeckoResult.fromValue(null);
    }

    private void eval(String js) { if (session != null) session.loadUri("javascript:" + js); }

    private String pkgVersionName() { try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return ""; } }
    private int pkgVersionCode() { try { return (int) getPackageManager().getPackageInfo(getPackageName(), 0).getLongVersionCode(); } catch (Exception e) { return 0; } }
    private String androidId() { try { return Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID); } catch (Exception e) { return ""; } }
    private String modelStr() { String m = ((Build.MANUFACTURER + " " + Build.MODEL).trim()); return m.length() > 60 ? m.substring(0, 60) : m; }

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
            if (body.startsWith("{")) {
                JSONObject j = new JSONObject(body);
                all = j.getDouble("TI"); asia = j.getDouble("TI_An"); europe = j.getDouble("TI_Av");
            } else {
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
        if (session == null || j == null) return;
        eval("window.__nativeTraffic && window.__nativeTraffic(" + j + ");");
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
        if (stopped) { stopped = false; handler.removeCallbacks(trafficTask); handler.post(trafficTask); }
    }

    @Override protected void onPause() {
        super.onPause();
        stopped = true; // trafik görevi durur; onResume'da sürer
    }

    @Override protected void onDestroy() {
        stopped = true;
        handler.removeCallbacksAndMessages(null);
        if (session != null) { try { session.close(); } catch (Throwable t) {} }
        super.onDestroy();
    }

    /** Menü tuşu sayfadaki menüyü açar/kapatır; geri tuşu menüyü kapatır ama uygulamadan çıkmaz. */
    @Override public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_MENU || keyCode == KeyEvent.KEYCODE_SETTINGS || keyCode == KeyEvent.KEYCODE_INFO) {
            eval("(function(){ if (window.__menu) window.__menu(); else location.reload(); })()");
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_F5) { if (session != null) session.reload(); return true; }
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            eval("(function(){ if (window.__menuClose) window.__menuClose(); })()");
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    private volatile boolean updating = false;

    private void updateStatus(final String msg) {
        handler.post(new Runnable() { @Override public void run() {
            eval("window.__updateStatus && window.__updateStatus(" + JSONObject.quote(msg) + ");");
        } });
    }

    private void startUpdate(final String url) {
        if (updating) return;
        String curHost = currentUri != null ? currentUri.split("/tv")[0] : BASE_URL;
        if (!url.startsWith(BASE_URL + "/") && !url.startsWith(curHost + "/")) {
            updateStatus("Geçersiz güncelleme adresi");
            return;
        }
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
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
