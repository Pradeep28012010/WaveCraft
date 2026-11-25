package com.wavecraft.pro;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;
import android.net.wifi.WifiManager;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class WaveCraftMediaService extends Service {
    public static final String ACTION_START = "ACTION_START";
    public static final String ACTION_STOP = "ACTION_STOP";
    public static final String ACTION_UPDATE_STATE = "ACTION_UPDATE_STATE";
    public static final String ACTION_PREV = "com.wavecraft.pro.ACTION_PREV";
    public static final String ACTION_PLAY_PAUSE = "com.wavecraft.pro.ACTION_PLAY_PAUSE";
    public static final String ACTION_NEXT = "com.wavecraft.pro.ACTION_NEXT";

    public static final String EXTRA_TITLE = "EXTRA_TITLE";
    public static final String EXTRA_ARTIST = "EXTRA_ARTIST";
    public static final String EXTRA_THUMBNAIL = "EXTRA_THUMBNAIL";
    public static final String EXTRA_IS_PLAYING = "EXTRA_IS_PLAYING";
    public static final String EXTRA_POSITION_MS = "EXTRA_POSITION_MS";
    public static final String EXTRA_DURATION_MS = "EXTRA_DURATION_MS";

    private static final String CHANNEL_ID = "wavecraft_playback_channel";
    private static final int NOTIFICATION_ID = 1001;

    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private MediaSession mediaSession;

    private String currentTitle = "WaveCraft Music";
    private String currentArtist = "WaveCraft Studio";
    private String currentArtUrl = null;
    private Bitmap currentArtBitmap = null;
    private boolean isCurrentlyPlaying = true;
    private long currentPositionMs = 0;
    private long currentDurationMs = 210000L;
    private long lastNotificationUpdateMs = 0;
    private BroadcastReceiver noisyAudioReceiver;
    private boolean isNoisyReceiverRegistered = false;
    private boolean isForegroundActive = false;

    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private AudioManager.OnAudioFocusChangeListener audioFocusChangeListener;
    private boolean resumeOnFocusGain = false;
    private boolean isDucked = false;

    private void initAudioFocus() {
        if (audioManager == null) {
            audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        }
        if (audioFocusChangeListener == null) {
            audioFocusChangeListener = new AudioManager.OnAudioFocusChangeListener() {
                @Override
                public void onAudioFocusChange(int focusChange) {
                    switch (focusChange) {
                        case AudioManager.AUDIOFOCUS_LOSS:
                            // Another app took exclusive audio focus permanently (e.g. YouTube, Spotify)
                            resumeOnFocusGain = false;
                            isDucked = false;
                            MainActivity.sendMediaAction("pause");
                            updatePlaybackStateOnly(false, currentPositionMs, currentDurationMs);
                            break;

                        case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
                            // Incoming phone call or transient audio interruption
                            if (isCurrentlyPlaying) {
                                resumeOnFocusGain = true;
                                MainActivity.sendMediaAction("pause");
                                updatePlaybackStateOnly(false, currentPositionMs, currentDurationMs);
                            }
                            break;

                        case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
                            // Navigation direction prompt or notification chime: duck volume to background
                            if (isCurrentlyPlaying) {
                                isDucked = true;
                                MainActivity.sendMediaAction("duck");
                            }
                            break;

                        case AudioManager.AUDIOFOCUS_GAIN:
                            // Focus regained after phone call or GPS direction completed
                            if (isDucked) {
                                isDucked = false;
                                MainActivity.sendMediaAction("unduck");
                            }
                            if (resumeOnFocusGain) {
                                resumeOnFocusGain = false;
                                MainActivity.sendMediaAction("play");
                                updatePlaybackStateOnly(true, currentPositionMs, currentDurationMs);
                            }
                            break;
                    }
                }
            };
        }
    }

    private boolean requestAudioFocus() {
        initAudioFocus();
        if (audioManager == null) return false;
        int res;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                AudioAttributes playbackAttributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build();
                audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(playbackAttributes)
                    .setAcceptsDelayedFocusGain(true)
                    .setOnAudioFocusChangeListener(audioFocusChangeListener)
                    .build();
                res = audioManager.requestAudioFocus(audioFocusRequest);
            } else {
                res = audioManager.requestAudioFocus(
                    audioFocusChangeListener,
                    AudioManager.STREAM_MUSIC,
                    AudioManager.AUDIOFOCUS_GAIN
                );
            }
            return res == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        } catch (Exception ignored) {
            return false;
        }
    }

    private void abandonAudioFocus() {
        if (audioManager == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
                audioManager.abandonAudioFocusRequest(audioFocusRequest);
            } else if (audioFocusChangeListener != null) {
                audioManager.abandonAudioFocus(audioFocusChangeListener);
            }
        } catch (Exception ignored) {}
    }

    private void registerNoisyReceiver() {
        if (!isNoisyReceiverRegistered) {
            if (noisyAudioReceiver == null) {
                noisyAudioReceiver = new BroadcastReceiver() {
                    @Override
                    public void onReceive(Context context, Intent intent) {
                        if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) {
                            MainActivity.sendMediaAction("pause");
                            updatePlaybackStateOnly(false, currentPositionMs, currentDurationMs);
                        }
                    }
                };
            }
            try {
                IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
                registerReceiver(noisyAudioReceiver, filter);
                isNoisyReceiverRegistered = true;
            } catch (Exception ignored) {}
        }
    }

    private void unregisterNoisyReceiver() {
        if (isNoisyReceiverRegistered && noisyAudioReceiver != null) {
            try {
                unregisterReceiver(noisyAudioReceiver);
            } catch (Exception ignored) {}
            isNoisyReceiverRegistered = false;
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "WaveCraft:PlaybackWakeLock");
            wakeLock.setReferenceCounted(false);
        }
        WifiManager wifiManager = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wifiManager != null) {
            wifiLock = wifiManager.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "WaveCraft:PlaybackWifiLock");
            wifiLock.setReferenceCounted(false);
        }
        createNotificationChannel();
        initMediaSession();
    }

    private void initMediaSession() {
        if (mediaSession == null) {
            mediaSession = new MediaSession(this, "WaveCraftMediaSession");
            mediaSession.setCallback(new MediaSession.Callback() {
                @Override
                public void onPlay() {
                    MainActivity.sendMediaAction("play");
                }

                @Override
                public void onPause() {
                    MainActivity.sendMediaAction("pause");
                }

                @Override
                public void onSkipToNext() {
                    MainActivity.sendMediaAction("next");
                }

                @Override
                public void onSkipToPrevious() {
                    MainActivity.sendMediaAction("prev");
                }

                @Override
                public void onSeekTo(long pos) {
                    currentPositionMs = pos;
                    MainActivity.sendMediaAction("seek:" + (pos / 1000.0));
                    updatePlaybackSessionState();
                }
            });
            mediaSession.setActive(true);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if (ACTION_START.equals(action)) {
                String title = intent.getStringExtra(EXTRA_TITLE);
                String artist = intent.getStringExtra(EXTRA_ARTIST);
                String thumb = intent.getStringExtra(EXTRA_THUMBNAIL);
                boolean playing = intent.getBooleanExtra(EXTRA_IS_PLAYING, true);
                long pos = intent.getLongExtra(EXTRA_POSITION_MS, 0L);
                long dur = intent.getLongExtra(EXTRA_DURATION_MS, 0L);
                startForegroundPlayback(title, artist, thumb, playing, pos, dur);
            } else if (ACTION_UPDATE_STATE.equals(action)) {
                String maybeTitle = intent.getStringExtra(EXTRA_TITLE);
                String maybeArtist = intent.getStringExtra(EXTRA_ARTIST);
                String maybeThumb = intent.getStringExtra(EXTRA_THUMBNAIL);
                boolean playing = intent.getBooleanExtra(EXTRA_IS_PLAYING, isCurrentlyPlaying);
                long pos = intent.getLongExtra(EXTRA_POSITION_MS, currentPositionMs);
                long dur = intent.getLongExtra(EXTRA_DURATION_MS, currentDurationMs);
                boolean metaChanged = false;
                if (maybeTitle != null && !maybeTitle.trim().isEmpty() && !maybeTitle.equals(currentTitle)) {
                    currentTitle = maybeTitle;
                    metaChanged = true;
                }
                if (maybeArtist != null && !maybeArtist.trim().isEmpty() && !maybeArtist.equals(currentArtist)) {
                    currentArtist = maybeArtist;
                    metaChanged = true;
                }
                if (maybeThumb != null && !maybeThumb.equals(currentArtUrl)) {
                    currentArtBitmap = null;
                    metaChanged = true;
                }
                if (!isForegroundActive) {
                    initMediaSession();
                    Notification fgNotif = buildNotification();
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        startForeground(NOTIFICATION_ID, fgNotif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
                    } else {
                        startForeground(NOTIFICATION_ID, fgNotif);
                    }
                    isForegroundActive = true;
                }
                updatePlaybackStateOnly(playing, pos, dur, metaChanged);
                if (maybeThumb != null && !maybeThumb.trim().isEmpty() && !maybeThumb.equals(currentArtUrl)) {
                    fetchArtworkWithFallback(maybeThumb);
                }
            } else if (ACTION_STOP.equals(action)) {
                stopForegroundPlayback();
            } else if (ACTION_PREV.equals(action)) {
                MainActivity.sendMediaAction("prev");
            } else if (ACTION_PLAY_PAUSE.equals(action)) {
                if (isCurrentlyPlaying) {
                    MainActivity.sendMediaAction("pause");
                } else {
                    MainActivity.sendMediaAction("play");
                }
            } else if (ACTION_NEXT.equals(action)) {
                MainActivity.sendMediaAction("next");
            }
        }
        return START_NOT_STICKY;
    }

    private void updatePlaybackStateOnly(boolean playing, long pos, long dur) {
        updatePlaybackStateOnly(playing, pos, dur, false);
    }

    private void updatePlaybackStateOnly(boolean playing, long pos, long dur, boolean metadataChanged) {
        boolean playStateChanged = (isCurrentlyPlaying != playing);
        boolean durationChanged = (dur > 0 && dur != currentDurationMs);
        isCurrentlyPlaying = playing;
        if (pos >= 0) currentPositionMs = pos;
        if (dur > 0) currentDurationMs = dur;

        updatePlaybackSessionState();

        if (playStateChanged) {
            if (playing) {
                requestAudioFocus();
                registerNoisyReceiver();
            } else if (!resumeOnFocusGain) {
                abandonAudioFocus();
                unregisterNoisyReceiver();
            }
        }

        if (playStateChanged || durationChanged || metadataChanged) {
            updateMediaMetadata();
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.notify(NOTIFICATION_ID, buildNotification());
            }
        }
    }

    private void startForegroundPlayback(String title, String artist, String thumbnail, boolean isPlaying, long pos, long dur) {
        if (wakeLock != null && !wakeLock.isHeld()) {
            wakeLock.acquire(12 * 60 * 60 * 1000L); // 12 hours max safety limit
        }
        if (wifiLock != null && !wifiLock.isHeld()) {
            try { wifiLock.acquire(); } catch (Exception ignored) {}
        }

        if (title != null && !title.trim().isEmpty()) {
            currentTitle = title;
        }
        if (artist != null && !artist.trim().isEmpty()) {
            currentArtist = artist;
        }
        isCurrentlyPlaying = isPlaying;
        currentPositionMs = Math.max(0, pos);
        if (dur > 0) currentDurationMs = dur;

        // Reset art bitmap if thumbnail changed or was cleared to prevent stale artwork
        if (thumbnail == null || thumbnail.trim().isEmpty()) {
            currentArtBitmap = null;
            currentArtUrl = null;
        } else if (!thumbnail.equals(currentArtUrl)) {
            currentArtBitmap = null;
        }

        initMediaSession();
        registerNoisyReceiver();
        if (isPlaying) {
            requestAudioFocus();
        }
        updateMediaMetadata();
        updatePlaybackSessionState();

        Notification notification = buildNotification();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        isForegroundActive = true;

        // Explicitly repaint the foreground notification on modern Android (12+)
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, notification);
        }

        // Asynchronously fetch high-resolution artwork with multi-CDN resolution waterfall
        if (thumbnail != null && !thumbnail.trim().isEmpty() && !thumbnail.equals(currentArtUrl)) {
            fetchArtworkWithFallback(thumbnail);
        }
    }

    private void updateMediaMetadata() {
        if (mediaSession == null) return;
        try {
            MediaMetadata.Builder metaBuilder = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, currentTitle)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, currentArtist)
                .putString(MediaMetadata.METADATA_KEY_ALBUM, "WaveCraft")
                .putLong(MediaMetadata.METADATA_KEY_DURATION, currentDurationMs > 0 ? currentDurationMs : 210000L);

            if (currentArtBitmap != null) {
                metaBuilder.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, currentArtBitmap);
                metaBuilder.putBitmap(MediaMetadata.METADATA_KEY_ART, currentArtBitmap);
            }
            mediaSession.setMetadata(metaBuilder.build());
        } catch (Exception ignored) {}
    }

    private void updatePlaybackSessionState() {
        if (mediaSession == null) return;
        try {
            PlaybackState.Builder stateBuilder = new PlaybackState.Builder()
                .setActions(
                    PlaybackState.ACTION_PLAY |
                    PlaybackState.ACTION_PAUSE |
                    PlaybackState.ACTION_SKIP_TO_NEXT |
                    PlaybackState.ACTION_SKIP_TO_PREVIOUS |
                    PlaybackState.ACTION_PLAY_PAUSE |
                    PlaybackState.ACTION_SEEK_TO
                )
                .setState(
                    isCurrentlyPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                    currentPositionMs,
                    isCurrentlyPlaying ? 1.0f : 0.0f,
                    SystemClock.elapsedRealtime()
                );
            mediaSession.setPlaybackState(stateBuilder.build());
        } catch (Exception ignored) {}
    }

    private void fetchArtworkWithFallback(String rawThumbnail) {
        currentArtUrl = rawThumbnail;
        final String target = rawThumbnail;

        new Thread(() -> {
            List<String> candidates = new ArrayList<>();
            // If it's a YouTube URL, extract videoId and prioritize HD thumbnails with fallback
            if (target.contains("i.ytimg.com") || target.contains("youtube.com")) {
                String vidId = null;
                Matcher m = Pattern.compile("/vi/([a-zA-Z0-9_-]+)/").matcher(target);
                if (m.find()) {
                    vidId = m.group(1);
                }
                if (vidId != null) {
                    candidates.add("https://i.ytimg.com/vi/" + vidId + "/maxresdefault.jpg");
                    candidates.add("https://i.ytimg.com/vi/" + vidId + "/sddefault.jpg");
                    candidates.add("https://i.ytimg.com/vi/" + vidId + "/hqdefault.jpg");
                    candidates.add("https://i.ytimg.com/vi/" + vidId + "/mqdefault.jpg");
                }
            }
            if (!candidates.contains(target)) {
                candidates.add(target);
            }

            Bitmap downloadedBmp = null;
            Bitmap fallbackBmp = null;
            for (String urlStr : candidates) {
                HttpURLConnection conn = null;
                InputStream input = null;
                try {
                    URL url = new URL(urlStr);
                    if (!"https".equalsIgnoreCase(url.getProtocol())) {
                        continue;
                    }
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setDoInput(true);
                    conn.setConnectTimeout(3000);
                    conn.setReadTimeout(3000);
                    conn.setInstanceFollowRedirects(false);
                    conn.connect();
                    if (conn.getResponseCode() == 200) {
                        input = conn.getInputStream();
                        Bitmap bmp = BitmapFactory.decodeStream(input);
                        if (bmp != null) {
                            // YouTube returns 120x90 gray placeholder for missing maxresdefault/sddefault
                            if (bmp.getWidth() > 120 && bmp.getHeight() > 90) {
                                downloadedBmp = bmp;
                                break;
                            } else if (fallbackBmp == null) {
                                fallbackBmp = bmp;
                            }
                        }
                    }
                } catch (Exception ignored) {
                } finally {
                    try { if (input != null) input.close(); } catch (Exception ignored) {}
                    try { if (conn != null) conn.disconnect(); } catch (Exception ignored) {}
                }
            }
            if (downloadedBmp == null && fallbackBmp != null) {
                downloadedBmp = fallbackBmp;
            }

            if (downloadedBmp != null && target.equals(currentArtUrl)) {
                currentArtBitmap = downloadedBmp;
                updateMediaMetadata();
                NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (manager != null) {
                    manager.notify(NOTIFICATION_ID, buildNotification());
                }
            }
        }).start();
    }

    private Notification buildNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            notificationIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        Intent prevIntent = new Intent(this, WaveCraftMediaService.class).setAction(ACTION_PREV);
        PendingIntent pPrev = PendingIntent.getService(
            this, 1, prevIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        Intent playPauseIntent = new Intent(this, WaveCraftMediaService.class).setAction(ACTION_PLAY_PAUSE);
        PendingIntent pPlayPause = PendingIntent.getService(
            this, 2, playPauseIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        Intent nextIntent = new Intent(this, WaveCraftMediaService.class).setAction(ACTION_NEXT);
        PendingIntent pNext = PendingIntent.getService(
            this, 3, nextIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        Notification.Action prevAction = new Notification.Action.Builder(
            android.R.drawable.ic_media_previous, "Previous", pPrev
        ).build();

        int playPauseIcon = isCurrentlyPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play;
        String playPauseTitle = isCurrentlyPlaying ? "Pause" : "Play";
        Notification.Action playPauseAction = new Notification.Action.Builder(
            playPauseIcon, playPauseTitle, pPlayPause
        ).build();

        Notification.Action nextAction = new Notification.Action.Builder(
            android.R.drawable.ic_media_next, "Next", pNext
        ).build();

        Notification.MediaStyle mediaStyle = new Notification.MediaStyle()
            .setMediaSession(mediaSession != null ? mediaSession.getSessionToken() : null)
            .setShowActionsInCompactView(0, 1, 2);

        Notification.Builder builder = new Notification.Builder(this, CHANNEL_ID)
            .setContentTitle(currentTitle)
            .setContentText(currentArtist)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setOngoing(isCurrentlyPlaying)
            .setOnlyAlertOnce(true)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setStyle(mediaStyle)
            .addAction(prevAction)
            .addAction(playPauseAction)
            .addAction(nextAction);

        if (currentArtBitmap != null) {
            builder.setLargeIcon(currentArtBitmap);
        }

        return builder.build();
    }

    private void stopForegroundPlayback() {
        abandonAudioFocus();
        unregisterNoisyReceiver();
        if (wakeLock != null && wakeLock.isHeld()) {
            try {
                wakeLock.release();
            } catch (Exception ignored) {}
        }
        if (wifiLock != null && wifiLock.isHeld()) {
            try {
                wifiLock.release();
            } catch (Exception ignored) {}
        }
        if (mediaSession != null) {
            mediaSession.setActive(false);
        }
        isForegroundActive = false;
        stopForeground(true);
        stopSelf();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "WaveCraft Pro Audio Playback",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Background audio playback service for continuous music streaming");
            channel.setShowBadge(true);
            channel.setSound(null, null);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public void onDestroy() {
        isForegroundActive = false;
        abandonAudioFocus();
        unregisterNoisyReceiver();
        if (wakeLock != null && wakeLock.isHeld()) {
            try {
                wakeLock.release();
            } catch (Exception ignored) {}
        }
        if (wifiLock != null && wifiLock.isHeld()) {
            try {
                wifiLock.release();
            } catch (Exception ignored) {}
        }
        if (mediaSession != null) {
            mediaSession.release();
            mediaSession = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
