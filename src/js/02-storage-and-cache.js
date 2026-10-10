/* ================== 全网搜歌引擎与持久化状态 ================== */
const DEFAULT_API_BASE = 'https://music-api.gdstudio.xyz/api.php';
let currentApiBase = localStorage.getItem('yyrc_api_base') || DEFAULT_API_BASE;
let currentAudioQuality = localStorage.getItem('yyrc_audio_quality') || '320';
let useExtractedCover = localStorage.getItem('yyrc_use_extracted_cover') !== 'false';
let searchHistory = [];
try {
  const savedHistory = localStorage.getItem('yyrc_search_history');
  searchHistory = savedHistory ? JSON.parse(savedHistory) : ['周杰伦', '起风了', '晴天', '陈奕迅'];
} catch(e) {
  searchHistory = ['周杰伦', '起风了', '晴天', '陈奕迅'];
}
let currentSearchResults = [];
let activeSearchResultMenuIdx = null;
let currentActionSong = null;

/* 当前播放队列：默认初始化为全曲库 */
let currentPlaybackQueue = [...ALL_LIBRARY_SONGS];
let currentIndex = 0;
let isPlaying = false;
let currentSec = 5;
let playMode = 'list';
let playProgressTimer = null;
let islandEnabled = true;
let isPureLyrics = false;
let activeRadioIndex = 0;
let currentPlayingAlbumIndex = -1;
let activeMenuIdx = null;

const audioPlayer = new Audio();
audioPlayer.preload = 'auto';
const RING_PERIMETER = 2 * Math.PI * 22.5;

/* 保持后台运行免休眠静音音频锚点（仅非 Android 原生环境使用） */
let bgMediaAnchor = null;
function keepBackgroundAlive() {
  if (isNativeAudioSupported) {
    if (bgMediaAnchor) {
      try { bgMediaAnchor.pause(); } catch(e) {}
      bgMediaAnchor = null;
    }
    return;
  }
  try {
    if (!bgMediaAnchor) {
      bgMediaAnchor = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA");
      bgMediaAnchor.loop = true;
      bgMediaAnchor.volume = 0.0001;
    }
    if (bgMediaAnchor.paused) {
      bgMediaAnchor.play().catch(() => {});
    }
  } catch(e) {}
}

let fetchCallbackSeq = 0;
const pendingFetchCallbacks = new Map();

window.__onFetchHttpCallback = function(callbackId, result) {
  const cb = pendingFetchCallbacks.get(callbackId);
  if (cb) {
    pendingFetchCallbacks.delete(callbackId);
    if (cb.timer) clearTimeout(cb.timer);
    cb.resolve({
      ok: !!result.ok,
      status: result.status,
      json: async () => {
        try {
          return typeof result.data === 'string' ? JSON.parse(result.data) : (result.data || {});
        } catch(e) {
          return {};
        }
      },
      text: async () => result.data || '',
      finalUrl: result.finalUrl || ''
    });
  }
};

/* 全平台通用安全网络请求：在 Android 原生环境下直通系统级 HttpURLConnection，非阻塞异步处理，彻底避开 Chromium JS 线程冻结 */
async function universalFetch(url, options = {}) {
  const timeoutMs = options.timeout || 6000;
  if (window.AndroidBridge && window.AndroidBridge.fetchHttpAsync) {
    return new Promise((resolve, reject) => {
      const callbackId = 'fetch_' + (++fetchCallbackSeq) + '_' + Date.now();
      const timer = setTimeout(() => {
        if (pendingFetchCallbacks.has(callbackId)) {
          pendingFetchCallbacks.delete(callbackId);
          fallbackFetch(url, options, timeoutMs).then(resolve).catch(reject);
        }
      }, timeoutMs + 2500);
      pendingFetchCallbacks.set(callbackId, { resolve, reject, timer });
      try {
        window.AndroidBridge.fetchHttpAsync(url, timeoutMs, callbackId);
      } catch (err) {
        clearTimeout(timer);
        pendingFetchCallbacks.delete(callbackId);
        fallbackFetch(url, options, timeoutMs).then(resolve).catch(reject);
      }
    });
  }
  if (window.AndroidBridge && window.AndroidBridge.fetchHttpSync) {
    try {
      const respStr = window.AndroidBridge.fetchHttpSync(url, timeoutMs);
      if (respStr) {
        const jsonResp = JSON.parse(respStr);
        return {
          ok: !!jsonResp.ok,
          status: jsonResp.status,
          json: async () => JSON.parse(jsonResp.data || '{}'),
          text: async () => jsonResp.data || '',
          finalUrl: jsonResp.finalUrl || url
        };
      }
    } catch(e) {
      console.warn("Native fetchHttpSync fallback to browser fetch:", e);
    }
  }
  return fallbackFetch(url, options, timeoutMs);
}

