/* ================== 光碟与歌单交互 ================== */
function getAlbumCover(alb) {
  if (!alb) return '';
  if (alb.customCover) return alb.customCover;
  if (alb.songs && alb.songs.length > 0) {
    const songWithCover = alb.songs.find(s => s && s.cover && typeof s.cover === 'string' && s.cover.startsWith('http'));
    if (songWithCover) return songWithCover.cover;
  }
  return '';
}

function renderVinylDiscs() {
  const container = document.getElementById('vinylDiscStream');
  if (!container) return;
  if (!topRecommendedTracks || topRecommendedTracks.length === 0) {
    initTopRecommendedTracks();
  }

  const curPlayingSong = currentPlaybackQueue[currentIndex];

  container.innerHTML = topRecommendedTracks.map((song, idx) => {
    const isThisPlaying = isPlaying && curPlayingSong && (
      curPlayingSong.id === 'online_' + song.id || 
      (curPlayingSong.title === (song.name || song.title) && curPlayingSong.artist === song.artist)
    );
    const coverUrl = song.cover || song.pic || '';
    return `
      <div class="vinyl-stream-card" onclick="handleStreamCardClick(${idx})">
        <div class="stream-disc ${isThisPlaying ? 'playing' : ''}" id="streamDisc${idx}" style="position:relative; overflow:hidden;">
          <div class="stream-disc-core" style="${coverUrl ? 'display:none;' : ''}">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
            </svg>
          </div>
          ${coverUrl ? `
            <img class="stream-disc-cover-img" src="${coverUrl}" alt="" loading="lazy"
              onload="const core=this.previousElementSibling; if(core) core.style.display='none';"
              onerror="this.style.display='none'; const core=this.previousElementSibling; if(core) core.style.display='flex';"
              style="position:absolute; inset:0; width:100%; height:100%; border-radius:50%; object-fit:cover; pointer-events:none; z-index:2;" />
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function updateFixedRadioCardUI() {
  if (!topRecommendedTracks || topRecommendedTracks.length === 0) {
    initTopRecommendedTracks();
  }

  const curPlayingSong = currentPlaybackQueue[currentIndex];
  const target = topRecommendedTracks[activeTopTrackIndex];
  if (!target) return;

  const isTargetPlaying = isPlaying && curPlayingSong && isSameSongIdentifier(curPlayingSong, target);

  const titleEl = document.getElementById('dynamicCardTitle');
  if (titleEl) {
    titleEl.textContent = formatCleanTitle(target.name || target.title || '灵犀推荐');
  }

  const subEl = document.getElementById('dynamicCardSub');
  if (subEl) {
    const cleanArt = formatCleanArtist(target.artist);
    subEl.textContent = `${cleanArt} - 灵犀心选`;
  }

  const radioPlayBtn = document.getElementById('radioPlayBtnCircle');
  if (radioPlayBtn) {
    const pauseSvg = '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="3.5" height="16" fill="currentColor"/><rect x="14.5" y="4" width="3.5" height="16" fill="currentColor"/></svg>';
    const playSvg = '<svg viewBox="0 0 24 24"><polygon points="7 4 20 12 7 20 7 4"/></svg>';
    radioPlayBtn.innerHTML = isTargetPlaying ? pauseSvg : playSvg;
  }

  const card = document.querySelector('.fixed-radio-card');
  if (card) {
    card.classList.toggle('playing', isPlaying);
  }

  const coverUrl = target.cover || target.pic || '';
  extractCardGlowColor(coverUrl);
}

function extractCardGlowColor(imgUrl) {
  const card = document.querySelector('.fixed-radio-card');
  if (!card) return;
  const setDefaultGlow = () => {
    card.style.setProperty('--card-glow-1', 'rgba(75, 180, 220, 0.85)');
    card.style.setProperty('--card-glow-2', 'rgba(245, 165, 125, 0.78)');
    card.style.setProperty('--card-glow-3', 'rgba(145, 205, 250, 0.72)');
  };

  if (!imgUrl) {
    setDefaultGlow();
    return;
  }

  const img = new Image();
  img.crossOrigin = 'Anonymous';
  img.onload = function() {
    try {
      const cvs = document.createElement('canvas');
      cvs.width = 16; cvs.height = 16;
      const ctx = cvs.getContext('2d');
      ctx.drawImage(img, 0, 0, 16, 16);
      const data = ctx.getImageData(0, 0, 16, 16).data;
      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      for (let i = 0; i < data.length; i += 16) {
        rSum += data[i]; gSum += data[i+1]; bSum += data[i+2]; count++;
      }
      const r = rSum / count;
      const g = gSum / count;
      const b = bSum / count;

      // 转换为 HSL 并校准饱和度与高明度，确保呈现纯净、通透的宣纸水粉轻云质感，绝不浑浊
      const rNorm = r / 255, gNorm = g / 255, bNorm = b / 255;
      const max = Math.max(rNorm, gNorm, bNorm), min = Math.min(rNorm, gNorm, bNorm);
      let h = 0, s = 0, l = (max + min) / 2;
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case rNorm: h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0); break;
          case gNorm: h = (bNorm - rNorm) / d + 2; break;
          case bNorm: h = (rNorm - gNorm) / d + 4; break;
        }
        h = Math.round(h * 60);
      }

      // 保持清透雅致的浅云色温
      const hue1 = h;
      const hue2 = (h + 38) % 360;
      const hue3 = (h + 312) % 360;
      const sat = Math.max(65, Math.min(90, Math.round(s * 100) || 75));
      const light = 66; // 66% 饱满通透明亮，流转流动感极强

      card.style.setProperty('--card-glow-1', `hsla(${hue1}, ${sat}%, ${light}%, 0.88)`);
      card.style.setProperty('--card-glow-2', `hsla(${hue2}, ${sat}%, ${light + 4}%, 0.78)`);
      card.style.setProperty('--card-glow-3', `hsla(${hue3}, ${sat}%, ${light - 2}%, 0.72)`);
    } catch(e) {
      setDefaultGlow();
    }
  };
  img.onerror = setDefaultGlow;
  img.src = imgUrl;
}

let isProgrammaticVinylScroll = false;
let programmaticVinylScrollTimer = null;

function scrollVinylToTrack(idx, smooth = true) {
  const channel = document.getElementById('vinylScrollChannel');
  if (!channel) return;
  const count = topRecommendedTracks ? topRecommendedTracks.length : 1;
  const validIdx = Math.min(count - 1, Math.max(0, idx));
  activeTopTrackIndex = validIdx;
  const targetLeft = validIdx * 108;

  isProgrammaticVinylScroll = true;
  if (programmaticVinylScrollTimer) clearTimeout(programmaticVinylScrollTimer);
  programmaticVinylScrollTimer = setTimeout(() => {
    isProgrammaticVinylScroll = false;
  }, 380);

  if (smooth && document.visibilityState === 'visible') {
    try {
      channel.scrollTo({
        left: targetLeft,
        behavior: 'smooth'
      });
    } catch(e) {
      channel.scrollLeft = targetLeft;
    }
  } else {
    channel.scrollLeft = targetLeft;
  }

  updateFixedRadioCardUI();
}

