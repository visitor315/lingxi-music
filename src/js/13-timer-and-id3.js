/* ================== 定时关闭功能 ================== */
let currentSleepTimerType = 'off'; // 'off' | 'time' | 'track'
let sleepTimerTargetTime = 0;
let sleepTimerTotalMinutes = 0;
let sleepTimerIntervalId = null;

function openSleepTimerModal() {
  const modal = document.getElementById('sleepTimerModal');
  if (!modal) return;
  updateSleepTimerOptionSelection();
  modal.classList.add('active');
}

function closeSleepTimerModal(e) {
  if (!e || e.target === e.currentTarget || (e.target && e.target.classList && e.target.classList.contains('modal-overlay'))) {
    const modal = document.getElementById('sleepTimerModal');
    if (modal) modal.classList.remove('active');
  }
}

function updateSleepTimerOptionSelection() {
  document.querySelectorAll('#sleepTimerModal .color-option-row').forEach(r => r.classList.remove('selected'));
  if (currentSleepTimerType === 'off') {
    const opt = document.getElementById('sleepTimerOpt_off');
    if (opt) opt.classList.add('selected');
  } else if (currentSleepTimerType === 'track') {
    const opt = document.getElementById('sleepTimerOpt_track');
    if (opt) opt.classList.add('selected');
  } else if (currentSleepTimerType === 'time') {
    const standardMins = [15, 30, 45, 60, 90];
    if (standardMins.includes(sleepTimerTotalMinutes)) {
      const opt = document.getElementById(`sleepTimerOpt_${sleepTimerTotalMinutes}`);
      if (opt) opt.classList.add('selected');
    } else {
      const opt = document.getElementById('sleepTimerOpt_custom');
      if (opt) opt.classList.add('selected');
    }
  }
}

function selectSleepTimer(type, mins) {
  if (type === 'off') {
    cancelSleepTimer(true);
    setTimeout(closeSleepTimerModal, 120);
    return;
  }
  if (type === 'track') {
    cancelSleepTimer(false);
    currentSleepTimerType = 'track';
    sleepTimerTargetTime = 0;
    sleepTimerTotalMinutes = 0;
    updateSleepTimerUI();
    toast('将在播完当前歌曲后停止播放');
    setTimeout(closeSleepTimerModal, 120);
    return;
  }
  if (type === 'time' && mins > 0) {
    startSleepTimerWithMinutes(mins);
    setTimeout(closeSleepTimerModal, 120);
  }
}

function selectSleepTimerCustom() {
  closeSleepTimerModal();
  const modal = document.getElementById('sleepTimerCustomModal');
  const input = document.getElementById('sleepTimerCustomInput');
  if (input) input.value = (sleepTimerTotalMinutes > 0 ? sleepTimerTotalMinutes : '20');
  if (modal) modal.classList.add('active');
}

function closeSleepTimerCustomModal(e) {
  if (!e || e.target === e.currentTarget || (e.target && e.target.classList && e.target.classList.contains('modern-dialog-backdrop')) || (e.target && e.target.classList && e.target.classList.contains('modern-pill-cancel'))) {
    const modal = document.getElementById('sleepTimerCustomModal');
    if (modal) modal.classList.remove('active');
  }
}

function confirmSleepTimerCustom() {
  const input = document.getElementById('sleepTimerCustomInput');
  const mins = parseInt(input ? input.value : '', 10);
  if (isNaN(mins) || mins <= 0 || mins > 720) {
    toast('请输入有效分钟数 (1 ~ 720)');
    return;
  }
  closeSleepTimerCustomModal();
  const customLabel = document.getElementById('sleepTimerCustomLabel');
  if (customLabel) customLabel.textContent = `自定义 (${mins} 分钟)`;
  startSleepTimerWithMinutes(mins);
}