async function fallbackFetch(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch(err) {
    clearTimeout(timer);
    throw err;
  }
}

function calibrateSystemInsets() {
  let sbHeight = 38;
  let nbHeight = 0;
  if (window.AndroidBridge) {
    if (window.AndroidBridge.getStatusBarHeightDp) {
      try {
        const nativeH = window.AndroidBridge.getStatusBarHeightDp();
        if (nativeH && nativeH > 0) {
          sbHeight = nativeH;
        }
      } catch(e) {}
    }
    if (window.AndroidBridge.getNavigationBarHeightDp) {
      try {
        const nativeNb = window.AndroidBridge.getNavigationBarHeightDp();
        if (nativeNb !== undefined && nativeNb !== null && nativeNb >= 0) {
          nbHeight = nativeNb;
        }
      } catch(e) {}
    }
  }
  document.documentElement.style.setProperty('--status-bar-height', sbHeight + 'px');
  document.documentElement.style.setProperty('--nav-bar-height', nbHeight + 'px');
}
window.calibrateStatusBarPadding = calibrateSystemInsets;
window.onStatusBarHeightUpdated = function(h) {
  if (h && h > 0) {
    document.documentElement.style.setProperty('--status-bar-height', h + 'px');
  }
};
window.onSystemInsetsUpdated = function(topDp, bottomDp) {
  if (topDp && topDp > 0) {
    document.documentElement.style.setProperty('--status-bar-height', topDp + 'px');
  }
  if (bottomDp !== undefined && bottomDp !== null && bottomDp >= 0) {
    document.documentElement.style.setProperty('--nav-bar-height', bottomDp + 'px');
  }
};

function init() {
  calibrateSystemInsets();
  initNativeAudioEngine();
  initAudioEngine();

  const defTab = localStorage.getItem('lingxi_default_tab') || 'discover';
  defaultHomeTab = defTab;
  currentHomeTab = defTab;
  if (defTab === 'library') {
    switchHomeNavTab('library', true);
  } else {
    switchHomeNavTab('discover', true);
  }
  updateDefaultHomeTabUI();

  renderVinylDiscs();
  renderSongList();
  renderLibraryAlbumPills();
  renderDiscoverPane();

  setTimeout(() => {
    const initNeedPicSongs = currentDiscoverSongs.filter(s => !s.cover && (s.pic_id || s.url_id));
    if (initNeedPicSongs.length > 0) {
      Promise.all(initNeedPicSongs.slice(0, 18).map(async song => {
        try {
          const url = await resolveSongCoverUrl(song);
          if (url) song.cover = url;
        } catch(e) {}
      })).then(() => {
        if (currentHomeTab === 'discover') renderDiscoverPane();
      });
    }
    if (typeof refreshRecommendations === 'function') refreshRecommendations(false);
  }, 100);
  const initialSong = currentPlaybackQueue[currentIndex];
  if (initialSong) {
    const initLrc = initialSong.lrc || getCachedLyric(initialSong.title, initialSong.artist);
    if (initLrc) {
      const parsed = parseLrc(initLrc);
      if (parsed && parsed.length) {
        LYRICS_DATA = parsed;
      }
    }
  }
  initLyricsList();
  playMode = localStorage.getItem('yyrc_play_mode') || 'list';
  applyPlayModeUI(playMode);
  updateUI();
  updateClock();
  updateApiDescText();
  updateQualityDescText();
  updateCoverDisplayToggleUI();
  if (window.matchMedia) {
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (currentThemeMode === 'auto') applyThemeMode();
      });
    } catch(e) {}
  }
  initThemeSettings();
  initGuideCarousel();
  initCardTapRipple();
  updateCacheStorageDisplay();
  updateDynamicAppVersion();
  initAudioFocusSetting();
  setInterval(updateClock, 1000);

  // APK 容器/真机手机打包自动适配：任何手机屏幕/打包容器均自动开启全屏沉浸纯净音乐应用，无需手动删改任何代码
  if (window.innerWidth <= 600 || window.location.search.includes('mode=apk') || window.IS_APK_MODE || window.Capacitor || window.cordova || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)) {
    document.body.classList.add('apk-mode');
    openXianyin();
  }
}