function handleStreamCardClick(idx) {
  playTopRecommendedTrack(idx, false);
}

function handleVinylScroll(el) {
  if (isProgrammaticVinylScroll) return;
  const step = 108;
  const count = topRecommendedTracks ? topRecommendedTracks.length : 1;
  const newIdx = Math.min(count - 1, Math.max(0, Math.round(el.scrollLeft / step)));
  if (newIdx !== activeTopTrackIndex) {
    activeTopTrackIndex = newIdx;
    updateFixedRadioCardUI();
  }
  if (newIdx >= count - 3) {
    if (typeof ensureMoreRecommendationsSilently === 'function') {
      ensureMoreRecommendationsSilently(true);
    }
  }
}

function openCurrentRadioAlbum() {
  const target = topRecommendedTracks[activeTopTrackIndex];
  if (!target) return;
  const curPlayingSong = currentPlaybackQueue[currentIndex];
  const isCurrentTarget = curPlayingSong && isSameSongIdentifier(curPlayingSong, target);

  if (isCurrentTarget) {
    openPlayerFull();
  } else {
    playTopRecommendedTrack(activeTopTrackIndex, true);
  }
}

function togglePlayCurrentRadioAlbum() {
  const target = topRecommendedTracks[activeTopTrackIndex];
  if (!target) return;
  const curPlayingSong = currentPlaybackQueue[currentIndex];
  const isCurrentTarget = curPlayingSong && isSameSongIdentifier(curPlayingSong, target);

  if (isCurrentTarget) {
    togglePlayState();
  } else {
    playTopRecommendedTrack(activeTopTrackIndex, false);
  }
}

function playTopRecommendedTrack(idx, openFull = true) {
  if (!topRecommendedTracks || !topRecommendedTracks[idx]) return;
  scrollVinylToTrack(idx, true);

  isDiscoverRecommendationQueue = true;

  // 将顶部推荐曲目与发现页所有板块歌曲合并，构建完整播放队列
  const queue = topRecommendedTracks.map((song, sIdx) => convertSongToQueueTrack(song, sIdx));

  (currentDiscoverSongs || []).forEach(dSong => {
    const exists = queue.some(q => isSameSongIdentifier(q, dSong));
    if (!exists) {
      queue.push(convertSongToQueueTrack(dSong, -1));
    }
  });

  currentPlaybackQueue = queue;
  currentIndex = idx;
  if (openFull) {
    openPlayerFull();
  }
  playSongAtQueue(idx);

  // 接近末尾时静默预加载
  if (idx >= currentPlaybackQueue.length - 3 || idx >= (topRecommendedTracks.length - 3)) {
    if (typeof ensureMoreRecommendationsSilently === 'function') {
      ensureMoreRecommendationsSilently();
    }
  }
}

/* ================== 乐库歌单切换与播放（第二页：我的曲库） ================== */
function scrollVinylToAlbum(idx, smooth = true) {
  activeRadioIndex = Math.min(VINYL_ALBUMS.length - 1, Math.max(0, idx));
  renderLibraryAlbumPills();
  renderSongList();
}

function togglePlayCurrentLibraryAlbum() {
  if (typeof isGhostClickBlocked === 'function' && isGhostClickBlocked()) return;
  const overlay = document.getElementById('createPlaylistModalOverlay');
  if (overlay && overlay.classList.contains('active')) return;
  const alb = VINYL_ALBUMS[activeRadioIndex];
  if (!alb || !alb.songs || alb.songs.length === 0) {
    toast('当前歌单暂无歌曲');
    return;
  }
  if (currentPlayingAlbumIndex === activeRadioIndex && isPlaying) {
    togglePlayState();
  } else {
    isDiscoverRecommendationQueue = false;
    currentPlayingAlbumIndex = activeRadioIndex;
    currentPlaybackQueue = [...alb.songs];
    openPlayerFull();
    playSongAtQueue(0);
    toast(`开始播放「${alb.title}」`);
  }
}

function playCurrentRadioAlbum() {
  togglePlayCurrentLibraryAlbum();
}

function playCuratedPlaylist() {
  togglePlayCurrentLibraryAlbum();
}

/* ================== 歌单多选管理系统（方框复选，绝无圆形选中效果） ================== */
let isMultiSelectActive = false;
let selectedSongIndices = new Set();

function enterMultiSelectMode() {
  const alb = VINYL_ALBUMS[activeRadioIndex];
  if (!alb || !alb.songs || alb.songs.length === 0) {
    toast('歌单暂无歌曲可供多选');
    return;
  }
  isMultiSelectActive = true;
  selectedSongIndices.clear();
  const detailView = document.getElementById('viewPlaylistDetail');
  if (detailView) detailView.classList.add('multi-mode');
  const normalBar = document.getElementById('playlistNormalControlBar');
  if (normalBar) normalBar.style.display = 'none';
  const multiBar = document.getElementById('playlistMultiControlBar');
  if (multiBar) multiBar.style.display = 'flex';
  const dock = document.getElementById('multiSelectActionDock');
  if (dock) dock.classList.add('active');
  updateMultiSelectUI();
  renderPlaylistDetailSongsOnly();
}

function exitMultiSelectMode() {
  isMultiSelectActive = false;
  selectedSongIndices.clear();
  window._batchAddSongs = null;
  const detailView = document.getElementById('viewPlaylistDetail');
  if (detailView) detailView.classList.remove('multi-mode');
  const normalBar = document.getElementById('playlistNormalControlBar');
  if (normalBar) normalBar.style.display = 'flex';
  const multiBar = document.getElementById('playlistMultiControlBar');
  if (multiBar) multiBar.style.display = 'none';
  const dock = document.getElementById('multiSelectActionDock');
  if (dock) dock.classList.remove('active');
  renderPlaylistDetailSongsOnly();
}

function enterHomeMultiSelectMode() {
  const alb = VINYL_ALBUMS[activeRadioIndex];
  if (!alb || !alb.songs || alb.songs.length === 0) {
    toast('当前曲目库暂无歌曲可供多选');
    return;
  }
  isMultiSelectActive = true;
  selectedSongIndices.clear();
  const panel = document.querySelector('.song-list-panel');
  if (panel) panel.classList.add('multi-mode');
  const normalHeader = document.getElementById('homeNormalHeader');
  if (normalHeader) normalHeader.style.display = 'none';
  const multiHeader = document.getElementById('homeMultiHeader');
  if (multiHeader) multiHeader.style.display = 'flex';
  const dock = document.getElementById('homeMultiSelectActionDock');
  if (dock) dock.classList.add('active');
  updateMultiSelectUI();
  renderSongList();
}

function exitHomeMultiSelectMode() {
  isMultiSelectActive = false;
  selectedSongIndices.clear();
  window._batchAddSongs = null;
  const panel = document.querySelector('.song-list-panel');
  if (panel) panel.classList.remove('multi-mode');
  const normalHeader = document.getElementById('homeNormalHeader');
  if (normalHeader) normalHeader.style.display = 'flex';
  const multiHeader = document.getElementById('homeMultiHeader');
  if (multiHeader) multiHeader.style.display = 'none';
  const dock = document.getElementById('homeMultiSelectActionDock');
  if (dock) dock.classList.remove('active');
  renderSongList();
}

