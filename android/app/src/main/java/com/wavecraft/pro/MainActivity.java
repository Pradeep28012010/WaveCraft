package com.wavecraft.pro;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

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
                java.net.URL url = new java.net.URL(urlString);
                java.net.HttpURLConnection conn = (java.net.HttpURLConnection) url.openConnection();
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

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instance = this;
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
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);

            // Register native bridge for background audio foreground service
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
        setupWebView();
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
        if (!hasFocus) {
            keepWebViewAlive();
        }
    }

    @Override
    public void onDestroy() {
        instance = null;
        super.onDestroy();
    }
}
