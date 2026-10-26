/* ================== 原生音频播放引擎与锁屏控制 ================== */
let isSeekingAudio = false;
let seekLockTimer = null;
const songRetryCounts = {};

let isNativeAudioSupported = false;
let nativeSyncTimer = null;

function startNativeSyncTimer() {
  if (!isNativeAudioSupported || nativeSyncTimer) return;
  nativeSyncTimer = setInterval(() => {
    if (isNativeAudioSupported && isPlaying) {
      if (document.hidden) {
        const needBg = isDesktopLyricsActive || (window.AndroidBridge && window.AndroidBridge.isDesktopLyricsActive && window.AndroidBridge.isDesktopLyricsActive());
        if (needBg) {
          syncCurrentLyricToDesktop();
        }
        return;
      }
      // 前台 60fps rAF 帧循环是唯一推进驱动；250ms 粗采样仅在其未运行时兜底，
      // 严禁用未经插值的原始位置直接覆盖 currentSec，杜绝歌词与进度条周期性回跳
      if (lyricRafId) return;
      currentSec = getAccuratePlaybackSec();
      syncProgress();
      updateLyricProgressSmooth();
    }
  }, 250);
}

function stopNativeSyncTimer() {
  if (nativeSyncTimer) {
    clearInterval(nativeSyncTimer);
    nativeSyncTimer = null;
  }
}

function initNativeAudioEngine() {
  isNativeAudioSupported = !!(window.AndroidBridge && window.AndroidBridge.isNativeAudioSupported && window.AndroidBridge.isNativeAudioSupported());
  if (isNativeAudioSupported) {
    startNativeSyncTimer();
  }
}

window.onNativePlay = function() {
  isPlaying = true;
  startNativeSyncTimer();
  updateUI();
  startLyricSmoothSync();
};

window.onNativePause = function() {
  isPlaying = false;
  stopNativeSyncTimer();
  updateUI();
  stopLyricSmoothSync();
};

window.onNativePrepared = function(durationSec) {
  isPlaying = true;
  const song = currentPlaybackQueue[currentIndex];
  if (song && durationSec > 0) {
    // 关键防御：如果底层解码出的时长 <= 35 秒（平台试听片段），且该曲目为在线歌曲，立即拦截并触发跨平台全长版检索
    const isOnline = !!(song.onlineId || (song.fileUrl && song.fileUrl.startsWith('http')));
    if (isOnline && durationSec <= 35 && !song.isLocal && !song._switchedToFull) {
      console.warn("Native prepared duration is only " + durationSec + "s for online song " + song.title + ", trial snippet detected!");
      song._switchedToFull = true;
      if (window.AndroidBridge && window.AndroidBridge.pauseNativeAudio) {
        window.AndroidBridge.pauseNativeAudio();
      }
      tryResolveAlternativeFullTrack(song);
      return;
    }

    song.duration = Math.floor(durationSec);
    const totalTimeEl = document.getElementById('totalTime');
    if (totalTimeEl) totalTimeEl.textContent = formatTime(song.duration);
    syncProgress();
  }
  updateUI();
  startLyricSmoothSync();
};

window.onNativeTrialSnippetDetected = function() {
  const song = currentPlaybackQueue[currentIndex];
  if (!song || song.isLocal) return;
  console.warn("Native layer reported trial snippet (VIP preview) for", song.title);
  if (!song._switchedToFull) {
    song._switchedToFull = true;
    tryResolveAlternativeFullTrack(song);
  } else {
    toast(`《${song.title}》暂无可用完整版本，自动播放下一首...`);
    setTimeout(() => playNext(), 1200);
  }
};

window.onNativeStreamInterrupted = function(resumeSec) {
  console.warn("Native stream unexpectedly interrupted at", resumeSec);
  const song = currentPlaybackQueue[currentIndex];
  if (!song) return;
  const isOnline = !!(song.onlineId || (song.fileUrl && song.fileUrl.startsWith('http')));
  if (isOnline) {
    const curResume = typeof resumeSec === 'number' && resumeSec > 0 ? resumeSec : (currentSec > 0 ? currentSec : 0);
    toast(`网络流波动中断，正在从第 ${Math.floor(curResume)} 秒自动断点续播...`);
    delete song.fileUrl;
    delete song.urlFetchedAt;
    persistData();
    resolveAndPlayOnlineSong(song, true, curResume);
  } else {
    handleTrackEnd();
  }
};

