package com.wavecraft.pro;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends BridgeActivity {

    public static MainActivity instance;

    public class AndroidAudioBridge {
        @JavascriptInterface
        public void startPlayback(String title, String artist, String thumbnail, boolean isPlaying, double positionSec, double durationSec) {
            try {
                Intent serviceIntent = new Intent(MainActivity.this, WaveCraftMediaService.class);
                serviceIntent.setAction(WaveCraftMediaService.ACTION_START);
                serviceIntent.putExtra(WaveCraftMediaService.EXTRA_TITLE, title);
                serviceIntent.putExtra(WaveCraftMediaService.EXTRA_ARTIST, artist);
                serviceIntent.putExtra(WaveCraftMediaService.EXTRA_THUMBNAIL, thumbnail);
                serviceIntent.putExtra(WaveCraftMediaService.EXTRA_IS_PLAYING, isPlaying);
                serviceIntent.putExtra(WaveCraftMediaService.EXTRA_POSITION_MS, (long) (positionSec * 1000));
                serviceIntent.putExtra(WaveCraftMediaService.EXTRA_DURATION_MS, (long) (durationSec * 1000));
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(serviceIntent);
                } else {
                    startService(serviceIntent);
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        @JavascriptInterface
        public void startPlayback(String title, String artist, String thumbnail, boolean isPlaying) {
            startPlayback(title, artist, thumbnail, isPlaying, 0, 0);
        }

        @JavascriptInterface
        public void startPlayback(String title, String artist) {
            startPlayback(title, artist, null, true, 0, 0);
        }

        @JavascriptInterface
        public void updatePlaybackState(boolean isPlaying, double positionSec, double durationSec) {
            try {
                Intent serviceIntent = new Intent(MainActivity.this, WaveCraftMediaService.class);
                serviceIntent.setAction(WaveCraftMediaService.ACTION_UPDATE_STATE);
                serviceIntent.putExtra(WaveCraftMediaService.EXTRA_IS_PLAYING, isPlaying);
                serviceIntent.putExtra(WaveCraftMediaService.EXTRA_POSITION_MS, (long) (positionSec * 1000));
                serviceIntent.putExtra(WaveCraftMediaService.EXTRA_DURATION_MS, (long) (durationSec * 1000));
                startService(serviceIntent);
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        @JavascriptInterface
        public void stopPlayback() {
            try {
                Intent serviceIntent = new Intent(MainActivity.this, WaveCraftMediaService.class);
                serviceIntent.setAction(WaveCraftMediaService.ACTION_STOP);
                startService(serviceIntent);
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        @JavascriptInterface
        public String fetchUrlNative(String urlString) {
            try {
                URL url = new URL(urlString);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(4500);
                conn.setReadTimeout(4500);
                conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36");
                int status = conn.getResponseCode();
                if (status >= 200 && status < 400) {
                    java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(conn.getInputStream(), "UTF-8"));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) {
                        sb.append(line);
                    }
                    reader.close();
                    return sb.toString();
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
            return null;
        }

        @JavascriptInterface
        public String getAppVersion() {
            try {
                android.content.pm.PackageInfo pInfo = getPackageManager().getPackageInfo(getPackageName(), 0);
                return pInfo.versionName != null ? pInfo.versionName : "5.0.0";
            } catch (Exception e) {
                return "5.0.0";
            }
        }

        @JavascriptInterface
        public int getAppVersionCode() {
            try {
                android.content.pm.PackageInfo pInfo = getPackageManager().getPackageInfo(getPackageName(), 0);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    return (int) pInfo.getLongVersionCode();
                } else {
                    return pInfo.versionCode;
                }
            } catch (Exception e) {
                return 5;
            }
        }

        @JavascriptInterface
        public boolean canInstallPackages() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                return getPackageManager().canRequestPackageInstalls();
            }
            return true;
        }

        @JavascriptInterface
        public void openInstallPermissionSettings() {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                    intent.setData(Uri.parse("package:" + getPackageName()));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        @JavascriptInterface
        public void downloadAndInstallUpdate(final String apkUrl) {
            new Thread(() -> {
                HttpURLConnection conn = null;
                InputStream in = null;
                FileOutputStream out = null;
                try {
                    notifyUpdateStatus("downloading");
                    notifyUpdateProgress(1);

                    File cacheDir = getExternalCacheDir();
                    if (cacheDir == null) {
                        cacheDir = getCacheDir();
                    }
                    File apkFile = new File(cacheDir, "WaveCraft_update.apk");
                    if (apkFile.exists()) {
                        apkFile.delete();
                    }

                    URL url = new URL(apkUrl);
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("GET");
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(45000);
                    conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android " + Build.VERSION.RELEASE + ") WaveCraft/" + getAppVersion());
                    conn.setInstanceFollowRedirects(true);
                    conn.connect();

                    int responseCode = conn.getResponseCode();
                    if (responseCode == HttpURLConnection.HTTP_MOVED_PERM ||
                        responseCode == HttpURLConnection.HTTP_MOVED_TEMP ||
                        responseCode == 307 || responseCode == 308) {
                        String newUrl = conn.getHeaderField("Location");
                        if (newUrl != null && !newUrl.isEmpty()) {
                            conn.disconnect();
                            url = new URL(newUrl);
                            conn = (HttpURLConnection) url.openConnection();
                            conn.setConnectTimeout(15000);
                            conn.setReadTimeout(45000);
                            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android " + Build.VERSION.RELEASE + ") WaveCraft/" + getAppVersion());
                            conn.connect();
                            responseCode = conn.getResponseCode();
                        }
                    }

                    if (responseCode < 200 || responseCode >= 300) {
                        notifyUpdateError("Download failed with HTTP " + responseCode);
                        return;
                    }

                    int fileLength = conn.getContentLength();
                    in = conn.getInputStream();
                    out = new FileOutputStream(apkFile);

                    byte[] buffer = new byte[8192];
                    long total = 0;
                    int count;
                    long lastProgressReportTime = 0;

                    while ((count = in.read(buffer)) != -1) {
                        total += count;
                        out.write(buffer, 0, count);

                        long now = System.currentTimeMillis();
                        if (fileLength > 0 && (now - lastProgressReportTime > 250)) {
                            int progress = (int) Math.min(99, (total * 100) / fileLength);
                            notifyUpdateProgress(progress);
                            lastProgressReportTime = now;
                        }
                    }

                    out.flush();
                    notifyUpdateProgress(100);

                    runOnUiThread(() -> promptInstallApk(apkFile));
                } catch (Exception e) {
                    e.printStackTrace();
                    notifyUpdateError("Update download failed: " + e.getMessage());
                } finally {
                    try { if (in != null) in.close(); } catch (Exception ignored) {}
                    try { if (out != null) out.close(); } catch (Exception ignored) {}
                    try { if (conn != null) conn.disconnect(); } catch (Exception ignored) {}
                }
            }).start();
        }

        @JavascriptInterface
        public void triggerPendingInstall() {
            runOnUiThread(() -> {
                File cacheDir = getExternalCacheDir();
                if (cacheDir == null) cacheDir = getCacheDir();
                File apkFile = new File(cacheDir, "WaveCraft_update.apk");
                if (apkFile.exists()) {
                    promptInstallApk(apkFile);
                } else {
                    notifyUpdateError("Update package not found. Please download again.");
                }
            });
        }
    }

    public void promptInstallApk(File apkFile) {
        try {
            if (!apkFile.exists()) {
                notifyUpdateError("Downloaded APK file not found.");
                return;
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!getPackageManager().canRequestPackageInstalls()) {
                    notifyUpdateStatus("permission_needed");
                    Intent permIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                    permIntent.setData(Uri.parse("package:" + getPackageName()));
                    permIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(permIntent);
                    return;
                }
            }

            notifyUpdateStatus("installing");
            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Uri apkUri = FileProvider.getUriForFile(
                this,
                getPackageName() + ".fileprovider",
                apkFile
            );
            installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            startActivity(installIntent);
        } catch (Exception e) {
            e.printStackTrace();
            notifyUpdateError("Failed to launch package installer: " + e.getMessage());
        }
    }

    private void notifyUpdateProgress(int percent) {
        if (bridge != null && bridge.getWebView() != null) {
            runOnUiThread(() -> {
                bridge.getWebView().evaluateJavascript(
                    "window.__wavecraft_update_progress && window.__wavecraft_update_progress(" + percent + ")",
                    null
                );
            });
        }
    }

    private void notifyUpdateStatus(String status) {
        if (bridge != null && bridge.getWebView() != null) {
            runOnUiThread(() -> {
                bridge.getWebView().evaluateJavascript(
                    "window.__wavecraft_update_status && window.__wavecraft_update_status('" + status + "')",
                    null
                );
            });
        }
    }

    private void notifyUpdateError(String error) {
        if (bridge != null && bridge.getWebView() != null) {
            runOnUiThread(() -> {
                String safeErr = error != null ? error.replace("'", "\\'") : "Unknown error";
                bridge.getWebView().evaluateJavascript(
                    "window.__wavecraft_update_error && window.__wavecraft_update_error('" + safeErr + "')",
                    null
                );
            });
        }
    }

    public static void sendMediaAction(String action) {
        if (instance != null && instance.bridge != null && instance.bridge.getWebView() != null) {
            instance.runOnUiThread(() -> {
                instance.bridge.getWebView().evaluateJavascript(
                    "window.__wavecraft_media_action && window.__wavecraft_media_action('" + action + "')",
                    null
                );
            });
        }
    }

    private void setImmersiveFullscreen() {
        try {
            Window window = getWindow();
            if (window == null) return;

            // Render edge-to-edge around notches and camera cutouts on Android 9+ (API 28+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                WindowManager.LayoutParams lp = window.getAttributes();
                lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                window.setAttributes(lp);
            }

            // Modern Android 11+ (API 30+) immersive fullscreen
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                WindowCompat.setDecorFitsSystemWindows(window, false);
                WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
                if (controller != null) {
                    controller.hide(WindowInsetsCompat.Type.statusBars());
                    controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                }
            } else {
                // Pre-Android 11 sticky immersive mode
                View decorView = window.getDecorView();
                int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
                decorView.setSystemUiVisibility(flags);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instance = this;
        setImmersiveFullscreen();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 101);
            }
        }
        setupWebView();
    }

    private void setupWebView() {
        if (bridge != null && bridge.getWebView() != null) {
            WebView webView = bridge.getWebView();
            WebSettings settings = webView.getSettings();
            // Zero user gesture restriction for gapless audio transitions
            settings.setMediaPlaybackRequiresUserGesture(false);
            // Support mixed content for high-definition streaming CDN audio chunks
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            // Enable storage engines
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setJavaScriptEnabled(true);
            // Enable hardware layer composition for buttery smooth 60-120fps GPU animations
            webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
            // Pre-rasterize offscreen content to eliminate scroll stutter
            settings.setOffscreenPreRaster(true);
            // Disable unused background sensor services to save battery
            settings.setGeolocationEnabled(false);
            settings.setNeedInitialFocus(false);

            // Register native bridge for background audio foreground service & auto-updates
            webView.addJavascriptInterface(new AndroidAudioBridge(), "AndroidAudioBridge");

            injectBackgroundAudioKeepAlive(webView);
        }
    }

    private void injectBackgroundAudioKeepAlive(WebView webView) {
        String js = "(function() {" +
            "  try {" +
            "    Object.defineProperty(document, 'hidden', { get: function() { return false; }, configurable: true });" +
            "    Object.defineProperty(document, 'visibilityState', { get: function() { return 'visible'; }, configurable: true });" +
            "    Object.defineProperty(document, 'webkitHidden', { get: function() { return false; }, configurable: true });" +
            "    Object.defineProperty(document, 'webkitVisibilityState', { get: function() { return 'visible'; }, configurable: true });" +
            "    window.addEventListener('visibilitychange', function(e) { e.stopImmediatePropagation(); }, true);" +
            "    document.addEventListener('visibilitychange', function(e) { e.stopImmediatePropagation(); }, true);" +
            "  } catch(e) {}" +
            "})();";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    private void keepWebViewAlive() {
        if (bridge != null && bridge.getWebView() != null) {
            WebView webView = bridge.getWebView();
            webView.post(() -> {
                webView.resumeTimers();
                webView.onResume();
                injectBackgroundAudioKeepAlive(webView);
            });
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        setImmersiveFullscreen();
        setupWebView();
    }

    @Override
    public void onResume() {
        super.onResume();
        setImmersiveFullscreen();
    }

    @Override
    public void onPause() {
        super.onPause();
        keepWebViewAlive();
    }

    @Override
    public void onStop() {
        super.onStop();
        keepWebViewAlive();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            setImmersiveFullscreen();
        } else {
            keepWebViewAlive();
        }
    }

    @Override
    public void onDestroy() {
        instance = null;
        super.onDestroy();
    }
}