function startSleepTimerWithMinutes(mins) {
  cancelSleepTimer(false);
  currentSleepTimerType = 'time';
  sleepTimerTotalMinutes = mins;
  sleepTimerTargetTime = Date.now() + (mins * 60 * 1000);

  // 通知原生 Android MediaPlaybackService 持有唤醒锁并倒计时，保证息屏/后台依然生效
  if (window.AndroidBridge && window.AndroidBridge.setNativeSleepTimer) {
    try {
      window.AndroidBridge.setNativeSleepTimer(mins);
    } catch(e) {}
  }

  // 网页端每秒刷新倒计时文案与小胶囊
  if (sleepTimerIntervalId) clearInterval(sleepTimerIntervalId);
  sleepTimerIntervalId = setInterval(tickSleepTimer, 1000);

  updateSleepTimerUI();
  toast(`已设置 ${mins} 分钟后停止播放`);
}

function cancelSleepTimer(showToast = true) {
  currentSleepTimerType = 'off';
  sleepTimerTargetTime = 0;
  sleepTimerTotalMinutes = 0;
  if (sleepTimerIntervalId) {
    clearInterval(sleepTimerIntervalId);
    sleepTimerIntervalId = null;
  }
  if (window.AndroidBridge && window.AndroidBridge.setNativeSleepTimer) {
    try {
      window.AndroidBridge.setNativeSleepTimer(0);
    } catch(e) {}
  }
  const customLabel = document.getElementById('sleepTimerCustomLabel');
  if (customLabel) customLabel.textContent = '自定义分钟';
  updateSleepTimerUI();
  if (showToast) {
    toast('定时关闭已取消');
  }
}

function tickSleepTimer() {
  if (currentSleepTimerType !== 'time') {
    if (sleepTimerIntervalId) {
      clearInterval(sleepTimerIntervalId);
      sleepTimerIntervalId = null;
    }
    return;
  }
  const remainingMs = sleepTimerTargetTime - Date.now();
  if (remainingMs <= 0) {
    fireSleepTimer();
  } else {
    updateSleepTimerUI();
  }
}

function fireSleepTimer() {
  cancelSleepTimer(false);
  if (isNativeAudioSupported && window.AndroidBridge && window.AndroidBridge.pauseNativeAudio) {
    window.AndroidBridge.pauseNativeAudio();
  } else if (audioPlayer) {
    audioPlayer.pause();
  }
  isPlaying = false;
  stopPlaybackLoop();
  updateUI();
  toast('定时关闭时间已到，播放已停止');
}

window.onNativeSleepTimerFired = function() {
  fireSleepTimer();
};

function updateSleepTimerUI() {
  const descEl = document.getElementById('sleepTimerSettingsDesc');
  const badgeEl = document.getElementById('topSleepTimerBadge');
  const btnEl = document.getElementById('topSleepTimerBtn');

  if (currentSleepTimerType === 'off') {
    if (descEl) descEl.textContent = '未开启';
    if (badgeEl) badgeEl.style.display = 'none';
    if (btnEl) btnEl.style.color = 'var(--ink-dark)';
  } else if (currentSleepTimerType === 'track') {
    if (descEl) descEl.textContent = '播完当前歌曲后停止';
    if (badgeEl) {
      badgeEl.textContent = '单曲';
      badgeEl.style.display = 'block';
    }
    if (btnEl) btnEl.style.color = 'var(--brand-terracotta)';
  } else if (currentSleepTimerType === 'time') {
    const remainingSec = Math.max(0, Math.ceil((sleepTimerTargetTime - Date.now()) / 1000));
    const m = Math.floor(remainingSec / 60);
    const s = remainingSec % 60;
    const timeStr = `${m}:${String(s).padStart(2, '0')}`;
    if (descEl) descEl.textContent = `倒计时 ${timeStr} - 停止播放`;
    if (badgeEl) {
      badgeEl.textContent = `${m + 1}m`;
      badgeEl.style.display = 'block';
    }
    if (btnEl) btnEl.style.color = 'var(--brand-terracotta)';
  }
}

/* 系统与重置功能 */
function promptResetAppData() {
  openUniversalConfirm({
    title: '重置灵犀音乐',
    desc: '确定要重置应用吗？这将清空搜索历史、恢复默认歌单并重置已存曲库，便于重新测试或排查问题。',
    confirmText: '立即重置',
    isDanger: true,
    onConfirm: () => {
      executeResetAppData();
    }
  });
}