window.onNativeCompletion = function() {
  const song = currentPlaybackQueue[currentIndex];
  // 核心防御1：防止偶发网络抖动导致系统提前触发完成而误切歌
  if (song && song.duration > 20 && currentSec > 0 && currentSec < (song.duration - 8)) {
    console.warn("Front-end caught premature completion at", currentSec, "of", song.duration);
    if (window.onNativeStreamInterrupted) {
      window.onNativeStreamInterrupted(currentSec);
      return;
    }
  }
  // 核心防御2：防止 30 秒以内的试听残片播完被误当作整曲播放完毕而草率切歌
  const isOnline = song && !!(song.onlineId || (song.fileUrl && song.fileUrl.startsWith('http')));
  if (isOnline && currentSec <= 35 && (!song.duration || song.duration <= 35) && !song._switchedToFull) {
    console.warn("Online song completed at " + currentSec + "s (trial snippet completion)");
    song._switchedToFull = true;
    tryResolveAlternativeFullTrack(song);
    return;
  }
  stopLyricSmoothSync();
  handleTrackEnd();
};

window.onNativeSeekComplete = function() {
  isSeekingAudio = false;
  syncProgress();
  updateLyricProgressSmooth();
};

window.onNativeError = function(what, extra) {
  console.warn("Native MediaPlayer error:", what, extra);
  const song = currentPlaybackQueue[currentIndex];
  if (!song) return;
  const isOnline = !!(song.onlineId || (song.fileUrl && song.fileUrl.startsWith('http')));
  const retries = songRetryCounts[song.id] || 0;
  if (isOnline && retries < 3) {
    songRetryCounts[song.id] = retries + 1;
    const resume = (currentSec > 0 && song.duration && currentSec < song.duration - 5) ? currentSec : 0;
    if (resume > 0) {
      toast(`《${song.title}》网络抖动，正在第 ${Math.floor(resume)} 秒断点重连...`);
    } else {
      toast(`《${song.title}》正在自动切换高可用音源通道...`);
    }
    delete song.fileUrl;
    delete song.urlFetchedAt;
    persistData();
    setTimeout(() => {
      resolveAndPlayOnlineSong(song, true, resume);
    }, 600);
  } else {
    songRetryCounts[song.id] = 0;
    if (currentPlaybackQueue.length > 1) {
      toast(`《${song.title}》音源暂不可达，自动播放下一首...`);
      setTimeout(() => {
        playNext();
      }, 1500);
    } else {
      toast(`《${song.title}》音源加载异常，点击可重试`);
      isPlaying = false;
      updateUI();
    }
  }
};

/* 浏览器直连环境一次性测量音频输出延迟并补偿进歌词基准（解码位置领先入耳约 50-150ms）；
   原生 MediaPlayer 路径无法从 JS 测量，保持 0 由用户档位微调 */
let audioLatencyMeasured = false;
function measureAudioOutputLatency() {
  if (audioLatencyMeasured || isNativeAudioSupported) return;
  audioLatencyMeasured = true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ac = new AC();
    const applyLatency = () => {
      const lat = (typeof ac.outputLatency === 'number' && ac.outputLatency > 0.01 && ac.outputLatency < 0.3) ? ac.outputLatency : 0;
      try { ac.close(); } catch(e) {}
      if (lat > 0 && typeof LYRIC_AUDIO_OFFSET === 'number') {
        LYRIC_AUDIO_OFFSET = Math.min(0.25, LYRIC_AUDIO_OFFSET + lat);
      }
    };
    if (ac.state === 'running') applyLatency();
    else ac.resume().then(applyLatency).catch(() => { try { ac.close(); } catch(e2) {} });
  } catch(e) {}
}

