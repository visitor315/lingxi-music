/* ================== 歌词逻辑 ================== */
let targetSeekTime = 5;
let autoCenterTimer = null;
let isUserInteractingWithLyrics = false;
let scrollEndTimer = null;
let lastActiveIdx = -1;
let isAnimatingPreviewRoll = false;
let displayedPreviewIdx = -1;

let targetSeekIndex = -1;
let activeLyricLineEl = null;
let previewMainLyricEl = null;
let appliedActiveIdx = -99;

let isLyricLoadingTransition = false;

/* 纯净歌词加载占位：直接呈现一行普通歌词“歌词正在加载中…”，期间隐藏所有其他歌词 */
let lyricLoadingWatchdogTimer = null;

/* 切歌触发时刻第 1 毫秒强制彻底重置歌词上下文与 DOM 渲染状态 */
function resetLyricStateOnSongSwitch(song) {
  if (lyricLoadingWatchdogTimer) {
    clearTimeout(lyricLoadingWatchdogTimer);
    lyricLoadingWatchdogTimer = null;
  }
  isLyricLoadingTransition = true;
  LYRICS_DATA = [];
  lastActiveIdx = -1;
  appliedActiveIdx = -99;
  displayedPreviewIdx = -1;
  activeLyricLineEl = null;

  const previewMain = document.getElementById('previewMainLyric');
  const previewSub = document.getElementById('previewSubLyric');
  const track = document.getElementById('previewScrollTrack');
  if (track) {
    track.style.transition = 'none';
    track.style.transform = 'translateY(0)';
  }
  if (previewMain) {
    previewMain.style.transition = 'none';
    previewMain.style.opacity = '0.7';
    previewMain.classList.remove('pending');
    previewMain.style.setProperty('--fill-pct', '0%');
    previewMain.innerHTML = '<span class="lyric-text-body">歌词正在加载中…</span>';
  }
  if (previewSub) {
    previewSub.style.transition = 'none';
    previewSub.style.transform = 'none';
    previewSub.style.display = 'none';
    previewSub.textContent = '';
  }

  const container = document.getElementById('lyricsItemsList');
  if (container) {
    container.innerHTML = '<div class="lyric-line-item active" style="pointer-events:none; opacity:0.7;"><span class="lyric-text-body">歌词正在加载中…</span></div>';
    container.scrollTop = 0;
  }

  if (window.AndroidBridge && window.AndroidBridge.setNativeLyrics) {
    try {
      window.AndroidBridge.setNativeLyrics(JSON.stringify([{ time: 0, text: '歌词正在加载中…' }]));
    } catch(e) {}
  }
}

/* 确定性无歌词安全状态（本地无词或网络未匹配时立即平稳落袋） */
function setNoLyricsState(song, reasonText = '此歌曲暂无同步歌词') {
  if (lyricLoadingWatchdogTimer) {
    clearTimeout(lyricLoadingWatchdogTimer);
    lyricLoadingWatchdogTimer = null;
  }
  isLyricLoadingTransition = false;
  LYRICS_DATA = [
    { time: 0, duration: 99999, text: reasonText, cleanText: reasonText }
  ];
  lastActiveIdx = -1;
  appliedActiveIdx = -99;
  displayedPreviewIdx = -1;
  activeLyricLineEl = null;

  const previewMain = document.getElementById('previewMainLyric');
  const previewSub = document.getElementById('previewSubLyric');
  const track = document.getElementById('previewScrollTrack');
  if (track) {
    track.style.transition = 'none';
    track.style.transform = 'translateY(0)';
  }
  if (previewMain) {
    previewMain.style.transition = 'none';
    previewMain.style.opacity = '0.6';
    previewMain.classList.remove('pending');
    previewMain.style.setProperty('--fill-pct', '0%');
    previewMain.innerHTML = '<span class="lyric-text-body">暂无歌词</span>';
  }
  if (previewSub) {
    previewSub.style.transition = 'none';
    previewSub.style.transform = 'none';
    previewSub.style.display = 'none';
    previewSub.textContent = '';
  }

  const container = document.getElementById('lyricsItemsList');
  if (container) {
    container.innerHTML = `
      <div class="lyric-line-item active" style="pointer-events:none; opacity:0.6; text-align:center;">
        <span class="lyric-text-body">${reasonText}</span>
      </div>
    `;
    container.scrollTop = 0;
  }

  if (window.AndroidBridge && window.AndroidBridge.setNativeLyrics) {
    try {
      window.AndroidBridge.setNativeLyrics(JSON.stringify([{ time: 0, text: reasonText }]));
    } catch(e) {}
  }
}