function executeResetAppData() {
  localStorage.removeItem('yyrc_lib_songs_v2');
  localStorage.removeItem('yyrc_albums_v2');
  localStorage.removeItem('yyrc_search_history');
  localStorage.removeItem('yyrc_api_base');
  localStorage.removeItem('yyrc_audio_quality');

  if ('caches' in window) {
    caches.keys().then(names => names.forEach(name => caches.delete(name))).catch(()=>{});
  }

  currentApiBase = DEFAULT_API_BASE;
  currentAudioQuality = '320';
  searchHistory = ['周杰伦', '起风了', '晴天', '陈奕迅'];
  ALL_LIBRARY_SONGS = JSON.parse(JSON.stringify(DEFAULT_LIBRARY_SONGS));
  initDefaultAlbums();

  audioPlayer.pause();
  audioPlayer.removeAttribute('src');
  isPlaying = false;
  stopPlaybackLoop();

  currentPlaybackQueue = [...ALL_LIBRARY_SONGS];
  currentIndex = 0;
  currentSec = 0;
  activeRadioIndex = 0;
  currentPlayingAlbumIndex = -1;

  renderVinylDiscs();
  scrollVinylToAlbum(0, false);
  updateApiDescText();
  updateQualityDescText();
  renderSearchHistory();
  renderSongList();
  renderDrawerList();
  updateUI();
  
  toast('已恢复初始出厂设置');
}

function handleSystemBack() {
  const createPlaylistM = document.getElementById('createPlaylistModalOverlay');
  const guideM = document.getElementById('beginnerGuideModal');
  const qualityM = document.getElementById('audioQualityModal');
  const coverM = document.getElementById('coverPreviewModal');
  const uniConfirm = document.getElementById('universalConfirmModal');
  const configM = document.getElementById('apiConfigModal');
  const customApiM = document.getElementById('customApiModal');
  const updateModal = document.getElementById('appUpdateModal');
  const chooseModal = document.getElementById('choosePlaylistModal');
  const menu = document.getElementById('songMenuOverlay');
  const playlistMenu = document.getElementById('playlistCornerMenu');
  const drawer = document.getElementById('playlistDrawer');
  const fullP = document.getElementById('viewPlayerFull');
  const themeP = document.getElementById('viewThemeSettings');
  const searchP = document.getElementById('viewSearchFull');
  const editP = document.getElementById('viewEditPlaylist');
  const detailP = document.getElementById('viewPlaylistDetail');

  if (createPlaylistM && createPlaylistM.classList.contains('active')) closeCreatePlaylistModal();
  else if (guideM && guideM.classList.contains('active')) closeBeginnerGuideModal();
  else if (qualityM && qualityM.classList.contains('active')) closeQualityModal();
  else if (coverM && coverM.classList.contains('active')) closeCoverPreview();
  else if (uniConfirm && uniConfirm.classList.contains('active')) closeUniversalConfirm();
  else if (customApiM && customApiM.classList.contains('active')) closeCustomApiModal();
  else if (configM && configM.classList.contains('active')) closeApiConfigModal();
  else if (updateModal && updateModal.classList.contains('active')) closeAppUpdateModalDirect();
  else if (chooseModal && chooseModal.classList.contains('active')) chooseModal.classList.remove('active');
  else if (menu && menu.classList.contains('active')) closeSongMenu();
  else if (playlistMenu && playlistMenu.classList.contains('active')) closePlaylistMenu();
  else if (drawer && drawer.classList.contains('open')) closePlaylistDrawer();
  else if (fullP && fullP.classList.contains('active')) handleHeaderBackClick();
  else if (themeP && themeP.classList.contains('active')) closeThemeSettingsSubpage();
  else if (searchP && searchP.classList.contains('active')) closeSearchView();
  else if (editP && editP.classList.contains('active')) closeEditPlaylistPage();
  else if (detailP && detailP.classList.contains('active')) closePlaylistDetail();
  else if (paneSettings && paneSettings.classList.contains('active')) {
    switchBottomTab('listen');
  } else {
    // 已经位于应用主界面，按返回键直接退回手机桌面
    if (window.AndroidBridge && window.AndroidBridge.minimizeApp) {
      window.AndroidBridge.minimizeApp();
    }
  }
}