/* ================== 设置页卡片水墨温润触控（古风典雅、零阴影、无杂色微墨呼吸） ================== */
function initCardTapRipple() {
  let activeRow = null;
  let pressStartTime = 0;

  document.addEventListener('pointerdown', function(e) {
    const row = e.target.closest('.settings-item-row');
    if (!row) return;

    // 所有弹窗内彻底禁用高亮
    if (row.closest('.modal-overlay, .choose-playlist-modal, [class*="modal" i], [id*="modal" i]')) {
      return;
    }

    if (activeRow && activeRow !== row) {
      activeRow.classList.remove('is-pressed');
    }

    activeRow = row;
    pressStartTime = Date.now();
    row.classList.add('is-pressed');
  }, { passive: true });

  const handlePointerEnd = function() {
    if (activeRow) {
      const r = activeRow;
      activeRow = null;
      const elapsed = Date.now() - pressStartTime;
      // 轻点保留至少180ms让微墨舒缓渐现，随后以0.38s柔顺淡出，绝不突兀闪烁
      const remainDelay = Math.max(0, 180 - elapsed);
      setTimeout(() => {
        if (r) r.classList.remove('is-pressed');
      }, remainDelay);
    }
  };

  document.addEventListener('pointerup', handlePointerEnd, { passive: true });
  document.addEventListener('pointercancel', handlePointerEnd, { passive: true });
}