function showLyricTransitionAnimation(song) {
  resetLyricStateOnSongSwitch(song);

  // 保险看门狗：最长等待 3.5 秒，若因全网无歌词或接口超时未正常结束，自动降级解除加载状态
  lyricLoadingWatchdogTimer = setTimeout(() => {
    if (isLyricLoadingTransition) {
      const s = currentPlaybackQueue[currentIndex] || song;
      setNoLyricsState(s, '此歌曲暂无同步歌词');
    }
  }, 4000);
}

function initLyricsList() {
  if (lyricLoadingWatchdogTimer) {
    clearTimeout(lyricLoadingWatchdogTimer);
    lyricLoadingWatchdogTimer = null;
  }
  isLyricLoadingTransition = false;
  if (!LYRICS_DATA || LYRICS_DATA.length === 0) {
    setNoLyricsState(currentPlaybackQueue[currentIndex]);
    return;
  }
  const previewSub = document.getElementById('previewSubLyric');
  if (previewSub) {
    previewSub.style.display = (LYRICS_DATA.length > 1) ? '' : 'none';
  }
  const container = document.getElementById('lyricsItemsList');
  container.innerHTML = LYRICS_DATA.map((item, idx) => `
    <div class="lyric-line-item" data-time="${item.time}" data-index="${idx}" id="lyricLine${idx}" onclick="seekToLyricLineByIndex(${idx}, event)">
      ${formatLyricItemHtml(item)}
    </div>
  `).join('');
  activeLyricLineEl = null;
  appliedActiveIdx = -99;

  if (LYRICS_DATA && LYRICS_DATA.length > 0) {
    displayedPreviewIdx = -1;
    updateSimplePreviewLyric(0, true);
    if (window.AndroidBridge && window.AndroidBridge.setNativeLyrics) {
      try {
        const list = LYRICS_DATA.map(l => ({
          time: l.time,
          text: l.cleanText || l.text || ''
        }));
        window.AndroidBridge.setNativeLyrics(JSON.stringify(list));
      } catch(e) {}
    }
  }

  const scrollBox = document.getElementById('pureLyricsContainer');
  let startY = 0;
  let moved = false;

  scrollBox.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY;
    moved = false;
    isUserInteractingWithLyrics = true;
    if (autoCenterTimer) clearTimeout(autoCenterTimer);
  }, { passive: true });

  scrollBox.addEventListener('touchmove', (e) => {
    if (Math.abs(e.touches[0].clientY - startY) > 6) {
      moved = true;
      triggerSeekLineOnScroll();
    }
  }, { passive: true });

  scrollBox.addEventListener('touchend', (e) => {
    if (!moved && !e.target.closest('.lyric-line-item') && !e.target.closest('.crossline-play-btn')) {
      closePureLyricsView();
    } else {
      startAutoCenterCountdown();
    }
  });

  scrollBox.addEventListener('wheel', () => {
    isUserInteractingWithLyrics = true;
    triggerSeekLineOnScroll();
    startAutoCenterCountdown();
  }, { passive: true });

  scrollBox.addEventListener('scroll', () => {
    if (isUserInteractingWithLyrics) {
      triggerSeekLineOnScroll();
      startAutoCenterCountdown();
    }
  }, { passive: true });
}

function startAutoCenterCountdown() {
  if (autoCenterTimer) clearTimeout(autoCenterTimer);
  autoCenterTimer = setTimeout(() => {
    isUserInteractingWithLyrics = false;
    scrollActiveLyricToCenter();
  }, 4000);
}

function openPureLyricsView() {
  isPureLyrics = true;
  isUserInteractingWithLyrics = false;
  document.getElementById('turntableBox').style.display = 'none';
  document.getElementById('simpleLyricsBox').style.display = 'none';
  document.getElementById('pureLyricsContainer').classList.add('active');
  const container = document.getElementById('lyricsItemsList');
  if (container && (!container.children || container.children.length === 0)) {
    if (isLyricLoadingTransition) {
      container.innerHTML = '<div class="lyric-line-item active" style="pointer-events:none; opacity:0.7;"><span class="lyric-text-body">歌词正在加载中…</span></div>';
    } else {
      container.innerHTML = '<div class="lyric-line-item active" style="pointer-events:none; opacity:0.6; text-align:center;"><span class="lyric-text-body">此歌曲暂无同步歌词</span></div>';
    }
  }
  setTimeout(() => scrollActiveLyricToCenter(), 60);
}

