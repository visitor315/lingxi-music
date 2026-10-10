/* ================== 歌词逻辑 ================== */
let targetSeekTime = 5;
let autoCenterTimer = null;
let isUserInteractingWithLyrics = false;
let scrollEndTimer = null;
let lastActiveIdx = -1;
let isAnimatingPreviewRoll = false;
let displayedPreviewIdx = -1;

let targetSeekIndex = -1;

function initLyricsList() {
  const container = document.getElementById('lyricsItemsList');
  container.innerHTML = LYRICS_DATA.map((item, idx) => `
    <div class="lyric-line-item" data-time="${item.time}" data-index="${idx}" id="lyricLine${idx}" onclick="seekToLyricLineByIndex(${idx}, event)">
      ${formatLyricItemHtml(item)}
    </div>
  `).join('');

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
  }, 2500);
}

function openPureLyricsView() {
  isPureLyrics = true;
  isUserInteractingWithLyrics = false;
  document.getElementById('turntableBox').style.display = 'none';
  document.getElementById('simpleLyricsBox').style.display = 'none';
  document.getElementById('pureLyricsContainer').classList.add('active');
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
  seekToLyricLine(item.time + offsetComp + 0.02, e, idx);
}

function seekToLyricLine(time, e, explicitIdx) {
  if (e && e.stopPropagation) e.stopPropagation();
  isUserInteractingWithLyrics = false;
  currentSec = Number(time) || 0;

  // 锁定寻道状态，防止底层解码器在缓冲准备阶段触发旧时间戳将进度篡改回上一句
  isSeekingAudio = true;
  if (seekLockTimer) clearTimeout(seekLockTimer);
  seekLockTimer = setTimeout(() => { isSeekingAudio = false; }, 500);

  if (typeof explicitIdx === 'number' && explicitIdx >= 0) {
    lastActiveIdx = explicitIdx;
    lastInterludeNextIdx = -1;
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
    seekToLyricLine(targetSeekTime + 0.05, e);
  }
}

let lyricRafId = null;
let bgLyricInterval = null;

function startLyricSmoothSync() {
  if (lyricRafId) cancelAnimationFrame(lyricRafId);
  function tick() {
    if (isPlaying && !document.hidden) {
      if (!isNativeAudioSupported && audioPlayer.paused) {
        lyricRafId = null;
        return;
      }
      if (!isSeekingAudio) {
        if (isNativeAudioSupported) {
          const np = window.AndroidBridge.getNativePosition ? window.AndroidBridge.getNativePosition() : currentSec;
          if (typeof np === 'number' && np >= 0) currentSec = np;
        } else if (!isNaN(audioPlayer.currentTime) && audioPlayer.currentTime >= 0) {
          currentSec = audioPlayer.currentTime;
        }
      }
      syncProgress();
      updateLyricProgressSmooth();
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
    if (needBgLyrics && !bgLyricInterval && isPlaying) {
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

// 音频与歌词时间轴同步基准（标准零时延 0.0s，彻底杜绝起唱滞后）
let LYRIC_AUDIO_OFFSET = 0.0;
let lastInterludeNextIdx = -1;

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

function updateLyricProgressSmooth(forcedIdx) {
  if (document.hidden) return; // 切后台彻底跳过歌词 DOM 渲染与重排计算
  if (!LYRICS_DATA || LYRICS_DATA.length === 0) return;
  const rawTime = isNativeAudioSupported
    ? (window.AndroidBridge.getNativePosition ? window.AndroidBridge.getNativePosition() : currentSec)
    : ((!isSeekingAudio && !isNaN(audioPlayer.currentTime) && audioPlayer.currentTime > 0) ? audioPlayer.currentTime : currentSec);
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
    if (lastActiveIdx !== 0) {
      applyLyricLineChange(0);
    }
    const activeLine = document.querySelector('.lyric-line-item.active');
    if (activeLine) {
      activeLine.style.setProperty('--fill-pct', '0%');
    }
    const previewMain = document.getElementById('previewMainLyric');
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
    const activeLine = document.querySelector('.lyric-line-item.active');
    if (activeLine) {
      activeLine.style.setProperty('--fill-pct', '100%');
    }
    const previewMain = document.getElementById('previewMainLyric');
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

  // 行切换时才触发 DOM 类名变更与平滑滚动
  if (activeIdx !== lastActiveIdx) {
    applyLyricLineChange(activeIdx);
  }

  // 高频精准更新当前活跃行颜色渐变（60fps 丝滑无跳跃）
  const activeLine = document.querySelector('.lyric-line-item.active');
  if (activeLine) {
    activeLine.style.setProperty('--fill-pct', `${fillPct.toFixed(1)}%`);
  }
  const previewMain = document.getElementById('previewMainLyric');
  if (previewMain) {
    previewMain.classList.remove('pending');
    previewMain.style.setProperty('--fill-pct', `${fillPct.toFixed(1)}%`);
  }
}

function applyLyricLineChange(activeIdx) {
  if (activeIdx === -1) {
    lastActiveIdx = -1;
    lastInterludeNextIdx = -1;
    const lines = document.querySelectorAll('.lyric-line-item');
    lines.forEach(line => {
      line.classList.remove('active', 'pending-next');
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
  lastInterludeNextIdx = -1;

  const lines = document.querySelectorAll('.lyric-line-item');
  lines.forEach((line, idx) => {
    line.classList.remove('pending-next');
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

function applyLyricInterludeState(nextIdx) {
  if (lastInterludeNextIdx === nextIdx && lastActiveIdx === -99) {
    return;
  }
  lastInterludeNextIdx = nextIdx;
  lastActiveIdx = -99;

  const lines = document.querySelectorAll('.lyric-line-item');
  lines.forEach((line, idx) => {
    line.style.removeProperty('--fill-pct');
    if (idx < nextIdx) {
      line.className = 'lyric-line-item passed';
    } else if (idx === nextIdx) {
      line.className = 'lyric-line-item pending-next';
    } else {
      line.className = 'lyric-line-item';
    }
  });

  if (!isUserInteractingWithLyrics && isPureLyrics) {
    scrollLyricItemToCenter(nextIdx);
  }

  updateSimplePreviewLyric(nextIdx, true);
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
  const activeLine = container.querySelector('.lyric-line-item.active, .lyric-line-item.pending-next');
  if (!activeLine) return;
  const containerHeight = container.clientHeight;
  const targetTop = activeLine.offsetTop - (containerHeight * 0.42) + (activeLine.clientHeight / 2);
  container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
}

