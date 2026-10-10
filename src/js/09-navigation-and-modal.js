/* ================== 页面导航与弹窗控制 ================== */
function openXianyin() {
  collapseIslandCard();
  document.getElementById('viewXianyin').classList.add('active');
  updateUI();
}
function closeXianyin() {
  document.getElementById('viewXianyin').classList.remove('active');
  closePlaylistDetail();
  closePlayerFull();
  closeEditPlaylistPage();
  updateUI();
}

let openedPlayerFromSearch = false;

function openPlayerFull() {
  collapseIslandCard();
  if (typeof setDragProgressState === 'function') setDragProgressState(false);
  document.getElementById('viewPlayerFull').classList.add('active');
  updateUI();
  syncProgress();
  if (typeof updateSleepTimerUI === 'function') updateSleepTimerUI();
  const song = currentPlaybackQueue[currentIndex];
  const isOnlineSong = song && !!(song.onlineId || (song.fileUrl && song.fileUrl.startsWith('http')));
  if (isOnlineSong && song.fileUrl && (!song.urlFetchedAt || (Date.now() - song.urlFetchedAt > 20 * 60 * 1000))) {
    delete song.fileUrl;
    delete song.urlFetchedAt;
    persistData();
  }
  if (song && !song.fileUrl && (song.onlineId || song.title)) {
    prefetchOnlineSongSource(song);
  }
}

async function prefetchOnlineSongSource(song) {
  if (!song || song.fileUrl || song._isPrefetching) return;
  song._isPrefetching = true;
  try {
    let targetOnlineId = song.onlineId;
    let targetSource = song.source || 'netease';
    let audioUrl = '';
    if (targetOnlineId) {
      if (currentApiBase.includes('injahow')) {
        audioUrl = `https://api.injahow.cn/meting/?server=${targetSource}&type=url&id=${targetOnlineId}`;
      } else {
        try {
          const urlApi = `${currentApiBase}?types=url&id=${targetOnlineId}&source=${targetSource}&br=${currentAudioQuality}`;
          const uRes = await universalFetch(urlApi, { timeout: 4500 });
          if (uRes.ok) {
            const uData = await uRes.json();
            if (uData && uData.url && typeof uData.url === 'string' && uData.url.startsWith('http')) {
              audioUrl = uData.url;
            }
          }
        } catch(e) {}
        if (!audioUrl) {
          audioUrl = `https://api.injahow.cn/meting/?server=${targetSource}&type=url&id=${targetOnlineId}`;
        }
      }
    } else if (song.title) {
      const query = `${song.title} ${song.artist !== '未知歌手' ? song.artist : ''}`.trim();
      const matches = await requestOnlineSearch(query, 1);
      if (matches && matches.length) {
        const item = matches[0];
        song.onlineId = item.url_id || item.id;
        song.source = item.source || 'netease';
        if (item.cover && !song.cover) {
          song.cover = item.cover;
          applySongCoverToUI(song.cover);
        }
        audioUrl = `https://api.injahow.cn/meting/?server=${song.source}&type=url&id=${song.onlineId}`;
      }
    }
    if (audioUrl) {
      song.fileUrl = audioUrl;
      song.urlFetchedAt = Date.now();
      if (!song.cover && song.onlineId) {
        song.cover = `https://api.injahow.cn/meting/?server=${song.source || 'netease'}&type=pic&id=${song.onlineId}`;
        applySongCoverToUI(song.cover);
      }
      persistData();
      updateUI();
      renderSongList();
      if (song.onlineId) {
        fetchLyricForSong(song.onlineId, song.title, song.source);
      }
    }
  } catch(e) {
    console.warn("Prefetch error:", e);
  } finally {
    song._isPrefetching = false;
  }
}
function closePlayerFull() {
  const player = document.getElementById('viewPlayerFull');
  if (player) player.classList.remove('active');
  if (typeof setDragProgressState === 'function') setDragProgressState(false);
  if (isPureLyrics) closePureLyricsView();
  closePlaylistDrawer();
  if (openedPlayerFromSearch) {
    openedPlayerFromSearch = false;
    // 搜索页始终在底层保持 active，绝不重复触发进入动画；若偶发未激活，则强制无动画瞬间归位
    const searchView = document.getElementById('viewSearchFull');
    if (searchView && !searchView.classList.contains('active')) {
      searchView.style.transition = 'none';
      searchView.classList.add('active');
      searchView.offsetHeight;
      searchView.style.transition = '';
    }
  }
}