function closePureLyricsView() {
  isPureLyrics = false;
  isUserInteractingWithLyrics = false;
  if (autoCenterTimer) clearTimeout(autoCenterTimer);
  document.getElementById('pureLyricsContainer').classList.remove('active');
  document.getElementById('lyricsSeekCrossline').classList.remove('visible');
  document.getElementById('turntableBox').style.display = 'flex';
  document.getElementById('simpleLyricsBox').style.display = 'flex';
}

function triggerSeekLineOnScroll() {
  if (!isPureLyrics) return;
  const crossline = document.getElementById('lyricsSeekCrossline');
  crossline.classList.add('visible');

  const container = document.getElementById('pureLyricsContainer');
  const crosslineRect = crossline.getBoundingClientRect();
  const targetY = crosslineRect.height > 0 ? (crosslineRect.top + crosslineRect.height / 2) : (container.getBoundingClientRect().top + container.clientHeight * 0.42);
  const lines = document.querySelectorAll('.lyric-line-item');
  let closestLine = null;
  let minDiff = Infinity;

  lines.forEach(line => {
    const rect = line.getBoundingClientRect();
    const lineCenter = rect.top + rect.height / 2;
    const diff = Math.abs(lineCenter - targetY);
    if (diff < minDiff) { minDiff = diff; closestLine = line; }
  });

  if (closestLine) {
    const t = parseFloat(closestLine.getAttribute('data-time')) || 0;
    const lineIdx = parseInt(closestLine.getAttribute('data-index'), 10);
    targetSeekTime = t;
    targetSeekIndex = isNaN(lineIdx) ? -1 : lineIdx;
    document.getElementById('crosslineTimeText').textContent = formatTime(Math.floor(t));
  }

  if (scrollEndTimer) clearTimeout(scrollEndTimer);
  scrollEndTimer = setTimeout(() => crossline.classList.remove('visible'), 1200);
}

function seekToLyricLineByIndex(idx, e) {
  if (e && e.stopPropagation) e.stopPropagation();
  const item = LYRICS_DATA[idx];
  if (!item) return;
  const offsetComp = (typeof LYRIC_AUDIO_OFFSET === 'number') ? LYRIC_AUDIO_OFFSET : 0.0;
  // 寻道目标按歌词偏移反向补偿：落点必须对齐本句 0% 起唱点（rawTime + offset 恰好等于行时间轴），
  // 杜绝点击歌词行后填充从中段才开始推进
  seekToLyricLine(Math.max(0, item.time - offsetComp + 0.02), e, idx);
}

function seekToLyricLine(time, e, explicitIdx) {
  if (e && e.stopPropagation) e.stopPropagation();
  isUserInteractingWithLyrics = false;
  currentSec = Number(time) || 0;
  resetPlaybackClock(currentSec);

  // 锁定寻道状态，防止底层解码器在缓冲准备阶段触发旧时间戳将进度篡改回上一句
  isSeekingAudio = true;
  if (seekLockTimer) clearTimeout(seekLockTimer);
  seekLockTimer = setTimeout(() => { isSeekingAudio = false; }, 500);

  if (typeof explicitIdx === 'number' && explicitIdx >= 0) {
    lastActiveIdx = explicitIdx;
    displayedPreviewIdx = -1;
  }

  const curSong = currentPlaybackQueue[currentIndex];
  if (curSong && curSong.fileUrl) {
    if (isNativeAudioSupported) {
      window.AndroidBridge.seekNativeAudio(currentSec);
    } else if (!isNaN(audioPlayer.duration) && audioPlayer.duration > 0) {
      audioPlayer.currentTime = currentSec;
    }
  }
  syncProgress();
  updateLyricProgress(explicitIdx);
  scrollActiveLyricToCenter();
  const crossline = document.getElementById('lyricsSeekCrossline');
  if (crossline) crossline.classList.remove('visible');
  if (!isPlaying) togglePlayState();
}

function playAtTargetLyric(e) {
  if (e && e.stopPropagation) e.stopPropagation();
  if (typeof targetSeekIndex === 'number' && targetSeekIndex >= 0) {
    seekToLyricLineByIndex(targetSeekIndex, e);
  } else {
    const offsetComp = (typeof LYRIC_AUDIO_OFFSET === 'number') ? LYRIC_AUDIO_OFFSET : 0.0;
    seekToLyricLine(Math.max(0, targetSeekTime - offsetComp + 0.02), e);
  }
}

let lyricRafId = null;
let bgLyricInterval = null;

