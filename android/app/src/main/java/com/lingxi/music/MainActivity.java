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
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final String CHANNEL_ID = "lingxi_music_playback";
    private static final int NOTIFICATION_ID = 1001;

    public static final String ACTION_TOGGLE = "com.lingxi.music.ACTION_TOGGLE";
    public static final String ACTION_PREV = "com.lingxi.music.ACTION_PREV";
    public static final String ACTION_NEXT = "com.lingxi.music.ACTION_NEXT";

    private WebView webView;
    private NotificationManager notificationManager;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(Color.parseColor("#D97757"));
        }

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#D97757"));
        setContentView(webView);

        notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        createNotificationChannel();

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
                public void run() {
                    webView.evaluateJavascript("togglePlayState()", null);
                }
            });
        } else if (ACTION_PREV.equals(action)) {
            webView.post(new Runnable() {
                @Override
                public void run() {
                    webView.evaluateJavascript("playPrev()", null);
                }
            });
        } else if (ACTION_NEXT.equals(action)) {
            webView.post(new Runnable() {
                @Override
                public void run() {
                    webView.evaluateJavascript("playNext()", null);
                }
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
            channel.setDescription("在通知栏显示当前播放歌曲与播控卡片");
            channel.setShowBadge(false);
            channel.setSound(null, null);
            channel.enableVibration(false);
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
            }
        }
    }

    private void showPlaybackNotification(String title, String artist, boolean isPlaying) {
        if (notificationManager == null) return;

        int flag = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flag |= PendingIntent.FLAG_IMMUTABLE;
        }

        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, openIntent, flag);

        Intent prevIntent = new Intent(this, MainActivity.class);
        prevIntent.setAction(ACTION_PREV);
        PendingIntent pPrev = PendingIntent.getActivity(this, 1, prevIntent, flag);

        Intent toggleIntent = new Intent(this, MainActivity.class);
        toggleIntent.setAction(ACTION_TOGGLE);
        PendingIntent pToggle = PendingIntent.getActivity(this, 2, toggleIntent, flag);

        Intent nextIntent = new Intent(this, MainActivity.class);
        nextIntent.setAction(ACTION_NEXT);
        PendingIntent pNext = PendingIntent.getActivity(this, 3, nextIntent, flag);

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
                .addAction(android.R.drawable.ic_media_previous, "上一曲", pPrev)
                .addAction(isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, isPlaying ? "暂停" : "播放", pToggle)
                .addAction(android.R.drawable.ic_media_next, "下一曲", pNext);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            builder.setVisibility(Notification.VISIBILITY_PUBLIC);
            Notification.MediaStyle mediaStyle = new Notification.MediaStyle();
            mediaStyle.setShowActionsInCompactView(0, 1, 2);
            builder.setStyle(mediaStyle);
        }

        notificationManager.notify(NOTIFICATION_ID, builder.build());
    }

    public class WebAppInterface {
        @JavascriptInterface
        public void updateMediaCard(final String title, final String artist, final boolean isPlaying) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    showPlaybackNotification(title, artist, isPlaying);
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
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