function handleHeaderBackClick() {
  if (isPureLyrics) closePureLyricsView();
  else closePlayerFull();
}

function openPlaylistDrawer() {
  renderDrawerList();
  document.getElementById('playlistDrawer').classList.add('open');
  document.getElementById('playlistDrawerBackdrop').classList.add('open');
}
function closePlaylistDrawer() {
  document.getElementById('playlistDrawer').classList.remove('open');
  document.getElementById('playlistDrawerBackdrop').classList.remove('open');
}

function expandIslandCard() {}
function collapseIslandCard(e) {
  if (e && e.stopPropagation) e.stopPropagation();
}

/* ================== 通用确认弹窗引擎（对标现代双药丸设计） ================== */
let universalConfirmCallback = null;

function openUniversalConfirm(options, legacyDesc, legacyCb) {
  let title = '', desc = '', confirmText = '确认', isDanger = true, onConfirm = null;
  if (typeof options === 'string') {
    title = options;
    desc = legacyDesc || '';
    onConfirm = legacyCb;
    confirmText = '确认';
    isDanger = true;
  } else if (options && typeof options === 'object') {
    title = options.title || '';
    desc = options.desc || '';
    confirmText = options.confirmText || '确认';
    isDanger = (options.isDanger !== undefined) ? options.isDanger : true;
    onConfirm = options.onConfirm;
  }
  const modal = document.getElementById('universalConfirmModal');
  const titleEl = document.getElementById('universalConfirmTitle');
  const descEl = document.getElementById('universalConfirmDesc');
  const actionBtn = document.getElementById('universalConfirmActionBtn');
  if (!modal || !titleEl || !descEl || !actionBtn) return;

  titleEl.textContent = title;
  descEl.textContent = desc;
  actionBtn.textContent = confirmText;
  actionBtn.className = `modern-pill-btn ${isDanger ? 'modern-pill-danger' : 'modern-pill-primary'}`;

  universalConfirmCallback = onConfirm;
  modal.classList.add('active');
}

function closeUniversalConfirmModal(e) {
  if (e && e.target !== document.getElementById('universalConfirmModal') && !e.target.closest('.modern-pill-cancel')) return;
  const modal = document.getElementById('universalConfirmModal');
  if (modal) modal.classList.remove('active');
  universalConfirmCallback = null;
}

function executeUniversalConfirm() {
  const cb = universalConfirmCallback;
  const modal = document.getElementById('universalConfirmModal');
  if (modal) modal.classList.remove('active');
  universalConfirmCallback = null;
  if (typeof cb === 'function') {
    cb();
  }
}

function toggleFavCurrent() {
  const song = currentPlaybackQueue[currentIndex];
  if (!song) return;
  toggleSongFav(song.id, document.getElementById('topHeartBtn') || document.getElementById('bottomHeartBtn'));
}

window.toggleSongFavFromNotification = function() {
  toggleFavCurrent();
};

function toggleSongFav(id, triggerBtn, event) {
  if (event && event.stopPropagation) event.stopPropagation();

  let target = ALL_LIBRARY_SONGS.find(s => s.id === id);
  if (!target) {
    const qSong = currentPlaybackQueue.find(s => s.id === id) || (typeof currentSong !== 'undefined' && currentSong && currentSong.id === id ? currentSong : null);
    if (qSong) {
      target = { ...qSong, isFav: false };
      ALL_LIBRARY_SONGS.unshift(target);
    }
  }
  if (!target) return;

  target.isFav = !target.isFav;
  const newFav = target.isFav;

  // 同步当前播放队列中的对应歌曲状态
  const qSong = currentPlaybackQueue.find(s => s.id === id);
  if (qSong) qSong.isFav = newFav;

  // 同步系统「我喜欢的音乐」歌单
  const favAlb = VINYL_ALBUMS.find(a => a.id === 'alb_fav') || VINYL_ALBUMS[1];
  if (favAlb && favAlb.songs) {
    if (newFav) {
      if (!favAlb.songs.some(s => s.id === id)) {
        favAlb.songs.unshift(target);
      }
    } else {
      favAlb.songs = favAlb.songs.filter(s => s.id !== id);
    }
  }

  persistData();

  // 精准局部 DOM 更新：找到所有匹配 data-song-id 的爱心按钮，直接切换状态，绝不重构列表 DOM，彻底根除封面闪烁
  const matchingFavBtns = document.querySelectorAll(`.fav-btn[data-song-id="${id}"]`);
  matchingFavBtns.forEach(btn => {
    btn.classList.toggle('active', newFav);
    const svg = btn.querySelector('svg');
    if (svg) {
      svg.setAttribute('fill', newFav ? 'currentColor' : 'none');
    }
  });

  // 若当前正在播放这首歌，同步全屏播放页与底栏/锁屏爱心
  const curPlaying = currentPlaybackQueue[currentIndex] || (typeof currentSong !== 'undefined' ? currentSong : null);
  if (curPlaying && curPlaying.id === id) {
    curPlaying.isFav = newFav;
    const heartBtn = document.getElementById('topHeartBtn') || document.getElementById('bottomHeartBtn');
    if (heartBtn) heartBtn.classList.toggle('unfav', !newFav);
    if (window.AndroidBridge && window.AndroidBridge.updateMediaCardFull) {
      try {
        const curSec = isNativeAudioSupported
          ? (window.AndroidBridge.getNativePosition ? window.AndroidBridge.getNativePosition() : currentSec)
          : ((typeof audioPlayer !== 'undefined' && audioPlayer) ? (audioPlayer.currentTime || 0) : 0);
        window.AndroidBridge.updateMediaCardFull(curPlaying.title || '灵犀音乐', curPlaying.artist || '随心听', curPlaying.cover || '', isPlaying, newFav, curSec, curPlaying.duration || 180);
      } catch(e) {}
    }
  }

  syncCurrentLyricToDesktop();
  toast(newFav ? `已收藏《${target.title}》` : `已取消收藏《${target.title}》`);
}

