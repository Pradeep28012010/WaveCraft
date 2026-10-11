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
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class WaveCraftMediaService extends Service {
    public static final String ACTION_START = "ACTION_START";
    public static final String ACTION_STOP = "ACTION_STOP";
    public static final String ACTION_PREV = "com.wavecraft.pro.ACTION_PREV";
    public static final String ACTION_PLAY_PAUSE = "com.wavecraft.pro.ACTION_PLAY_PAUSE";
    public static final String ACTION_NEXT = "com.wavecraft.pro.ACTION_NEXT";

    public static final String EXTRA_TITLE = "EXTRA_TITLE";
    public static final String EXTRA_ARTIST = "EXTRA_ARTIST";
    public static final String EXTRA_THUMBNAIL = "EXTRA_THUMBNAIL";
    public static final String EXTRA_IS_PLAYING = "EXTRA_IS_PLAYING";

    private static final String CHANNEL_ID = "wavecraft_playback_channel";
    private static final int NOTIFICATION_ID = 1001;

    private PowerManager.WakeLock wakeLock;
    private MediaSession mediaSession;

    private String currentTitle = "WaveCraft Music";
    private String currentArtist = "WaveCraft Studio";
    private String currentArtUrl = null;
    private Bitmap currentArtBitmap = null;
    private boolean isCurrentlyPlaying = true;

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
                startForegroundPlayback(title, artist, thumb, playing);
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

    private void startForegroundPlayback(String title, String artist, String thumbnail, boolean isPlaying) {
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

        initMediaSession();

        // Update MediaSession PlaybackState
        PlaybackState.Builder stateBuilder = new PlaybackState.Builder()
            .setActions(
                PlaybackState.ACTION_PLAY |
                PlaybackState.ACTION_PAUSE |
                PlaybackState.ACTION_SKIP_TO_NEXT |
                PlaybackState.ACTION_SKIP_TO_PREVIOUS |
                PlaybackState.ACTION_PLAY_PAUSE
            )
            .setState(
                isCurrentlyPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                PlaybackState.PLAYBACK_POSITION_UNKNOWN,
                1.0f
            );
        mediaSession.setPlaybackState(stateBuilder.build());

        Notification notification = buildNotification();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        // Asynchronously fetch artwork if provided and different from current
        if (thumbnail != null && !thumbnail.trim().isEmpty() && !thumbnail.equals(currentArtUrl)) {
            currentArtUrl = thumbnail;
            final String artToLoad = thumbnail;
            new Thread(() -> {
                try {
                    URL url = new URL(artToLoad);
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setDoInput(true);
                    conn.setConnectTimeout(4000);
                    conn.setReadTimeout(4000);
                    conn.connect();
                    InputStream input = conn.getInputStream();
                    Bitmap bmp = BitmapFactory.decodeStream(input);
                    if (bmp != null && artToLoad.equals(currentArtUrl)) {
                        currentArtBitmap = bmp;
                        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                        if (manager != null) {
                            manager.notify(NOTIFICATION_ID, buildNotification());
                        }
                    }
                } catch (Exception ignored) {}
            }).start();
        }
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
            .setMediaSession(mediaSession.getSessionToken())
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
