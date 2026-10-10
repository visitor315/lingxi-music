/* ================= 歌曲封面高可用解析保障 ================= */
async function ensureSongCover(song) {
  if (!song) return '';
  const curPlaying = currentPlaybackQueue[currentIndex];
  const isCurPlaying = curPlaying && (curPlaying.id === song.id || (curPlaying.title === song.title && curPlaying.artist === song.artist));

  if (song.cover && song.cover.startsWith('http') && !song.cover.includes('injahow.cn/meting/?server=')) {
    if (isCurPlaying) applySongCoverToUI(song.cover);
    return song.cover;
  }

  // 1. 优先通过 GDStudio 或 Injahow 302 直接提取真实高清封面
  const directCover = await resolveSongCoverUrl(song);
  if (directCover && directCover.startsWith('http')) {
    song.cover = directCover;
    if (isCurPlaying) applySongCoverToUI(song.cover);
    persistData();
    updateSongRowCover(song);
    return song.cover;
  }

  // 2. 通过标题与歌手在线检索匹配 pic_id 与封面
  if (song.title) {
    const query = `${song.title} ${song.artist !== '未知歌手' ? song.artist : ''}`.trim();
    try {
      const matches = await requestOnlineSearch(query, 1);
      if (matches && matches.length) {
        const match = matches[0];
        if (match.pic_id || match.url_id || match.id) {
          const matchedCover = await resolveSongCoverUrl(match);
          if (matchedCover) {
            song.cover = matchedCover;
            if (isCurPlaying) applySongCoverToUI(song.cover);
            persistData();
            updateSongRowCover(song);
            return song.cover;
          }
        }
        if (match.cover) {
          song.cover = match.cover;
          if (isCurPlaying) applySongCoverToUI(song.cover);
          persistData();
          updateSongRowCover(song);
          return song.cover;
        }
      }
    } catch(e) {}
  }

  return song.cover || '';
}

/* ================= 应用内版本检测与自动更新管理 ================= */
let currentPendingUpdate = null;
let lastUpdateCheckTime = 0;

function checkAppUpdateOnResume() {
  const now = Date.now();
  if (now - lastUpdateCheckTime > 3 * 60 * 1000) {
    checkAppUpdate(false);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    checkAppUpdateOnResume();
  }
});
window.addEventListener('focus', () => {
  checkAppUpdateOnResume();
});

async function checkAppUpdate(isManual = false) {
  lastUpdateCheckTime = Date.now();
  let localCode = 40;
  if (window.AndroidBridge && window.AndroidBridge.getAppVersionCode) {
    try {
      const code = window.AndroidBridge.getAppVersionCode();
      if (typeof code === 'number' && code > 0) localCode = code;
    } catch(e) {}
  }

  if (isManual) {
    toast('正在检查版本更新...');
  }

  let remoteData = null;
  const ts = Date.now();
  const endpoints = [
    'https://ghfast.top/https://raw.githubusercontent.com/visitor315/lingxi-music/main/version.json?t=' + ts,
    'https://fastly.jsdelivr.net/gh/visitor315/lingxi-music@main/version.json?t=' + ts,
    'https://ghproxy.net/https://raw.githubusercontent.com/visitor315/lingxi-music/main/version.json?t=' + ts,
    'https://cdn.jsdelivr.net/gh/visitor315/lingxi-music@main/version.json?t=' + ts,
    'https://raw.githubusercontent.com/visitor315/lingxi-music/main/version.json?t=' + ts
  ];

  for (let u of endpoints) {
    try {
      const res = await universalFetch(u, { timeout: 3500 });
      if (res && res.ok) {
        let json = null;
        try {
          json = await res.json();
        } catch(pe) {}
        if (json && json.versionCode) {
          remoteData = json;
          break;
        }
      }
    } catch(e) {}
  }

  if (!remoteData || !remoteData.versionCode) {
    if (isManual) toast('未能获取到更新信息，请检查网络');
    return;
  }

  if (remoteData.versionCode > localCode) {
    currentPendingUpdate = remoteData;
    openAppUpdateModal(remoteData);
  } else {
    if (isManual) {
      toast(`当前已是最新版本 (v${APP_CONFIG.version || '2.0.9'})`);
    }
  }
}