function isSongUnorganized(song) {
  if (!song) return false;
  if (song.isFav) return false;
  const favAlb = VINYL_ALBUMS.find(a => a.id === 'alb_fav');
  if (favAlb && favAlb.songs && favAlb.songs.some(s => s.id === song.id || (s.title === song.title && s.artist === song.artist))) {
    return false;
  }
  const customAlbums = VINYL_ALBUMS.filter(a => a.id !== 'alb_all' && a.id !== 'alb_fav');
  for (const a of customAlbums) {
    if (a.songs && a.songs.some(s => s.id === song.id || (s.title === song.title && s.artist === song.artist))) {
      return false;
    }
  }
  return true;
}

function getUnorganizedSongIndices(alb) {
  if (!alb || !alb.songs) return [];
  const indices = [];
  alb.songs.forEach((s, idx) => {
    if (isSongUnorganized(s)) indices.push(idx);
  });
  return indices;
}

function toggleSelectAllSongs() {
  const alb = VINYL_ALBUMS[activeRadioIndex];
  if (!alb || !alb.songs || alb.songs.length === 0) return;

  const isAllAlbum = (alb.id === 'alb_all');
  const unorganizedIndices = isAllAlbum ? getUnorganizedSongIndices(alb) : [];

  if (isAllAlbum) {
    const allSelected = (selectedSongIndices.size === alb.songs.length);
    const unorganizedAllSelected = (unorganizedIndices.length > 0 &&
      selectedSongIndices.size === unorganizedIndices.length &&
      unorganizedIndices.every(idx => selectedSongIndices.has(idx)));

    if (allSelected) {
      // 态 3 -> 取消全选
      selectedSongIndices.clear();
      toast('已取消全选');
    } else if (unorganizedAllSelected) {
      // 态 2 -> 全选全部歌曲
      selectedSongIndices.clear();
      alb.songs.forEach((_, idx) => selectedSongIndices.add(idx));
      toast(`已全选 ${alb.songs.length} 首歌曲`);
    } else {
      // 态 1 -> 优先全选未整理歌曲
      if (unorganizedIndices.length > 0) {
        selectedSongIndices.clear();
        unorganizedIndices.forEach(idx => selectedSongIndices.add(idx));
        toast(`已勾选 ${unorganizedIndices.length} 首未整理歌曲`);
      } else {
        selectedSongIndices.clear();
        alb.songs.forEach((_, idx) => selectedSongIndices.add(idx));
        toast(`已全选 ${alb.songs.length} 首歌曲`);
      }
    }
  } else {
    // 普通歌单：常规全选 / 取消全选
    if (selectedSongIndices.size === alb.songs.length) {
      selectedSongIndices.clear();
    } else {
      selectedSongIndices.clear();
      alb.songs.forEach((_, idx) => selectedSongIndices.add(idx));
    }
  }

  updateMultiSelectUI();
  if (document.getElementById('viewPlaylistDetail').classList.contains('active')) {
    renderPlaylistDetailSongsOnly();
  } else {
    renderSongList();
  }
}

const toggleHomeSelectAllSongs = toggleSelectAllSongs;

function toggleSongSelection(sIdx) {
  if (selectedSongIndices.has(sIdx)) {
    selectedSongIndices.delete(sIdx);
  } else {
    selectedSongIndices.add(sIdx);
  }
  updateMultiSelectUI();
  if (document.getElementById('viewPlaylistDetail').classList.contains('active')) {
    renderPlaylistDetailSongsOnly();
  } else {
    renderSongList();
  }
}

function updateMultiSelectUI() {
  const alb = VINYL_ALBUMS[activeRadioIndex];
  const count = selectedSongIndices.size;
  const isAll = (alb && alb.id === 'alb_all');
  const removeLabel = isAll ? '删除歌曲' : '移出歌单';
  const hasSelection = count > 0;
  const unorganizedIndices = isAll ? getUnorganizedSongIndices(alb) : [];

  let selectBtnLabel = '全选';
  if (alb && alb.songs && alb.songs.length > 0) {
    if (count === alb.songs.length) {
      selectBtnLabel = '取消全选';
    } else if (isAll) {
      const isUnorgSelected = (unorganizedIndices.length > 0 &&
        count === unorganizedIndices.length &&
        unorganizedIndices.every(idx => selectedSongIndices.has(idx)));
      if (isUnorgSelected) {
        selectBtnLabel = '全选';
      } else {
        selectBtnLabel = (unorganizedIndices.length > 0) ? '选未整理' : '全选';
      }
    }
  }

  // 1. 歌单详情页内多选控件
  const countEl = document.getElementById('multiSelectedCountText');
  if (countEl) countEl.textContent = `已选 ${count} 首`;
  const toggleBtn = document.getElementById('multiSelectAllToggleBtn');
  if (toggleBtn) toggleBtn.textContent = selectBtnLabel;
  const removeBtnText = document.getElementById('multiDockRemoveBtnText');
  if (removeBtnText) removeBtnText.textContent = removeLabel;
  const nextBtn = document.getElementById('multiDockPlayNextBtn');
  const addBtn = document.getElementById('multiDockAddPlaylistBtn');
  const removeBtn = document.getElementById('multiDockRemoveBtn');
  if (nextBtn) nextBtn.classList.toggle('disabled', !hasSelection);
  if (addBtn) addBtn.classList.toggle('disabled', !hasSelection);
  if (removeBtn) removeBtn.classList.toggle('disabled', !hasSelection);

  // 2. 首页私人专属曲目多选控件
  const homeCountEl = document.getElementById('homeMultiSelectedCountText');
  if (homeCountEl) homeCountEl.textContent = `已选 ${count} 首`;
  const homeToggleBtn = document.getElementById('homeMultiSelectAllToggleBtn');
  if (homeToggleBtn) homeToggleBtn.textContent = selectBtnLabel;
  const homeRemoveBtnText = document.getElementById('homeMultiDockRemoveBtnText');
  if (homeRemoveBtnText) homeRemoveBtnText.textContent = removeLabel;
  const homeNextBtn = document.getElementById('homeMultiDockPlayNextBtn');
  const homeAddBtn = document.getElementById('homeMultiDockAddPlaylistBtn');
  const homeRemoveBtn = document.getElementById('homeMultiDockRemoveBtn');
  if (homeNextBtn) homeNextBtn.classList.toggle('disabled', !hasSelection);
  if (homeAddBtn) homeAddBtn.classList.toggle('disabled', !hasSelection);
  if (homeRemoveBtn) homeRemoveBtn.classList.toggle('disabled', !hasSelection);
}

function handleHomeSongClick(sIdx) {
  if (isMultiSelectActive) {
    toggleSongSelection(sIdx);
  } else {
    playSongFromActivePlaylist(sIdx);
  }
}