/* 后台歌词轮询共享实现：08 本模块与 10 桌面歌词的 visibilitychange / 状态回调统一复用 */
function startBgLyricPolling() {
  if (bgLyricInterval || !isPlaying) return;
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

function stopBgLyricPolling() {
  if (bgLyricInterval) {
    clearInterval(bgLyricInterval);
    bgLyricInterval = null;
  }
}

let smoothedPlaybackSec = 0;
let lastSmoothedPerfTime = 0;
let lastRawSamplePos = -1;

function resetPlaybackClock(newTime) {
  const t = (typeof newTime === 'number' && newTime >= 0) ? newTime : currentSec;
  smoothedPlaybackSec = t;
  lastSmoothedPerfTime = performance.now();
  lastRawSamplePos = -1;
  currentSec = t;
}

function getAccuratePlaybackSec() {
  if (isSeekingAudio) {
    smoothedPlaybackSec = currentSec;
    lastSmoothedPerfTime = performance.now();
    lastRawSamplePos = -1;
    return currentSec;
  }

  const now = performance.now();
  let rawPos = -1;

  if (isNativeAudioSupported && window.AndroidBridge && window.AndroidBridge.getNativePosition) {
    try {
      const p = window.AndroidBridge.getNativePosition();
      if (typeof p === 'number' && p >= 0) rawPos = p;
    } catch(e) {}
  } else if (!isNaN(audioPlayer.currentTime) && audioPlayer.currentTime >= 0) {
    rawPos = audioPlayer.currentTime;
  }

  if (rawPos < 0) return currentSec;

  if (lastSmoothedPerfTime === 0 || lastRawSamplePos < 0) {
    smoothedPlaybackSec = rawPos;
    lastSmoothedPerfTime = now;
    lastRawSamplePos = rawPos;
    currentSec = rawPos;
    return rawPos;
  }

  const dt = Math.max(0, Math.min(0.1, (now - lastSmoothedPerfTime) / 1000));
  lastSmoothedPerfTime = now;

  const isActuallyPlaying = isPlaying || (!isNativeAudioSupported && audioPlayer && !audioPlayer.paused);
  if (!isActuallyPlaying) {
    smoothedPlaybackSec = rawPos;
    currentSec = rawPos;
    return rawPos;
  }

  // 物理高精连续前向推进：每帧按真实高精度时钟 dt 匀速前行，从数学上根除阶梯停顿
  smoothedPlaybackSec += dt;

  // 硬件时钟对齐校验：温柔吸收硬件时钟微小漂移，杜绝倒退与突跳
  const diff = rawPos - smoothedPlaybackSec;
  if (Math.abs(diff) > 0.6) {
    // 拖动进度条或硬件重定位：立即同步
    smoothedPlaybackSec = rawPos;
  } else if (rawPos !== lastRawSamplePos) {
    lastRawSamplePos = rawPos;
    smoothedPlaybackSec += diff * 0.25;
  }

  // 单调性保证：正常播放中时间绝对禁止倒流
  if (smoothedPlaybackSec < currentSec && Math.abs(rawPos - currentSec) < 0.6) {
    smoothedPlaybackSec = currentSec;
  }

  currentSec = smoothedPlaybackSec;
  return currentSec;
}

function startLyricSmoothSync() {
  if (lyricRafId) cancelAnimationFrame(lyricRafId);
  function tick() {
    if (isPlaying && !document.hidden) {
      if (!isNativeAudioSupported && audioPlayer.paused) {
        lyricRafId = null;
        return;
      }
      if (!isSeekingAudio) {
        // 每帧只做一次原生位置采样，同一采样值贯穿进度条与歌词推进，杜绝双源写入回跳
        const sampled = getAccuratePlaybackSec();
        currentSec = sampled;
        syncProgress(sampled);
        updateLyricProgressSmooth(-1, sampled);
      } else {
        syncProgress();
        updateLyricProgressSmooth();
      }
      lyricRafId = requestAnimationFrame(tick);
    } else {
      lyricRafId = null;
    }
  }
  if (!document.hidden) {
    lyricRafId = requestAnimationFrame(tick);
  }
}

// 监听切到后台/桌面状态：rAF 会被 Chromium 挂起
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (lyricRafId) {
      cancelAnimationFrame(lyricRafId);
      lyricRafId = null;
    }
    // 关键优化：若未开启桌面悬浮歌词，切后台时坚决不运行高频定时器与 DOM 计算，节省 100% CPU 给底层音频解码！
    const needBgLyrics = isDesktopLyricsActive || (window.AndroidBridge && window.AndroidBridge.isDesktopLyricsActive && window.AndroidBridge.isDesktopLyricsActive());
    if (needBgLyrics) {
      startBgLyricPolling();
    }
  } else {
    stopBgLyricPolling();
    if (isPlaying) {
      if (isNativeAudioSupported && window.AndroidBridge.getNativePosition) {
        const np = window.AndroidBridge.getNativePosition();
        if (typeof np === 'number' && np >= 0) currentSec = np;
      }
      syncProgress();
      startLyricSmoothSync();
    }
  }
});

