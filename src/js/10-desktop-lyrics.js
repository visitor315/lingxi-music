/* ================== 真实原生桌面悬浮歌词与画中画降级兼容 ================== */
let isDesktopLyricsActive = false;

function toggleDesktopLyricsFromUI() {
  if (window.AndroidBridge && window.AndroidBridge.toggleDesktopLyrics) {
    window.AndroidBridge.toggleDesktopLyrics();
    isDesktopLyricsActive = !isDesktopLyricsActive;
    updateDesktopLyricsUI();
    syncCurrentLyricToDesktop();
    return;
  }
  // 非原生 Android 环境或纯浏览器环境降级走 PiP
  togglePipLyrics();
}

function updateDesktopLyricsUI() {
  const toggle = document.getElementById('desktopLyricsToggle') || document.getElementById('pipLyricsToggle');
  const desc = document.getElementById('desktopLyricsDesc') || document.getElementById('pipLyricsDesc');
  const active = (window.AndroidBridge && window.AndroidBridge.isDesktopLyricsActive)
    ? window.AndroidBridge.isDesktopLyricsActive()
    : (isDesktopLyricsActive || isPipActive);
  if (toggle) {
    toggle.classList.toggle('active', !!active);
  }
  if (desc) {
    desc.textContent = active ? '桌面悬浮歌词运行中 - 点击可关闭' : '在手机桌面与应用上方浮窗显示歌词，支持滑动切词与拖拽';
  }
}

window.onDesktopLyricsStateChanged = function(active) {
  isDesktopLyricsActive = !!active;
  updateDesktopLyricsUI();
  if (document.hidden) {
    if (isDesktopLyricsActive) {
      if (!bgLyricInterval && isPlaying) {
        bgLyricInterval = setInterval(() => {
          if (!isPlaying) return;
          if (isNativeAudioSupported) {
            if (window.AndroidBridge && window.AndroidBridge.getNativePosition) {
              const np = window.AndroidBridge.getNativePosition();
              if (typeof np === 'number' && np >= 0) currentSec = np;
            }
          } else if (audioPlayer && !audioPlayer.paused && !isSeekingAudio && !isNaN(audioPlayer.currentTime)) {
            currentSec = audioPlayer.currentTime;
          }
          syncCurrentLyricToDesktop();
        }, 300);
      }
    } else {
      if (bgLyricInterval) {
        clearInterval(bgLyricInterval);
        bgLyricInterval = null;
      }
    }
  }
};

function syncCurrentLyricToDesktop() {
  if (window.AndroidBridge && window.AndroidBridge.updateDesktopLyric) {
    let curTxt = '灵犀音乐 - 随心听';
    let nextTxt = '';
    const curSong = currentPlaybackQueue[currentIndex];
    if (curSong) {
      curTxt = `${curSong.title} - ${curSong.artist}`;
    }
    if (LYRICS_DATA && LYRICS_DATA.length > 0) {
      const rawTime = isNativeAudioSupported
        ? (window.AndroidBridge.getNativePosition ? window.AndroidBridge.getNativePosition() : currentSec)
        : ((!isSeekingAudio && !isNaN(audioPlayer.currentTime) && audioPlayer.currentTime > 0) ? audioPlayer.currentTime : currentSec);
      const curTime = Math.max(0, rawTime + LYRIC_AUDIO_OFFSET);
      let matchIdx = -1;
      for (let i = 0; i < LYRICS_DATA.length; i++) {
        if (curTime >= LYRICS_DATA[i].time) matchIdx = i;
      }
      if (matchIdx >= 0 && LYRICS_DATA[matchIdx]) {
        lastActiveIdx = matchIdx;
        curTxt = LYRICS_DATA[matchIdx].cleanText || LYRICS_DATA[matchIdx].text;
        if (LYRICS_DATA[matchIdx + 1]) {
          nextTxt = LYRICS_DATA[matchIdx + 1].cleanText || LYRICS_DATA[matchIdx + 1].text;
        }
      } else if (LYRICS_DATA[0]) {
        nextTxt = LYRICS_DATA[0].cleanText || LYRICS_DATA[0].text;
      }
    }
    const themeHex = (typeof getActiveThemeColorHex === 'function') ? getActiveThemeColorHex() : '#234BB8';
    const isFav = curSong ? !!curSong.isFav : false;
    if (window.AndroidBridge.updateDesktopLyricFull) {
      window.AndroidBridge.updateDesktopLyricFull(curTxt, nextTxt, themeHex, isFav, isPlaying);
    } else {
      window.AndroidBridge.updateDesktopLyric(curTxt, nextTxt, themeHex, isFav, isPlaying);
    }
  }
}

// 桌面歌词上下划动切句原生调用接口
window.seekToNextLyricLine = function() {
  if (!LYRICS_DATA || LYRICS_DATA.length === 0) return;
  let targetIdx = (lastActiveIdx >= 0) ? (lastActiveIdx + 1) : 0;
  if (targetIdx >= LYRICS_DATA.length) targetIdx = LYRICS_DATA.length - 1;
  const targetTime = LYRICS_DATA[targetIdx].time;
  currentSec = targetTime;
  if (isNativeAudioSupported) {
    window.AndroidBridge.seekNativeAudio(targetTime);
  } else if (audioPlayer) {
    audioPlayer.currentTime = targetTime;
  }
  updateLyricProgressSmooth(targetIdx);
  syncProgress();
  syncCurrentLyricToDesktop();
};

window.seekToPrevLyricLine = function() {
  if (!LYRICS_DATA || LYRICS_DATA.length === 0) return;
  let targetIdx = (lastActiveIdx > 0) ? (lastActiveIdx - 1) : 0;
  const targetTime = LYRICS_DATA[targetIdx].time;
  currentSec = targetTime;
  if (isNativeAudioSupported) {
    window.AndroidBridge.seekNativeAudio(targetTime);
  } else if (audioPlayer) {
    audioPlayer.currentTime = targetTime;
  }
  updateLyricProgressSmooth(targetIdx);
  syncProgress();
  syncCurrentLyricToDesktop();
};

// 本地音乐系统扫描
function scanDeviceLocalMusic() {
  if (window.AndroidBridge && window.AndroidBridge.scanLocalMusic) {
    toast('正在扫描手机本地音频...');
    window.AndroidBridge.scanLocalMusic();
  } else {
    triggerFileImport();
  }
}

window.onLocalMusicScanned = function(scannedSongs) {
  if (!scannedSongs || !Array.isArray(scannedSongs)) return;
  const alb = VINYL_ALBUMS.find(a => a.id === 'alb_local');
  if (!alb) return;
  if (!alb.songs) alb.songs = [];

  let addedCount = 0;
  scannedSongs.forEach(item => {
    const exists = alb.songs.some(s => (s.id === item.id) || (s.title === item.title && s.artist === item.artist));
    if (!exists) {
      alb.songs.push(item);
      if (!ALL_LIBRARY_SONGS.some(s => s.id === item.id)) {
        ALL_LIBRARY_SONGS.push(item);
      }
      addedCount++;
    }
  });

  persistData();
  renderPlaylistDetailSongsOnly();
  renderVinylHomeList();
  const countEl = document.getElementById('heroTrackCount');
  if (countEl && alb) countEl.textContent = '(' + (alb.songs ? alb.songs.length : 0) + '首)';
  toast(`扫描完成，新增 ${addedCount} 首本地歌曲（共 ${alb.songs.length} 首）`);
};