function openSongMenu(e, idx) {
  if (e && e.stopPropagation) e.stopPropagation();
  activeMenuIdx = idx;
  window._isSearchResultMenu = false;
  window._isDrawerMenu = false;
  const activeAlb = VINYL_ALBUMS[activeRadioIndex] || VINYL_ALBUMS[0];
  const s = (activeAlb && activeAlb.songs && activeAlb.songs[idx]) ? activeAlb.songs[idx] : ALL_LIBRARY_SONGS[idx];
  currentActionSong = s;
  if (!s) return;
  document.getElementById('sheetSongTitle').textContent = `歌曲：${s.title}`;
  const isFav = !!(s && (s.isFav || ALL_LIBRARY_SONGS.some(item => (item.id === s.id || (item.title === s.title && item.artist === s.artist)) && item.isFav)));
  const favIconEl = document.getElementById('sheetFavIcon');
  const favTextEl = document.getElementById('sheetFavText');
  if (isFav) {
    if (favIconEl) favIconEl.classList.add('is-favorited');
    if (favTextEl) {
      favTextEl.classList.add('is-favorited');
      favTextEl.textContent = '已收藏歌曲';
    }
  } else {
    if (favIconEl) favIconEl.classList.remove('is-favorited');
    if (favTextEl) {
      favTextEl.classList.remove('is-favorited');
      favTextEl.textContent = '收藏歌曲';
    }
  }
  const isSpecificSubAlbum = (activeRadioIndex > 0 && activeAlb && activeAlb.id !== 'alb_all');
  const deleteTextEl = document.getElementById('sheetDeleteText');
  if (deleteTextEl) deleteTextEl.textContent = isSpecificSubAlbum ? '移出此歌曲' : '删除此歌曲';
  document.getElementById('songMenuOverlay').classList.add('active');
}

function openSongMenuById(id, e) {
  if (e && e.stopPropagation) e.stopPropagation();
  window._isSearchResultMenu = false;
  window._isDrawerMenu = true;
  const s = currentPlaybackQueue.find(item => item.id === id) || ALL_LIBRARY_SONGS.find(item => item.id === id);
  if (!s) return;
  currentActionSong = s;
  document.getElementById('sheetSongTitle').textContent = `歌曲：${s.title}`;
  const isFav = !!(s && (s.isFav || ALL_LIBRARY_SONGS.some(item => (item.id === s.id || (item.title === s.title && item.artist === s.artist)) && item.isFav)));
  const favIconEl = document.getElementById('sheetFavIcon');
  const favTextEl = document.getElementById('sheetFavText');
  if (isFav) {
    if (favIconEl) favIconEl.classList.add('is-favorited');
    if (favTextEl) {
      favTextEl.classList.add('is-favorited');
      favTextEl.textContent = '已收藏歌曲';
    }
  } else {
    if (favIconEl) favIconEl.classList.remove('is-favorited');
    if (favTextEl) {
      favTextEl.classList.remove('is-favorited');
      favTextEl.textContent = '收藏歌曲';
    }
  }
  const deleteTextEl = document.getElementById('sheetDeleteText');
  if (deleteTextEl) deleteTextEl.textContent = '从队列移除';
  document.getElementById('songMenuOverlay').classList.add('active');
}