function stopLyricSmoothSync() {
  if (lyricRafId) {
    cancelAnimationFrame(lyricRafId);
    lyricRafId = null;
  }
  if (bgLyricInterval) {
    clearInterval(bgLyricInterval);
    bgLyricInterval = null;
  }
}

function updateLyricProgress(forcedIdx) {
  if (typeof forcedIdx === 'number') {
    applyLyricLineChange(forcedIdx);
  }
  updateLyricProgressSmooth(forcedIdx);
}

// 音频与歌词时间轴同步基准：默认零偏移，直连输出下填充与人声严格对位；
// 蓝牙/车载等高延迟链路请在设置中切换补偿档位，支持持久化自定义
let LYRIC_AUDIO_OFFSET = (function() {
  const saved = localStorage.getItem('lingxi_lyric_offset');
  if (saved !== null && !isNaN(parseFloat(saved))) return parseFloat(saved);
  return 0.0;
})();

function setLyricAudioOffset(val) {
  LYRIC_AUDIO_OFFSET = Number(val) || 0.0;
  localStorage.setItem('lingxi_lyric_offset', String(LYRIC_AUDIO_OFFSET));
}

const LYRIC_OFFSET_PRESETS = [
  { val: 0.00, label: '标准 0.00 秒 (推荐 - 直连输出零延迟)' },
  { val: 0.15, label: '提前 0.15 秒 (普通蓝牙耳机)' },
  { val: 0.25, label: '提前 0.25 秒 (高延迟蓝牙耳机)' },
  { val: 0.35, label: '提前 0.35 秒 (车载蓝牙或远距音箱)' },
  { val: -0.15, label: '延后 0.15 秒 (提前打轴音源)' }
];

function updateLyricOffsetSettingUI() {
  const descEl = document.getElementById('lyricOffsetSettingDesc');
  if (!descEl) return;
  const cur = (typeof LYRIC_AUDIO_OFFSET === 'number') ? LYRIC_AUDIO_OFFSET : 0.0;
  const found = LYRIC_OFFSET_PRESETS.find(p => Math.abs(p.val - cur) < 0.01);
  descEl.textContent = found ? found.label : `自定义：${cur > 0 ? '提前' : '延后'} ${Math.abs(cur).toFixed(2)} 秒`;
}

function cycleLyricOffsetSetting() {
  const cur = (typeof LYRIC_AUDIO_OFFSET === 'number') ? LYRIC_AUDIO_OFFSET : 0.0;
  let idx = LYRIC_OFFSET_PRESETS.findIndex(p => Math.abs(p.val - cur) < 0.01);
  if (idx === -1) idx = 0;
  idx = (idx + 1) % LYRIC_OFFSET_PRESETS.length;
  const target = LYRIC_OFFSET_PRESETS[idx];
  setLyricAudioOffset(target.val);
  updateLyricOffsetSettingUI();
  toast(`已切换为：${target.label.split(' (')[0]}`);
}

