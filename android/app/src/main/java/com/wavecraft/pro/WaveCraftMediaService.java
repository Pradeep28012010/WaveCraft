package com.wavecraft.pro;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;
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
    private MediaSession mediaSession;

    private String currentTitle = "WaveCraft Music";
    private String currentArtist = "WaveCraft Studio";
    private String currentArtUrl = null;
    private Bitmap currentArtBitmap = null;
    private boolean isCurrentlyPlaying = true;
    private long currentPositionMs = 0;
    private long currentDurationMs = 210000L;

    @Override
    public void onCreate() {
        super.onCreate();
        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "WaveCraft:PlaybackWakeLock");
            wakeLock.setReferenceCounted(false);
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
                    MainActivity.sendMediaAction("play_pause");
                }

                @Override
                public void onPause() {
                    MainActivity.sendMediaAction("play_pause");
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
                boolean playing = intent.getBooleanExtra(EXTRA_IS_PLAYING, isCurrentlyPlaying);
                long pos = intent.getLongExtra(EXTRA_POSITION_MS, currentPositionMs);
                long dur = intent.getLongExtra(EXTRA_DURATION_MS, currentDurationMs);
                updatePlaybackStateOnly(playing, pos, dur);
            } else if (ACTION_STOP.equals(action)) {
                stopForegroundPlayback();
            } else if (ACTION_PREV.equals(action)) {
                MainActivity.sendMediaAction("prev");
            } else if (ACTION_PLAY_PAUSE.equals(action)) {
                MainActivity.sendMediaAction("play_pause");
            } else if (ACTION_NEXT.equals(action)) {
                MainActivity.sendMediaAction("next");
            }
        }
        return START_NOT_STICKY;
    }

    private void updatePlaybackStateOnly(boolean playing, long pos, long dur) {
        isCurrentlyPlaying = playing;
        if (pos >= 0) currentPositionMs = pos;
        if (dur > 0) currentDurationMs = dur;

        updateMediaMetadata();
        updatePlaybackSessionState();

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, buildNotification());
        }
    }

    private void startForegroundPlayback(String title, String artist, String thumbnail, boolean isPlaying, long pos, long dur) {
        if (wakeLock != null && !wakeLock.isHeld()) {
            wakeLock.acquire(12 * 60 * 60 * 1000L); // 12 hours max safety limit
        }

        if (title != null && !title.trim().isEmpty()) {
            currentTitle = title;
        }
        if (artist != null && !artist.trim().isEmpty()) {
            currentArtist = artist;
        }
        isCurrentlyPlaying = isPlaying;
        if (pos >= 0) currentPositionMs = pos;
        if (dur > 0) currentDurationMs = dur;

        initMediaSession();
        updateMediaMetadata();
        updatePlaybackSessionState();

        Notification notification = buildNotification();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
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
            for (String urlStr : candidates) {
                try {
                    URL url = new URL(urlStr);
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setDoInput(true);
                    conn.setConnectTimeout(3000);
                    conn.setReadTimeout(3000);
                    conn.connect();
                    if (conn.getResponseCode() == 200) {
                        InputStream input = conn.getInputStream();
                        Bitmap bmp = BitmapFactory.decodeStream(input);
                        if (bmp != null) {
                            downloadedBmp = bmp;
                            break;
                        }
                    }
                } catch (Exception ignored) {}
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
        if (wakeLock != null && wakeLock.isHeld()) {
            try {
                wakeLock.release();
            } catch (Exception ignored) {}
        }
        if (mediaSession != null) {
            mediaSession.setActive(false);
        }
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
        if (wakeLock != null && wakeLock.isHeld()) {
            try {
                wakeLock.release();
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