function closeSongMenu() { document.getElementById('songMenuOverlay').classList.remove('active'); }

function triggerSheetAction(action) {
  const s = currentActionSong;
  closeSongMenu();
  if (!s) return;

  if (action === 'delete') {
    if (window._isDrawerMenu) {
      const qIdx = currentPlaybackQueue.findIndex(item => item.id === s.id);
      if (qIdx !== -1) {
        currentPlaybackQueue.splice(qIdx, 1);
        if (currentIndex >= currentPlaybackQueue.length) {
          currentIndex = Math.max(0, currentPlaybackQueue.length - 1);
        }
        renderDrawerList();
        toast(`已从队列移除《${s.title}》`);
      }
      return;
    }

    if (window._isSearchResultMenu) {
      toast('搜索结果未保存在本地，无需删除');
      return;
    }

    const currentAlb = VINYL_ALBUMS[activeRadioIndex];
    const isSpecificSubAlbum = (activeRadioIndex > 0 && currentAlb && currentAlb.id !== 'alb_all');

    const descText = isSpecificSubAlbum
      ? `确定要将《${s.title}》从「${currentAlb.title}」歌单中移出吗？（全部歌曲中仍将保留）`
      : `确定要将《${s.title}》从曲库中彻底删除吗？此操作将同步从所有歌单中清理。`;

    openUniversalConfirm({
      title: isSpecificSubAlbum ? '移出歌单' : '删除歌曲',
      desc: descText,
      confirmText: isSpecificSubAlbum ? '移出' : '删除',
      isDanger: true,
      onConfirm: () => {
        deleteSong(s.id, isSpecificSubAlbum ? currentAlb.id : null);
      }
    });
    return;
  }

  if (action === 'playlist') {
    if (!ALL_LIBRARY_SONGS.some(item => item.id === s.id)) {
      ALL_LIBRARY_SONGS.unshift(s);
      persistData();
    }
    ensureSongCover(s);
    openChoosePlaylistModal();
    return;
  }

  if (action === 'fav') {
    const favAlb = VINYL_ALBUMS.find(a => a.id === 'alb_fav') || VINYL_ALBUMS[1];
    if (!ALL_LIBRARY_SONGS.some(item => item.id === s.id)) {
      s.isFav = true;
      ALL_LIBRARY_SONGS.unshift(s);
      if (favAlb && !favAlb.songs.some(item => item.id === s.id)) {
        favAlb.songs.unshift(s);
      }
      ensureSongCover(s);
      persistData();
      renderSongList();
      updateUI();
      syncCurrentLyricToDesktop();
      toast(`已收藏《${s.title}》`);
    } else {
      toggleSongFav(s.id);
      ensureSongCover(s);
    }
    return;
  }

  if (action === 'share') {
    shareSong(s);
    return;
  }

  if (action === 'next') {
    currentPlaybackQueue.splice(currentIndex + 1, 0, s);
    renderDrawerList();
    toast(`《${s.title}》已插播至下一首`);
    return;
  }

  if (action === 'download') {
    downloadSongFile(s);
    return;
  }

  if (action === 'ringtone') {
    openChooseRingtoneModal(s);
    return;
  }

  if (action === 'extract_cover') {
    openCoverPreviewModal(s);
    return;
  }
}

function openChooseRingtoneModal(song) {
  const modal = document.getElementById('chooseRingtoneModal');
  const titleEl = document.getElementById('chooseRingtoneSongTitle');
  if (titleEl && song) {
    titleEl.textContent = `设为系统铃声 - 《${song.title}》`;
  }
  if (modal) modal.classList.add('active');
}

function closeChooseRingtoneModal(e) {
  if (!e || e.target === e.currentTarget || (e.target && e.target.classList && e.target.classList.contains('choose-playlist-modal'))) {
    const modal = document.getElementById('chooseRingtoneModal');
    if (modal) modal.classList.remove('active');
  }
}

