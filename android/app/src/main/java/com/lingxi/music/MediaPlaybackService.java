package com.lingxi.music;

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
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.RectF;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.Process;
import android.util.Base64;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MediaPlaybackService extends Service {
    public static final String CHANNEL_ID = "lingxi_playback_channel_v2";
    public static final int NOTIFICATION_ID = 1001;

    public static final String ACTION_PLAY_PAUSE = "com.lingxi.music.ACTION_PLAY_PAUSE";
    public static final String ACTION_PREV = "com.lingxi.music.ACTION_PREV";
    public static final String ACTION_NEXT = "com.lingxi.music.ACTION_NEXT";
    public static final String ACTION_FAV = "com.lingxi.music.ACTION_FAV";
    public static final String ACTION_LYRICS = "com.lingxi.music.ACTION_LYRICS";
    public static final String ACTION_UPDATE_STATE = "com.lingxi.music.ACTION_UPDATE_STATE";
    public static final String ACTION_PLAY_URL = "com.lingxi.music.ACTION_PLAY_URL";
    public static final String ACTION_PAUSE = "com.lingxi.music.ACTION_PAUSE";
    public static final String ACTION_RESUME = "com.lingxi.music.ACTION_RESUME";
    public static final String ACTION_SEEK = "com.lingxi.music.ACTION_SEEK";

    private static MediaPlaybackService sInstance = null;
    public static MediaPlaybackService getInstance() { return sInstance; }

    private MediaSession mediaSession;
    private NotificationManager notificationManager;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private Bitmap defaultCoverBitmap = null;

    private MediaPlayer mediaPlayer = null;
    private String currentAudioUrl = "";
    private boolean isPrepared = false;
    private boolean isPreparing = false;
    private long pendingSeekMs = -1;

    private String currentTitle = "灵犀音乐";
    private String currentArtist = "随心听";
    private String currentCoverUrl = "";
    private boolean isPlaying = false;
    private boolean isFav = false;
    private boolean isLyricsActive = false;
    private long currentPositionMs = 0;
    private long durationMs = 180000;
    private Bitmap currentCoverBitmap = null;

    @Override
    public void onCreate() {
        super.onCreate();
        sInstance = this;
        try {
            Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO);
        } catch (Exception ignored) {}
        notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "LingXiMusic:PlaybackWakeLock");
                wakeLock.setReferenceCounted(false);
            }
        } catch (Exception ignored) {}

        try {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                int wifiMode = WifiManager.WIFI_MODE_FULL;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    wifiMode = WifiManager.WIFI_MODE_FULL_HIGH_PERF;
                }
                wifiLock = wm.createWifiLock(wifiMode, "LingXiMusic:PlaybackWifiLock");
                wifiLock.setReferenceCounted(false);
            }
        } catch (Exception ignored) {}

        createNotificationChannel();
        initMediaSession();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "灵犀音乐播放状态",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("在通知栏、锁屏与状态栏胶囊显示当前播放歌曲与播控卡片");
            channel.setShowBadge(false);
            channel.setSound(null, null);
            channel.enableVibration(false);
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
            }
        }
    }

    private void initMediaSession() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            mediaSession = new MediaSession(this, "LingXiMusicSession");
            mediaSession.setCallback(new MediaSession.Callback() {
                @Override
                public void onPlay() {
                    resumePlayback();
                }
                @Override
                public void onPause() {
                    pausePlayback();
                }
                @Override
                public void onSkipToNext() {
                    MainActivity.dispatchWebAction("playNext()");
                }
                @Override
                public void onSkipToPrevious() {
                    MainActivity.dispatchWebAction("playPrev()");
                }
                @Override
                public void onSeekTo(long pos) {
                    seekTo(pos);
                }
            });
            mediaSession.setActive(true);
        }
    }

    private synchronized void initMediaPlayerIfNeeded() {
        if (mediaPlayer == null) {
            mediaPlayer = new MediaPlayer();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                AudioAttributes attrs = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build();
                mediaPlayer.setAudioAttributes(attrs);
            }
            try {
                mediaPlayer.setWakeMode(getApplicationContext(), PowerManager.PARTIAL_WAKE_LOCK);
            } catch (Exception ignored) {}

            mediaPlayer.setOnPreparedListener(new MediaPlayer.OnPreparedListener() {
                @Override
                public void onPrepared(MediaPlayer mp) {
                    isPrepared = true;
                    isPreparing = false;
                    if (pendingSeekMs > 0) {
                        try {
                            mp.seekTo((int) pendingSeekMs);
                        } catch (Exception ignored) {}
                        pendingSeekMs = -1;
                    }
                    try {
                        mp.start();
                        isPlaying = true;
                        durationMs = mp.getDuration();
                        acquireLocks();
                        buildAndPostNotification(currentCoverBitmap != null ? currentCoverBitmap : getRoundedDefaultCover());
                        MainActivity.setNativePlaybackState(true);
                        MainActivity.dispatchWebAction("if (window.onNativePrepared) window.onNativePrepared(" + (durationMs / 1000.0) + ");");
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }
            });

            mediaPlayer.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
                @Override
                public void onCompletion(MediaPlayer mp) {
                    isPlaying = false;
                    releaseLocks();
                    buildAndPostNotification(currentCoverBitmap != null ? currentCoverBitmap : getRoundedDefaultCover());
                    MainActivity.setNativePlaybackState(false);
                    MainActivity.dispatchWebAction("if (window.onNativeCompletion) window.onNativeCompletion(); else if (typeof handleTrackEnd === 'function') handleTrackEnd();");
                }
            });

            mediaPlayer.setOnErrorListener(new MediaPlayer.OnErrorListener() {
                @Override
                public boolean onError(MediaPlayer mp, int what, int extra) {
                    isPrepared = false;
                    isPreparing = false;
                    isPlaying = false;
                    releaseLocks();
                    MainActivity.setNativePlaybackState(false);
                    MainActivity.dispatchWebAction("if (window.onNativeError) window.onNativeError(" + what + ", " + extra + ");");
                    return true;
                }
            });

            mediaPlayer.setOnSeekCompleteListener(new MediaPlayer.OnSeekCompleteListener() {
                @Override
                public void onSeekComplete(MediaPlayer mp) {
                    MainActivity.dispatchWebAction("if (window.onNativeSeekComplete) window.onNativeSeekComplete();");
                }
            });
        }
    }

    public synchronized void playUrl(String url, long seekMs) {
        if (url == null || url.isEmpty()) return;
        initMediaPlayerIfNeeded();

        if (url.equals(currentAudioUrl) && isPrepared) {
            try {
                if (seekMs >= 0) {
                    mediaPlayer.seekTo((int) seekMs);
                }
                mediaPlayer.start();
                isPlaying = true;
                acquireLocks();
                buildAndPostNotification(currentCoverBitmap != null ? currentCoverBitmap : getRoundedDefaultCover());
                MainActivity.setNativePlaybackState(true);
                MainActivity.dispatchWebAction("if (window.onNativePlay) window.onNativePlay();");
                return;
            } catch (Exception ignored) {}
        }

        currentAudioUrl = url;
        pendingSeekMs = seekMs;
        isPrepared = false;
        isPreparing = true;

        try {
            mediaPlayer.reset();
            if (url.startsWith("content://")) {
                mediaPlayer.setDataSource(getApplicationContext(), Uri.parse(url));
            } else {
                mediaPlayer.setDataSource(url);
            }
            mediaPlayer.prepareAsync();
        } catch (Exception e) {
            e.printStackTrace();
            isPreparing = false;
            MainActivity.dispatchWebAction("if (window.onNativeError) window.onNativeError(-1, -1);");
        }
    }

    public synchronized void pausePlayback() {
        if (mediaPlayer != null && isPrepared) {
            try {
                if (mediaPlayer.isPlaying()) {
                    mediaPlayer.pause();
                }
            } catch (Exception ignored) {}
        }
        isPlaying = false;
        releaseLocks();
        buildAndPostNotification(currentCoverBitmap != null ? currentCoverBitmap : getRoundedDefaultCover());
        MainActivity.setNativePlaybackState(false);
        MainActivity.dispatchWebAction("if (window.onNativePause) window.onNativePause();");
    }

    public synchronized void resumePlayback() {
        if (mediaPlayer != null && isPrepared) {
            try {
                mediaPlayer.start();
                isPlaying = true;
                acquireLocks();
                buildAndPostNotification(currentCoverBitmap != null ? currentCoverBitmap : getRoundedDefaultCover());
                MainActivity.setNativePlaybackState(true);
                MainActivity.dispatchWebAction("if (window.onNativePlay) window.onNativePlay();");
                return;
            } catch (Exception ignored) {}
        }
        MainActivity.dispatchWebAction("togglePlayState()");
    }

    public synchronized void seekTo(long posMs) {
        if (mediaPlayer != null && isPrepared) {
            try {
                mediaPlayer.seekTo((int) posMs);
            } catch (Exception ignored) {}
        } else {
            pendingSeekMs = posMs;
        }
    }

    public synchronized long getCurrentPositionMs() {
        if (mediaPlayer != null && isPrepared) {
            try {
                return mediaPlayer.getCurrentPosition();
            } catch (Exception ignored) {}
        }
        return currentPositionMs;
    }

    public synchronized long getDurationMs() {
        if (mediaPlayer != null && isPrepared) {
            try {
                return mediaPlayer.getDuration();
            } catch (Exception ignored) {}
        }
        return durationMs;
    }

    public synchronized boolean isNativePlaying() {
        if (mediaPlayer != null && isPrepared) {
            try {
                return mediaPlayer.isPlaying();
            } catch (Exception ignored) {}
        }
        return isPlaying;
    }

    public synchronized boolean isPrepared() {
        return isPrepared;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // 先确保立即前台化，避免 Android 8+ 及 Android 14 前台服务因异步延迟而崩溃
        buildAndPostNotification(currentCoverBitmap != null ? currentCoverBitmap : getRoundedDefaultCover());

        if (intent == null || intent.getAction() == null) {
            return START_STICKY;
        }

        String action = intent.getAction();
        if (ACTION_FAV.equals(action)) {
            MainActivity.dispatchWebAction("toggleSongFavFromNotification()");
        } else if (ACTION_PLAY_PAUSE.equals(action)) {
            if (mediaPlayer != null && isPrepared) {
                if (mediaPlayer.isPlaying()) {
                    pausePlayback();
                } else {
                    resumePlayback();
                }
            } else {
                MainActivity.dispatchWebAction("togglePlayState()");
            }
        } else if (ACTION_PREV.equals(action)) {
            MainActivity.dispatchWebAction("playPrev()");
        } else if (ACTION_NEXT.equals(action)) {
            MainActivity.dispatchWebAction("playNext()");
        } else if (ACTION_LYRICS.equals(action)) {
            if (MainActivity.getInstance() != null) {
                MainActivity.getInstance().toggleDesktopLyrics();
            }
        } else if (ACTION_PLAY_URL.equals(action)) {
            String url = intent.getStringExtra("url");
            long seek = intent.getLongExtra("seekMs", 0);
            playUrl(url, seek);
        } else if (ACTION_PAUSE.equals(action)) {
            pausePlayback();
        } else if (ACTION_RESUME.equals(action)) {
            resumePlayback();
        } else if (ACTION_SEEK.equals(action)) {
            long seek = intent.getLongExtra("seekMs", 0);
            seekTo(seek);
        } else if (ACTION_UPDATE_STATE.equals(action)) {
            currentTitle = intent.getStringExtra("title");
            if (currentTitle == null) currentTitle = "灵犀音乐";
            currentArtist = intent.getStringExtra("artist");
            if (currentArtist == null) currentArtist = "随心听";
            String newCover = intent.getStringExtra("coverUrl");
            boolean coverChanged = (newCover != null && !newCover.equals(currentCoverUrl));
            currentCoverUrl = (newCover != null) ? newCover : "";

            isPlaying = intent.getBooleanExtra("isPlaying", false);
            isFav = intent.getBooleanExtra("isFav", false);
            isLyricsActive = intent.getBooleanExtra("isLyricsActive", isLyricsActive);
            currentPositionMs = intent.getLongExtra("positionMs", 0);
            durationMs = intent.getLongExtra("durationMs", 180000);

            if (isPlaying) {
                acquireLocks();
            } else {
                releaseLocks();
            }

            if (coverChanged || currentCoverBitmap == null) {
                fetchCoverAndNotify();
            } else {
                buildAndPostNotification(currentCoverBitmap);
            }
        }

        return START_STICKY;
    }

    private void fetchCoverAndNotify() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                Bitmap cover = loadCoverBitmap(currentCoverUrl);
                if (cover == null) {
                    cover = getRoundedDefaultCover();
                } else {
                    try {
                        int w = cover.getWidth();
                        int h = cover.getHeight();
                        int dim = Math.min(w, h);
                        Bitmap rounded = Bitmap.createBitmap(dim, dim, Bitmap.Config.ARGB_8888);
                        Canvas c = new Canvas(rounded);
                        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
                        RectF r = new RectF(0, 0, dim, dim);
                        c.drawRoundRect(r, dim * 0.14f, dim * 0.14f, p);
                        p.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_IN));
                        c.drawBitmap(cover, (dim - w) / 2f, (dim - h) / 2f, p);
                        cover = rounded;
                    } catch (Exception ignored) {}
                }
                currentCoverBitmap = cover;
                buildAndPostNotification(cover);
            }
        }).start();
    }

    private Bitmap loadCoverBitmap(String urlStr) {
        if (urlStr == null || urlStr.isEmpty()) return null;
        if (urlStr.startsWith("data:image/")) {
            try {
                int comma = urlStr.indexOf(',');
                if (comma != -1) {
                    byte[] bytes = Base64.decode(urlStr.substring(comma + 1), Base64.DEFAULT);
                    return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                }
            } catch (Exception ignored) {}
            return null;
        }
        if (urlStr.startsWith("http://") || urlStr.startsWith("https://")) {
            try {
                URL url = new URL(urlStr);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(3500);
                conn.setReadTimeout(3500);
                InputStream is = conn.getInputStream();
                Bitmap b = BitmapFactory.decodeStream(is);
                is.close();
                return b;
            } catch (Exception ignored) {}
        }
        return null;
    }

    private Bitmap getRoundedDefaultCover() {
        if (defaultCoverBitmap != null) return defaultCoverBitmap;
        try {
            int size = 256;
            Bitmap output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(output);
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
            paint.setColor(Color.parseColor("#D97757"));
            RectF rect = new RectF(0, 0, size, size);
            canvas.drawRoundRect(rect, 36, 36, paint);

            paint.setColor(Color.parseColor("#161718"));
            canvas.drawCircle(size / 2f, size / 2f, size * 0.42f, paint);

            paint.setColor(Color.parseColor("#FAF9F6"));
            canvas.drawCircle(size / 2f, size / 2f, size * 0.16f, paint);

            paint.setColor(Color.parseColor("#D97757"));
            canvas.drawCircle(size / 2f, size / 2f, size * 0.05f, paint);

            defaultCoverBitmap = output;
            return output;
        } catch (Exception e) {
            return null;
        }
    }

    private void buildAndPostNotification(Bitmap cover) {
        int flag = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flag |= PendingIntent.FLAG_IMMUTABLE;
        }

        Intent openApp = new Intent(this, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, openApp, flag);

        // 全部播控按钮使用 Service Intent，确保在后台无感响应，绝不弹窗打扰用户
        PendingIntent pFav = PendingIntent.getService(this, 10,
                new Intent(this, MediaPlaybackService.class).setAction(ACTION_FAV), flag);
        PendingIntent pPrev = PendingIntent.getService(this, 1,
                new Intent(this, MediaPlaybackService.class).setAction(ACTION_PREV), flag);
        PendingIntent pToggle = PendingIntent.getService(this, 2,
                new Intent(this, MediaPlaybackService.class).setAction(ACTION_PLAY_PAUSE), flag);
        PendingIntent pNext = PendingIntent.getService(this, 3,
                new Intent(this, MediaPlaybackService.class).setAction(ACTION_NEXT), flag);
        PendingIntent pLyrics = PendingIntent.getService(this, 20,
                new Intent(this, MediaPlaybackService.class).setAction(ACTION_LYRICS), flag);

        // 同步系统 MediaSession 与 OriginOS 状态栏灵动岛元数据
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP && mediaSession != null) {
            mediaSession.setActive(true);

            int state = isPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED;
            long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE |
                    PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SKIP_TO_NEXT |
                    PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SEEK_TO;
            mediaSession.setPlaybackState(new PlaybackState.Builder()
                    .setActions(actions)
                    .setState(state, currentPositionMs, 1.0f)
                    .build());

            MediaMetadata.Builder mb = new MediaMetadata.Builder()
                    .putString(MediaMetadata.METADATA_KEY_TITLE, currentTitle)
                    .putString(MediaMetadata.METADATA_KEY_ARTIST, currentArtist)
                    .putString(MediaMetadata.METADATA_KEY_ALBUM, "灵犀音乐")
                    .putLong(MediaMetadata.METADATA_KEY_DURATION, durationMs);
            if (cover != null) {
                mb.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, cover);
                mb.putBitmap(MediaMetadata.METADATA_KEY_ART, cover);
            }
            mediaSession.setMetadata(mb.build());
        }

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }

        // 爱心图标状态区分：收藏显示实体赤红爱心，未收藏显示纤细线框爱心
        int favIcon = isFav ? R.drawable.ic_btn_fav_active : R.drawable.ic_btn_fav;
        String favLabel = isFav ? "取消收藏" : "收藏";

        int lyricsIcon = isLyricsActive ? R.drawable.ic_btn_lyrics_active : R.drawable.ic_btn_lyrics;
        String lyricsLabel = isLyricsActive ? "桌面歌词已开" : "桌面歌词";

        builder.setContentTitle(currentTitle)
                .setContentText(currentArtist)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(contentIntent)
                .setOngoing(isPlaying)
                .setAutoCancel(false)
                .addAction(favIcon, favLabel, pFav)
                .addAction(R.drawable.ic_btn_prev, "上一曲", pPrev)
                .addAction(isPlaying ? R.drawable.ic_btn_pause : R.drawable.ic_btn_play, isPlaying ? "暂停" : "播放", pToggle)
                .addAction(R.drawable.ic_btn_next, "下一曲", pNext)
                .addAction(lyricsIcon, lyricsLabel, pLyrics);

        if (cover != null) {
            builder.setLargeIcon(cover);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            builder.setVisibility(Notification.VISIBILITY_PUBLIC);
            Notification.MediaStyle mediaStyle = new Notification.MediaStyle();
            if (mediaSession != null) {
                mediaStyle.setMediaSession(mediaSession.getSessionToken());
            }
            mediaStyle.setShowActionsInCompactView(1, 2, 3);
            builder.setStyle(mediaStyle);
        }

        Notification notification = builder.build();

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Exception e) {
            if (notificationManager != null) {
                notificationManager.notify(NOTIFICATION_ID, notification);
            }
        }
    }

    public void acquireLocks() {
        // 持有 WakeLock 确保切后台与息屏时不被系统 CPU 调度深度挂起
        if (wakeLock != null && !wakeLock.isHeld()) {
            try {
                wakeLock.acquire(12 * 60 * 60 * 1000L); // 12 小时超时保护
            } catch (Exception ignored) {}
        }

        // 持有 WifiLock 保证切应用时网络拉流不发生节能休眠与分包抖动
        if (wifiLock != null && !wifiLock.isHeld()) {
            try {
                wifiLock.acquire();
            } catch (Exception ignored) {}
        }
    }

    public void releaseLocks() {
        if (wakeLock != null && wakeLock.isHeld()) {
            try { wakeLock.release(); } catch (Exception ignored) {}
        }
        if (wifiLock != null && wifiLock.isHeld()) {
            try { wifiLock.release(); } catch (Exception ignored) {}
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        sInstance = null;
        releaseLocks();
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) mediaPlayer.stop();
                mediaPlayer.release();
            } catch (Exception ignored) {}
            mediaPlayer = null;
        }
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
            mediaSession = null;
        }
    }
}
