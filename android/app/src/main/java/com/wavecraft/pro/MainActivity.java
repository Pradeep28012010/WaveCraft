package com.wavecraft.pro;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
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
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    public static MainActivity instance;
    private SpeechRecognizer speechRecognizer;
    private static final int REQUEST_RECORD_AUDIO = 202;
    private static final int MAX_NATIVE_FETCH_BYTES = 2 * 1024 * 1024;
    private static final int MAX_APK_REDIRECTS = 5;
    private boolean webViewConfigured = false;
    private final Object updateLock = new Object();
    private volatile boolean isUpdatingApk = false;

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

        @JavascriptInterface
        public String fetchUrlNative(String urlString) {
            if (urlString == null || urlString.trim().isEmpty()) return null;
            HttpURLConnection conn = null;
            InputStream in = null;
            try {
                URL currentUrl = new URL(urlString.trim());
                int redirects = 0;
                while (true) {
                    if (!isSafePublicHttpsUrl(currentUrl)) {
                        return null;
                    }
                    conn = (HttpURLConnection) currentUrl.openConnection();
                    conn.setRequestMethod("GET");
                    conn.setConnectTimeout(4500);
                    conn.setReadTimeout(4500);
                    conn.setInstanceFollowRedirects(false);
                    conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36");
                    int status = conn.getResponseCode();
                    if (status == HttpURLConnection.HTTP_MOVED_PERM ||
                        status == HttpURLConnection.HTTP_MOVED_TEMP ||
                        status == 307 || status == 308) {
                        String loc = conn.getHeaderField("Location");
                        conn.disconnect();
                        conn = null;
                        if (loc == null || loc.isEmpty() || redirects >= 3) {
                            return null;
                        }
                        currentUrl = new URL(currentUrl, loc);
                        redirects++;
                        continue;
                    }
                    if (status >= 200 && status < 400) {
                        in = conn.getInputStream();
                        ByteArrayOutputStream baos = new ByteArrayOutputStream();
                        byte[] buf = new byte[4096];
                        int total = 0;
                        int read;
                        while ((read = in.read(buf)) != -1) {
                            total += read;
                            if (total > MAX_NATIVE_FETCH_BYTES) {
                                return null;
                            }
                            baos.write(buf, 0, read);
                        }
                        return baos.toString(StandardCharsets.UTF_8.name());
                    }
                    return null;
                }
            } catch (Exception e) {
                e.printStackTrace();
            } finally {
                try { if (in != null) in.close(); } catch (Exception ignored) {}
                try { if (conn != null) conn.disconnect(); } catch (Exception ignored) {}
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
            synchronized (updateLock) {
                if (isUpdatingApk) {
                    return;
                }
                isUpdatingApk = true;
            }
            new Thread(() -> {
                HttpURLConnection conn = null;
                InputStream in = null;
                FileOutputStream out = null;
                File apkFile = null;
                try {
                    if (apkUrl == null || apkUrl.trim().isEmpty()) {
                        notifyUpdateError("Invalid update package URL");
                        return;
                    }
                    URL currentUrl = new URL(apkUrl.trim());
                    if (!isAllowedApkUrl(currentUrl, false)) {
                        notifyUpdateError("Untrusted update source URL or domain");
                        return;
                    }

                    notifyUpdateStatus("downloading");
                    notifyUpdateProgress(1);

                    apkFile = getPendingApkFile();
                    if (apkFile.exists()) {
                        apkFile.delete();
                    }

                    int redirects = 0;
                    int responseCode;
                    while (true) {
                        if (!isAllowedApkUrl(currentUrl, redirects > 0)) {
                            notifyUpdateError("Unapproved update redirect target");
                            return;
                        }
                        conn = (HttpURLConnection) currentUrl.openConnection();
                        conn.setRequestMethod("GET");
                        conn.setConnectTimeout(15000);
                        conn.setReadTimeout(45000);
                        conn.setInstanceFollowRedirects(false);
                        conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android " + Build.VERSION.RELEASE + ") WaveCraft/" + getAppVersion());
                        conn.connect();

                        responseCode = conn.getResponseCode();
                        if (responseCode == HttpURLConnection.HTTP_MOVED_PERM ||
                            responseCode == HttpURLConnection.HTTP_MOVED_TEMP ||
                            responseCode == 307 || responseCode == 308) {
                            String newLocation = conn.getHeaderField("Location");
                            conn.disconnect();
                            conn = null;
                            if (newLocation == null || newLocation.isEmpty() || redirects >= MAX_APK_REDIRECTS) {
                                notifyUpdateError("Too many or invalid redirects while downloading update");
                                return;
                            }
                            currentUrl = new URL(currentUrl, newLocation);
                            redirects++;
                            continue;
                        }
                        break;
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
                    out.close();
                    out = null;

                    if (!verifyDownloadedApkSignature(apkFile)) {
                        apkFile.delete();
                        notifyUpdateError("Update package signature verification failed");
                        return;
                    }

                    notifyUpdateProgress(100);
                    final File verifiedApk = apkFile;
                    runOnUiThread(() -> promptInstallApk(verifiedApk));
                } catch (Exception e) {
                    e.printStackTrace();
                    if (apkFile != null && apkFile.exists()) {
                        apkFile.delete();
                    }
                    notifyUpdateError("Update download failed: " + e.getMessage());
                } finally {
                    synchronized (updateLock) {
                        isUpdatingApk = false;
                    }
                    try { if (in != null) in.close(); } catch (Exception ignored) {}
                    try { if (out != null) out.close(); } catch (Exception ignored) {}
                    try { if (conn != null) conn.disconnect(); } catch (Exception ignored) {}
                }
            }).start();
        }

        @JavascriptInterface
        public void triggerPendingInstall() {
            runOnUiThread(() -> {
                File apkFile = getPendingApkFile();
                if (apkFile.exists() && verifyDownloadedApkSignature(apkFile)) {
                    promptInstallApk(apkFile);
                } else {
                    if (apkFile.exists()) apkFile.delete();
                    notifyUpdateError("Valid update package not found. Please download again.");
                }
            });
        }

        @JavascriptInterface
        public void startVoiceSearch() {
            startVoiceSearchInternal();
        }

        @JavascriptInterface
        public void stopVoiceSearch() {
            stopVoiceSearchInternal();
        }

        @JavascriptInterface
        public boolean isVoiceSearchSupported() {
            return SpeechRecognizer.isRecognitionAvailable(MainActivity.this);
        }
    }

    private File getPendingApkFile() {
        File updatesDir = new File(getCacheDir(), "updates");
        if (!updatesDir.exists()) {
            updatesDir.mkdirs();
        }
        return new File(updatesDir, "WaveCraft_update.apk");
    }

    private boolean isSafePublicHttpsUrl(URL url) {
        if (url == null || !"https".equalsIgnoreCase(url.getProtocol())) {
            return false;
        }
        if (url.getUserInfo() != null && !url.getUserInfo().isEmpty()) {
            return false;
        }
        int port = url.getPort();
        if (port != -1 && port != 443) {
            return false;
        }
        String host = url.getHost() != null ? url.getHost().toLowerCase(Locale.ROOT) : "";
        if (host.isEmpty() || host.equals("localhost") || host.endsWith(".localhost") ||
            host.endsWith(".local") || host.endsWith(".internal") ||
            host.contains(":") || host.startsWith("[")) {
            return false;
        }
        try {
            InetAddress[] addrs = InetAddress.getAllByName(host);
            if (addrs == null || addrs.length == 0) {
                return false;
            }
            for (InetAddress addr : addrs) {
                if (isPrivateOrUnsafeAddress(addr)) {
                    return false;
                }
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private boolean isPrivateOrUnsafeAddress(InetAddress addr) {
        if (addr == null ||
            addr.isAnyLocalAddress() ||
            addr.isLoopbackAddress() ||
            addr.isLinkLocalAddress() ||
            addr.isSiteLocalAddress() ||
            addr.isMulticastAddress()) {
            return true;
        }
        byte[] bytes = addr.getAddress();
        if (bytes.length == 4) {
            int b0 = bytes[0] & 0xFF;
            int b1 = bytes[1] & 0xFF;
            if (b0 == 0 || b0 == 10 || b0 == 127) return true;
            if (b0 == 169 && b1 == 254) return true;
            if (b0 == 172 && b1 >= 16 && b1 <= 31) return true;
            if (b0 == 192 && b1 == 168) return true;
            if (b0 == 100 && (b1 & 0xC0) == 64) return true; // Carrier-grade NAT 100.64.0.0/10
        } else if (bytes.length == 16) {
            int b0 = bytes[0] & 0xFF;
            if ((b0 & 0xFE) == 0xFC) return true; // Unique local fc00::/7
            boolean isV4Mapped = true;
            for (int i = 0; i < 10; i++) {
                if (bytes[i] != 0) {
                    isV4Mapped = false;
                    break;
                }
            }
            if (isV4Mapped && (bytes[10] & 0xFF) == 0xFF && (bytes[11] & 0xFF) == 0xFF) {
                int v4b0 = bytes[12] & 0xFF;
                int v4b1 = bytes[13] & 0xFF;
                if (v4b0 == 0 || v4b0 == 10 || v4b0 == 127) return true;
                if (v4b0 == 169 && v4b1 == 254) return true;
                if (v4b0 == 172 && v4b1 >= 16 && v4b1 <= 31) return true;
                if (v4b0 == 192 && v4b1 == 168) return true;
            }
        }
        return false;
    }

    private boolean isAllowedApkUrl(URL url, boolean isRedirectHop) {
        if (url == null || !"https".equalsIgnoreCase(url.getProtocol())) {
            return false;
        }
        if (url.getUserInfo() != null && !url.getUserInfo().isEmpty()) {
            return false;
        }
        int port = url.getPort();
        if (port != -1 && port != 443) {
            return false;
        }
        String host = url.getHost() != null ? url.getHost().toLowerCase(Locale.ROOT) : "";
        String path = url.getPath() != null ? url.getPath().toLowerCase(Locale.ROOT) : "";

        if (!isRedirectHop) {
            if (!path.endsWith(".apk")) {
                return false;
            }
            if (host.equals("wavecraft-alpha.vercel.app")) {
                return path.equals("/wavecraft.apk") || path.equals("/wavecraft-pro.apk");
            }
            if (host.equals("github.com")) {
                return path.startsWith("/pradeep28012010/wavecraft/releases/");
            }
            return host.equals("objects.githubusercontent.com") || host.equals("release-assets.githubusercontent.com");
        }

        if (host.equals("wavecraft-alpha.vercel.app")) {
            return path.equals("/wavecraft.apk") || path.equals("/wavecraft-pro.apk");
        }
        if (host.equals("github.com")) {
            return path.startsWith("/pradeep28012010/wavecraft/releases/");
        }
        return host.equals("objects.githubusercontent.com") ||
            host.equals("release-assets.githubusercontent.com") ||
            host.endsWith(".githubusercontent.com");
    }

    private List<byte[]> extractSigningDigests(PackageInfo info) {
        List<byte[]> digests = new ArrayList<>();
        if (info == null) return digests;
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            Signature[] sigs = null;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                SigningInfo signingInfo = info.signingInfo;
                if (signingInfo != null) {
                    sigs = signingInfo.getApkContentsSigners();
                }
            } else {
                @SuppressWarnings("deprecation")
                Signature[] legacy = info.signatures;
                sigs = legacy;
            }
            if (sigs != null) {
                for (Signature sig : sigs) {
                    if (sig != null) {
                        digests.add(md.digest(sig.toByteArray()));
                    }
                }
            }
        } catch (Exception ignored) {}
        return digests;
    }

    private boolean verifyDownloadedApkSignature(File apkFile) {
        if (apkFile == null || !apkFile.exists() || apkFile.length() < 1024) {
            return false;
        }
        try {
            PackageManager pm = getPackageManager();
            int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? PackageManager.GET_SIGNING_CERTIFICATES
                : PackageManager.GET_SIGNATURES;
            PackageInfo archiveInfo = pm.getPackageArchiveInfo(apkFile.getAbsolutePath(), flags);
            if (archiveInfo == null || !getPackageName().equals(archiveInfo.packageName)) {
                return false;
            }
            PackageInfo installedInfo = pm.getPackageInfo(getPackageName(), flags);
            List<byte[]> archiveDigests = extractSigningDigests(archiveInfo);
            List<byte[]> installedDigests = extractSigningDigests(installedInfo);
            if (archiveDigests.isEmpty() || installedDigests.isEmpty()) {
                return false;
            }
            for (byte[] ad : archiveDigests) {
                for (byte[] id : installedDigests) {
                    if (Arrays.equals(ad, id)) {
                        return true;
                    }
                }
            }
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    private void evaluateJsCallback(final String script) {
        runOnUiThread(() -> {
            if (isFinishing() || isDestroyed() || bridge == null) return;
            WebView wv = bridge.getWebView();
            if (wv != null) {
                wv.evaluateJavascript(script, null);
            }
        });
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
        evaluateJsCallback(
            "window.__wavecraft_update_progress && window.__wavecraft_update_progress(" + percent + ")"
        );
    }

    private void notifyUpdateStatus(String status) {
        String safeStatus = JSONObject.quote(status != null ? status : "");
        evaluateJsCallback(
            "window.__wavecraft_update_status && window.__wavecraft_update_status(" + safeStatus + ")"
        );
    }

    private void notifyUpdateError(String error) {
        String safeErr = JSONObject.quote(error != null ? error : "Unknown error");
        evaluateJsCallback(
            "window.__wavecraft_update_error && window.__wavecraft_update_error(" + safeErr + ")"
        );
    }

    private static String pendingMediaAction = null;

    public static void sendMediaAction(String action) {
        MainActivity act = instance;
        if (act != null) {
            final String safeAction = JSONObject.quote(action != null ? action : "");
            act.runOnUiThread(() -> {
                if (act.isFinishing() || act.isDestroyed() || act.bridge == null) {
                    pendingMediaAction = action;
                    return;
                }
                WebView wv = act.bridge.getWebView();
                if (wv != null) {
                    wv.evaluateJavascript(
                        "window.__wavecraft_media_action && window.__wavecraft_media_action(" + safeAction + ")",
                        null
                    );
                } else {
                    pendingMediaAction = action;
                }
            });
        } else {
            pendingMediaAction = action;
        }
    }

    public void startVoiceSearchInternal() {
        runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_RECORD_AUDIO);
                    return;
                }
            }

            if (!SpeechRecognizer.isRecognitionAvailable(this)) {
                notifyVoiceError("Speech recognition is not available on this device.");
                return;
            }

            try {
                if (speechRecognizer != null) {
                    try {
                        speechRecognizer.destroy();
                    } catch (Exception ignored) {}
                    speechRecognizer = null;
                }

                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
                intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());

                speechRecognizer.setRecognitionListener(new RecognitionListener() {
                    @Override
                    public void onReadyForSpeech(Bundle params) {
                        notifyVoiceStatus("listening");
                    }

                    @Override
                    public void onBeginningOfSpeech() {
                        notifyVoiceStatus("recording");
                    }

                    @Override
                    public void onRmsChanged(float rmsdB) {}

                    @Override
                    public void onBufferReceived(byte[] buffer) {}

                    @Override
                    public void onEndOfSpeech() {
                        notifyVoiceStatus("processing");
                    }

                    @Override
                    public void onError(int error) {
                        String errMsg;
                        switch (error) {
                            case SpeechRecognizer.ERROR_AUDIO: errMsg = "Audio recording error"; break;
                            case SpeechRecognizer.ERROR_CLIENT: errMsg = "Client error"; break;
                            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: errMsg = "Microphone permission required"; break;
                            case SpeechRecognizer.ERROR_NETWORK: errMsg = "Network error"; break;
                            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: errMsg = "Network timeout"; break;
                            case SpeechRecognizer.ERROR_NO_MATCH: errMsg = "No speech recognized"; break;
                            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: errMsg = "Recognition service busy"; break;
                            case SpeechRecognizer.ERROR_SERVER: errMsg = "Server error"; break;
                            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: errMsg = "No speech input detected"; break;
                            default: errMsg = "Voice recognition error (" + error + ")"; break;
                        }
                        notifyVoiceError(errMsg);
                    }

                    @Override
                    public void onResults(Bundle results) {
                        ArrayList<String> matches = results != null ? results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) : null;
                        if (matches != null && !matches.isEmpty()) {
                            notifyVoiceResult(matches.get(0), true);
                        } else {
                            notifyVoiceEnd();
                        }
                    }

                    @Override
                    public void onPartialResults(Bundle partialResults) {
                        ArrayList<String> matches = partialResults != null ? partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) : null;
                        if (matches != null && !matches.isEmpty()) {
                            notifyVoiceResult(matches.get(0), false);
                        }
                    }

                    @Override
                    public void onEvent(int eventType, Bundle params) {}
                });

                speechRecognizer.startListening(intent);
                notifyVoiceStatus("listening");
            } catch (Exception e) {
                e.printStackTrace();
                notifyVoiceError("Speech recognition error: " + e.getMessage());
            }
        });
    }

    public void stopVoiceSearchInternal() {
        runOnUiThread(() -> {
            if (speechRecognizer != null) {
                try {
                    speechRecognizer.stopListening();
                } catch (Exception ignored) {}
            }
            notifyVoiceEnd();
        });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_RECORD_AUDIO) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startVoiceSearchInternal();
            } else {
                notifyVoiceError("Microphone permission was denied.");
            }
        }
    }

    private void notifyVoiceStatus(String status) {
        String safe = JSONObject.quote(status != null ? status : "");
        evaluateJsCallback(
            "window.__wavecraft_voice_status && window.__wavecraft_voice_status(" + safe + ")"
        );
    }

    private void notifyVoiceResult(String transcript, boolean isFinal) {
        String safe = JSONObject.quote(transcript != null ? transcript : "");
        evaluateJsCallback(
            "window.__wavecraft_voice_result && window.__wavecraft_voice_result(" + safe + ", " + isFinal + ")"
        );
    }

    private void notifyVoiceError(String error) {
        String safe = JSONObject.quote(error != null ? error : "");
        evaluateJsCallback(
            "window.__wavecraft_voice_error && window.__wavecraft_voice_error(" + safe + ")"
        );
    }

    private void notifyVoiceEnd() {
        evaluateJsCallback("window.__wavecraft_voice_end && window.__wavecraft_voice_end()");
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
            if (!webViewConfigured) {
                WebSettings settings = webView.getSettings();
                // Zero user gesture restriction for gapless audio transitions
                settings.setMediaPlaybackRequiresUserGesture(false);
                // Enforce HTTPS-only resources in production WebView
                settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
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

                // Support third-party cookies for embedded streams
                android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
                android.webkit.CookieManager.getInstance().setAcceptCookie(true);
                settings.setCacheMode(WebSettings.LOAD_DEFAULT);

                // Register native bridge once per WebView instance
                webView.addJavascriptInterface(new AndroidAudioBridge(), "AndroidAudioBridge");
                webViewConfigured = true;
            }
            keepWebViewAlive();
        }
    }

    private void keepWebViewAlive() {
        runOnUiThread(() -> {
            if (isFinishing() || isDestroyed() || bridge == null) return;
            WebView webView = bridge.getWebView();
            if (webView == null) return;
            try {
                webView.resumeTimers();
                webView.onResume();
            } catch (Exception ignored) {}
        });
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
        keepWebViewAlive();
        if (pendingMediaAction != null && bridge != null && bridge.getWebView() != null) {
            final String act = pendingMediaAction;
            pendingMediaAction = null;
            bridge.getWebView().postDelayed(() -> {
                sendMediaAction(act);
            }, 350);
        }
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
        if (speechRecognizer != null) {
            try {
                speechRecognizer.destroy();
            } catch (Exception ignored) {}
            speechRecognizer = null;
        }
        instance = null;
        super.onDestroy();
    }
}