function initAudioEngine() {
  audioPlayer.addEventListener('timeupdate', () => {
    if (isSeekingAudio) return; // 寻道解码期间屏蔽旧时间戳，防止选句时被旧进度强行扯回上一句
    if (!isNaN(audioPlayer.currentTime) && audioPlayer.currentTime >= 0) {
      // 只要底层音频硬件实际在发声行进，自动自我对齐修复 isPlaying 状态
      if (!audioPlayer.paused && !isPlaying) {
        isPlaying = true;
        updateUI();
      }
      currentSec = audioPlayer.currentTime;
      // 无论在前台还是后台，timeupdate 事件稳定触发，持续驱动进度条前进与桌面悬浮歌词滚动
      syncProgress();
      updateLyricProgressSmooth();
      if (!lyricRafId && isPlaying && !document.hidden) startLyricSmoothSync();
    }
  });

  audioPlayer.addEventListener('seeked', () => {
    isSeekingAudio = false;
    if (seekLockTimer) clearTimeout(seekLockTimer);
    if (!isNaN(audioPlayer.currentTime) && audioPlayer.currentTime >= 0) {
      currentSec = audioPlayer.currentTime;
    }
    syncProgress();
    updateLyricProgressSmooth();
    scrollActiveLyricToCenter();
  });

  audioPlayer.addEventListener('durationchange', () => {
    if (!isNaN(audioPlayer.duration) && audioPlayer.duration > 0) {
      const song = currentPlaybackQueue[currentIndex];
      if (song) {
        const actualDur = Math.floor(audioPlayer.duration);
        song.duration = actualDur;
        document.getElementById('totalTime').textContent = formatTime(actualDur);
        syncProgress();
        // 自动拦截小于 50 秒的试听片段，自动跨平台无缝检索完整版！
        if (actualDur > 0 && actualDur < 50 && !song.isLocal && !song._switchedToFull) {
          song._switchedToFull = true;
          tryResolveAlternativeFullTrack(song);
        } else if (actualDur <= 35 && !song._trialToastShown) {
          song._trialToastShown = true;
          toast('当前为平台试听片段 (全网暂无免费完整音源)');
        }
      }
    }
  });

  audioPlayer.addEventListener('ended', () => {
    stopLyricSmoothSync();
    handleTrackEnd();
  });

  audioPlayer.addEventListener('play', () => {
    isPlaying = true;
    const song = currentPlaybackQueue[currentIndex];
    if (song) songRetryCounts[song.id] = 0;
    updateUI();
    startLyricSmoothSync();
  });

  audioPlayer.addEventListener('playing', () => {
    isPlaying = true;
    const song = currentPlaybackQueue[currentIndex];
    if (song) songRetryCounts[song.id] = 0;
    measureAudioOutputLatency();
    updateUI();
    startLyricSmoothSync();
  });

  audioPlayer.addEventListener('pause', () => {
    if (audioPlayer.paused && !isSeekingAudio) {
      isPlaying = false;
      updateUI();
      stopLyricSmoothSync();
    }
  });

  audioPlayer.addEventListener('waiting', () => {
    // 缓冲卡顿状态，保持 isPlaying 真实态，不误报暂停
  });

  audioPlayer.addEventListener('error', (e) => {
    const song = currentPlaybackQueue[currentIndex];
    if (!song) return;
    console.warn("音频加载异常:", audioPlayer.error, song.fileUrl);

    const isOnline = !!(song.onlineId || (song.fileUrl && song.fileUrl.startsWith('http')));
    const retries = songRetryCounts[song.id] || 0;

    if (isOnline && retries < 2) {
      songRetryCounts[song.id] = retries + 1;
      toast(`《${song.title}》正在自动切换高可用音源通道...`);
      delete song.fileUrl;
      delete song.urlFetchedAt;
      persistData();
      resolveAndPlayOnlineSong(song, true);
    } else {
      songRetryCounts[song.id] = 0;
      toast(`《${song.title}》网络流暂不可达，请在设置中更换音乐接口`);
      isPlaying = false;
      updateUI();
    }
  });
}