function handleSystemHome() {
  const guideM = document.getElementById('beginnerGuideModal');
  const qualityM = document.getElementById('audioQualityModal');
  const coverM = document.getElementById('coverPreviewModal');
  const uniConfirm = document.getElementById('universalConfirmModal');
  const configM = document.getElementById('apiConfigModal');
  const customApiM = document.getElementById('customApiModal');
  const updateModal = document.getElementById('appUpdateModal');
  const searchP = document.getElementById('viewSearchFull');
  if (guideM) guideM.classList.remove('active');
  if (qualityM) qualityM.classList.remove('active');
  if (coverM) coverM.classList.remove('active');
  if (uniConfirm) uniConfirm.classList.remove('active');
  if (customApiM) customApiM.classList.remove('active');
  if (configM) configM.classList.remove('active');
  if (updateModal) updateModal.classList.remove('active');
  if (searchP) searchP.classList.remove('active');
  document.getElementById('choosePlaylistModal').classList.remove('active');
  closeSongMenu();
  closePlaylistMenu();
  closePlaylistDrawer();
  closeEditPlaylistPage();
  closePlayerFull();
  closePlaylistDetail();
  closeXianyin();
}

function seekAudio(e) {
  if (isDraggingProgressBar) return;
  const bar = e.currentTarget || document.getElementById('seekBarWrap');
  if (!bar) return;
  const rect = bar.getBoundingClientRect();
  const clientX = (e.clientX !== undefined) ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : rect.left);
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const curSong = currentPlaybackQueue[currentIndex];
  if (!curSong) return;
  const duration = (curSong && curSong.duration > 0) ? curSong.duration : (!isNaN(audioPlayer.duration) && audioPlayer.duration > 0 ? audioPlayer.duration : 180);
  currentSec = ratio * duration;
  isSeekingAudio = true;
  if (!isNaN(audioPlayer.duration) && audioPlayer.duration > 0) {
    try {
      audioPlayer.currentTime = currentSec;
    } catch(err) {}
  }
  if (seekLockTimer) clearTimeout(seekLockTimer);
  seekLockTimer = setTimeout(() => { isSeekingAudio = false; }, 400);

  let targetIdx = 0;
  if (LYRICS_DATA && LYRICS_DATA.length > 0) {
    for (let i = 0; i < LYRICS_DATA.length; i++) {
      if (currentSec >= LYRICS_DATA[i].time) targetIdx = i;
    }
    lastActiveIdx = targetIdx;
    updateSimplePreviewLyricScrubbing(targetIdx);
    if (isPureLyrics) {
      scrollLyricItemToCenter(targetIdx);
    }
  }

  syncProgress();
  updateLyricProgressSmooth(targetIdx);
  syncCurrentLyricToDesktop();
}

function formatTime(sec) {
  sec = Math.floor(Number(sec) || 0);
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function updateClock() {
  const now = new Date();
  const str = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const bigClock = document.getElementById('big-clock');
  if (bigClock) bigClock.textContent = str;
  const statusTime = document.getElementById('status-time');
  if (statusTime) statusTime.textContent = str;
}

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toastMsg');
  el.textContent = msg;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1400);
}

let currentThemeMode = localStorage.getItem('yyrc_theme_mode') || 'auto'; // 'auto' | 'dark' | 'light'

function applyThemeMode() {
  const isSystemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  let effectiveDark = false;
  if (currentThemeMode === 'auto') {
    effectiveDark = isSystemDark;
  } else if (currentThemeMode === 'dark') {
    effectiveDark = true;
  } else {
    effectiveDark = false;
  }

  document.body.classList.toggle('night', effectiveDark);
  applyThemeColorStyles();

  const mainThemeDisp = document.getElementById('main-theme-display');
  if (mainThemeDisp) {
    if (currentThemeMode === 'auto' || currentThemeMode === 'system') {
      mainThemeDisp.textContent = '跟随系统';
    } else if (currentThemeMode === 'dark') {
      mainThemeDisp.textContent = '深色夜间';
    } else {
      mainThemeDisp.textContent = '浅色明亮';
    }
  }
}

