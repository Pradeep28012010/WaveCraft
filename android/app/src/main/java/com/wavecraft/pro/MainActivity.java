package com.wavecraft.pro;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    public class AndroidAudioBridge {
        @JavascriptInterface
        public void startPlayback(String title, String artist) {
            try {
                Intent serviceIntent = new Intent(MainActivity.this, WaveCraftMediaService.class);
                serviceIntent.setAction(WaveCraftMediaService.ACTION_START);
                serviceIntent.putExtra(WaveCraftMediaService.EXTRA_TITLE, title);
                serviceIntent.putExtra(WaveCraftMediaService.EXTRA_ARTIST, artist);
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

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 101);
            }
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        if (bridge != null && bridge.getWebView() != null) {
            WebView webView = bridge.getWebView();
            WebSettings settings = webView.getSettings();
            // Android optimization: Zero user gesture restriction for gapless audio transitions
            settings.setMediaPlaybackRequiresUserGesture(false);
            // Support mixed content for high-definition streaming CDN audio chunks
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            // Enable offline vault storage engines
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setJavaScriptEnabled(true);
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);

            // Register native bridge for background audio foreground service
            webView.addJavascriptInterface(new AndroidAudioBridge(), "AndroidAudioBridge");
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        // Crucial: keep WebView timers running so audio engine and streams continue when app is minimized
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().resumeTimers();
        }
    }

    @Override
    public void onStop() {
        super.onStop();
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().resumeTimers();
        }
    }
}