function updateMediaSession(song) {
  if ('mediaSession' in navigator && song) {
    try {
      const artworkList = song.cover ? [
        { src: song.cover, sizes: '96x96', type: 'image/jpeg' },
        { src: song.cover, sizes: '256x256', type: 'image/jpeg' },
        { src: song.cover, sizes: '512x512', type: 'image/jpeg' }
      ] : [];
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: song.artist,
        album: 'YYRC 灵犀音乐',
        artwork: artworkList
      });
      navigator.mediaSession.setActionHandler('play', () => { if (!isPlaying) togglePlayState(); });
      navigator.mediaSession.setActionHandler('pause', () => { if (isPlaying) togglePlayState(); });
      navigator.mediaSession.setActionHandler('previoustrack', () => playPrev());
      navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime != null) {
          currentSec = details.seekTime;
          if (audioPlayer.src) audioPlayer.currentTime = currentSec;
          syncProgress();
          updateLyricProgress();
        }
      });
    } catch(err) {
      console.warn('MediaSession error', err);
    }
  }
}

/* 在当前队列中播放 */
function playSongAtQueue(idx) {
  if (idx < 0 || idx >= currentPlaybackQueue.length) return;
  currentIndex = idx;
  const song = currentPlaybackQueue[currentIndex];
  if (!song) return;
  currentSec = 0;

  // 发现页顶部推荐曲目联动：当前歌曲若为推荐曲目，唱片自动平滑滚入正方形卡片
  if (topRecommendedTracks && topRecommendedTracks.length > 0) {
    let matchIdx = -1;
    if (typeof song.topTrackIndex === 'number' && song.topTrackIndex >= 0 && song.topTrackIndex < topRecommendedTracks.length) {
      matchIdx = song.topTrackIndex;
    } else {
      const curOnlineId = song.onlineId || (song.id ? String(song.id).replace('online_', '') : '');
      const cleanCurTitle = (formatCleanTitle(song.title || '')).toLowerCase().trim();
      const cleanCurArtist = (formatCleanArtist(song.artist || '')).toLowerCase().trim();

      matchIdx = topRecommendedTracks.findIndex(t => {
        if ('online_' + t.id === song.id) return true;
        if (String(t.id) === curOnlineId) return true;
        if (t.url_id && String(t.url_id) === curOnlineId) return true;
        const cleanTTitle = (formatCleanTitle(t.name || t.title || '')).toLowerCase().trim();
        const cleanTArtist = (formatCleanArtist(t.artist || '')).toLowerCase().trim();
        if (cleanTTitle && cleanCurTitle && cleanTTitle === cleanCurTitle) {
          if (!cleanCurArtist || !cleanTArtist || cleanCurArtist === cleanTArtist || cleanCurArtist.includes(cleanTArtist) || cleanTArtist.includes(cleanCurArtist)) {
            return true;
          }
        }
        return false;
      });
    }
    if (matchIdx !== -1) {
      scrollVinylToTrack(matchIdx, true);
    }
  }

  // 发现推荐无限流静默预加载：接近末尾时自动扩充
  if (typeof isDiscoverRecommendationQueue !== 'undefined' && isDiscoverRecommendationQueue) {
    if (idx >= currentPlaybackQueue.length - 3 || activeTopTrackIndex >= (topRecommendedTracks ? topRecommendedTracks.length - 3 : 0)) {
      if (typeof ensureMoreRecommendationsSilently === 'function') {
        ensureMoreRecommendationsSilently();
      }
    }
  }

  // 每次触发点播，重置错误重试计数器，杜绝因偶发网络波动被永久锁定
  if (song.id) songRetryCounts[song.id] = 0;

  // 确保正在播放的歌曲属性同步更新，若为新点播歌曲加入主曲库顶部（后听的在上面）
  const existingIdx = ALL_LIBRARY_SONGS.findIndex(s => s.id === song.id || (s.title === song.title && s.artist === song.artist));
  if (existingIdx !== -1) {
    Object.assign(ALL_LIBRARY_SONGS[existingIdx], song);
  } else {
    ALL_LIBRARY_SONGS.unshift(song);
  }
  if (VINYL_ALBUMS[0]) {
    VINYL_ALBUMS[0].songs = ALL_LIBRARY_SONGS;
  }
  persistData();

  stopPlaybackLoop();

  // 1. 自动补全歌曲封面（高可用解析真实高清封面）；本地导入歌曲保留 ID3 内嵌封面，不做在线检索覆盖
  if (song.isLocal && song.cover) {
    applySongCoverToUI(song.cover);
  } else if (!song.cover || !song.cover.startsWith('http') || song.cover.includes('injahow.cn/meting/?server=') || song.cover.includes('param=300y300')) {
    ensureSongCover(song);
  } else {
    applySongCoverToUI(song.cover);
  }

  // 2. 歌词恢复与加载（优质词级逐字优先直接上屏，未完成逐字分词时优雅呈现水墨过场动效）
  const cachedLrc = song.lrc || getCachedLyric(song.title, song.artist);
  const parsed = cachedLrc ? parseLrc(cachedLrc) : null;
  const hasWordLyric = parsed && parsed.length && parsed.some(l => l.words && l.words.length > 0);
  const isUpToDateAnchor = cachedLrc && cachedLrc.includes('[krc-anchor:6]');

  if (hasWordLyric && isUpToDateAnchor) {
    // 命中最新的高质量商业/逐字词轴：秒级直接呈现，排版绝对确定稳定
    isLyricLoadingTransition = false;
    LYRICS_DATA = parsed;
    lastActiveIdx = -1;
    displayedPreviewIdx = -1;
    initLyricsList();
    syncCurrentLyricToDesktop();
  } else {
    // 存量普通单行 LRC、旧缓存或无缓存：绝不提前刷上屏幕导致一长句排版！
    // 立即启动宣纸水墨过场微光动效，后台优先拉取 QRC / KRC 商业逐字排版
    showLyricTransitionAnimation(song);
    if (cachedLrc && !hasWordLyric) {
      upgradeLyricToWordLevel(song, cachedLrc);
    } else {
      loadBestAvailableLyric(song);
    }
  }

  // 3. 音频流加载与播放
  // 检查直链是否过期（网络 CDN 鉴权流通常在 15-20 分钟内过期，超 20 分钟自动清除重新解析）
  const isOnlineSong = !!(song.onlineId || (song.fileUrl && song.fileUrl.startsWith('http')));
  if (isOnlineSong && song.fileUrl) {
    const isExpiredToken = !song.urlFetchedAt || (Date.now() - song.urlFetchedAt > 20 * 60 * 1000);
    const isBrokenNeteaseOuter = song.fileUrl.includes('music.163.com/song/media/outer/url');
    if (isExpiredToken || isBrokenNeteaseOuter) {
      delete song.fileUrl;
      delete song.urlFetchedAt;
      persistData();
    }
  }

  if (song.fileUrl) {
    if (isNativeAudioSupported) {
      if (song.fileUrl.startsWith('blob:')) {
        // 旧版导入的 blob 临时地址原生引擎无法访问且会话结束即失效，引导重新导入而非误报网络问题
        toast('该本地歌曲的临时音源已失效，请删除后重新导入');
        isPlaying = false;
        updateUI();
        return;
      }
      if (audioPlayer && !audioPlayer.paused) {
        try { audioPlayer.pause(); } catch(e) {}
      }
      keepBackgroundAlive();
      window.AndroidBridge.playNativeAudio(song.fileUrl, 0);
      isPlaying = true;
      updateUI();
    } else {
      if (audioPlayer.src !== song.fileUrl) {
        audioPlayer.src = song.fileUrl;
        audioPlayer.load();
      }
      audioPlayer.currentTime = 0;
      const playPromise = audioPlayer.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          isPlaying = true;
          updateUI();
        }).catch(err => {
          console.warn("Autoplay block or stream pending", err);
          isPlaying = false;
          updateUI();
        });
      }
    }
  } else if (song.onlineId || song.title) {
    resolveAndPlayOnlineSong(song);
  } else {
    if (currentPlaybackQueue.length > 1) {
      toast('《' + song.title + '》暂无可用音源，自动切换下一首...');
      setTimeout(() => playNext(), 1200);
    } else {
      toast('《' + song.title + '》暂无可用音源');
    }
  }

  updateMediaSession(song);
  updateUI();
}