/* 渲染私人专属曲目：随当前听/选中的歌单动态联动，红心歌单移除加收藏按钮 */
function renderSongList() {
  const container = document.getElementById('songsContainer');
  if (!container) return;

  const curPlayingSong = currentPlaybackQueue[currentIndex];
  const activeAlb = VINYL_ALBUMS[activeRadioIndex] || VINYL_ALBUMS[0];
  const songs = activeAlb.songs || [];
  const isFavAlbum = (activeAlb.id === 'alb_fav' || activeAlb.hasRose);

  const titleEl = document.getElementById('songListPanelTitle');
  if (titleEl) {
    titleEl.textContent = activeAlb.title || '我的曲库';
  }

  if (songs.length === 0) {
    container.innerHTML = '<div style="padding:40px 20px; text-align:center; color:var(--ink-light); font-size:13px;">曲库暂无曲目</div>';
    return;
  }

  container.innerHTML = songs.map((song, idx) => {
    const isCurPlaying = curPlayingSong && (song.id === curPlayingSong.id) && isPlaying;
    const isSelected = selectedSongIndices.has(idx);
    const coverUrl = song.cover || '';
    return `
      <div class="song-row ${isCurPlaying ? 'playing' : ''} ${isSelected ? 'selected' : ''}" data-song-id="${escapeHtml(song.id || '')}" data-song-idx="${idx}" onclick="handleHomeSongClick(${idx})">
        <div class="multi-select-check-box" onclick="event.stopPropagation(); toggleSongSelection(${idx})">
          <svg viewBox="0 0 24 24" class="multi-check-svg"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="song-cover-mini" data-song-id="${escapeHtml(song.id || '')}" data-cover="${escapeHtml(coverUrl)}" onclick="event.stopPropagation(); if(isMultiSelectActive){toggleSongSelection(${idx});}else{playSongFromActiveAndOpenDetail(${idx});}" title="${isMultiSelectActive ? '勾选歌曲' : '点击查看详情'}">
          <div class="static-icon">
            <svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          </div>
          ${(useExtractedCover && coverUrl) ? `
            <img src="${coverUrl}" class="song-cover-thumb" alt="cover" onerror="this.remove()">
          ` : ''}
          <div class="playing-bars"><div class="bar"></div><div class="bar"></div><div class="bar"></div></div>
        </div>
        <div class="song-info">
          <div class="song-title">${song.title}</div>
          <div class="song-artist">${song.artist}</div>
        </div>
        <div class="song-actions-cluster">
          ${isFavAlbum ? '' : `
          <div class="fav-btn ${song.isFav ? 'active' : ''}" data-song-id="${song.id}" onclick="event.stopPropagation(); toggleSongFav('${song.id}', this, event)">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="${song.isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.4"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </div>`}
          <div class="more-dots-btn" onclick="openSongMenu(event, ${idx})" title="更多操作">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="12" cy="7" r="2.2"></circle>
              <circle cx="12" cy="17" r="2.2"></circle>
            </svg>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // 静默排查并补全无封面或失效封面的曲目
  if (useExtractedCover) {
    const needCovers = songs.filter(s => s && (!s.cover || s.cover.includes('param=300y300') || s.cover.includes('injahow.cn')));
    if (needCovers.length > 0) {
      setTimeout(() => {
        batchFillNetEaseCovers(needCovers.slice(0, 30));
      }, 300);
    }
  }
}

/* 渲染播放队列抽屉 */
function renderDrawerList() {
  const c = document.getElementById('drawerItemsList');
  if (!c) return;
  document.getElementById('drawerCountText').textContent = currentPlaybackQueue.length;
  c.innerHTML = currentPlaybackQueue.map((song, idx) => `
    <div class="song-row ${idx === currentIndex && isPlaying ? 'playing' : ''}" data-song-id="${escapeHtml(song.id || '')}" data-song-idx="${idx}" onclick="playSongAtQueue(${idx})">
      <div style="width:24px; font-size:14px; font-weight:500; color:var(--ink-light); text-align:center;">${idx + 1}</div>
      <div class="song-info">
        <div class="song-title">${song.title}</div>
        <div class="song-artist">${song.artist}</div>
      </div>
      <div class="song-actions-cluster">
        <div class="fav-btn ${song.isFav ? 'active' : ''}" data-song-id="${song.id}" onclick="event.stopPropagation(); toggleSongFav('${song.id}', this, event)" title="收藏歌曲">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="${song.isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.4"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </div>
        <div class="more-dots-btn" onclick="event.stopPropagation(); openSongMenuById('${song.id}', event)" title="更多操作">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="12" cy="7" r="2.2"></circle>
            <circle cx="12" cy="17" r="2.2"></circle>
          </svg>
        </div>
      </div>
    </div>
  `).join('');
}

function switchNavTab(tabIdx) {}

/* 从激活歌单点播某首歌曲 */
function playSongFromActivePlaylist(idx) {
  isDiscoverRecommendationQueue = false;
  currentPlayingAlbumIndex = activeRadioIndex;
  const activeAlb = VINYL_ALBUMS[activeRadioIndex] || VINYL_ALBUMS[0];
  currentPlaybackQueue = [...activeAlb.songs];
  playSongAtQueue(idx);
}

/* 从主曲库点播某首歌曲 */
function playFromLibrary(idx) {
  isDiscoverRecommendationQueue = false;
  currentPlaybackQueue = [...ALL_LIBRARY_SONGS];
  playSongAtQueue(idx);
}

