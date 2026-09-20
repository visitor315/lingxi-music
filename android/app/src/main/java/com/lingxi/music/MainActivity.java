package com.lingxi.music;

import android.app.Activity;
import android.app.DownloadManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.PackageInfo;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.database.Cursor;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaMetadata;
import android.media.MediaScannerConnection;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.Base64;
import android.util.Rational;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.GestureDetector;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewOutlineProvider;
import android.graphics.Outline;
import android.animation.LayoutTransition;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {
    public static final String CHANNEL_ID = "lingxi_playback_channel_v2";
    public static final int NOTIFICATION_ID = 1001;

    public static final String ACTION_FAV = "com.lingxi.music.ACTION_FAV";
    public static final String ACTION_PREV = "com.lingxi.music.ACTION_PREV";
    public static final String ACTION_TOGGLE = "com.lingxi.music.ACTION_PLAY_PAUSE";
    public static final String ACTION_NEXT = "com.lingxi.music.ACTION_NEXT";
    public static final String ACTION_LYRICS = "com.lingxi.music.ACTION_LYRICS";
    public static final String ACTION_PIP = "com.lingxi.music.ACTION_PIP";

    private static MainActivity sInstance = null;
    public static MainActivity getInstance() { return sInstance; }
    public static void dispatchWebAction(final String jsCode) {
        if (sInstance != null && sInstance.webView != null) {
            sInstance.webView.post(new Runnable() {
                @Override
                public void run() {
                    sInstance.webView.evaluateJavascript(jsCode, null);
                }
            });
        }
    }

    private WebView webView;
    private NotificationManager notificationManager;
    private MediaSession mediaSession;
    private Bitmap defaultCoverBitmap;

    private WindowManager windowManager;
    private View floatingLyricView;
    private WindowManager.LayoutParams floatingParams;
    private LinearLayout floatingRootLayout;
    private LinearLayout floatingHeaderLayout;
    private LinearLayout floatingControlsLayout;
    private TextView floatingTvCurrent;
    private TextView floatingTvSub;
    private ImageView floatingIvFav;
    private ImageView floatingIvPlay;
    private boolean isFloatingLyricsActive = false;
    private boolean isActivityForeground = false;
    private boolean isControlCardExpanded = false;
    private long lastCardToggleTime = 0;
    private String currentFloatingThemeColor = "#234BB8";
    private String currentFloatingLyricText = "灵犀音乐 · 随心听";
    private String currentFloatingSubLyricText = "";
    private boolean isFloatingCurrentFav = false;
    private boolean isFloatingCurrentPlaying = true;
    private String lastMediaTitle = "灵犀音乐";
    private String lastMediaArtist = "随心听";
    private String lastMediaCoverUrl = "";
    private boolean lastMediaIsPlaying = false;
    private boolean lastMediaIsFav = false;
    private long lastMediaPosMs = 0;
    private long lastMediaDurMs = 180000;
    private Handler floatingHandler = new Handler(Looper.getMainLooper());
    private Runnable autoCollapseRunnable = new Runnable() {
        @Override
        public void run() {
            setFloatingCardExpanded(false);
        }
    };

    private ValueCallback<Uri[]> uploadMessage;
    private final static int FILE_CHOOSER_RESULT_CODE = 10001;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        sInstance = this;

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

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                String ver = "1.7.5";
                try {
                    ver = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
                } catch (Exception ignored) {}
                webView.evaluateJavascript("if (typeof updateDynamicAppVersion === 'function') updateDynamicAppVersion('" + ver + "');", null);
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, WebChromeClient.FileChooserParams fileChooserParams) {
                if (uploadMessage != null) {
                    uploadMessage.onReceiveValue(null);
                }
                uploadMessage = filePathCallback;
                Intent intent = null;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    try {
                        intent = fileChooserParams.createIntent();
                    } catch (Exception ignored) {}
                }
                if (intent == null) {
                    intent = new Intent(Intent.ACTION_GET_CONTENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("audio/*");
                }
                try {
                    startActivityForResult(intent, FILE_CHOOSER_RESULT_CODE);
                } catch (ActivityNotFoundException e) {
                    uploadMessage = null;
                    return false;
                }
                return true;
            }
        });
        webView.addJavascriptInterface(new WebAppInterface(), "AndroidBridge");

        // 系统下载监听器，支持任何 web 下载
        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
                String filename = URLUtil.guessFileName(url, contentDisposition, mimetype);
                downloadFile(url, filename);
            }
        });

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
        handleIntentNavigation(intent);
    }

    @Override
    protected void onResume() {
        super.onResume();
        isActivityForeground = true;
        updateFloatingWindowState();
        handleIntentNavigation(getIntent());
    }

    @Override
    protected void onPause() {
        super.onPause();
        isActivityForeground = false;
        updateFloatingWindowState();
    }

    @Override
    protected void onStop() {
        super.onStop();
        isActivityForeground = false;
        updateFloatingWindowState();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (windowManager != null && floatingLyricView != null) {
            try {
                windowManager.removeView(floatingLyricView);
            } catch (Exception ignored) {}
            floatingLyricView = null;
        }
    }

    private void updateFloatingWindowState() {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (isActivityForeground) {
                    // 应用位于前台时，严禁在灵犀应用内部显示桌面悬浮歌词遮挡界面
                    if (windowManager != null && floatingLyricView != null) {
                        try {
                            windowManager.removeView(floatingLyricView);
                        } catch (Exception ignored) {}
                        floatingLyricView = null;
                    }
                } else {
                    // 应用处于后台或用户返回桌面时，若用户开启了桌面歌词，则在桌面上呈现
                    if (isFloatingLyricsActive && floatingLyricView == null) {
                        showDesktopWindowInternal();
                    }
                }
            }
        });
    }

    private void handleIntentNavigation(Intent intent) {
        if (intent != null && "settings".equals(intent.getStringExtra("navigate_to"))) {
            intent.removeExtra("navigate_to");
            if (webView != null) {
                webView.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        webView.evaluateJavascript("if (typeof closePlayerFull === 'function') closePlayerFull(); if (typeof switchBottomTab === 'function') switchBottomTab('settings');", null);
                    }
                }, 200);
            }
        }
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
        } else if (ACTION_LYRICS.equals(action) || ACTION_PIP.equals(action)) {
            toggleDesktopLyrics();
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

    public void updateMediaCardFull(final String title, final String artist, final String coverUrl, final boolean isPlaying, final boolean isFav, final long positionMs, final long durationMs) {
        if (title != null) lastMediaTitle = title;
        if (artist != null) lastMediaArtist = artist;
        if (coverUrl != null) lastMediaCoverUrl = coverUrl;
        lastMediaIsPlaying = isPlaying;
        lastMediaIsFav = isFav;
        lastMediaPosMs = positionMs;
        lastMediaDurMs = durationMs;
        isFloatingCurrentFav = isFav;
        isFloatingCurrentPlaying = isPlaying;
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                updateFloatingFavState();
                updateFloatingPlayState();
            }
        });

        Intent intent = new Intent(this, MediaPlaybackService.class);
        intent.setAction(MediaPlaybackService.ACTION_UPDATE_STATE);
        intent.putExtra("title", title);
        intent.putExtra("artist", artist);
        intent.putExtra("coverUrl", coverUrl);
        intent.putExtra("isPlaying", isPlaying);
        intent.putExtra("isFav", isFav);
        intent.putExtra("isLyricsActive", isFloatingLyricsActive);
        intent.putExtra("positionMs", positionMs);
        intent.putExtra("durationMs", durationMs);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent);
            } else {
                startService(intent);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void showPlaybackNotification(final String title, final String artist, final String coverUrl, final boolean isPlaying) {
        updateMediaCardFull(title, artist, coverUrl, isPlaying, isFloatingCurrentFav, 0, 180000);
    }

    public void downloadFile(final String urlStr, final String filename) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    if (urlStr.startsWith("http://") || urlStr.startsWith("https://")) {
                        DownloadManager downloadManager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                        Uri uri = Uri.parse(urlStr);
                        DownloadManager.Request request = new DownloadManager.Request(uri);
                        request.setTitle(filename);
                        request.setDescription("灵犀音乐正在下载歌曲...");
                        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                        request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);
                        request.setMimeType("audio/mpeg");
                        if (downloadManager != null) {
                            downloadManager.enqueue(request);
                            Toast.makeText(MainActivity.this, "已加入系统下载，保存在「下载(Download)」文件夹", Toast.LENGTH_LONG).show();
                            return;
                        }
                    }
                } catch (Exception ignored) {}
                downloadDirectStream(urlStr, filename);
            }
        });
    }

    private void downloadDirectStream(final String urlStr, final String filename) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                    if (!dir.exists()) dir.mkdirs();
                    File targetFile = new File(dir, filename);

                    URL u = new URL(urlStr);
                    HttpURLConnection conn = (HttpURLConnection) u.openConnection();
                    conn.setConnectTimeout(10000);
                    conn.setReadTimeout(15000);
                    InputStream in = conn.getInputStream();
                    FileOutputStream out = new FileOutputStream(targetFile);
                    byte[] buf = new byte[8192];
                    int len;
                    while ((len = in.read(buf)) != -1) {
                        out.write(buf, 0, len);
                    }
                    out.flush();
                    out.close();
                    in.close();

                    MediaScannerConnection.scanFile(MainActivity.this,
                            new String[]{targetFile.getAbsolutePath()},
                            new String[]{"audio/mpeg"}, null);

                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            Toast.makeText(MainActivity.this, "《" + filename + "》已保存至手机「下载」目录", Toast.LENGTH_LONG).show();
                        }
                    });
                } catch (final Exception e) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            Toast.makeText(MainActivity.this, "下载失败：" + e.getMessage(), Toast.LENGTH_SHORT).show();
                        }
                    });
                }
            }
        }).start();
    }

    private int dp2px(float dp) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, dp, getResources().getDisplayMetrics());
    }

    public void toggleDesktopLyrics() {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    if (!Settings.canDrawOverlays(MainActivity.this)) {
                        try {
                            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                    Uri.parse("package:" + getPackageName()));
                            startActivity(intent);
                            Toast.makeText(MainActivity.this, "请在系统设置中允许开启「悬浮窗权限」以显示桌面歌词", Toast.LENGTH_LONG).show();
                        } catch (Exception e) {
                            Toast.makeText(MainActivity.this, "未能直接打开悬浮窗权限，请在系统应用设置中手动开启", Toast.LENGTH_LONG).show();
                        }
                        return;
                    }
                }

                if (isFloatingLyricsActive) {
                    hideDesktopLyrics();
                } else {
                    showDesktopLyrics();
                }
            }
        });
    }

    private ImageView createSvgButton(int resId, int sizeDp, View.OnClickListener listener) {
        ImageView iv = new ImageView(this);
        iv.setImageResource(resId);
        int pad = (sizeDp > 36) ? dp2px(4) : dp2px(6);
        iv.setPadding(pad, pad, pad, pad);
        int pxSize = dp2px(sizeDp);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(pxSize, pxSize);
        lp.gravity = Gravity.CENTER;
        iv.setLayoutParams(lp);
        iv.setClickable(true);
        iv.setFocusable(true);
        iv.setBackground(null); // 彻底移除系统默认的圆形选中框/水波纹
        iv.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        v.setAlpha(0.55f);
                        v.setScaleX(0.92f);
                        v.setScaleY(0.92f);
                        break;
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        v.setAlpha(1.0f);
                        v.setScaleX(1.0f);
                        v.setScaleY(1.0f);
                        break;
                }
                return false;
            }
        });
        iv.setOnClickListener(listener);
        return iv;
    }

    private View createFlexSpacer() {
        View v = new View(this);
        v.setLayoutParams(new LinearLayout.LayoutParams(0, 1, 1.0f));
        return v;
    }

    private void updateFloatingFavState() {
        if (floatingIvFav != null) {
            floatingIvFav.setImageResource(isFloatingCurrentFav ? R.drawable.ic_floating_fav_active : R.drawable.ic_floating_fav);
        }
    }

    private void updateFloatingPlayState() {
        if (floatingIvPlay != null) {
            floatingIvPlay.setImageResource(isFloatingCurrentPlaying ? R.drawable.ic_floating_pause : R.drawable.ic_floating_play);
        }
    }

    private void resetAutoCollapseTimer() {
        if (floatingHandler != null) {
            floatingHandler.removeCallbacks(autoCollapseRunnable);
            floatingHandler.postDelayed(autoCollapseRunnable, 4500);
        }
    }

    public void setDesktopThemeColor(final String themeColor) {
        if (themeColor != null && !themeColor.isEmpty()) {
            currentFloatingThemeColor = themeColor;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (floatingTvCurrent != null) {
                        try {
                            floatingTvCurrent.setTextColor(Color.parseColor(currentFloatingThemeColor));
                        } catch (Exception ignored) {}
                    }
                }
            });
        }
    }

    private void toggleFloatingCardExpanded() {
        long now = System.currentTimeMillis();
        if (now - lastCardToggleTime < 350) return;
        lastCardToggleTime = now;
        setFloatingCardExpanded(!isControlCardExpanded);
    }

    private void setFloatingCardExpanded(boolean expanded) {
        isControlCardExpanded = expanded;
        if (floatingRootLayout == null) return;

        int cardPadH = dp2px(16);
        int cardPadTop = dp2px(10);
        int cardPadBottom = dp2px(12);

        if (expanded) {
            GradientDrawable cardBg = new GradientDrawable();
            cardBg.setColor(Color.parseColor("#E6202022")); // 概念版哑光深灰半透明
            cardBg.setCornerRadius(dp2px(18));
            cardBg.setStroke(dp2px(1), Color.parseColor("#1FFFFFFF")); // 微光细描边
            floatingRootLayout.setBackground(cardBg);
            floatingRootLayout.setPadding(cardPadH, cardPadTop, cardPadH, cardPadBottom);

            if (floatingHeaderLayout != null) floatingHeaderLayout.setVisibility(View.VISIBLE);
            if (floatingControlsLayout != null) floatingControlsLayout.setVisibility(View.VISIBLE);
            resetAutoCollapseTimer();
        } else {
            if (floatingHandler != null) floatingHandler.removeCallbacks(autoCollapseRunnable);
            floatingRootLayout.setBackground(null); // 平时完全纯净无框无背景
            floatingRootLayout.setPadding(cardPadH, cardPadTop, cardPadH, cardPadBottom);

            // 关键：平时态使用 INVISIBLE 保持顶部栏占位高度，确保歌词文字垂直坐标绝对固定，点击展开时绝不向下移动！
            if (floatingHeaderLayout != null) floatingHeaderLayout.setVisibility(View.INVISIBLE);
            if (floatingControlsLayout != null) floatingControlsLayout.setVisibility(View.GONE);
        }

        if (windowManager != null && floatingLyricView != null && floatingParams != null) {
            try {
                windowManager.updateViewLayout(floatingLyricView, floatingParams);
            } catch (Exception ignored) {}
        }
    }

    public void showDesktopLyrics() {
        isFloatingLyricsActive = true;
        updateMediaCardFull(lastMediaTitle, lastMediaArtist, lastMediaCoverUrl, lastMediaIsPlaying, isFloatingCurrentFav, lastMediaPosMs, lastMediaDurMs);
        if (!isActivityForeground) {
            showDesktopWindowInternal();
        } else {
            Toast.makeText(this, "桌面悬浮歌词已开启，返回桌面即可显示", Toast.LENGTH_SHORT).show();
        }
        if (webView != null) {
            webView.evaluateJavascript("if (window.onDesktopLyricsStateChanged) window.onDesktopLyricsStateChanged(true)", null);
        }
    }

    private void showDesktopWindowInternal() {
        if (windowManager == null) {
            windowManager = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        }
        if (floatingLyricView != null) {
            try {
                windowManager.removeView(floatingLyricView);
            } catch (Exception ignored) {}
            floatingLyricView = null;
        }

        floatingRootLayout = new LinearLayout(this);
        floatingRootLayout.setOrientation(LinearLayout.VERTICAL);
        floatingRootLayout.setGravity(Gravity.CENTER_HORIZONTAL);
        // 彻底移除任何可能导致左滑、右滑或下移的 LayoutTransition 动画，确保卡片直接纯粹呈现，位置完全锁死

        // 1. 顶部栏 (平时为 INVISIBLE 占位，展开时为 VISIBLE)
        floatingHeaderLayout = new LinearLayout(this);
        floatingHeaderLayout.setOrientation(LinearLayout.HORIZONTAL);
        floatingHeaderLayout.setGravity(Gravity.CENTER_VERTICAL);
        floatingHeaderLayout.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        floatingHeaderLayout.setPadding(0, 0, 0, dp2px(4));

        ImageView ivLogo = new ImageView(this);
        ivLogo.setImageResource(R.mipmap.ic_launcher);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            ivLogo.setClipToOutline(true);
            ivLogo.setOutlineProvider(new ViewOutlineProvider() {
                @Override
                public void getOutline(View view, Outline outline) {
                    outline.setRoundRect(0, 0, view.getWidth(), view.getHeight(), dp2px(4));
                }
            });
        }
        int logoSize = dp2px(22);
        LinearLayout.LayoutParams logoLp = new LinearLayout.LayoutParams(logoSize, logoSize);
        ivLogo.setLayoutParams(logoLp);
        ivLogo.setClickable(true);
        ivLogo.setFocusable(true);
        ivLogo.setBackground(null);
        ivLogo.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent event) {
                if (event.getAction() == MotionEvent.ACTION_DOWN) {
                    v.setAlpha(0.55f);
                    v.setScaleX(0.92f);
                    v.setScaleY(0.92f);
                } else if (event.getAction() == MotionEvent.ACTION_UP || event.getAction() == MotionEvent.ACTION_CANCEL) {
                    v.setAlpha(1.0f);
                    v.setScaleX(1.0f);
                    v.setScaleY(1.0f);
                }
                return false;
            }
        });
        // 点击小猫咪图标直接返回并进入灵犀音乐应用
        ivLogo.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Intent appIntent = new Intent(MainActivity.this, MainActivity.class);
                appIntent.setAction(Intent.ACTION_MAIN);
                appIntent.addCategory(Intent.CATEGORY_LAUNCHER);
                appIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
                startActivity(appIntent);
                setFloatingCardExpanded(false);
            }
        });
        floatingHeaderLayout.addView(ivLogo);

        View spacer = new View(this);
        LinearLayout.LayoutParams spParams = new LinearLayout.LayoutParams(0, 1, 1f);
        floatingHeaderLayout.addView(spacer, spParams);

        ImageView ivClose = new ImageView(this);
        ivClose.setImageResource(R.drawable.ic_floating_close);
        int closeSize = dp2px(22);
        LinearLayout.LayoutParams closeLp = new LinearLayout.LayoutParams(closeSize, closeSize);
        ivClose.setLayoutParams(closeLp);
        ivClose.setPadding(dp2px(2), dp2px(2), dp2px(2), dp2px(2));
        ivClose.setBackground(null);
        ivClose.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent event) {
                if (event.getAction() == MotionEvent.ACTION_DOWN) {
                    v.setAlpha(0.55f);
                } else if (event.getAction() == MotionEvent.ACTION_UP || event.getAction() == MotionEvent.ACTION_CANCEL) {
                    v.setAlpha(1.0f);
                }
                return false;
            }
        });
        ivClose.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                hideDesktopLyrics();
            }
        });
        floatingHeaderLayout.addView(ivClose);
        floatingRootLayout.addView(floatingHeaderLayout);

        // 2. 核心歌词区 (始终居中，单行防换行，字号放大至 18.5sp，只显示单行，杜绝第二行在白底屏幕看不清)
        LinearLayout lyricsBody = new LinearLayout(this);
        lyricsBody.setOrientation(LinearLayout.VERTICAL);
        lyricsBody.setGravity(Gravity.CENTER_HORIZONTAL);
        lyricsBody.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        lyricsBody.setPadding(dp2px(6), dp2px(4), dp2px(6), dp2px(4));

        floatingTvCurrent = new TextView(this);
        floatingTvCurrent.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18.5f); // 放大字号，清晰醒目！
        try {
            floatingTvCurrent.setTextColor(Color.parseColor(currentFloatingThemeColor));
        } catch (Exception e) {
            floatingTvCurrent.setTextColor(Color.parseColor("#234BB8"));
        }
        floatingTvCurrent.setTypeface(Typeface.DEFAULT_BOLD);
        floatingTvCurrent.setGravity(Gravity.CENTER);
        floatingTvCurrent.setSingleLine(true);
        floatingTvCurrent.setEllipsize(TextUtils.TruncateAt.END);
        // 纯净现代风，彻底移除黑色阴影
        floatingTvCurrent.setShadowLayer(0, 0, 0, 0);
        floatingTvCurrent.setText(currentFloatingLyricText);
        lyricsBody.addView(floatingTvCurrent);

        // 彻底移除 floatingTvSub 第二行，保证视觉极简纯净
        floatingRootLayout.addView(lyricsBody);

        // 3. 底部播控栏 (操作态才显示，全部使用精美 SVG 矢量图标)
        floatingControlsLayout = new LinearLayout(this);
        floatingControlsLayout.setOrientation(LinearLayout.HORIZONTAL);
        floatingControlsLayout.setGravity(Gravity.CENTER_VERTICAL);
        floatingControlsLayout.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        floatingControlsLayout.setPadding(dp2px(4), dp2px(10), dp2px(4), 0);

        floatingIvFav = createSvgButton(isFloatingCurrentFav ? R.drawable.ic_floating_fav_active : R.drawable.ic_floating_fav, 34, new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                dispatchWebAction("toggleSongFavFromNotification()");
                resetAutoCollapseTimer();
            }
        });

        ImageView ivPrev = createSvgButton(R.drawable.ic_floating_prev, 34, new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                dispatchWebAction("playPrev()");
                resetAutoCollapseTimer();
            }
        });

        floatingIvPlay = createSvgButton(isFloatingCurrentPlaying ? R.drawable.ic_floating_pause : R.drawable.ic_floating_play, 42, new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                dispatchWebAction("togglePlayState()");
                resetAutoCollapseTimer();
            }
        });

        ImageView ivNext = createSvgButton(R.drawable.ic_floating_next, 34, new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                dispatchWebAction("playNext()");
                resetAutoCollapseTimer();
            }
        });

        ImageView ivSettings = createSvgButton(R.drawable.ic_floating_settings, 34, new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Intent appIntent = new Intent(MainActivity.this, MainActivity.class);
                appIntent.setAction(Intent.ACTION_MAIN);
                appIntent.addCategory(Intent.CATEGORY_LAUNCHER);
                appIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
                appIntent.putExtra("navigate_to", "settings");
                startActivity(appIntent);
                setFloatingCardExpanded(false);
                dispatchWebAction("if (typeof closePlayerFull === 'function') closePlayerFull(); if (typeof switchBottomTab === 'function') switchBottomTab('settings');");
                resetAutoCollapseTimer();
            }
        });

        floatingControlsLayout.removeAllViews();
        floatingControlsLayout.addView(floatingIvFav);
        floatingControlsLayout.addView(createFlexSpacer());
        floatingControlsLayout.addView(ivPrev);
        floatingControlsLayout.addView(createFlexSpacer());
        floatingControlsLayout.addView(floatingIvPlay);
        floatingControlsLayout.addView(createFlexSpacer());
        floatingControlsLayout.addView(ivNext);
        floatingControlsLayout.addView(createFlexSpacer());
        floatingControlsLayout.addView(ivSettings);

        floatingRootLayout.addView(floatingControlsLayout);

        int layoutType;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            layoutType = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
        } else {
            layoutType = WindowManager.LayoutParams.TYPE_PHONE;
        }

        int screenWidth = getResources().getDisplayMetrics().widthPixels;
        int cardWidth = Math.min(screenWidth - dp2px(36), dp2px(330));

        floatingParams = new WindowManager.LayoutParams(
                cardWidth,
                WindowManager.LayoutParams.WRAP_CONTENT,
                layoutType,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT
        );
        floatingParams.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        floatingParams.x = 0; // 屏幕正中央，严禁左右偏移
        floatingParams.y = dp2px(130);

        final int touchSlop = ViewConfiguration.get(this).getScaledTouchSlop();
        final GestureDetector gestureDetector = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
            @Override
            public boolean onSingleTapConfirmed(MotionEvent e) {
                toggleFloatingCardExpanded();
                return true;
            }

            @Override
            public boolean onFling(MotionEvent e1, MotionEvent e2, float velocityX, float velocityY) {
                if (e1 == null || e2 == null) return false;
                float dy = e2.getRawY() - e1.getRawY();
                if (Math.abs(dy) > dp2px(30) && Math.abs(velocityY) > 800) {
                    if (dy < 0) {
                        dispatchWebAction("seekToNextLyricLine()");
                    } else {
                        dispatchWebAction("seekToPrevLyricLine()");
                    }
                    return true;
                }
                return false;
            }
        });

        floatingRootLayout.setOnTouchListener(new View.OnTouchListener() {
            private int initialY;
            private float initialTouchY;
            private boolean isDragging = false;
            private long downTime = 0;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                gestureDetector.onTouchEvent(event);

                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        initialY = floatingParams.y;
                        initialTouchY = event.getRawY();
                        isDragging = false;
                        downTime = System.currentTimeMillis();
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        float dy = event.getRawY() - initialTouchY;
                        if (!isDragging && Math.abs(dy) > touchSlop) {
                            isDragging = true;
                        }
                        if (isDragging) {
                            floatingParams.x = 0; // 严格禁止左右移动
                            floatingParams.y = initialY + (int) dy;
                            if (windowManager != null && floatingLyricView != null) {
                                try {
                                    windowManager.updateViewLayout(floatingLyricView, floatingParams);
                                } catch (Exception ignored) {}
                            }
                        }
                        return true;
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        floatingParams.x = 0;
                        if (!isDragging) {
                            float totalDy = Math.abs(event.getRawY() - initialTouchY);
                            long duration = System.currentTimeMillis() - downTime;
                            if (totalDy <= touchSlop && duration < 350) {
                                toggleFloatingCardExpanded();
                            }
                        }
                        isDragging = false;
                        return true;
                }
                return false;
            }
        });

        // 初始设为平时纯净无框态（顶部栏 INVISIBLE，底栏 GONE，文字位置完全居中固定）
        setFloatingCardExpanded(false);

        try {
            windowManager.addView(floatingRootLayout, floatingParams);
            floatingLyricView = floatingRootLayout;
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public void hideDesktopLyrics() {
        if (floatingHandler != null) {
            floatingHandler.removeCallbacks(autoCollapseRunnable);
        }
        if (windowManager != null && floatingLyricView != null) {
            try {
                windowManager.removeView(floatingLyricView);
            } catch (Exception ignored) {}
            floatingLyricView = null;
        }
        isFloatingLyricsActive = false;
        isControlCardExpanded = false;
        // 刷新通知栏图标以移除勾标 √
        updateMediaCardFull(lastMediaTitle, lastMediaArtist, lastMediaCoverUrl, lastMediaIsPlaying, isFloatingCurrentFav, lastMediaPosMs, lastMediaDurMs);
        Toast.makeText(this, "桌面悬浮歌词已关闭", Toast.LENGTH_SHORT).show();
        if (webView != null) {
            webView.evaluateJavascript("if (window.onDesktopLyricsStateChanged) window.onDesktopLyricsStateChanged(false)", null);
        }
    }

    public void updateDesktopLyric(final String current, final String next, final String themeColor, final boolean isFav, final boolean isPlaying) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (current != null) currentFloatingLyricText = current;
                if (next != null) currentFloatingSubLyricText = next;
                if (themeColor != null && !themeColor.isEmpty()) currentFloatingThemeColor = themeColor;
                isFloatingCurrentFav = isFav;
                isFloatingCurrentPlaying = isPlaying;

                if (floatingTvCurrent != null) {
                    floatingTvCurrent.setText(currentFloatingLyricText);
                    try {
                        floatingTvCurrent.setTextColor(Color.parseColor(currentFloatingThemeColor));
                    } catch (Exception ignored) {}
                }
                updateFloatingFavState();
                updateFloatingPlayState();
            }
        });
    }

    public void updateDesktopLyric(final String current, final String next) {
        updateDesktopLyric(current, next, null, isFloatingCurrentFav, isFloatingCurrentPlaying);
    }

    public void scanLocalMusic() {
        if (Build.VERSION.SDK_INT >= 33) {
            if (checkSelfPermission("android.permission.READ_MEDIA_AUDIO") != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{"android.permission.READ_MEDIA_AUDIO"}, 102);
                return;
            }
        } else {
            if (checkSelfPermission("android.permission.READ_EXTERNAL_STORAGE") != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{"android.permission.READ_EXTERNAL_STORAGE"}, 102);
                return;
            }
        }

        new Thread(new Runnable() {
            @Override
            public void run() {
                final JSONArray songs = new JSONArray();
                try {
                    ContentResolver cr = getContentResolver();
                    Uri uri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
                    String[] projection = {
                            MediaStore.Audio.Media._ID,
                            MediaStore.Audio.Media.TITLE,
                            MediaStore.Audio.Media.ARTIST,
                            MediaStore.Audio.Media.ALBUM,
                            MediaStore.Audio.Media.DURATION,
                            MediaStore.Audio.Media.DATA
                    };
                    String selection = MediaStore.Audio.Media.IS_MUSIC + "!=0 AND " +
                            MediaStore.Audio.Media.DURATION + ">=15000";
                    Cursor cursor = cr.query(uri, projection, selection, null, MediaStore.Audio.Media.DEFAULT_SORT_ORDER);
                    if (cursor != null) {
                        int idCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
                        int titleCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
                        int artistCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
                        int albumCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM);
                        int durationCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
                        int dataCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATA);

                        while (cursor.moveToNext()) {
                            long id = cursor.getLong(idCol);
                            String title = cursor.getString(titleCol);
                            String artist = cursor.getString(artistCol);
                            String album = cursor.getString(albumCol);
                            long durationMs = cursor.getLong(durationCol);
                            String path = cursor.getString(dataCol);

                            if (artist == null || artist.equals("<unknown>")) artist = "未知歌手";
                            if (album == null || album.equals("<unknown>")) album = "本地音乐";

                            JSONObject item = new JSONObject();
                            item.put("id", "local_" + id);
                            item.put("title", title);
                            item.put("artist", artist);
                            item.put("album", album);
                            item.put("duration", Math.max(1, (int)(durationMs / 1000)));
                            item.put("fileUrl", "file://" + path);
                            item.put("isLocal", true);
                            songs.put(item);
                        }
                        cursor.close();
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }

                final String resultJson = songs.toString();
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        webView.evaluateJavascript("window.onLocalMusicScanned(" + resultJson + ")", null);
                        Toast.makeText(MainActivity.this, "已扫描到 " + songs.length() + " 首本地歌曲", Toast.LENGTH_SHORT).show();
                    }
                });
            }
        }).start();
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
        public void updateMediaCardFull(final String title, final String artist, final String coverUrl, final boolean isPlaying, final boolean isFav, final double currentSec, final double durationSec) {
            long posMs = (long) (currentSec * 1000);
            long durMs = (long) (durationSec * 1000);
            if (durMs <= 0) durMs = 180000;
            MainActivity.this.updateMediaCardFull(title, artist, coverUrl, isPlaying, isFav, posMs, durMs);
        }

        @JavascriptInterface
        public void downloadFile(final String url, final String filename) {
            MainActivity.this.downloadFile(url, filename);
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

        @JavascriptInterface
        public void toggleDesktopLyrics() {
            MainActivity.this.toggleDesktopLyrics();
        }

        @JavascriptInterface
        public void updateDesktopLyric(final String current, final String next) {
            MainActivity.this.updateDesktopLyric(current, next);
        }

        @JavascriptInterface
        public void updateDesktopLyric(final String current, final String next, final String themeColor, final boolean isFav, final boolean isPlaying) {
            MainActivity.this.updateDesktopLyric(current, next, themeColor, isFav, isPlaying);
        }

        @JavascriptInterface
        public void updateDesktopLyricFull(final String current, final String next, final String themeColor, final boolean isFav, final boolean isPlaying) {
            MainActivity.this.updateDesktopLyric(current, next, themeColor, isFav, isPlaying);
        }

        @JavascriptInterface
        public void setDesktopThemeColor(final String themeColor) {
            MainActivity.this.setDesktopThemeColor(themeColor);
        }

        @JavascriptInterface
        public boolean isDesktopLyricsActive() {
            return isFloatingLyricsActive;
        }

        @JavascriptInterface
        public String getAppVersion() {
            try {
                PackageInfo pInfo = getPackageManager().getPackageInfo(getPackageName(), 0);
                return pInfo.versionName;
            } catch (Exception e) {
                return "1.7.5";
            }
        }

        @JavascriptInterface
        public void scanLocalMusic() {
            MainActivity.this.scanLocalMusic();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_RESULT_CODE) {
            if (uploadMessage == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                uploadMessage.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            } else {
                Uri result = (data == null || resultCode != RESULT_OK) ? null : data.getData();
                uploadMessage.onReceiveValue(result != null ? new Uri[]{result} : null);
            }
            uploadMessage = null;
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 102 && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            scanLocalMusic();
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
