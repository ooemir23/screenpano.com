# ScreenPano — R8 kuralları
# Uygulama kodu olduğu gibi kalır (köprü, yerel arayüz, yansıma riski yok); yalnız kütüphanelerin kullanılmayan kısımları atılır.
-keep class com.screenpano.tv.** { *; }
# Sayfanın çağırdığı köprü yöntemleri
-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }
-keepattributes JavascriptInterface,*Annotation*,Signature,InnerClasses,EnclosingMethod,SourceFile,LineNumberTable
# OkHttp/Okio isteğe bağlı TLS sağlayıcıları
-dontwarn org.bouncycastle.**
-dontwarn org.conscrypt.**
-dontwarn org.openjsse.**
-dontwarn okhttp3.internal.platform.**
# Media3 / Coil kendi kurallarını getirir; eksik isteğe bağlı sınıflar uyarı vermesin
-dontwarn javax.annotation.**
-dontwarn kotlinx.coroutines.debug.**