function playSong(idx) {
  playFromLibrary(idx);
}

function togglePlayState() {
  const song = currentPlaybackQueue[currentIndex];
  if (!song) return;

  if (isPlaying) {
    if (isNativeAudioSupported) {
      window.AndroidBridge.pauseNativeAudio();
    } else {
      audioPlayer.pause();
    }
    isPlaying = false;
    stopPlaybackLoop();
    updateUI();
  } else {
    // 恢复播放或初次联网加载播放
    const isOnlineSong = !!(song.onlineId || (song.fileUrl && song.fileUrl.startsWith('http')));
    const isExpired = isOnlineSong && (!song.urlFetchedAt || (Date.now() - song.urlFetchedAt > 20 * 60 * 1000));
    if (isExpired) {
      delete song.fileUrl;
      delete song.urlFetchedAt;
      persistData();
      playSongAtQueue(currentIndex);
      return;
    }

    const hasNativePrepared = isNativeAudioSupported && window.AndroidBridge.isNativePrepared && window.AndroidBridge.isNativePrepared();
    if (song.fileUrl && (hasNativePrepared || !isNativeAudioSupported)) {
      if (isNativeAudioSupported) {
        window.AndroidBridge.resumeNativeAudio();
        isPlaying = true;
        updateUI();
      } else {
        if (audioPlayer.src && audioPlayer.src.includes(song.fileUrl) && audioPlayer.currentTime > 0) {
          audioPlayer.play().then(() => { isPlaying = true; updateUI(); }).catch(() => { playSongAtQueue(currentIndex); });
        } else {
          playSongAtQueue(currentIndex);
        }
      }
    } else {
      // 缺少有效音频流或原生解码器尚未就绪，自动触发全网音源解析与加载播放
      playSongAtQueue(currentIndex);
    }
  }
}