function findActiveLyricIndex(curTime) {
  if (!LYRICS_DATA || LYRICS_DATA.length === 0) return -1;
  if (curTime < LYRICS_DATA[0].time) return -1;
  let low = 0;
  let high = LYRICS_DATA.length - 1;
  let ans = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (LYRICS_DATA[mid].time <= curTime) {
      ans = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return ans;
}

function updateLyricProgressSmooth(forcedIdx, sampledSec) {
  if (document.hidden) return; // 切后台彻底跳过歌词 DOM 渲染与重排计算
  if (isLyricLoadingTransition) return; // 过渡加载中坚决禁止任何歌词计算与预览覆盖！
  if (!LYRICS_DATA || LYRICS_DATA.length === 0) return;
  const rawTime = (typeof sampledSec === 'number' && sampledSec >= 0) ? sampledSec
    : ((typeof getAccuratePlaybackSec === 'function') ? getAccuratePlaybackSec() : currentSec);
  const curTime = Math.max(0, rawTime + LYRIC_AUDIO_OFFSET);

  let activeIdx = -1;
  let inInterlude = false;

  if (typeof forcedIdx === 'number' && forcedIdx >= 0 && forcedIdx < LYRICS_DATA.length) {
    activeIdx = forcedIdx;
  } else {
    activeIdx = findActiveLyricIndex(curTime);
  }

  // 1. 前奏判定：歌曲已开播但尚未起唱第一句（停在首句，0%填色，绝不提前染蓝）
  if (activeIdx === -1 && LYRICS_DATA.length > 0 && curTime < LYRICS_DATA[0].time) {
    if (lastActiveIdx !== 0 || appliedActiveIdx !== 0) {
      applyLyricLineChange(0);
    }
    let activeLine = activeLyricLineEl;
    if (!activeLine) activeLine = document.querySelector('.lyric-line-item.active');
    if (activeLine) {
      activeLine.style.setProperty('--fill-pct', '0%');
    }
    if (!previewMainLyricEl) previewMainLyricEl = document.getElementById('previewMainLyric');
    const previewMain = previewMainLyricEl;
    if (previewMain) {
      previewMain.classList.remove('pending');
      previewMain.style.setProperty('--fill-pct', '0%');
    }
    return;
  }

  // 2. 间奏判定：当前句的人声发音已唱完，且后续存在乐器留白间奏
  if (activeIdx >= 0 && LYRICS_DATA[activeIdx]) {
    const currentItem = LYRICS_DATA[activeIdx];
    if (currentItem.hasInterludeAfter && curTime > (currentItem.time + currentItem.duration)) {
      inInterlude = true;
    }
  }

  if (inInterlude) {
    // 间奏期间锁定停在当前句，保持100%全高亮状态，绝不跳到下一句或提前染蓝
    let activeLine = activeLyricLineEl;
    if (!activeLine) activeLine = document.querySelector('.lyric-line-item.active');
    if (activeLine) {
      activeLine.style.setProperty('--fill-pct', '100%');
    }
    if (!previewMainLyricEl) previewMainLyricEl = document.getElementById('previewMainLyric');
    const previewMain = previewMainLyricEl;
    if (previewMain) {
      previewMain.classList.remove('pending');
      previewMain.style.setProperty('--fill-pct', '100%');
    }
    return;
  }

  if (activeIdx < 0) return;

  const currentItem = LYRICS_DATA[activeIdx];
  let fillPct = 0;

  // 3. 高精度推进进度计算：若自带词级逐字时间戳，走毫秒级真逐字推进；若为普通 LRC，走物理平滑线性流
  if (currentItem && currentItem.words && currentItem.words.length > 0) {
    const words = currentItem.words;
    let totalChars = 0;
    for (let w = 0; w < words.length; w++) {
      totalChars += (words[w].text || '').length || 1;
    }
    let charAcc = 0;
    for (let w = 0; w < words.length; w++) {
      const word = words[w];
      const wLen = (word.text || '').length || 1;
      const wEnd = word.start + word.duration;
      if (curTime >= wEnd) {
        charAcc += wLen;
      } else if (curTime >= word.start) {
        const wElapsed = curTime - word.start;
        const wRatio = Math.min(1.0, Math.max(0, wElapsed / word.duration));
        charAcc += wRatio * wLen;
        break;
      } else {
        break;
      }
    }
    fillPct = totalChars > 0 ? Math.min(100, Math.max(0, (charAcc / totalChars) * 100)) : 0;
  } else if (currentItem && currentItem.duration > 0) {
    const elapsed = Math.max(0, curTime - currentItem.time);
    const t = Math.min(1.0, Math.max(0, elapsed / currentItem.duration));
    // 物理平滑线性流（参考 AMLL 与 lrc-file-parser）：消除陡峭正弦畸变，恒定匀速自然推进，仅首尾微幅平滑收放
    let smoothedRatio = t;
    if (t < 0.04) {
      smoothedRatio = t * (t / 0.04);
    } else if (t > 0.96) {
      const rest = 1 - t;
      smoothedRatio = 1 - rest * (rest / 0.04);
    }
    fillPct = Math.min(100, Math.max(0, smoothedRatio * 100));
  }

  // 行切换时才触发 DOM 类名变更与平滑滚动；以「已应用到 DOM 的行号」为门控，
  // 修复拖动进度条或 seekAudio 直接改写 lastActiveIdx 后高亮滞留旧行的问题
  if (activeIdx !== appliedActiveIdx) {
    applyLyricLineChange(activeIdx);
  }

  // 高频精准更新当前活跃行颜色渐变（60fps 丝滑无跳跃，活跃行元素走缓存避免每帧查询）
  let activeLine = activeLyricLineEl;
  if (!activeLine) activeLine = document.querySelector('.lyric-line-item.active');
  if (activeLine) {
    activeLine.style.setProperty('--fill-pct', `${fillPct.toFixed(2)}%`);
  }
  if (!previewMainLyricEl) previewMainLyricEl = document.getElementById('previewMainLyric');
  const previewMain = previewMainLyricEl;
  if (previewMain) {
    previewMain.classList.remove('pending');
    previewMain.style.setProperty('--fill-pct', `${fillPct.toFixed(2)}%`);
  }
}

function applyLyricLineChange(activeIdx) {
  if (activeIdx === -1) {
    lastActiveIdx = -1;
    activeLyricLineEl = null;
    appliedActiveIdx = -1;
    const lines = document.querySelectorAll('.lyric-line-item');
    lines.forEach(line => {
      line.classList.remove('active');
      line.style.removeProperty('--fill-pct');
    });
    const previewMain = document.getElementById('previewMainLyric');
    if (previewMain) {
      previewMain.classList.remove('pending');
      previewMain.innerHTML = '';
      previewMain.style.removeProperty('--fill-pct');
    }
    return;
  }

  const isForward = activeIdx > lastActiveIdx && lastActiveIdx !== -1 && lastActiveIdx !== -99;
  lastActiveIdx = activeIdx;
  appliedActiveIdx = activeIdx;

  const lines = document.querySelectorAll('.lyric-line-item');
  lines.forEach((line, idx) => {
    if (idx < activeIdx) {
      if (!line.classList.contains('passed')) {
        line.className = 'lyric-line-item passed';
        line.style.removeProperty('--fill-pct');
      }
    } else if (idx === activeIdx) {
      line.className = 'lyric-line-item active';
    } else {
      if (line.classList.contains('active') || line.classList.contains('passed')) {
        line.className = 'lyric-line-item';
        line.style.removeProperty('--fill-pct');
      }
    }
  });
  activeLyricLineEl = (activeIdx >= 0 && activeIdx < lines.length) ? lines[activeIdx] : null;

  if (!isUserInteractingWithLyrics && isPureLyrics) {
    scrollActiveLyricToCenter();
  }

  updateSimplePreviewLyric(activeIdx, false);
  if (window.AndroidBridge && window.AndroidBridge.updateDesktopLyric) {
    const curTxt = LYRICS_DATA[activeIdx] ? (LYRICS_DATA[activeIdx].cleanText || LYRICS_DATA[activeIdx].text) : '';
    const nextTxt = LYRICS_DATA[activeIdx + 1] ? (LYRICS_DATA[activeIdx + 1].cleanText || LYRICS_DATA[activeIdx + 1].text) : '';
    const curSong = currentPlaybackQueue[currentIndex];
    const themeHex = (typeof getActiveThemeColorHex === 'function') ? getActiveThemeColorHex() : '#234BB8';
    const isFav = curSong ? !!curSong.isFav : false;
    if (window.AndroidBridge.updateDesktopLyricFull) {
      window.AndroidBridge.updateDesktopLyricFull(curTxt, nextTxt, themeHex, isFav, isPlaying);
    } else {
      window.AndroidBridge.updateDesktopLyric(curTxt, nextTxt, themeHex, isFav, isPlaying);
    }
  }
}

let previewRollTimer = null;

function updateSimplePreviewLyric(targetIdx, isPending = false) {
  const previewMain = document.getElementById('previewMainLyric');
  const previewSub = document.getElementById('previewSubLyric');
  const track = document.getElementById('previewScrollTrack');
  if (!previewMain || !track) return;

  if (targetIdx === -1) {
    if (previewRollTimer) { clearTimeout(previewRollTimer); previewRollTimer = null; }
    isAnimatingPreviewRoll = false;
    displayedPreviewIdx = -1;
    track.style.transition = 'none';
    track.style.transform = 'translateY(0)';
    previewMain.style.transition = 'none';
    previewMain.style.opacity = '1';
    previewMain.innerHTML = '';
    previewMain.classList.remove('pending');
    if (previewSub) {
      previewSub.style.transition = 'none';
      previewSub.style.transform = 'none';
      previewSub.style.color = '';
      previewSub.textContent = '';
    }
    return;
  }

  const mainHtml = formatLyricItemHtml(LYRICS_DATA[targetIdx]);
  const subItem = LYRICS_DATA[targetIdx + 1];
  const subTxt = subItem ? (subItem.text || subItem.cleanText || '') : '';

  // 如果唱片页当前已展示该行（如从间奏静候无缝进入开唱），保持不动，绝不重复触发滚动跳跃
  if (displayedPreviewIdx === targetIdx) {
    previewMain.classList.toggle('pending', isPending);
    return;
  }

  // 若前次动画未结束，立即平稳落定，杜绝堆积卡顿
  if (previewRollTimer) {
    clearTimeout(previewRollTimer);
    previewRollTimer = null;
    track.style.transition = 'none';
    track.style.transform = 'translateY(0)';
    previewMain.style.transition = 'none';
    previewMain.style.opacity = '1';
    if (previewSub) {
      previewSub.style.transition = 'none';
      previewSub.style.transform = 'none';
      previewSub.style.color = '';
    }
    isAnimatingPreviewRoll = false;
  }

  // 严格判断是否为播放推进至下一句（相邻单步步进），杜绝跳选/拖拽时触发错误位移动画
  const isSequentialNext = (targetIdx === displayedPreviewIdx + 1) && displayedPreviewIdx !== -1;
  displayedPreviewIdx = targetIdx;

  if (isSequentialNext) {
    isAnimatingPreviewRoll = true;
    // 物理精确上移 30px（主歌词行高26px + 间距4px = 精准30px）
    track.style.transition = 'transform 0.28s cubic-bezier(0.25, 1, 0.5, 1)';
    track.style.transform = 'translateY(-30px)';

    previewMain.style.transition = 'opacity 0.22s ease';
    previewMain.style.opacity = '0';

    if (previewSub) {
      previewSub.style.transition = 'opacity 0.28s ease, color 0.22s ease';
      previewSub.style.transform = 'none';
      previewSub.style.opacity = '1';
      if (isPending) previewSub.style.color = 'var(--brand-blue)';
    }

    previewRollTimer = setTimeout(() => {
      previewRollTimer = null;
      track.style.transition = 'none';
      track.style.transform = 'translateY(0)';
      previewMain.style.transition = 'none';
      previewMain.style.opacity = '1';
      previewMain.innerHTML = mainHtml;
      previewMain.classList.toggle('pending', isPending);

      if (previewSub) {
        previewSub.style.transition = 'none';
        previewSub.style.transform = 'none';
        previewSub.style.color = '';
        previewSub.style.opacity = '0.55';
        previewSub.textContent = subTxt;
      }
      isAnimatingPreviewRoll = false;
    }, 280);
  } else {
    // 进度条拖拽寻道、跳句、换歌：瞬时无缝刷新，绝不闪白、绝不消失
    track.style.transition = 'none';
    track.style.transform = 'translateY(0)';
    previewMain.style.transition = 'none';
    previewMain.style.opacity = '1';
    previewMain.innerHTML = mainHtml;
    previewMain.classList.toggle('pending', isPending);
    if (previewSub) {
      previewSub.style.transition = 'none';
      previewSub.style.transform = 'none';
      previewSub.style.color = '';
      previewSub.style.opacity = '0.55';
      previewSub.textContent = subTxt;
    }
  }
}

// 拖动进度条时的实时歌词刷新（绝对无空白、无闪烁、无延迟）
function updateSimplePreviewLyricScrubbing(targetIdx) {
  const previewMain = document.getElementById('previewMainLyric');
  const previewSub = document.getElementById('previewSubLyric');
  const track = document.getElementById('previewScrollTrack');
  if (!previewMain || !track || !LYRICS_DATA || !LYRICS_DATA[targetIdx]) return;

  if (previewRollTimer) {
    clearTimeout(previewRollTimer);
    previewRollTimer = null;
    isAnimatingPreviewRoll = false;
  }

  displayedPreviewIdx = targetIdx;
  track.style.transition = 'none';
  track.style.transform = 'translateY(0)';
  previewMain.style.transition = 'none';
  previewMain.style.opacity = '1';
  previewMain.classList.remove('pending');
  previewMain.innerHTML = formatLyricItemHtml(LYRICS_DATA[targetIdx]);
  previewMain.style.setProperty('--fill-pct', '100%');

  if (previewSub) {
    previewSub.style.transition = 'none';
    previewSub.style.transform = 'none';
    previewSub.style.opacity = '0.55';
    previewSub.style.color = '';
    const nextItem = LYRICS_DATA[targetIdx + 1];
    previewSub.textContent = nextItem ? (nextItem.text || nextItem.cleanText || '') : '';
  }
}

function scrollLyricItemToCenter(targetIdx) {
  const container = document.getElementById('pureLyricsContainer');
  if (!container) return;
  const targetLine = document.getElementById(`lyricLine${targetIdx}`);
  if (!targetLine) return;
  const containerHeight = container.clientHeight;
  const targetTop = targetLine.offsetTop - (containerHeight * 0.42) + (targetLine.clientHeight / 2);
  container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
}

function scrollActiveLyricToCenter() {
  const container = document.getElementById('pureLyricsContainer');
  if (!container) return;
  const activeLine = container.querySelector('.lyric-line-item.active');
  if (!activeLine) return;
  const containerHeight = container.clientHeight;
  const targetTop = activeLine.offsetTop - (containerHeight * 0.42) + (activeLine.clientHeight / 2);
  container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
}

