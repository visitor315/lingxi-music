package com.lingxi.music;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.util.Rational;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {
    private static final String CHANNEL_ID = "lingxi_music_playback";
    private static final int NOTIFICATION_ID = 1001;

    public static final String ACTION_FAV = "com.lingxi.music.ACTION_FAV";
    public static final String ACTION_PREV = "com.lingxi.music.ACTION_PREV";
    public static final String ACTION_TOGGLE = "com.lingxi.music.ACTION_TOGGLE";
    public static final String ACTION_NEXT = "com.lingxi.music.ACTION_NEXT";
    public static final String ACTION_PIP = "com.lingxi.music.ACTION_PIP";

    private WebView webView;
    private NotificationManager notificationManager;
    private MediaSession mediaSession;
    private Bitmap defaultCoverBitmap;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 1. 设置系统状态栏与导航栏完全透明与沉浸式
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            Window window = getWindow();
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS | WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(Color.TRANSPARENT);
            window.setNavigationBarColor(Color.TRANSPARENT);

            int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                      | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            }
            window.getDecorView().setSystemUiVisibility(flags);
        }

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#FAF9F6"));
        setContentView(webView);

        notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        createNotificationChannel();
        initMediaSession();

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new WebAppInterface(), "AndroidBridge");

        webView.loadUrl("file:///android_asset/index.html");

        checkNotificationPermission();
        handleIntentAction(getIntent());
    }

    private void initMediaSession() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            mediaSession = new MediaSession(this, "LingXiMusicSession");
            mediaSession.setCallback(new MediaSession.Callback() {
                @Override
                public void onPlay() {
                    webView.post(new Runnable() {
                        @Override
                        public void run() { webView.evaluateJavascript("togglePlayState()", null); }
                    });
                }
                @Override
                public void onPause() {
                    webView.post(new Runnable() {
                        @Override
                        public void run() { webView.evaluateJavascript("togglePlayState()", null); }
                    });
                }
                @Override
                public void onSkipToNext() {
                    webView.post(new Runnable() {
                        @Override
                        public void run() { webView.evaluateJavascript("playNext()", null); }
                    });
                }
                @Override
                public void onSkipToPrevious() {
                    webView.post(new Runnable() {
                        @Override
                        public void run() { webView.evaluateJavascript("playPrev()", null); }
                    });
                }
            });
            mediaSession.setActive(true);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntentAction(intent);
    }

    private void handleIntentAction(Intent intent) {
        if (intent == null || intent.getAction() == null || webView == null) {
            return;
        }
        String action = intent.getAction();
        if (ACTION_TOGGLE.equals(action)) {
            webView.post(new Runnable() {
                @Override
                public void run() { webView.evaluateJavascript("togglePlayState()", null); }
            });
        } else if (ACTION_PREV.equals(action)) {
            webView.post(new Runnable() {
                @Override
                public void run() { webView.evaluateJavascript("playPrev()", null); }
            });
        } else if (ACTION_NEXT.equals(action)) {
            webView.post(new Runnable() {
                @Override
                public void run() { webView.evaluateJavascript("playNext()", null); }
            });
        } else if (ACTION_FAV.equals(action)) {
            webView.post(new Runnable() {
                @Override
                public void run() { webView.evaluateJavascript("toggleFavCurrent()", null); }
            });
        } else if (ACTION_PIP.equals(action)) {
            webView.post(new Runnable() {
                @Override
                public void run() { webView.evaluateJavascript("togglePipLyrics()", null); }
            });
        }
    }

    private void checkNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33) {
            if (checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 101);
            }
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "灵犀音乐播放控制",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("在通知栏与锁屏显示当前播放歌曲与播控卡片");
            channel.setShowBadge(false);
            channel.setSound(null, null);
            channel.enableVibration(false);
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
            }
        }
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

            // Draw inner vinyl disc
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

    private void showPlaybackNotification(final String title, final String artist, final String coverUrl, final boolean isPlaying) {
        if (notificationManager == null) return;

        new Thread(new Runnable() {
            @Override
            public void run() {
                Bitmap cover = null;
                if (coverUrl != null && !coverUrl.isEmpty()) {
                    if (coverUrl.startsWith("data:image/")) {
                        try {
                            int comma = coverUrl.indexOf(',');
                            if (comma != -1) {
                                byte[] bytes = Base64.decode(coverUrl.substring(comma + 1), Base64.DEFAULT);
                                cover = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                            }
                        } catch (Exception ignored) {}
                    } else if (coverUrl.startsWith("http://") || coverUrl.startsWith("https://")) {
                        try {
                            URL url = new URL(coverUrl);
                            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                            conn.setConnectTimeout(3000);
                            conn.setReadTimeout(3000);
                            InputStream is = conn.getInputStream();
                            cover = BitmapFactory.decodeStream(is);
                            is.close();
                        } catch (Exception ignored) {}
                    }
                }

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
                        c.drawRoundRect(r, dim * 0.12f, dim * 0.12f, p);
                        p.setXfermode(new android.graphics.PorterDuffXfermode(android.graphics.PorterDuff.Mode.SRC_IN));
                        c.drawBitmap(cover, (dim - w) / 2f, (dim - h) / 2f, p);
                        cover = rounded;
                    } catch (Exception ignored) {}
                }

                final Bitmap finalCover = cover;
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        buildAndNotify(title, artist, finalCover, isPlaying);
                    }
                });
            }
        }).start();
    }

    private void buildAndNotify(String title, String artist, Bitmap cover, boolean isPlaying) {
        int flag = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flag |= PendingIntent.FLAG_IMMUTABLE;
        }

        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, openIntent, flag);

        Intent favIntent = new Intent(this, MainActivity.class);
        favIntent.setAction(ACTION_FAV);
        PendingIntent pFav = PendingIntent.getActivity(this, 10, favIntent, flag);

        Intent prevIntent = new Intent(this, MainActivity.class);
        prevIntent.setAction(ACTION_PREV);
        PendingIntent pPrev = PendingIntent.getActivity(this, 1, prevIntent, flag);

        Intent toggleIntent = new Intent(this, MainActivity.class);
        toggleIntent.setAction(ACTION_TOGGLE);
        PendingIntent pToggle = PendingIntent.getActivity(this, 2, toggleIntent, flag);

        Intent nextIntent = new Intent(this, MainActivity.class);
        nextIntent.setAction(ACTION_NEXT);
        PendingIntent pNext = PendingIntent.getActivity(this, 3, nextIntent, flag);

        Intent pipIntent = new Intent(this, MainActivity.class);
        pipIntent.setAction(ACTION_PIP);
        PendingIntent pPip = PendingIntent.getActivity(this, 20, pipIntent, flag);

        // Update PlaybackState in MediaSession so Android knows current state
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP && mediaSession != null) {
            long state = isPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED;
            long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE |
                    PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SKIP_TO_NEXT |
                    PlaybackState.ACTION_PLAY_PAUSE;
            mediaSession.setPlaybackState(new PlaybackState.Builder()
                    .setActions(actions)
                    .setState(state, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1.0f)
                    .build());
        }

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }

        builder.setContentTitle(title)
                .setContentText(artist)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(contentIntent)
                .setOngoing(isPlaying)
                .setAutoCancel(false)
                .addAction(R.drawable.ic_btn_fav, "喜欢", pFav)
                .addAction(R.drawable.ic_btn_prev, "上一曲", pPrev)
                .addAction(isPlaying ? R.drawable.ic_btn_pause : R.drawable.ic_btn_play, isPlaying ? "暂停" : "播放", pToggle)
                .addAction(R.drawable.ic_btn_next, "下一曲", pNext)
                .addAction(R.drawable.ic_btn_pip, "小窗", pPip);

        if (cover != null) {
            builder.setLargeIcon(cover);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            builder.setVisibility(Notification.VISIBILITY_PUBLIC);
            Notification.MediaStyle mediaStyle = new Notification.MediaStyle();
            if (mediaSession != null) {
                mediaStyle.setMediaSession(mediaSession.getSessionToken());
            }
            // In compact view, show Prev (1), Play/Pause (2), Next (3)
            mediaStyle.setShowActionsInCompactView(1, 2, 3);
            builder.setStyle(mediaStyle);
        }

        notificationManager.notify(NOTIFICATION_ID, builder.build());
    }

    public class WebAppInterface {
        @JavascriptInterface
        public void updateMediaCard(final String title, final String artist, final boolean isPlaying) {
            showPlaybackNotification(title, artist, null, isPlaying);
        }

        @JavascriptInterface
        public void updateMediaCardWithCover(final String title, final String artist, final String coverUrl, final boolean isPlaying) {
            showPlaybackNotification(title, artist, coverUrl, isPlaying);
        }

        @JavascriptInterface
        public void minimizeApp() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    moveTaskToBack(true);
                }
            });
        }

        @JavascriptInterface
        public boolean isPipSupported() {
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                    getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
        }

        @JavascriptInterface
        public void enterPipMode() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        try {
                            android.app.PictureInPictureParams.Builder pipBuilder = new android.app.PictureInPictureParams.Builder();
                            pipBuilder.setAspectRatio(new Rational(16, 9));
                            enterPictureInPictureMode(pipBuilder.build());
                        } catch (Exception e) {
                            try {
                                enterPictureInPictureMode();
                            } catch (Exception ignored) {}
                        }
                    }
                }
            });
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        if (webView != null) {
            webView.evaluateJavascript("if (window.onPipModeChanged) window.onPipModeChanged(" + isInPictureInPictureMode + ")", null);
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (webView != null) {
                webView.evaluateJavascript("handleSystemBack()", null);
                return true;
            }
        }
        return super.onKeyDown(keyCode, event);
    }
}