function stopPlaybackLoop() {
  if (playProgressTimer) clearInterval(playProgressTimer);
  playProgressTimer = null;
}

function handleTrackEnd() {
  const finishedSong = currentPlaybackQueue[currentIndex];
  if (finishedSong && !ALL_LIBRARY_SONGS.some(s => s.id === finishedSong.id || (s.title === finishedSong.title && s.artist === finishedSong.artist))) {
    ALL_LIBRARY_SONGS.push(finishedSong);
    persistData();
    renderSongList();
    renderVinylDiscs();
    renderDrawerList();
  }

  // 若开启了播完当前歌曲后停止定时器
  if (currentSleepTimerType === 'track') {
    cancelSleepTimer(false);
    if (isNativeAudioSupported && window.AndroidBridge && window.AndroidBridge.pauseNativeAudio) {
      window.AndroidBridge.pauseNativeAudio();
    } else if (audioPlayer) {
      audioPlayer.pause();
    }
    isPlaying = false;
    stopPlaybackLoop();
    updateUI();
    toast('当前歌曲播放完毕，定时已自动停止');
    return;
  }

  if (playMode === 'single') {
    currentSec = 0;
    playSongAtQueue(currentIndex);
  } else if (playMode === 'random') {
    let next = Math.floor(Math.random() * currentPlaybackQueue.length);
    if (currentPlaybackQueue.length > 1 && next === currentIndex) {
      next = (next + 1) % currentPlaybackQueue.length;
    }
    playSongAtQueue(next);
  } else if (playMode === 'order') {
    if (currentIndex < currentPlaybackQueue.length - 1) {
      playSongAtQueue(currentIndex + 1);
    } else {
      isPlaying = false;
      currentSec = 0;
      updateUI();
      toast('已播放至列表末尾');
    }
  } else {
    playNext();
  }
}

