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
        // Crucial: keep WebView timers & audio decoders running so audio continues when minimized
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().resumeTimers();
            bridge.getWebView().onResume();
        }
    }

    @Override
    public void onStop() {
        super.onStop();
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().resumeTimers();
            bridge.getWebView().onResume();
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (!hasFocus && bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().resumeTimers();
            bridge.getWebView().onResume();
        }
    }

    @Override
    public void onDestroy() {
        instance = null;
        super.onDestroy();
    }
}