function handlePlaylistSongClick(sIdx) {
  if (isMultiSelectActive) {
    toggleSongSelection(sIdx);
  } else {
    playSongFromAlbum(sIdx);
  }
}

function executeBatchPlayNext() {
  if (selectedSongIndices.size === 0) {
    toast('请先选择要操作的歌曲');
    return;
  }
  const alb = VINYL_ALBUMS[activeRadioIndex];
  if (!alb || !alb.songs) return;
  const selectedSongs = Array.from(selectedSongIndices).sort((a,b)=>a-b).map(i => alb.songs[i]).filter(Boolean);
  currentPlaybackQueue.splice(currentIndex + 1, 0, ...selectedSongs);
  renderDrawerList();
  toast(`已将 ${selectedSongs.length} 首歌曲添加至下一首播放`);
  exitMultiSelectMode();
  exitHomeMultiSelectMode();
}

function executeBatchAddToPlaylist() {
  if (selectedSongIndices.size === 0) {
    toast('请先选择要操作的歌曲');
    return;
  }
  const alb = VINYL_ALBUMS[activeRadioIndex];
  if (!alb || !alb.songs) return;
  window._batchAddSongs = Array.from(selectedSongIndices).sort((a,b)=>a-b).map(i => alb.songs[i]).filter(Boolean);
  openChoosePlaylistModal();
}

function executeBatchRemoveFromPlaylist() {
  if (selectedSongIndices.size === 0) {
    toast('请先选择要操作的歌曲');
    return;
  }
  const alb = VINYL_ALBUMS[activeRadioIndex];
  if (!alb || !alb.songs) return;
  const count = selectedSongIndices.size;
  const isAll = (alb.id === 'alb_all');

  openUniversalConfirm({
    title: isAll ? '批量删除歌曲' : '批量移出歌曲',
    desc: isAll
      ? `确定要将选中的 ${count} 首歌曲从全部曲库中彻底删除吗？此操作将同步从所有歌单中清理。`
      : `确定要将选中的 ${count} 首歌曲从「${alb.title}」中移出吗？（全部歌曲中仍将保留）`,
    confirmText: isAll ? '删除' : '移出',
    isDanger: true,
    onConfirm: () => {
      const toRemoveIndices = new Set(selectedSongIndices);
      const toRemoveSongs = Array.from(toRemoveIndices).map(i => alb.songs[i]).filter(Boolean);
      if (isAll) {
        const toRemoveIds = new Set(toRemoveSongs.map(s => s.id));
        ALL_LIBRARY_SONGS = ALL_LIBRARY_SONGS.filter(s => !toRemoveIds.has(s.id));
        VINYL_ALBUMS.forEach(a => {
          if (a.songs) a.songs = a.songs.filter(s => !toRemoveIds.has(s.id));
        });
        currentPlaybackQueue = currentPlaybackQueue.filter(s => !toRemoveIds.has(s.id));
        persistData();
        toast(`已从曲库删除 ${count} 首歌曲`);
      } else {
        alb.songs = alb.songs.filter((s, idx) => !toRemoveIndices.has(idx));
        persistData();
        toast(`已移出 ${count} 首歌曲`);
      }
      exitMultiSelectMode();
      exitHomeMultiSelectMode();
      renderSongList();
      renderDrawerList();
      updateUI();
    }
  });
}