function openAppUpdateModal(data) {
  const modal = document.getElementById('appUpdateModal');
  const titleEl = document.getElementById('updateVersionTitle');
  const badgeEl = document.getElementById('updateVersionBadge');
  const logEl = document.getElementById('updateChangelogBox');
  const btn = document.getElementById('btnStartAppUpdate');
  const cancelBtn = document.getElementById('btnCancelAppUpdate');
  const progressWrap = document.getElementById('updateProgressWrap');

  if (titleEl) titleEl.textContent = data.versionName ? (data.versionName.startsWith('v') ? data.versionName : 'v' + data.versionName) : '新版本';
  if (badgeEl) badgeEl.textContent = `发现新版 (Build ${data.versionCode})`;
  if (logEl) logEl.textContent = data.changelog || '功能优化与体验改进';
  if (btn) {
    btn.style.display = 'block';
    btn.textContent = '立即升级';
    btn.disabled = false;
  }
  if (cancelBtn) cancelBtn.style.display = 'block';
  if (progressWrap) progressWrap.style.display = 'none';

  if (modal) modal.classList.add('active');
}

function closeAppUpdateModalDirect() {
  const modal = document.getElementById('appUpdateModal');
  if (modal) modal.classList.remove('active');
}

function closeAppUpdateModal(e) {
  if (e && e.target !== document.getElementById('appUpdateModal')) return;
  closeAppUpdateModalDirect();
}

function executeAppUpdate() {
  if (!currentPendingUpdate || !currentPendingUpdate.downloadUrl) {
    toast('下载链接不可用');
    return;
  }

  const btn = document.getElementById('btnStartAppUpdate');
  const cancelBtn = document.getElementById('btnCancelAppUpdate');
  const progressWrap = document.getElementById('updateProgressWrap');
  const percentEl = document.getElementById('updateProgressPercent');
  const bytesEl = document.getElementById('updateProgressBytes');
  const bar = document.getElementById('updateProgressBar');

  if (btn) btn.style.display = 'none';
  if (cancelBtn) cancelBtn.style.display = 'none';
  if (progressWrap) progressWrap.style.display = 'flex';
  if (bar) bar.style.width = '0%';
  if (percentEl) percentEl.textContent = '准备下载...';
  if (bytesEl) bytesEl.textContent = '正在连接云端加速节点...';

  if (window.AndroidBridge && window.AndroidBridge.startAppUpdate) {
    window.AndroidBridge.startAppUpdate(currentPendingUpdate.downloadUrl);
  } else {
    window.open(currentPendingUpdate.downloadUrl, '_blank');
    toast('已打开浏览器下载');
  }
}

window.onAppUpdateProgress = function(percent, readBytes, totalBytes) {
  const bar = document.getElementById('updateProgressBar');
  const percentEl = document.getElementById('updateProgressPercent');
  const bytesEl = document.getElementById('updateProgressBytes');

  if (bar && percent >= 0) {
    bar.style.width = Math.min(100, Math.max(0, percent)) + '%';
  }
  if (percentEl) {
    percentEl.textContent = percent >= 0 ? `正在极速下载 ${percent}%` : '正在极速下载...';
  }
  if (bytesEl && totalBytes > 0) {
    const mbRead = (readBytes / (1024 * 1024)).toFixed(1);
    const mbTotal = (totalBytes / (1024 * 1024)).toFixed(1);
    bytesEl.textContent = `${mbRead}MB / ${mbTotal}MB`;
  }
};

window.onAppUpdateCompleted = function() {
  const bar = document.getElementById('updateProgressBar');
  const percentEl = document.getElementById('updateProgressPercent');
  const bytesEl = document.getElementById('updateProgressBytes');

  if (bar) bar.style.width = '100%';
  if (percentEl) percentEl.textContent = '下载完成';
  if (bytesEl) bytesEl.textContent = '正在调起系统覆盖安装...';
  toast('安装包已就绪，正在调起系统安装');
};

window.onAppUpdateFailed = function(err) {
  const btn = document.getElementById('btnStartAppUpdate');
  const cancelBtn = document.getElementById('btnCancelAppUpdate');
  const progressWrap = document.getElementById('updateProgressWrap');
  if (btn) {
    btn.style.display = 'block';
    btn.textContent = '重试升级';
    btn.disabled = false;
  }
  if (cancelBtn) cancelBtn.style.display = 'block';
  if (progressWrap) progressWrap.style.display = 'none';
  toast('更新失败: ' + (err || '网络节点连接超时'));
};

function openCreatePlaylistFromChoose() {
  openCreatePlaylistPrompt();
}

/* 新手入门指南：滑动式引导卡片，一信息一页 */
let currentGuideSlide = 0;
const TOTAL_GUIDE_SLIDES = 4;

function openBeginnerGuideModal() {
  currentGuideSlide = 0;
  updateGuideUI();
  document.getElementById('beginnerGuideModal').classList.add('active');
}

