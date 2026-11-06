package com.screenpano.tv.ui

import android.app.ActivityManager
import android.content.Context
import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.GLES20
import android.os.Build
import android.os.Process
import android.os.SystemClock
import org.json.JSONObject
import java.io.File

/**
 * Cihazın kaynak kullanımı (CPU, RAM, grafik belleği, GPU adı). Dakikada bir durum raporuyla panele gider.
 * Ölçülemeyen değer -1 ya da boş gelir; hiçbir şey ekranı etkilemez, hata olursa boş döner.
 * Not: Android, WebView'in ayrı çizim sürecini uygulamaya göstermeyebilir; CPU yalnız okunabilen süreçleri sayar.
 */
object SysStats {
    private var lastTicks = -1L
    private var lastAt = 0L
    private var gpu: String? = null

    /** /proc/<pid>/stat içindeki utime+stime (saat darbesi); okunamazsa -1 */
    private fun procTicks(pid: Int): Long {
        return try {
            val s = File("/proc/$pid/stat").readText()
            val p = s.substring(s.lastIndexOf(')') + 2).split(' ')
            p[11].toLong() + p[12].toLong()
        } catch (_: Throwable) {
            -1L
        }
    }

    /** GPU adı: küçük bir EGL bağlamından bir kez okunur ve saklanır */
    private fun gpuName(): String {
        gpu?.let { return it }
        var out = ""
        try {
            val dpy = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
            val ver = IntArray(2)
            if (EGL14.eglInitialize(dpy, ver, 0, ver, 1)) {
                val cfg = arrayOfNulls<EGLConfig>(1)
                val num = IntArray(1)
                val attr = intArrayOf(EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT, EGL14.EGL_NONE)
                EGL14.eglChooseConfig(dpy, attr, 0, cfg, 0, 1, num, 0)
                if (num[0] > 0 && cfg[0] != null) {
                    val ctxAttr = intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE)
                    val ctx = EGL14.eglCreateContext(dpy, cfg[0], EGL14.EGL_NO_CONTEXT, ctxAttr, 0)
                    val surAttr = intArrayOf(EGL14.EGL_WIDTH, 1, EGL14.EGL_HEIGHT, 1, EGL14.EGL_NONE)
                    val sur = EGL14.eglCreatePbufferSurface(dpy, cfg[0], surAttr, 0)
                    if (EGL14.eglMakeCurrent(dpy, sur, sur, ctx)) {
                        out = (GLES20.glGetString(GLES20.GL_RENDERER) ?: "").trim()
                    }
                    EGL14.eglMakeCurrent(dpy, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
                    EGL14.eglDestroySurface(dpy, sur)
                    EGL14.eglDestroyContext(dpy, ctx)
                }
            }
        } catch (_: Throwable) {
            // GPU adı alınamazsa boş kalır
        }
        gpu = out
        return out
    }

    fun json(ctx: Context): String {
        val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val mi = ActivityManager.MemoryInfo()
        am.getMemoryInfo(mi)

        val own = Process.myPid()
        val pkg = ctx.packageName
        val pids = ArrayList<Int>()
        try {
            val list = am.runningAppProcesses
            if (list != null) for (p in list) if (p.processName != null && p.processName.startsWith(pkg)) pids.add(p.pid)
        } catch (_: Throwable) {
        }
        if (!pids.contains(own)) pids.add(own)

        var pssKb = 0
        var gfxKb = 0
        try {
            val infos = am.getProcessMemoryInfo(pids.toIntArray())
            for (i in infos) {
                pssKb += i.totalPss
                if (Build.VERSION.SDK_INT >= 23) {
                    gfxKb += (i.getMemoryStat("summary.graphics") ?: "0").toIntOrNull() ?: 0
                }
            }
        } catch (_: Throwable) {
        }

        var ticks = 0L
        var counted = 0
        for (p in pids) {
            val t = procTicks(p)
            if (t >= 0) {
                ticks += t
                counted++
            }
        }
        val cores = Runtime.getRuntime().availableProcessors().coerceAtLeast(1)
        val now = SystemClock.elapsedRealtime()
        var cpu = -1.0
        if (lastTicks >= 0 && now > lastAt && counted > 0) {
            val hz = try {
                android.system.Os.sysconf(android.system.OsConstants._SC_CLK_TCK)
            } catch (_: Throwable) {
                100L
            }
            val d = ticks - lastTicks
            if (d >= 0 && hz > 0) cpu = d.toDouble() / hz.toDouble() / ((now - lastAt) / 1000.0) / cores * 100.0
        }
        lastTicks = ticks
        lastAt = now
        val cpuV: Double = if (cpu >= 0) Math.round(cpu * 10) / 10.0 else -1.0

        val rt = Runtime.getRuntime()
        val o = JSONObject()
        o.put("cpu", cpuV)
        o.put("cores", cores)
        o.put("ramApp", pssKb / 1024)
        o.put("ramTotal", (mi.totalMem / 1048576L).toInt())
        o.put("ramFree", (mi.availMem / 1048576L).toInt())
        o.put("low", mi.lowMemory)
        o.put("gfx", gfxKb / 1024)
        o.put("heap", ((rt.totalMemory() - rt.freeMemory()) / 1048576L).toInt())
        o.put("procs", counted)
        o.put("gpu", gpuName().take(60))
        return o.toString()
    }
}