async function confirmSetRingtone(type) {
  const s = currentActionSong;
  closeChooseRingtoneModal();
  if (!s) return;

  if (!window.AndroidBridge || !window.AndroidBridge.setAsRingtone) {
    toast('当前为网页环境，请在 Android 手机客户端中使用设为铃声功能');
    return;
  }

  toast(`正在准备音频并配置系统铃声...`);

  let audioUrl = s.fileUrl || '';
  const onlineId = s.onlineId || (s.id && s.id.startsWith('online_') ? s.id.replace('online_', '') : null);

  if (onlineId) {
    try {
      const source = s.source || 'netease';
      const urlApi = `${currentApiBase}?types=url&id=${onlineId}&source=${source}&br=${currentAudioQuality}`;
      const urlRes = await universalFetch(urlApi, { timeout: 3500 });
      if (urlRes.ok) {
        const uData = await urlRes.json();
        if (uData && uData.url) {
          audioUrl = uData.url;
        }
      }
    } catch(e) {
      console.warn("Resolve audio URL for ringtone failed, trying fallback", e);
    }
  }

  if (!audioUrl) {
    toast(`未能获取《${s.title}》的真实音频地址`);
    return;
  }

  window.AndroidBridge.setAsRingtone(audioUrl, s.title, s.artist || '未知歌手', type);
}