function closeBeginnerGuideModal(e) {
  if (e && e.target !== document.getElementById('beginnerGuideModal') && !e.target.closest('.guide-close-btn') && !e.target.closest('#guideNextBtn')) {
    if (e.target.closest('.guide-carousel-card')) return;
  }
  document.getElementById('beginnerGuideModal').classList.remove('active');
}

function goToGuideSlide(idx) {
  if (idx < 0) idx = 0;
  if (idx >= TOTAL_GUIDE_SLIDES) idx = TOTAL_GUIDE_SLIDES - 1;
  currentGuideSlide = idx;
  updateGuideUI();
}

function nextGuideSlide() {
  if (currentGuideSlide < TOTAL_GUIDE_SLIDES - 1) {
    currentGuideSlide++;
    updateGuideUI();
  } else {
    document.getElementById('beginnerGuideModal').classList.remove('active');
  }
}

function prevGuideSlide() {
  if (currentGuideSlide > 0) {
    currentGuideSlide--;
    updateGuideUI();
  }
}

function updateGuideUI() {
  const track = document.getElementById('guideSlidesTrack');
  const tag = document.getElementById('guideStepTag');
  const prevBtn = document.getElementById('guidePrevBtn');
  const nextBtn = document.getElementById('guideNextBtn');
  const dots = document.querySelectorAll('.guide-dot');

  if (track) {
    track.style.transform = `translateX(-${currentGuideSlide * 25}%)`;
  }
  if (tag) {
    tag.textContent = `机制指引 ${currentGuideSlide + 1} / ${TOTAL_GUIDE_SLIDES}`;
  }
  if (prevBtn) {
    prevBtn.style.visibility = currentGuideSlide === 0 ? 'hidden' : 'visible';
  }
  if (nextBtn) {
    nextBtn.textContent = currentGuideSlide === TOTAL_GUIDE_SLIDES - 1 ? '我知道了' : '下一条';
  }
  dots.forEach((dot, idx) => {
    dot.classList.toggle('active', idx === currentGuideSlide);
  });
}

function initGuideCarousel() {
  const viewport = document.getElementById('guideViewport');
  if (!viewport) return;
  let startX = 0;
  let startY = 0;
  let isMoving = false;

  viewport.addEventListener('touchstart', (e) => {
    if (!e.touches.length) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isMoving = true;
  }, { passive: true });

  viewport.addEventListener('touchmove', (e) => {
    if (!isMoving || !e.touches.length) return;
    const diffX = e.touches[0].clientX - startX;
    const diffY = e.touches[0].clientY - startY;
    if (Math.abs(diffX) > Math.abs(diffY)) {
      e.preventDefault();
    }
  }, { passive: false });

  viewport.addEventListener('touchend', (e) => {
    if (!isMoving) return;
    isMoving = false;
    const diffX = e.changedTouches[0].clientX - startX;
    const diffY = e.changedTouches[0].clientY - startY;
    if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY)) {
      if (diffX < 0) {
        nextGuideSlide();
      } else {
        prevGuideSlide();
      }
    }
  }, { passive: true });
}

/* 播放音质切换逻辑（严格对齐显示模式/主题色调设计规范） */
function openQualityModal() {
  const overlay = document.getElementById('audioQualityModal');
  if (!overlay) return;
  const opt320 = document.getElementById('qualityOpt320');
  const opt128 = document.getElementById('qualityOpt128');
  if (opt320) opt320.classList.toggle('selected', currentAudioQuality === '320');
  if (opt128) opt128.classList.toggle('selected', currentAudioQuality === '128');
  overlay.classList.add('active');
}

function closeQualityModal(e) {
  if (!e || e.target === e.currentTarget) {
    const el = document.getElementById('audioQualityModal');
    if (el) el.classList.remove('active');
  }
}

function selectQuality(q, rowEl) {
  document.querySelectorAll('#audioQualityModal .color-option-row').forEach(r => r.classList.remove('selected'));
  if (rowEl) {
    rowEl.classList.add('selected');
  } else {
    const target = document.getElementById(`qualityOpt${q}`);
    if (target) target.classList.add('selected');
  }
  currentAudioQuality = q;
  localStorage.setItem('yyrc_audio_quality', q);
  updateQualityDescText();
  toast(q === '320' ? '已切换至极高音质 (320 kbps)' : '已切换至标准音质 (128 kbps)');
  setTimeout(() => {
    const el = document.getElementById('audioQualityModal');
    if (el) el.classList.remove('active');
  }, 120);
}

function updateQualityDescText() {
  const el = document.getElementById('currentQualityDesc');
  if (el) {
    el.textContent = currentAudioQuality === '320' ? '极高音质 - 320 kbps (高清)' : '标准音质 - 128 kbps (流畅)';
  }
}