function cycleThemeMode() {
  if (currentThemeMode === 'auto') {
    currentThemeMode = 'dark';
  } else if (currentThemeMode === 'dark') {
    currentThemeMode = 'light';
  } else {
    currentThemeMode = 'auto';
  }
  localStorage.setItem('yyrc_theme_mode', currentThemeMode);
  applyThemeMode();
  toast(currentThemeMode === 'auto' ? '主题：跟随系统' : (currentThemeMode === 'dark' ? '主题：深色模式' : '主题：浅色模式'));
}

const toggleNightMode = cycleThemeMode;
function toggleIslandFeature() {
  islandEnabled = !islandEnabled;
  const toggle = document.getElementById('islandToggle');
  if (toggle) toggle.classList.toggle('active', islandEnabled);
  updateUI();
  toast(islandEnabled ? '灵动岛已开启' : '灵动岛已关闭');
}
function switchBottomTab(tab) {
  const paneListen = document.getElementById('paneListen');
  const paneDiscover = document.getElementById('paneDiscover');
  const paneSettings = document.getElementById('paneSettings');
  const headerBar = document.getElementById('listenHeaderBar');
  const btnListen = document.getElementById('tabBtnListen');
  const btnSettings = document.getElementById('tabBtnSettings');
  const homeNavTitles = document.getElementById('homeNavTitles');
  const settingsNavTitles = document.getElementById('settingsNavTitles');
  const headerActions = document.querySelector('.listen-header-actions');

  const homeTabSlider = document.getElementById('homeTabSlider');

  if (tab === 'listen') {
    if (homeNavTitles) homeNavTitles.style.display = 'flex';
    if (settingsNavTitles) settingsNavTitles.style.display = 'none';
    if (headerActions) headerActions.style.display = 'flex';
    if (headerBar) headerBar.style.display = 'flex';
    paneSettings.classList.remove('active');
    btnListen.classList.add('active');
    btnSettings.classList.remove('active');
    triggerListenWaveTap();

    if (homeTabSlider) homeTabSlider.style.display = 'block';
    switchHomeNavTab(currentHomeTab, true);
  } else {
    exitHomeMultiSelectMode();
    if (homeTabSlider) homeTabSlider.style.display = 'none';
    if (headerBar) headerBar.style.display = 'none';
    paneSettings.classList.add('active');
    btnListen.classList.remove('active');
    btnSettings.classList.add('active');
    triggerSettingsGearSpin();
    updateCacheStorageDisplay();
    updateDynamicAppVersion();
    if (typeof updateSleepTimerUI === 'function') updateSleepTimerUI();
    if (typeof updateAudioFocusUI === 'function') updateAudioFocusUI();
    if (typeof updateVideoAutoPauseUI === 'function') updateVideoAutoPauseUI();
  }
}

function handleListenNavClick() {
  triggerListenWaveTap();
  const btnListen = document.getElementById('tabBtnListen');
  const isAlreadyActive = btnListen && btnListen.classList.contains('active');

  if (!isAlreadyActive) {
    switchBottomTab('listen');
  } else {
    // 已经处于听歌/发现页，再次点击音波：响应用户“这个功能好像是播放音乐”的操作认知
    if (!isPlaying) {
      if (currentPlaybackQueue.length > 0) {
        togglePlayState();
      } else {
        togglePlayCurrentRadioAlbum();
      }
    } else {
      const cur = currentPlaybackQueue[currentIndex];
      if (cur) {
        toast(`正在播放：${cur.title}`);
      }
    }
  }
}

function triggerListenWaveTap() {
  const bars = document.getElementById('navWaveBars');
  if (!bars) return;
  bars.classList.remove('anim-wave-tap');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      bars.classList.add('anim-wave-tap');
      bars.addEventListener('animationend', () => {
        bars.classList.remove('anim-wave-tap');
      }, { once: true });
    });
  });
}

function triggerSettingsGearSpin() {
  const settingsSvg = document.getElementById('navSettingsSvg');
  if (!settingsSvg) return;
  settingsSvg.classList.remove('anim-gear-spin');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      settingsSvg.classList.add('anim-gear-spin');
      settingsSvg.addEventListener('animationend', () => {
        settingsSvg.classList.remove('anim-gear-spin');
      }, { once: true });
    });
  });
}