async function downloadSongFile(song) {
  if (!song) return;
  if (!song.fileUrl) {
    toast(`《${song.title}》为系统演示曲目，无实际音频源，请搜索网络歌曲下载`);
    return;
  }

  const safeTitle = (song.title || '未知歌曲').replace(/[\\/:*?"<>|]/g, '_');
  const safeArtist = (song.artist || '未知歌手').replace(/[\\/:*?"<>|]/g, '_');
  const filename = `${safeArtist} - ${safeTitle}.mp3`;

  toast(`正在下载《${song.title}》...`);

  // 1. 获取真实支持 CORS 的 CDN 链接
  let downloadUrl = song.fileUrl;
  const onlineId = song.onlineId || (song.id && song.id.startsWith('online_') ? song.id.replace('online_', '') : null);

  if (onlineId) {
    try {
      const source = song.source || 'netease';
      const urlApi = `${currentApiBase}?types=url&id=${onlineId}&source=${source}&br=${currentAudioQuality}`;
      const urlRes = await universalFetch(urlApi, { timeout: 3500 });
      if (urlRes.ok) {
        const uData = await urlRes.json();
        if (uData && uData.url) {
          downloadUrl = uData.url;
        }
      }
    } catch(e) {
      console.warn("Resolve CDN URL for download failed, trying direct", e);
    }
  }

  // 2. Android App 原生系统下载通道（直接存入手机「下载 (Download)」目录与媒体库）
  if (window.AndroidBridge && window.AndroidBridge.downloadFile) {
    window.AndroidBridge.downloadFile(downloadUrl, filename);
    return;
  }

  // 3. 浏览器环境下的 Blob 下载尝试
  try {
    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error(`HTTP status ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    }, 2000);

    toast(`《${song.title}》已下载完成`);
    return;
  } catch(e) {
    console.warn("Direct blob download failed, falling back to hidden iframe", e);
  }

  // 3. 安全后备下载方式：采用隐藏 iframe 下载，杜绝 a.target = '_blank' 导致整页跳转为黑屏播放器！
  try {
    const ifr = document.createElement('iframe');
    ifr.style.display = 'none';
    ifr.src = downloadUrl;
    document.body.appendChild(ifr);
    setTimeout(() => {
      document.body.removeChild(ifr);
    }, 4000);
    toast(`已发起《${song.title}》下载`);
  } catch(err) {
    toast(`下载受限，请检查网络权限`);
  }
}

function exportCurrentPlaylistJson() {
  const alb = VINYL_ALBUMS[activeRadioIndex];
  if (!alb) return;
  const songsToExport = (alb.songs || []).map(s => ({
    id: s.id,
    onlineId: s.onlineId || undefined,
    source: s.source || undefined,
    title: s.title,
    artist: s.artist,
    album: s.album || '',
    duration: s.duration || 240,
    fileUrl: s.fileUrl || '',
    cover: s.cover || '',
    isFav: !!s.isFav
  }));

  const exportData = {
    app: 'YYRC灵犀音乐',
    version: '3.2',
    exportedAt: new Date().toISOString(),
    playlist: {
      id: alb.id,
      title: alb.title,
      author: alb.author || '灵犀音乐',
      desc: alb.desc || '',
      customCover: alb.customCover || '',
      songs: songsToExport
    }
  };

  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = (alb.title || '歌单').replace(/[\\/:*?"<>|]/g, '_');
  a.href = url;
  a.download = `歌单_${safeName}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  toast(`已导出歌单「${alb.title}」为 JSON 文件`);
}

const shareCurrentPlaylist = exportCurrentPlaylistJson;

function openPlaylistImportDialog() {
  const modal = document.getElementById('playlistImportModal');
  if (!modal) return;
  const nameInput = document.getElementById('importPlaylistNameInput');
  const textInput = document.getElementById('importPlaylistTextInput');
  if (nameInput) nameInput.value = '';
  if (textInput) textInput.value = '';
  modal.classList.add('active');
}

function closePlaylistImportModal(e) {
  if (e && e.target !== document.getElementById('playlistImportModal') && !e.target.closest('.modern-pill-cancel')) return;
  const modal = document.getElementById('playlistImportModal');
  if (modal) modal.classList.remove('active');
}

function executeTextPlaylistImport() {
  const nameInput = document.getElementById('importPlaylistNameInput');
  const textInput = document.getElementById('importPlaylistTextInput');
  const playlistName = (nameInput && nameInput.value.trim()) || `酷狗导入歌单 (${new Date().getMonth() + 1}月${new Date().getDate()}日)`;
  const rawText = (textInput && textInput.value.trim()) || '';

  if (!rawText) {
    toast('请先粘贴歌单文本');
    return;
  }

  const lines = rawText.split('\n');
  const songs = [];

  lines.forEach(line => {
    line = line.trim();
    if (!line) return;
    if (/^https?:\/\/\S+$/i.test(line)) return;

    // 剥离行内包含的 URL 链接
    line = line.replace(/https?:\/\/\S+/gi, '').trim();

    // 剥离酷狗概念版/网易云/QQ音乐常见分享套话
    line = line.replace(/(?:来自@?酷狗概念版|来自@?酷狗音乐|来自@?网易云音乐|来自@?QQ音乐|【来自酷狗音乐】|复制整段话打开酷狗[^）\)]*|完整版点击链接试听[:：]?|分享单曲[:：]?|分享歌单[:：]?|网页链接[:：]?|点击链接[^)]*|链接[:：]?)/gi, '').trim();
    line = line.replace(/[（\(][^）\)]*来自@[^）\)]*[）\)]/gi, '').trim();
    line = line.replace(/[（\(]@?[酷网Q][^）\)]*[）\)]/gi, '').trim();

    // 去除开头的序号 (例如 "1. ", "01、", "1 - ")
    let clean = line.replace(/^\d+[\.、\s\-]+/, '').trim();
    if (!clean) return;

    let title = '';
    let artist = '未知歌手';

    // 提取书名号中的歌名 《xxx》
    const bookMatch = clean.match(/《([^》]+)》/);
    if (bookMatch) {
      title = bookMatch[1].trim();
      let rest = clean.replace(/《[^》]+》/, '').replace(/^[-—/\s]+|[-—/\s]+$/g, '').trim();
      const sharePrefix = rest.match(/分享(.+?)的单曲/);
      if (sharePrefix) {
        artist = sharePrefix[1].trim();
      } else if (rest) {
        artist = rest;
      }
    } else if (clean.includes(' - ')) {
      const parts = clean.split(' - ');
      title = parts[0].trim();
      artist = parts.slice(1).join(' - ').trim();
    } else if (clean.includes(' — ')) {
      const parts = clean.split(' — ');
      title = parts[0].trim();
      artist = parts.slice(1).join(' — ').trim();
    } else if (/\s{2,}/.test(clean)) {
      const parts = clean.split(/\s{2,}/);
      title = parts[0].trim();
      artist = parts.slice(1).join(' ').trim();
    } else if (clean.includes('/')) {
      const parts = clean.split('/');
      title = parts[0].trim();
      artist = parts.slice(1).join('/').trim();
    } else {
      title = clean;
    }

    if (title) {
      title = title.replace(/[《》]/g, '').trim();
      artist = artist ? artist.replace(/[《》()（）]/g, '').replace(/链接[:：]?/g, '').trim() : '未知歌手';
      if (!artist) artist = '未知歌手';

      songs.push({
        id: 'txt_import_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        title: title,
        artist: artist,
        duration: 210,
        isFav: false
      });
    }
  });

  if (!songs.length) {
    toast('未能识别出有效的歌曲内容，请检查文本格式');
    return;
  }

  const newAlbum = {
    id: 'alb_import_' + Date.now(),
    title: playlistName,
    author: '酷狗/外部导入',
    sub: `${songs.length} 首好歌 - 点击进入`,
    hasRose: false,
    songs: songs
  };

  VINYL_ALBUMS.push(newAlbum);

  songs.forEach(track => {
    const exists = ALL_LIBRARY_SONGS.some(s => s.id === track.id || (s.title === track.title && s.artist === track.artist));
    if (!exists) {
      ALL_LIBRARY_SONGS.push(track);
    }
  });

  persistData();
  renderVinylDiscs();
  renderSongList();
  renderDrawerList();

  const newIndex = VINYL_ALBUMS.length - 1;
  scrollVinylToAlbum(newIndex, true);
  closePlaylistImportModal();
  toast(`已成功导入歌单「${playlistName}」，共 ${songs.length} 首歌`);
  openPlaylistDetail(newIndex);
}

async function resolveAndPlayOnlineSong(song, isRetry = false, resumeSec = 0) {
  if (!song) return;
  if (!isRetry) {
    toast(`正在获取《${song.title}》播放源...`);
  }
  keepBackgroundAlive();
  try {
    let audioUrl = '';
    let targetOnlineId = song.onlineId;
    let targetSource = song.source || 'netease';

    // 1. 如果已有 onlineId，优先直接解析
    if (targetOnlineId) {
      if (currentApiBase.includes('injahow')) {
        audioUrl = `https://api.injahow.cn/meting/?server=${targetSource}&type=url&id=${targetOnlineId}`;
      } else {
        try {
          const urlApi = `${currentApiBase}?types=url&id=${targetOnlineId}&source=${targetSource}&br=${currentAudioQuality}`;
          const uRes = await universalFetch(urlApi, { timeout: 4500 });
          if (uRes.ok) {
            const uData = await uRes.json();
            if (uData && uData.url && typeof uData.url === 'string' && uData.url.startsWith('http')) {
              audioUrl = uData.url;
            }
          }
        } catch(e) {
          console.warn("主接口响应超时或失败，自动切换高可用通道:", e);
        }

        // 若主接口未能解析（服务器宕机或超时），无缝自动走高可用 Meting 镜像通道
        if (!audioUrl && !isRetry) {
          audioUrl = `https://api.injahow.cn/meting/?server=${targetSource}&type=url&id=${targetOnlineId}`;
        }
      }
    }

    // 2. 如果无 onlineId，或者已有 ID 在重试时解析失败，执行多源全网检索匹配（QQ/网易/酷狗跨平台互备）
    if (!audioUrl || isRetry) {
      const query = `${song.title} ${song.artist !== '未知歌手' ? song.artist : ''}`.trim();
      try {
        const matches = await requestOnlineSearch(query, 5);
        if (matches && matches.length) {
          for (const item of matches) {
            const candId = item.url_id || item.id;
            const candSource = item.source || 'netease';
            if (candId && (candId !== targetOnlineId || candSource !== targetSource)) {
              if (!currentApiBase.includes('injahow')) {
                try {
                  const candUrlApi = `${currentApiBase}?types=url&id=${candId}&source=${candSource}&br=${currentAudioQuality}`;
                  const cRes = await universalFetch(candUrlApi, { timeout: 4000 });
                  if (cRes.ok) {
                    const cData = await cRes.json();
                    if (cData && cData.url && typeof cData.url === 'string' && cData.url.startsWith('http')) {
                      audioUrl = cData.url;
                    }
                  }
                } catch(e) {}
              }
              if (!audioUrl) {
                audioUrl = `https://api.injahow.cn/meting/?server=${candSource}&type=url&id=${candId}`;
              }
              if (audioUrl) {
                targetOnlineId = candId;
                targetSource = candSource;
                song.onlineId = targetOnlineId;
                song.source = targetSource;
                if (item.cover && !song.cover) song.cover = item.cover;
                break;
              }
            }
          }
        }
      } catch(e) {
        console.warn("在线检索匹配失败:", e);
      }
    }

    if (!audioUrl) {
      if (currentPlaybackQueue.length > 1) {
        toast(`《${song.title}》暂未获取到可用音源，自动播放下一首...`);
        setTimeout(() => playNext(), 1200);
      } else {
        toast(`《${song.title}》暂未获取到可用音源`);
        isPlaying = false;
        updateUI();
      }
      return;
    }

    // 3. 记录有效播放地址与获取时间戳
    song.fileUrl = audioUrl;
    song.urlFetchedAt = Date.now();
    persistData();

    // 4. 歌词与封面联动拉取
    if (targetOnlineId) {
      fetchLyricForSong(targetOnlineId, song.title, targetSource);
      if (!song.cover) {
        song.cover = `https://api.injahow.cn/meting/?server=${targetSource}&type=pic&id=${targetOnlineId}`;
        applySongCoverToUI(song.cover);
      }
    }

    // 5. 播放音频流
    stopPlaybackLoop();
    keepBackgroundAlive();
    const startSeek = (typeof resumeSec === 'number' && resumeSec > 0) ? resumeSec : 0;
    if (isNativeAudioSupported) {
      if (audioPlayer && !audioPlayer.paused) {
        try { audioPlayer.pause(); } catch(e) {}
      }
      window.AndroidBridge.playNativeAudio(audioUrl, startSeek);
      isPlaying = true;
      if (startSeek > 0) {
        currentSec = startSeek;
        syncProgress();
        updateLyricProgressSmooth();
      }
      songRetryCounts[song.id] = 0;
      updateUI();
    } else {
      audioPlayer.src = audioUrl;
      audioPlayer.load();
      audioPlayer.currentTime = startSeek;
      const playPromise = audioPlayer.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          isPlaying = true;
          if (startSeek > 0) {
            currentSec = startSeek;
            syncProgress();
            updateLyricProgressSmooth();
          }
          songRetryCounts[song.id] = 0;
          updateUI();
        }).catch(err => {
          console.warn("Autoplay block or user interaction required:", err);
        });
      }
    }

    updateMediaSession(song);
    updateUI();
  } catch(err) {
    console.warn("Online resolve failed:", err);
    if (currentPlaybackQueue.length > 1) {
      toast(`《${song.title}》网络流解析异常，自动播放下一首...`);
      setTimeout(() => playNext(), 1200);
    } else {
      toast(`《${song.title}》网络流解析异常，可在设置中更换接口`);
      isPlaying = false;
      updateUI();
    }
  }
}