/* 打开歌单详情：根据是否包含玫瑰花动态切换封面展示 */
function renderPlaylistDetailSongsOnly() {
  const alb = VINYL_ALBUMS[activeRadioIndex];
  const pSongsBox = document.getElementById('playlistSongsBox');
  if (!alb || !pSongsBox) return;

  const curPlayingSong = currentPlaybackQueue[currentIndex];

  if (!alb.songs || alb.songs.length === 0) {
    if (alb.id === 'alb_local') {
      pSongsBox.innerHTML = `
        <div style="padding: 42px 20px; text-align: center; color: var(--ink-light);">
          <div style="font-size: 14.5px; font-weight: 500; margin-bottom: 8px; color: var(--ink-dark);">本地歌曲库暂空</div>
          <div style="font-size: 12px; line-height: 1.5; margin-bottom: 18px; color: var(--ink-gray);">可一键自动扫描手机内音频，或手动选取音频文件</div>
          <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
            <button onclick="scanDeviceLocalMusic()" style="background:var(--brand-blue); color:#FFFFFF; border:none; padding:8px 18px; border-radius:20px; font-size:12.5px; font-weight:500; cursor:pointer;">扫描手机音乐</button>
            <button onclick="triggerFileImport()" style="background:var(--pinned-bg, #EDEDEB); color:var(--ink-dark); border:none; padding:8px 18px; border-radius:20px; font-size:12.5px; font-weight:500; cursor:pointer;">手动选择文件</button>
          </div>
        </div>
      `;
    } else {
      pSongsBox.innerHTML = `
        <div style="padding: 42px 20px; text-align: center; color: var(--ink-light);">
          <div style="font-size: 14.5px; font-weight: 500; margin-bottom: 8px; color: var(--ink-dark);">歌单暂无曲目</div>
          <div style="font-size: 12px; line-height: 1.5; margin-bottom: 18px; color: var(--ink-gray);">可通过全网检索添加或粘贴外部歌单</div>
          <button onclick="openSearchView()" style="background:var(--brand-red); color:#FFFFFF; border:none; padding:8px 20px; border-radius:20px; font-size:12.5px; font-weight:500; cursor:pointer;">去搜索歌曲</button>
        </div>
      `;
    }
  } else {
    pSongsBox.innerHTML = alb.songs.map((s, sIdx) => {
      const isCurPlaying = curPlayingSong && (s.id === curPlayingSong.id) && isPlaying;
      const isSelected = selectedSongIndices.has(sIdx);
      const coverUrl = s.cover || '';
      return `
        <div class="song-row ${isCurPlaying ? 'playing' : ''} ${isSelected ? 'selected' : ''}" data-song-id="${escapeHtml(s.id || '')}" data-song-idx="${sIdx}" onclick="handlePlaylistSongClick(${sIdx})">
          <div class="multi-select-check-box" onclick="event.stopPropagation(); toggleSongSelection(${sIdx})">
            <svg viewBox="0 0 24 24" class="multi-check-svg"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div class="song-cover-mini" data-song-id="${escapeHtml(s.id || '')}" data-cover="${escapeHtml(coverUrl)}" onclick="event.stopPropagation(); if(isMultiSelectActive){toggleSongSelection(${sIdx});}else{playSongFromAlbumAndOpenDetail(${sIdx});}" title="${isMultiSelectActive ? '勾选歌曲' : '点击查看详情'}">
            <div class="static-icon">
              <svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            </div>
            ${(useExtractedCover && coverUrl) ? `
              <img src="${coverUrl}" class="song-cover-thumb" alt="cover" onerror="this.remove()">
            ` : ''}
            <div class="playing-bars"><div class="bar"></div><div class="bar"></div><div class="bar"></div></div>
          </div>
          <div class="song-info"><div class="song-title">${s.title}</div><div class="song-artist">${s.artist}</div></div>
          <div class="song-actions-cluster">
            ${(alb.id === 'alb_fav' || alb.hasRose) ? '' : `
            <div class="fav-btn ${s.isFav ? 'active' : ''}" data-song-id="${s.id}" onclick="event.stopPropagation(); toggleSongFav('${s.id}', this, event)">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="${s.isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.4"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </div>`}
            <div class="more-dots-btn" onclick="openSongMenu(event, ${sIdx})">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
                <circle cx="12" cy="7" r="2.2"></circle>
                <circle cx="12" cy="17" r="2.2"></circle>
              </svg>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
}

function openPlaylistDetailInMultiSelect() {
  openPlaylistDetail(activeRadioIndex);
  enterMultiSelectMode();
}

function openPlaylistDetail(idx) {
  exitMultiSelectMode();
  exitHomeMultiSelectMode();
  activeRadioIndex = idx;
  const alb = VINYL_ALBUMS[idx];
  document.getElementById('heroTitle').textContent = alb.title;
  document.getElementById('heroAuthor').textContent = alb.author;
  document.getElementById('heroTrackCount').textContent = '(' + (alb.songs ? alb.songs.length : 0) + '首)';
  const descEl = document.getElementById('heroDesc');
  if (descEl) {
    descEl.textContent = alb.desc || '';
    descEl.style.display = alb.desc ? 'block' : 'none';
  }

  // 动态作者头像 SVG：灵犀音乐专属线条猫咪(452985)，我的歌单专属陶土线条猫咪(524392)
  const dotEl = document.getElementById('heroCreatorDot');
  if (dotEl) {
    if (alb.id === 'alb_all' || alb.author === '灵犀音乐' || alb.author === '灵犀') {
      dotEl.className = 'creator-avatar-dot lingxi';
      dotEl.innerHTML = LINGXI_CAT_AVATAR_SVG;
    } else if (alb.id === 'alb_fav' || alb.author === '我' || (alb.id && alb.id.startsWith('alb_user_'))) {
      dotEl.className = 'creator-avatar-dot user';
      dotEl.innerHTML = USER_CAT_AVATAR_SVG;
    } else {
      dotEl.className = 'creator-avatar-dot other';
      dotEl.innerHTML = OTHER_AVATAR_SVG;
    }
  }

  const artBox = document.getElementById('heroArtBox');
  const albumCover = getAlbumCover(alb);
  if (albumCover) {
    artBox.style.backgroundImage = `url("${albumCover}")`;
    artBox.style.backgroundSize = 'cover';
    artBox.style.backgroundPosition = 'center';
    artBox.innerHTML = '';
  } else {
    artBox.style.backgroundImage = '';
    const isRose = alb.hasRose || alb.id === 'alb_fav';
    if (isRose) {
      artBox.innerHTML = '<svg class="cover-rose-icon" viewBox="0 0 512 512"><path d="' + ROSE_SVG_PATH + '"/></svg>';
    } else {
      artBox.innerHTML = '<svg class="cover-note-icon" viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
    }
  }

  renderPlaylistDetailSongsOnly();
  document.getElementById('viewPlaylistDetail').classList.add('active');
}
function closePlaylistDetail() {
  exitMultiSelectMode();
  closePlaylistMenu();
  document.getElementById('viewPlaylistDetail').classList.remove('active');
}

function playSongFromAlbum(sIdx) {
  currentPlayingAlbumIndex = activeRadioIndex;
  const alb = VINYL_ALBUMS[activeRadioIndex];
  if (!alb || !alb.songs || !alb.songs[sIdx]) return;
  currentPlaybackQueue = [...alb.songs];
  currentIndex = sIdx;
  isPlaying = true;
  renderPlaylistDetailSongsOnly();
  playSongAtQueue(sIdx);
}

/* 歌单右上角下拉菜单 */

/* ================== 外观与主题弹窗管理（严格对齐新UI规范） ================== */
const PRESET_THEME_COLORS = [
  { id: 'blue',       name: '克莱因蓝', desc: '默认经典', color: '#234BB8', nightColor: '#4A76ED', light: 'rgba(35, 75, 184, 0.12)',  shadow: 'rgba(35, 75, 184, 0.35)' },
  { id: 'terracotta', name: '陶土橙',   desc: '剧情本色', color: '#D97757', nightColor: '#E88A68', light: 'rgba(217, 119, 87, 0.12)', shadow: 'rgba(217, 119, 87, 0.35)' },
  { id: 'green',      name: '青翠绿',   desc: '自然清新', color: '#2E6B4F', nightColor: '#3FA375', light: 'rgba(46, 107, 79, 0.12)',  shadow: 'rgba(46, 107, 79, 0.35)' },
  { id: 'purple',     name: '深邃紫',   desc: '典雅华丽', color: '#6A1B9A', nightColor: '#A242E6', light: 'rgba(106, 27, 154, 0.12)', shadow: 'rgba(106, 27, 154, 0.35)' },
  { id: 'black',      name: '水墨黑',   desc: '纯粹极简', color: '#171715', nightColor: '#E8E7E3', light: 'rgba(23, 23, 21, 0.12)',   shadow: 'rgba(23, 23, 21, 0.35)' }
];
let currentThemeColorId = localStorage.getItem('yyrc_theme_color_id') || 'blue';
if (currentThemeColorId === 'cinnabar') currentThemeColorId = 'blue';

function getActiveThemeColorHex() {
  const isNight = document.body && document.body.classList.contains('night');
  const item = PRESET_THEME_COLORS.find(c => c.id === currentThemeColorId) || PRESET_THEME_COLORS[0];
  return isNight ? (item.nightColor || item.color) : item.color;
}

function applyThemeColorStyles() {
  const isNight = document.body.classList.contains('night');
  const item = PRESET_THEME_COLORS.find(c => c.id === currentThemeColorId) || PRESET_THEME_COLORS[0];
  const activeColor = isNight ? (item.nightColor || item.color) : item.color;
  const activeSoft = isNight ? 'rgba(255, 255, 255, 0.12)' : item.light;

  const root = document.documentElement;
  const body = document.body;

  root.style.setProperty('--brand-blue', activeColor);
  root.style.setProperty('--brand-blue-press', activeColor);
  root.style.setProperty('--brand-blue-soft', activeSoft);

  body.style.setProperty('--brand-blue', activeColor);
  body.style.setProperty('--brand-blue-press', activeColor);
  body.style.setProperty('--brand-blue-soft', activeSoft);

  if (window.AndroidBridge && window.AndroidBridge.setDesktopThemeColor) {
    try {
      window.AndroidBridge.setDesktopThemeColor(activeColor);
    } catch(e) {}
  }
}

function openThemeSettingsSubpage() {
  document.getElementById('viewThemeSettings').classList.add('active');
  updateSettingsSummary();
}

function closeThemeSettingsSubpage() {
  document.getElementById('viewThemeSettings').classList.remove('active');
  updateSettingsSummary();
}

let currentAppFont = localStorage.getItem('yyrc_app_font') || 'lxgw';

function applyAppFont(fontKey) {
  currentAppFont = fontKey || 'lxgw';
  if (currentAppFont === 'system') {
    document.body.classList.add('font-system');
  } else {
    document.body.classList.remove('font-system');
  }
  const disp = document.getElementById('main-font-display');
  if (disp) disp.textContent = (currentAppFont === 'system' ? '系统自带' : '霞鹜文楷');
}

function openFontModal() {
  const overlay = document.getElementById('font-modal-overlay');
  if (!overlay) return;
  const rows = overlay.querySelectorAll('.color-option-row');
  rows.forEach(r => {
    const f = r.getAttribute('data-font');
    r.classList.toggle('selected', f === currentAppFont);
  });
  overlay.classList.add('active');
}

function closeFontModal(e) {
  if (!e || e.target === e.currentTarget) {
    const el = document.getElementById('font-modal-overlay');
    if (el) el.classList.remove('active');
  }
}

function selectAppFont(fontKey, rowEl) {
  document.querySelectorAll('#font-modal-overlay .color-option-row').forEach(r => r.classList.remove('selected'));
  if (rowEl) rowEl.classList.add('selected');

  currentAppFont = fontKey;
  localStorage.setItem('yyrc_app_font', fontKey);

  applyAppFont(fontKey);

  setTimeout(() => {
    const overlay = document.getElementById('font-modal-overlay');
    if (overlay) overlay.classList.remove('active');
  }, 120);
  toast('已切换字体为 ' + (fontKey === 'system' ? '系统自带' : '霞鹜文楷'));
}

function updateSettingsSummary() {
  const textMap = { system: '跟随系统', auto: '跟随系统', light: '浅色明亮', dark: '深色夜间' };
  const modeText = textMap[currentThemeMode] || '跟随系统';
  const cInfo = PRESET_THEME_COLORS.find(c => c.id === currentThemeColorId) || PRESET_THEME_COLORS[0];
  const sumEl = document.getElementById('themeSettingsSummary');
  if (sumEl) sumEl.textContent = `${modeText} - ${cInfo.name}`;

  const fontDisp = document.getElementById('main-font-display');
  if (fontDisp) fontDisp.textContent = (currentAppFont === 'system' ? '系统自带' : '霞鹜文楷');
  if (typeof updateDefaultHomeTabUI === 'function') updateDefaultHomeTabUI();
}

function openColorModal() {
  const overlay = document.getElementById('color-modal-overlay');
  if (!overlay) return;
  const rows = overlay.querySelectorAll('.color-option-row');
  const effMode = (currentThemeMode === 'auto') ? 'system' : currentThemeMode;
  rows.forEach(r => {
    const m = r.getAttribute('data-mode');
    r.classList.toggle('selected', m === effMode);
  });
  overlay.classList.add('active');
}

function closeColorModal(e) {
  if (!e || e.target === e.currentTarget) {
    const el = document.getElementById('color-modal-overlay');
    if (el) el.classList.remove('active');
  }
}

function selectTheme(mode, rowEl) {
  document.querySelectorAll('#color-modal-overlay .color-option-row').forEach(r => r.classList.remove('selected'));
  if (rowEl) rowEl.classList.add('selected');

  currentThemeMode = mode;
  localStorage.setItem('yyrc_theme_mode', mode);

  applyThemeMode();
  updateSettingsSummary();

  const textMap = { system: '跟随系统', light: '浅色明亮', dark: '深色夜间' };
  const disp = document.getElementById('main-theme-display');
  if (disp) disp.textContent = textMap[mode] || '跟随系统';

  setTimeout(() => {
    const overlay = document.getElementById('color-modal-overlay');
    if (overlay) overlay.classList.remove('active');
  }, 120);
  toast('显示模式已切换为 ' + (textMap[mode] || mode));
}

function openThemeColorModal() {
  const overlay = document.getElementById('theme-color-modal-overlay');
  if (!overlay) return;
  const rows = overlay.querySelectorAll('.color-option-row');
  rows.forEach(r => {
    const cid = r.getAttribute('data-color-id');
    const isCur = (cid === currentThemeColorId);
    r.classList.toggle('selected', isCur);
    const tag = r.querySelector('.theme-cur-tag');
    if (tag) tag.remove();
    if (isCur) {
      const item = PRESET_THEME_COLORS.find(c => c.id === cid);
      const curTag = document.createElement('span');
      curTag.className = 'theme-cur-tag';
      curTag.style.color = item ? (document.body.classList.contains('night') ? item.nightColor : item.color) : 'var(--brand-blue)';
      curTag.textContent = '当前';
      r.appendChild(curTag);
    }
  });
  overlay.classList.add('active');
}

function closeThemeColorModal(e) {
  if (!e || e.target === e.currentTarget) {
    const el = document.getElementById('theme-color-modal-overlay');
    if (el) el.classList.remove('active');
  }
}

function selectThemeColor(colorId, colorHex, nameText, rowEl, notify = true) {
  document.querySelectorAll('#theme-color-modal-overlay .color-option-row').forEach(r => {
    r.classList.remove('selected');
    const tag = r.querySelector('.theme-cur-tag');
    if (tag) tag.remove();
  });
  if (rowEl) {
    rowEl.classList.add('selected');
    const curTag = document.createElement('span');
    curTag.className = 'theme-cur-tag';
    curTag.style.color = colorHex;
    curTag.textContent = '当前';
    rowEl.appendChild(curTag);
  }

  currentThemeColorId = colorId;
  localStorage.setItem('yyrc_theme_color_id', colorId);

  applyThemeColorStyles();

  const disp = document.getElementById('main-theme-color-display');
  if (disp) disp.textContent = nameText;

  updateSettingsSummary();

  setTimeout(() => {
    const overlay = document.getElementById('theme-color-modal-overlay');
    if (overlay) overlay.classList.remove('active');
  }, 120);
  if (notify) toast('已选用「' + nameText + '」配色');
}

function initThemeSettings() {
  const savedMode = localStorage.getItem('yyrc_theme_mode') || 'system';
  currentThemeMode = savedMode;
  applyThemeMode();

  let savedColorId = localStorage.getItem('yyrc_theme_color_id') || 'blue';
  if (savedColorId === 'cinnabar') savedColorId = 'blue';
  const cInfo = PRESET_THEME_COLORS.find(c => c.id === savedColorId) || PRESET_THEME_COLORS[0];
  selectThemeColor(cInfo.id, cInfo.color, cInfo.name, null, false);
  applyThemeColorStyles();
  applyAppFont(currentAppFont);
  updateSettingsSummary();
}

/* ================== 点击歌曲封面直达全屏详情页 ================== */
function playSongFromActiveAndOpenDetail(idx) {
  playSongFromActivePlaylist(idx);
  openPlayerFull();
}
function playSongFromAlbumAndOpenDetail(sIdx) {
  playSongFromAlbum(sIdx);
  openPlayerFull();
}
function playSongAtQueueAndOpenDetail(idx) {
  playSongAtQueue(idx);
  openPlayerFull();
}

/* ================== 纯文本歌单导出与专用弹窗 ================== */
function exportCurrentPlaylistText() {
  const alb = VINYL_ALBUMS[activeRadioIndex];
  if (!alb || !alb.songs || !alb.songs.length) {
    toast('当前歌单内暂无歌曲');
    return;
  }
  const lines = alb.songs.map(s => (s.title || '未知曲目') + ' - ' + (s.artist || '未知歌手'));
  const textContent = lines.join('\n');
  openExportPlaylistModal(alb.title, textContent, alb.songs.length);
}

function openExportPlaylistModal(title, textContent, count) {
  const modal = document.getElementById('playlistExportTextModal');
  const titleEl = document.getElementById('exportModalTitle');
  const descEl = document.getElementById('exportModalDesc');
  const areaEl = document.getElementById('exportPlaylistTextArea');
  if (titleEl) titleEl.textContent = '导出歌单 - ' + title;
  if (descEl) descEl.textContent = '共 ' + count + ' 首歌曲，已复制到剪贴板，可直接粘贴分享。';
  if (areaEl) areaEl.value = textContent;
  if (modal) modal.classList.add('active');

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(textContent).then(() => {
      toast('歌单文本已复制到剪贴板');
    }).catch(() => {});
  }
}

function closeExportPlaylistModal(e) {
  if (e && e.target !== document.getElementById('playlistExportTextModal') && !e.target.closest('.modern-pill-cancel')) return;
  const modal = document.getElementById('playlistExportTextModal');
  if (modal) modal.classList.remove('active');
}

function copyExportedText() {
  const areaEl = document.getElementById('exportPlaylistTextArea');
  if (areaEl && areaEl.value) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(areaEl.value).then(() => {
        toast('已复制全部歌单文本');
      }).catch(() => {
        areaEl.select();
        document.execCommand('copy');
        toast('已复制全部歌单文本');
      });
    } else {
      areaEl.select();
      document.execCommand('copy');
      toast('已复制全部歌单文本');
    }
  }
}

/* ================== 动态歌单右上角下拉菜单 ================== */
function renderPlaylistCornerMenu() {
  const alb = VINYL_ALBUMS[activeRadioIndex];
  const menu = document.getElementById('playlistCornerMenu');
  if (!menu || !alb) return;

  if (alb.id === 'alb_local') {
    menu.innerHTML = `
      <div class="popup-menu-item" onclick="closePlaylistMenu(); scanDeviceLocalMusic();">
        <div class="popup-item-icon">
          <svg viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        </div>
        <span class="popup-item-text">扫描手机本地音频</span>
      </div>
      <div class="popup-menu-item" onclick="closePlaylistMenu(); triggerFileImport();">
        <div class="popup-item-icon">
          <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        </div>
        <span class="popup-item-text">导入本地音频文件</span>
      </div>
      <div class="popup-menu-item" onclick="closePlaylistMenu(); exportCurrentPlaylistText();">
        <div class="popup-item-icon">
          <svg viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
        </div>
        <span class="popup-item-text">导出歌单文本</span>
      </div>
      <div class="popup-menu-item" onclick="closePlaylistMenu(); clearLocalSongs();">
        <div class="popup-item-icon" style="color: var(--brand-red);">
          <svg viewBox="0 0 24 24" stroke="currentColor"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </div>
        <span class="popup-item-text" style="color: var(--brand-red);">清空本地列表</span>
      </div>
    `;
  } else if (alb.id === 'alb_all' || alb.id === 'alb_fav' || alb.hasRose) {
    menu.innerHTML = `
      <div class="popup-menu-item" onclick="closePlaylistMenu(); exportCurrentPlaylistText();">
        <div class="popup-item-icon">
          <svg viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
        </div>
        <span class="popup-item-text">导出歌单文本</span>
      </div>
    `;
  } else {
    menu.innerHTML = `
      <div class="popup-menu-item" onclick="handleEditPlaylistMenu()">
        <div class="popup-item-icon">
          <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </div>
        <span class="popup-item-text">编辑歌单</span>
      </div>
      <div class="popup-menu-item" onclick="closePlaylistMenu(); exportCurrentPlaylistText();">
        <div class="popup-item-icon">
          <svg viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
        </div>
        <span class="popup-item-text">导出歌单文本</span>
      </div>
      <div class="popup-menu-item" onclick="handleDeletePlaylistMenu()">
        <div class="popup-item-icon" style="color: var(--brand-red);">
          <svg viewBox="0 0 24 24" stroke="currentColor"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </div>
        <span class="popup-item-text" style="color: var(--brand-red);">删除歌单</span>
      </div>
    `;
  }
}

function clearLocalSongs() {
  const alb = VINYL_ALBUMS.find(a => a.id === 'alb_local');
  if (!alb || !alb.songs || !alb.songs.length) {
    toast('本地歌曲列表已是空的');
    return;
  }
  openUniversalConfirm({
    title: '清空本地列表',
    desc: '确定清空本地歌曲歌单中的全部 ' + alb.songs.length + ' 首歌曲吗？',
    confirmText: '清空列表',
    isDanger: true,
    onConfirm: () => {
      alb.songs = [];
      persistData();
      renderSongList();
      renderDrawerList();
      renderPlaylistDetail(activeRadioIndex);
      toast('已清空本地歌曲列表');
    }
  });
}

function togglePlaylistMenu(e) {
  if (e) e.stopPropagation();
  renderPlaylistCornerMenu();
  const menu = document.getElementById('playlistCornerMenu');
  const backdrop = document.getElementById('playlistMenuBackdrop');
  const isAct = menu.classList.contains('active');
  menu.classList.toggle('active', !isAct);
  backdrop.classList.toggle('active', !isAct);
}
function closePlaylistMenu() {
  document.getElementById('playlistCornerMenu').classList.remove('active');
  document.getElementById('playlistMenuBackdrop').classList.remove('active');
}

/* 独立歌单编辑逻辑（移植自歌单.html） */
let tempEditCoverUrl = '';

function handleEditPlaylistMenu() {
  closePlaylistMenu();
  openEditPlaylistPage();
}

function openEditPlaylistPage() {
  const alb = VINYL_ALBUMS[activeRadioIndex];
  document.getElementById('editTitleInput').value = alb.title;
  document.getElementById('editDescInput').value = alb.desc || '';
  tempEditCoverUrl = alb.customCover || '';

  const thumb = document.getElementById('editCoverThumbnail');
  if (tempEditCoverUrl) {
    thumb.style.backgroundImage = `url('${tempEditCoverUrl}')`;
    thumb.innerHTML = '';
  } else {
    thumb.style.backgroundImage = '';
    if (alb.hasRose) {
      thumb.innerHTML = `<svg viewBox="0 0 512 512" style="width:20px;height:20px;fill:var(--brand-red);margin:auto;"><path d="${ROSE_SVG_PATH}"/></svg>`;
    } else {
      thumb.innerHTML = `<svg viewBox="0 0 24 24" style="width:20px;height:20px;stroke:currentColor;fill:none;margin:auto;"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
    }
  }

  document.getElementById('viewEditPlaylist').classList.add('active');
}

function closeEditPlaylistPage() {
  document.getElementById('viewEditPlaylist').classList.remove('active');
}

function compressImageFile(file, maxWidth = 360, maxHeight = 360, quality = 0.82) {
  return new Promise((resolve) => {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxWidth || h > maxHeight) {
          if (w > h) {
            h = Math.round((h * maxWidth) / w);
            w = maxWidth;
          } else {
            w = Math.round((w * maxHeight) / h);
            h = maxHeight;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => resolve(e.target.result);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function triggerCoverImageUpload() {
  const input = document.getElementById('coverImageFileInput');
  if (input) {
    input.value = '';
    input.click();
  }
}

async function handleCoverImageUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  toast('正在压缩处理封面...');
  const compressedUrl = await compressImageFile(file, 360, 360, 0.82);
  if (!compressedUrl) {
    toast('图片读取失败，请重试');
    return;
  }
  tempEditCoverUrl = compressedUrl;
  const thumb = document.getElementById('editCoverThumbnail');
  if (thumb) {
    thumb.style.backgroundImage = `url('${tempEditCoverUrl}')`;
    thumb.innerHTML = '';
  }
  toast('封面已更新，点击右上角保存生效');
}

function saveEditedPlaylist() {
  const title = document.getElementById('editTitleInput').value.trim();
  const desc = document.getElementById('editDescInput').value.trim();

  if (!title) {
    toast('歌单名称不能为空');
    return;
  }

  const alb = VINYL_ALBUMS[activeRadioIndex];
  if (!alb) return;
  alb.title = title;
  alb.desc = desc;
  // 将简介同步为副标题（在听歌页卡片中替换原本硬编码的“自建私享”）
  alb.sub = desc || (alb.id === 'alb_fav' ? '心选好歌 - 点击进入' : (alb.id === 'alb_local' ? '离线曲库 - 随心畅听' : (alb.id === 'alb_all' ? '包含所有听过的歌' : '自建私享 - 触碰进入')));
  if (tempEditCoverUrl) {
    alb.customCover = tempEditCoverUrl;
  }

  document.getElementById('heroTitle').textContent = alb.title;
  const descEl = document.getElementById('heroDesc');
  if (descEl) {
    descEl.textContent = alb.desc || '';
    descEl.style.display = alb.desc ? 'block' : 'none';
  }

  const box = document.getElementById('heroArtBox');
  if (alb.customCover) {
    box.style.backgroundImage = `url('${alb.customCover}')`;
    box.innerHTML = ``;
  }

  // 同步更新听歌主页卡片标题与副标题
  const cardTitle = document.getElementById('dynamicCardTitle');
  const cardSub = document.getElementById('dynamicCardSub');
  if (cardTitle) cardTitle.textContent = alb.title;
  if (cardSub) cardSub.textContent = alb.desc || alb.sub;

  renderVinylDiscs();
  persistData();
  closeEditPlaylistPage();
  toast('保存成功');
}

function handleDeletePlaylistMenu() {
  closePlaylistMenu();
  if (activeRadioIndex >= 0 && activeRadioIndex <= 2) {
    toast('系统默认歌单不可删除');
    return;
  }
  const alb = VINYL_ALBUMS[activeRadioIndex];
  if (!alb) return;
  openUniversalConfirm({
    title: '删除歌单',
    desc: `确定要删除自建歌单「${alb.title}」吗？其中的歌曲仍将保留在全部歌曲中。`,
    confirmText: '删除歌单',
    isDanger: true,
    onConfirm: () => {
      VINYL_ALBUMS.splice(activeRadioIndex, 1);
      activeRadioIndex = 0;
      persistData();
      renderLibraryAlbumPills();
      renderVinylDiscs();
      closePlaylistDetail();
      renderSongList();
      if (typeof renderDrawerList === 'function') renderDrawerList();
      toast(`已删除歌单「${alb.title}」`);
    }
  });
}

/* 新建歌单功能 */
let lastOpenCreatePlaylistTime = 0;

function openCreatePlaylistPrompt(e) {
  if (e) {
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
    if (typeof e.preventDefault === 'function') e.preventDefault();
  }
  const now = Date.now();
  if (now - lastOpenCreatePlaylistTime < 350) return;
  lastOpenCreatePlaylistTime = now;

  // 严防全屏播放页与当前播放列表抽屉被夹带在下方
  if (typeof closePlayerFull === 'function') closePlayerFull();
  if (typeof closePlaylistDrawer === 'function') closePlaylistDrawer();

  const drawer = document.getElementById('playlistDrawer');
  const drawerBackdrop = document.getElementById('playlistDrawerBackdrop');
  if (drawer) {
    drawer.classList.remove('open');
    drawer.style.visibility = 'hidden';
  }
  if (drawerBackdrop) {
    drawerBackdrop.classList.remove('open');
  }
  const overlay = document.getElementById('createPlaylistModalOverlay');
  const input = document.getElementById('createPlaylistInput');
  if (!overlay || !input) return;
  input.value = '';
  overlay.classList.add('active');
  setTimeout(() => input.focus(), 80);
}

function closeCreatePlaylistModal(e) {
  if (e) {
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
    if (typeof e.preventDefault === 'function') e.preventDefault();
  }
  closeCreatePlaylistModalDirect();
}

function closeCreatePlaylistModalDirect() {
  if (typeof blockGhostClicks === 'function') blockGhostClicks(450);
  const input = document.getElementById('createPlaylistInput');
  if (input) input.blur();
  const overlay = document.getElementById('createPlaylistModalOverlay');
  if (overlay) overlay.classList.remove('active');
  if (typeof closePlaylistDrawer === 'function') closePlaylistDrawer();
  if (typeof forceResetViewportScroll === 'function') forceResetViewportScroll();
}

function submitCreatePlaylistModal() {
  const input = document.getElementById('createPlaylistInput');
  if (input) input.blur();
  if (!input) return;
  const name = input.value.trim();
  if (!name) {
    toast('请输入歌单名称');
    return;
  }
  closeCreatePlaylistModal();
  const newAlb = {
    id: 'alb_custom_' + Date.now(),
    title: name,
    author: '我',
    sub: '自建私享 - 触碰进入',
    hasRose: false,
    songs: []
  };
  VINYL_ALBUMS.push(newAlb);
  persistData();
  renderLibraryAlbumPills();
  const newIdx = VINYL_ALBUMS.length - 1;
  scrollVinylToAlbum(newIdx, true);
  toast(`已创建歌单「${name}」`);

  const chooseModal = document.getElementById('choosePlaylistModal');
  if (chooseModal && chooseModal.classList.contains('active')) {
    if (typeof selectedPlaylistIndices !== 'undefined') {
      selectedPlaylistIndices.add(newIdx);
    }
    if (typeof renderChoosePlaylistItems === 'function') {
      renderChoosePlaylistItems();
    }
  } else {
    openPlaylistDetail(newIdx);
  }
}