/* ================== 封面提取与预览保存 ================== */
let currentCoverPreviewSong = null;

async function openCoverPreviewModal(song) {
  currentCoverPreviewSong = song;
  const modal = document.getElementById('coverPreviewModal');
  const titleEl = document.getElementById('coverPreviewTitle');
  const imgEl = document.getElementById('coverPreviewImg');
  const placeholderEl = document.getElementById('coverPreviewPlaceholder');
  const saveBtn = document.getElementById('coverSaveBtn');

  if (!modal) return;
  if (titleEl) {
    titleEl.textContent = song ? `封面：${song.title}` : '歌曲封面';
  }

  modal.classList.add('active');

  // 若歌曲暂无封面但包含在线 ID 或图片 ID，自动向聚合引擎补拉真实图片
  if (song && !song.cover && (song.pic_id || song.onlineId)) {
    if (placeholderEl) {
      placeholderEl.textContent = '正在获取封面...';
      placeholderEl.style.display = 'block';
    }
    imgEl.style.display = 'none';
    if (saveBtn) saveBtn.style.display = 'none';

    try {
      const fetchedUrl = await resolveSongCoverUrl(song);
      if (fetchedUrl) {
        song.cover = fetchedUrl;
        const libSong = ALL_LIBRARY_SONGS.find(s => s.id === song.id);
        if (libSong) libSong.cover = fetchedUrl;
        persistData();
        applySongCoverToUI(fetchedUrl);
        renderSongList();
      }
    } catch(e) {
      console.warn('On-demand cover fetch failed', e);
    }
  }

  const coverUrl = song ? (song.cover || '') : '';
  if (coverUrl) {
    imgEl.src = coverUrl;
    imgEl.style.display = 'block';
    if (placeholderEl) placeholderEl.style.display = 'none';
    if (saveBtn) saveBtn.style.display = 'block';
  } else {
    imgEl.removeAttribute('src');
    imgEl.style.display = 'none';
    if (placeholderEl) {
      placeholderEl.textContent = '暂无独立封面';
      placeholderEl.style.display = 'block';
    }
    if (saveBtn) saveBtn.style.display = 'none';
  }
}

function triggerCustomSongCoverUpload() {
  const input = document.getElementById('songCoverFileInput');
  if (input) {
    input.value = '';
    input.click();
  }
}

async function handleCustomSongCoverUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  toast('正在压缩处理封面...');
  const dataUrl = await compressImageFile(file, 360, 360, 0.82);
  if (!dataUrl || !currentCoverPreviewSong) return;

  currentCoverPreviewSong.cover = dataUrl;

    // 同步更新全部歌曲库
    const libSong = ALL_LIBRARY_SONGS.find(s => s.id === currentCoverPreviewSong.id);
    if (libSong) libSong.cover = dataUrl;

    // 同步更新播放队列
    const qSong = currentPlaybackQueue.find(s => s.id === currentCoverPreviewSong.id);
    if (qSong) qSong.cover = dataUrl;

    // 同步更新各大歌单中的该歌曲
    VINYL_ALBUMS.forEach(alb => {
      if (alb.songs) {
        const aSong = alb.songs.find(s => s.id === currentCoverPreviewSong.id);
        if (aSong) aSong.cover = dataUrl;
      }
    });

    persistData();

    // 刷新弹窗预览
    const imgEl = document.getElementById('coverPreviewImg');
    const placeholderEl = document.getElementById('coverPreviewPlaceholder');
    const saveBtn = document.getElementById('coverSaveBtn');
    if (imgEl) {
      imgEl.src = dataUrl;
      imgEl.style.display = 'block';
    }
    if (placeholderEl) placeholderEl.style.display = 'none';
    if (saveBtn) saveBtn.style.display = 'block';

    // 若正播放该曲目，实时刷新转盘外观
    const curSong = currentPlaybackQueue[currentIndex];
    if (curSong && curSong.id === currentCoverPreviewSong.id) {
      applySongCoverToUI(dataUrl);
    }

    renderSongList();
    renderDrawerList();
    if (document.getElementById('viewPlaylistDetail').classList.contains('active')) {
      openPlaylistDetail(activeRadioIndex);
    }

    toast('已成功更换歌曲封面');
}