// 自动拦截试听片段并跨平台检索全长无损版本（QQ音乐/酷狗备用源）
async function tryResolveAlternativeFullTrack(song) {
  if (!song || song.isLocal) return;
  toast(`检测到《${song.title}》为试听片段，正在跨平台匹配全长完整版...`);

  const currentSrc = song.source || 'netease';
  const alternativeServers = ['tencent', 'kugou', 'netease'].filter(s => s !== currentSrc);
  const query = `${song.title} ${song.artist !== '未知歌手' ? song.artist : ''}`.trim();
  const encodedQuery = encodeURIComponent(query);

  for (const altServer of alternativeServers) {
    try {
      const searchUrl = `https://api.i-meto.com/meting/api?server=${altServer}&type=search&id=${encodedQuery}`;
      const res = await universalFetch(searchUrl, { timeout: 3500 });
      if (!res.ok) continue;
      const list = await res.json();
      if (!Array.isArray(list) || list.length === 0) continue;

      const trialKeywords = ['试听', '片段', '铃声', '30s', '30秒', '副歌', '高潮版', '截取'];
      const candidate = list.find(item => {
        const t = (item.name || item.title || '').toLowerCase();
        return !trialKeywords.some(k => t.includes(k));
      }) || list[0];

      if (!candidate) continue;

      const altId = candidate.url_id || candidate.id || (candidate.url && candidate.url.match(/[?&]id=([^&]+)/)?.[1]);
      if (!altId || altId === song.onlineId) continue;

      const altAudioUrl = `https://api.injahow.cn/meting/?server=${altServer}&type=url&id=${altId}`;
      
      song.onlineId = altId;
      song.source = altServer;
      song.fileUrl = altAudioUrl;
      song.urlFetchedAt = Date.now();
      if (candidate.pic || candidate.cover) song.cover = candidate.pic || candidate.cover;
      persistData();

      fetchLyricForSong(altId, song.title, altServer);

      const wasPlaying = isPlaying;
      const curSec = (typeof currentSec === 'number' && currentSec > 0) ? currentSec : 0;
      if (isNativeAudioSupported) {
        if (audioPlayer && !audioPlayer.paused) {
          try { audioPlayer.pause(); } catch(e) {}
        }
        keepBackgroundAlive();
        window.AndroidBridge.playNativeAudio(altAudioUrl, curSec);
        isPlaying = true;
        updateUI();
      } else {
        audioPlayer.src = altAudioUrl;
        audioPlayer.load();
        audioPlayer.currentTime = curSec;
        if (wasPlaying) {
          audioPlayer.play().catch(e => console.warn("Alt track play failed", e));
        }
      }
      toast(`已成功切换至《${song.title}》完整版`);
      return;
    } catch(err) {
      console.warn("Alternative track search failed for", altServer, err);
    }
  }
  toast(`《${song.title}》全网暂无免费完整版本，仅有试听片段`);
}