function closeCoverPreviewModal(e) {
  if (e && e.target !== document.getElementById('coverPreviewModal') && !e.target.closest('.modern-pill-cancel')) return;
  const modal = document.getElementById('coverPreviewModal');
  if (modal) modal.classList.remove('active');
}

async function saveCoverImageToDevice() {
  if (!currentCoverPreviewSong || !currentCoverPreviewSong.cover) {
    toast('当前歌曲无有效封面可供保存');
    return;
  }
  const song = currentCoverPreviewSong;
  const coverUrl = song.cover;
  const safeTitle = (song.title || '未知歌曲').replace(/[\\/:*?"<>|]/g, '_');
  const safeArtist = (song.artist || '未知歌手').replace(/[\\/:*?"<>|]/g, '_');
  const filename = `${safeArtist} - ${safeTitle}_封面.jpg`;

  try {
    if (coverUrl.startsWith('blob:')) {
      const a = document.createElement('a');
      a.href = coverUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast(`已保存封面图片《${filename}》`);
      return;
    }

    const res = await fetch(coverUrl);
    if (!res.ok) throw new Error('Fetch cover failed');
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
    toast(`已保存封面图片《${filename}》`);
  } catch(err) {
    console.warn('Cover download fallback', err);
    try {
      const ifr = document.createElement('iframe');
      ifr.style.display = 'none';
      ifr.src = coverUrl;
      document.body.appendChild(ifr);
      setTimeout(() => document.body.removeChild(ifr), 3000);
      toast(`已发起封面图片保存`);
    } catch(e) {
      toast(`保存封面受限，请长按图片保存`);
    }
  }
}

/* ================== 原生 ID3v2 标签解析（提取内嵌 APIC 封面与信息） ================== */
function extractID3CoverAndMetadata(file) {
  return new Promise((resolve) => {
    if (!file) return resolve({ title: '', artist: '', coverUrl: '', coverBlob: null });
    const slice = file.slice(0, 256 * 1024);
    const reader = new FileReader();

    reader.onload = function(e) {
      const buffer = e.target.result;
      const view = new DataView(buffer);
      const result = {
        title: '',
        artist: '',
        coverUrl: '',
        coverBlob: null
      };

      try {
        if (buffer.byteLength < 10) return resolve(result);

        const id3Tag = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2));
        if (id3Tag !== 'ID3') return resolve(result);

        const versionMajor = view.getUint8(3);
        const tagSize = ((view.getUint8(6) & 0x7f) << 21) |
                        ((view.getUint8(7) & 0x7f) << 14) |
                        ((view.getUint8(8) & 0x7f) << 7)  |
                        (view.getUint8(9) & 0x7f);

        let offset = 10;
        const maxOffset = Math.min(buffer.byteLength, 10 + tagSize);

        while (offset + 10 < maxOffset) {
          const frameId = String.fromCharCode(
            view.getUint8(offset),
            view.getUint8(offset + 1),
            view.getUint8(offset + 2),
            view.getUint8(offset + 3)
          );

          if (frameId.charCodeAt(0) === 0) break;

          let frameSize = 0;
          if (versionMajor === 4) {
            frameSize = ((view.getUint8(offset + 4) & 0x7f) << 21) |
                        ((view.getUint8(offset + 5) & 0x7f) << 14) |
                        ((view.getUint8(offset + 6) & 0x7f) << 7)  |
                        (view.getUint8(offset + 7) & 0x7f);
          } else {
            frameSize = view.getUint32(offset + 4, false);
          }

          if (frameSize <= 0 || offset + 10 + frameSize > buffer.byteLength) {
            break;
          }

          const frameBodyOffset = offset + 10;

          if (frameId === 'TIT2' && !result.title) {
            result.title = decodeTextFrame(view, frameBodyOffset, frameSize);
          } else if (frameId === 'TPE1' && !result.artist) {
            result.artist = decodeTextFrame(view, frameBodyOffset, frameSize);
          } else if (frameId === 'APIC' && !result.coverUrl) {
            const coverInfo = decodeApicFrame(buffer, frameBodyOffset, frameSize);
            if (coverInfo) {
              result.coverUrl = coverInfo.url;
              result.coverBlob = coverInfo.blob;
            }
          }

          offset += 10 + frameSize;
        }
      } catch (err) {
        console.warn('ID3 parse error:', err);
      }

      resolve(result);
    };

    reader.onerror = function() {
      resolve({ title: '', artist: '', coverUrl: '', coverBlob: null });
    };

    reader.readAsArrayBuffer(slice);
  });
}

function decodeTextFrame(view, offset, size) {
  if (size <= 1) return '';
  const encoding = view.getUint8(offset);
  const bytes = new Uint8Array(view.buffer, offset + 1, size - 1);
  try {
    if (encoding === 0) {
      return new TextDecoder('latin1').decode(bytes).replace(/\0+$/, '').trim();
    } else if (encoding === 1) {
      return new TextDecoder('utf-16').decode(bytes).replace(/\0+$/, '').trim();
    } else if (encoding === 2) {
      return new TextDecoder('utf-16be').decode(bytes).replace(/\0+$/, '').trim();
    } else if (encoding === 3) {
      return new TextDecoder('utf-8').decode(bytes).replace(/\0+$/, '').trim();
    }
  } catch(e) {}
  return '';
}

function decodeApicFrame(buffer, offset, size) {
  if (size < 10) return null;
  const view = new DataView(buffer, offset, size);
  const encoding = view.getUint8(0);
  let pos = 1;

  let mimeType = '';
  while (pos < size && view.getUint8(pos) !== 0) {
    mimeType += String.fromCharCode(view.getUint8(pos));
    pos++;
  }
  pos++;

  if (pos >= size) return null;
  pos++; // picture type

  if (encoding === 1 || encoding === 2) {
    while (pos + 1 < size && !(view.getUint8(pos) === 0 && view.getUint8(pos + 1) === 0)) {
      pos += 2;
    }
    pos += 2;
  } else {
    while (pos < size && view.getUint8(pos) !== 0) {
      pos++;
    }
    pos++;
  }

  if (pos >= size) return null;

  if (!mimeType || mimeType === '-->') {
    mimeType = 'image/jpeg';
  }

  const imgData = buffer.slice(offset + pos, offset + size);
  const blob = new Blob([imgData], { type: mimeType });
  const url = URL.createObjectURL(blob);
  return { url, blob };
}

function triggerFileImport() { document.getElementById('audioFileInput').click(); }
async function handleAudioImport(e) {
  const files = e.target.files;
  if (!files || !files.length) return;
  const localAlb = VINYL_ALBUMS.find(a => a.id === 'alb_local') || VINYL_ALBUMS[2];

  toast('正在解析本地音频与内嵌封面...');

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const defaultTitle = file.name.replace(/\.[^/.]+$/, '');
    let title = defaultTitle;
    let artist = '本地乐曲';
    let coverUrl = '';

    try {
      const meta = await extractID3CoverAndMetadata(file);
      if (meta.title) title = meta.title;
      if (meta.artist) artist = meta.artist;
      if (meta.coverUrl) coverUrl = meta.coverUrl;
    } catch(err) {
      console.warn('Extract ID3 failed for ' + file.name, err);
    }

    const newTrack = {
      id: 'local-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      title: title,
      artist: artist,
      album: '本地导入',
      duration: 180,
      fileUrl: URL.createObjectURL(file),
      cover: coverUrl,
      isFav: false
    };

    ALL_LIBRARY_SONGS.unshift(newTrack);
    if (localAlb && !localAlb.songs.some(s => s.id === newTrack.id)) {
      localAlb.songs.unshift(newTrack);
    }
    currentPlaybackQueue.unshift(newTrack);
  }

  persistData();
  playSongAtQueue(0);
  renderSongList();
  renderDrawerList();
  toast(`已成功导入 ${files.length} 首本地歌曲并解析封面`);
}

init();
if (typeof initProgressBarDrag === 'function') initProgressBarDrag();
if (typeof updateDesktopLyricsUI === 'function') updateDesktopLyricsUI();
