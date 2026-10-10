/* ================== 歌曲进度条拖动核心引擎（支持触屏触摸滑动与鼠标平滑拖拽） ================== */
let isDraggingProgressBar = false;
let dragSafetyTimer = null;

function setDragProgressState(isDragging) {
  isDraggingProgressBar = isDragging;
  if (dragSafetyTimer) clearTimeout(dragSafetyTimer);
  if (isDragging) {
    // 8秒无动作自动释放拖拽锁定，防止因触摸中断或手机手势导航导致的锁死
    dragSafetyTimer = setTimeout(() => {
      if (isDraggingProgressBar) {
        isDraggingProgressBar = false;
        syncProgress();
      }
    }, 8000);
  }
}

function initProgressBarDrag() {
  const barWrap = document.getElementById('seekBarWrap') || document.querySelector('.seek-bar-wrap');
  if (!barWrap || barWrap._dragInited) return;
  barWrap._dragInited = true;

  function performSeek(clientX, isCommit) {
    const rect = barWrap.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const curSong = currentPlaybackQueue[currentIndex];
    const nd = (isNativeAudioSupported && window.AndroidBridge.getNativeDuration) ? window.AndroidBridge.getNativeDuration() : 0;
    const duration = (nd > 0) ? nd : ((curSong && curSong.duration > 0) ? curSong.duration : (!isNaN(audioPlayer.duration) && audioPlayer.duration > 0 ? audioPlayer.duration : 180));
    const targetSec = Math.min(ratio * duration, duration);
    const pct = (ratio * 100).toFixed(1);

    const seekFill = document.getElementById('seekFill');
    if (seekFill) seekFill.style.width = pct + '%';
    const seekThumb = document.getElementById('seekThumb');
    if (seekThumb) seekThumb.style.left = pct + '%';
    const curTimeEl = document.getElementById('curTime');
    if (curTimeEl) curTimeEl.textContent = formatTime(targetSec);

    // 毫秒级歌词顺畅联动
    if (LYRICS_DATA && LYRICS_DATA.length > 0) {
      let scrubIdx = 0;
      for (let i = 0; i < LYRICS_DATA.length; i++) {
        if (targetSec >= LYRICS_DATA[i].time) scrubIdx = i;
      }
      if (scrubIdx !== lastActiveIdx || isCommit) {
        lastActiveIdx = scrubIdx;
        updateSimplePreviewLyricScrubbing(scrubIdx);
        if (isPureLyrics) {
          scrollLyricItemToCenter(scrubIdx);
        }
      }
    }

    if (isCommit) {
      currentSec = targetSec;
      isSeekingAudio = true;
      if (isNativeAudioSupported) {
        window.AndroidBridge.seekNativeAudio(targetSec);
      } else if (!isNaN(audioPlayer.duration) && audioPlayer.duration > 0) {
        try {
          audioPlayer.currentTime = targetSec;
        } catch(err) {
          console.warn("audioPlayer seek error:", err);
        }
      }
      if (seekLockTimer) clearTimeout(seekLockTimer);
      seekLockTimer = setTimeout(() => { isSeekingAudio = false; syncProgress(); }, 700);

      syncProgress();
      if (LYRICS_DATA && LYRICS_DATA.length > 0) {
        let finalIdx = 0;
        for (let i = 0; i < LYRICS_DATA.length; i++) {
          if (targetSec >= LYRICS_DATA[i].time) finalIdx = i;
        }
        updateLyricProgressSmooth(finalIdx);
      } else {
        updateLyricProgressSmooth();
      }
      syncCurrentLyricToDesktop();
    }
  }

  // Pointer Events (现代浏览器与 Android WebView 统一精准触控事件)
  barWrap.addEventListener('pointerdown', (e) => {
    setDragProgressState(true);
    try { barWrap.setPointerCapture(e.pointerId); } catch(err) {}
    performSeek(e.clientX, false);
    e.stopPropagation();
    e.preventDefault();
  }, { passive: false });

  barWrap.addEventListener('pointermove', (e) => {
    if (!isDraggingProgressBar) return;
    performSeek(e.clientX, false);
    e.stopPropagation();
    e.preventDefault();
  }, { passive: false });

  barWrap.addEventListener('pointerup', (e) => {
    if (!isDraggingProgressBar) return;
    setDragProgressState(false);
    try { barWrap.releasePointerCapture(e.pointerId); } catch(err) {}
    performSeek(e.clientX, true);
    e.stopPropagation();
    e.preventDefault();
  }, { passive: false });

  barWrap.addEventListener('pointercancel', (e) => {
    if (!isDraggingProgressBar) return;
    setDragProgressState(false);
    try { barWrap.releasePointerCapture(e.pointerId); } catch(err) {}
    syncProgress();
  });

  // 全局 Window 兜底，绝不卡死
  window.addEventListener('pointerup', (e) => {
    if (isDraggingProgressBar) {
      setDragProgressState(false);
      performSeek(e.clientX, true);
    }
  }, { passive: true });

  window.addEventListener('pointercancel', () => {
    if (isDraggingProgressBar) {
      setDragProgressState(false);
      syncProgress();
    }
  }, { passive: true });

  window.addEventListener('blur', () => {
    if (isDraggingProgressBar) {
      setDragProgressState(false);
      syncProgress();
    }
  }, { passive: true });
}

/* 浏览器画中画降级引擎 */
let pipVideoElement = null;
let pipCanvas = null;
let pipCtx = null;
let isPipActive = false;

function initPipLyricsEngine() {
  if (pipCanvas) return;
  pipCanvas = document.createElement('canvas');
  pipCanvas.width = 640;
  pipCanvas.height = 200;
  pipCtx = pipCanvas.getContext('2d');

  pipVideoElement = document.createElement('video');
  pipVideoElement.muted = true;
  pipVideoElement.playsInline = true;
  pipVideoElement.style.position = 'fixed';
  pipVideoElement.style.top = '-9999px';
  pipVideoElement.style.left = '-9999px';
  pipVideoElement.style.opacity = '0';
  pipVideoElement.style.pointerEvents = 'none';
  document.body.appendChild(pipVideoElement);

  pipVideoElement.addEventListener('enterpictureinpicture', () => {
    isPipActive = true;
    updateDesktopLyricsUI();
  });

  pipVideoElement.addEventListener('leavepictureinpicture', () => {
    isPipActive = false;
    updateDesktopLyricsUI();
  });
}

function updatePipCanvas() {
  if (!isPipActive || !pipCtx) return;
  const curSong = currentPlaybackQueue[currentIndex] || { title: '灵犀音乐', artist: '随心听' };
  const activeLine = (lastActiveIdx >= 0 && LYRICS_DATA[lastActiveIdx]) ? LYRICS_DATA[lastActiveIdx] : { text: '享受音乐时光' };

  pipCtx.fillStyle = '#141416';
  pipCtx.fillRect(0, 0, pipCanvas.width, pipCanvas.height);
  pipCtx.fillStyle = '#8E8E93';
  pipCtx.font = '20px sans-serif';
  pipCtx.textAlign = 'center';
  pipCtx.textBaseline = 'middle';
  pipCtx.fillText(`${curSong.title} - ${curSong.artist}`, pipCanvas.width / 2, 55);

  pipCtx.fillStyle = '#FFFFFF';
  pipCtx.font = 'bold 30px sans-serif';
  pipCtx.fillText(activeLine.text, pipCanvas.width / 2, 130);
}

async function togglePipLyrics() {
  if (!('pictureInPictureEnabled' in document) || !document.pictureInPictureEnabled) {
    toast('当前环境暂不支持画中画悬浮窗');
    return;
  }
  initPipLyricsEngine();
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      isPipActive = false;
      updateDesktopLyricsUI();
    } else {
      updatePipCanvas();
      const stream = pipCanvas.captureStream(15);
      pipVideoElement.srcObject = stream;
      await pipVideoElement.play();
      await pipVideoElement.requestPictureInPicture();
    }
  } catch(err) {
    console.warn("PiP lyrics error:", err);
    toast('开启悬浮窗失败：' + (err.message || '请点击允许'));
  }
}

function triggerPlaylistJsonImport() {
  const fileInput = document.getElementById('playlistJsonFileInput');
  if (fileInput) {
    fileInput.value = '';
    fileInput.click();
  }
}

function handlePlaylistJsonImport(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const data = JSON.parse(evt.target.result);
      let playlistInfo = null;
      let importedSongs = [];

      if (data && data.playlist && Array.isArray(data.playlist.songs)) {
        playlistInfo = data.playlist;
        importedSongs = data.playlist.songs;
      } else if (Array.isArray(data)) {
        playlistInfo = { title: file.name.replace(/\.[^/.]+$/, ''), author: '外部导入', desc: '导入歌单' };
        importedSongs = data;
      } else if (data && Array.isArray(data.songs)) {
        playlistInfo = data;
        importedSongs = data.songs;
      } else {
        toast('无法识别的歌单 JSON 格式');
        return;
      }

      if (!importedSongs.length) {
        toast('导入的歌单中没有找到歌曲');
        return;
      }

      const validSongs = [];
      importedSongs.forEach(item => {
        if (!item || (!item.title && !item.name)) return;
        const track = {
          id: item.id || ('imported_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
          onlineId: item.onlineId || item.url_id || undefined,
          source: item.source || 'netease',
          title: item.title || item.name || '未知歌曲',
          artist: item.artist || '未知歌手',
          album: item.album || '',
          duration: Number(item.duration) || 240,
          fileUrl: item.fileUrl && !item.fileUrl.includes('music.163.com/song/media/outer/url') ? item.fileUrl : '',
          cover: item.cover || '',
          isFav: !!item.isFav
        };
        validSongs.push(track);

        const exists = ALL_LIBRARY_SONGS.some(s => s.id === track.id || (s.title === track.title && s.artist === track.artist));
        if (!exists) {
          ALL_LIBRARY_SONGS.push(track);
        }
      });

      const baseTitle = playlistInfo.title || file.name.replace(/\.[^/.]+$/, '');
      let finalTitle = baseTitle;
      if (VINYL_ALBUMS.some(a => a.title === finalTitle)) {
        finalTitle = `${baseTitle} (导入)`;
      }

      const newAlbum = {
        id: 'alb_imported_' + Date.now(),
        title: finalTitle,
        author: playlistInfo.author || '外部导入',
        desc: playlistInfo.desc || `从 ${file.name} 导入的歌单`,
        customCover: playlistInfo.customCover || '',
        songs: validSongs
      };

      VINYL_ALBUMS.push(newAlbum);
      persistData();
      renderVinylDiscs();
      renderSongList();
      renderDrawerList();

      const newIndex = VINYL_ALBUMS.length - 1;
      scrollVinylToAlbum(newIndex, true);
      openPlaylistDetail(newIndex);
      toast(`已成功导入歌单「${finalTitle}」(共 ${validSongs.length} 首歌曲)`);
    } catch(err) {
      console.error('Import playlist json failed:', err);
      toast('解析歌单 JSON 失败，请检查文件内容');
    }
  };
  reader.onerror = function() {
    toast('读取文件失败');
  };
  reader.readAsText(file, 'utf-8');
}

async function downloadCurrentPlaylist() {
  const alb = VINYL_ALBUMS[activeRadioIndex];
  if (!alb || !alb.songs || alb.songs.length === 0) {
    toast(`当前歌单「${alb ? alb.title : ''}」暂无歌曲可供下载`);
    return;
  }

  const downloadableSongs = alb.songs.filter(s => s.fileUrl && !s.id.startsWith('s1'));
  if (downloadableSongs.length === 0) {
    toast(`歌单中仅有系统演示曲目，无实际网络音频源`);
    return;
  }

  toast(`开始批量下载歌单共 ${downloadableSongs.length} 首歌曲...`);
  for (let i = 0; i < downloadableSongs.length; i++) {
    const s = downloadableSongs[i];
    toast(`正在下载 [${i + 1}/${downloadableSongs.length}] 《${s.title}》...`);
    await downloadSongFile(s);
    if (i < downloadableSongs.length - 1) {
      await new Promise(r => setTimeout(r, 1200));
    }
  }
}

function shareCurrentPlayingSong() {
  const song = currentPlaybackQueue[currentIndex];
  if (song) {
    shareSong(song);
  } else {
    toast('当前暂无正在播放的曲目');
  }
}

async function shareSong(song) {
  if (!song) return;
  const shareCardText = `《${song.title}》- ${song.artist}\n来自 灵犀音乐\n${song.fileUrl ? ('试听直链: ' + song.fileUrl) : ''}`;
  copyFallback(shareCardText, song.title);
}

function copyFallback(text, title) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      toast(`已复制《${title}》分享卡片与试听链接`);
    }).catch(() => {
      legacyCopy(text, title);
    });
  } else {
    legacyCopy(text, title);
  }
}

function legacyCopy(text, title) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    toast(`已复制《${title}》分享卡片与试听链接`);
  } catch(e) {
    toast(`分享卡片复制受限`);
  }
  document.body.removeChild(ta);
}

function deleteSong(songId, albumId = null) {
  if (albumId && albumId !== 'alb_all') {
    // 仅从指定歌单中移出
    const targetAlb = VINYL_ALBUMS.find(a => a.id === albumId);
    if (targetAlb) {
      targetAlb.songs = targetAlb.songs.filter(s => s.id !== songId);
    }
    if (albumId === 'alb_fav') {
      const songInLib = ALL_LIBRARY_SONGS.find(s => s.id === songId);
      if (songInLib) songInLib.isFav = false;
    }
  } else {
    // 从主曲库彻底移除
    ALL_LIBRARY_SONGS = ALL_LIBRARY_SONGS.filter(s => s.id !== songId);
    VINYL_ALBUMS.forEach(alb => {
      alb.songs = alb.songs.filter(s => s.id !== songId);
    });
  }

  // 播放队列处理
  const qIdx = currentPlaybackQueue.findIndex(s => s.id === songId);
  if (qIdx !== -1) {
    if (qIdx === currentIndex) {
      if (currentPlaybackQueue.length <= 1) {
        audioPlayer.pause();
        audioPlayer.removeAttribute('src');
        isPlaying = false;
        currentPlaybackQueue = [];
        currentIndex = 0;
      } else {
        currentPlaybackQueue.splice(qIdx, 1);
        if (currentIndex >= currentPlaybackQueue.length) currentIndex = 0;
        playSongAtQueue(currentIndex);
      }
    } else {
      currentPlaybackQueue.splice(qIdx, 1);
      if (currentIndex > qIdx) currentIndex--;
    }
  }

  persistData();
  renderSongList();
  renderDrawerList();
  if (document.getElementById('viewPlaylistDetail').classList.contains('active')) {
    openPlaylistDetail(activeRadioIndex);
  }
  updateUI();
  toast('已移出歌曲');
}

let selectedPlaylistIndices = new Set();
let choosePlaylistInitialState = new Map();

/* 动态选择加入歌单功能（多选勾选框、无SVG、纯净胶囊新建按钮） */
function openChoosePlaylistModal() {
  const modal = document.getElementById('choosePlaylistModal');
  selectedPlaylistIndices.clear();
  choosePlaylistInitialState.clear();

  const targetAlbums = VINYL_ALBUMS.map((alb, aIdx) => ({ alb, aIdx })).filter(item => item.alb.id !== 'alb_all');
  const song = currentActionSong;
  const batch = window._batchAddSongs;

  targetAlbums.forEach(({ alb, aIdx }) => {
    let initiallyIn = false;
    if (batch && batch.length > 0) {
      initiallyIn = batch.every(s => alb.songs.some(as => as.id === s.id));
    } else if (song) {
      initiallyIn = alb.songs.some(as => as.id === song.id);
    }
    choosePlaylistInitialState.set(aIdx, initiallyIn);
    if (initiallyIn) {
      selectedPlaylistIndices.add(aIdx);
    }
  });

  renderChoosePlaylistItems();
  modal.classList.add('active');
}

function renderChoosePlaylistItems() {
  const itemsBox = document.getElementById('choosePlaylistItems');
  if (!itemsBox) return;

  const targetAlbums = VINYL_ALBUMS.map((alb, aIdx) => ({ alb, aIdx })).filter(item => item.alb.id !== 'alb_all');

  itemsBox.innerHTML = targetAlbums.map(({ alb, aIdx }) => {
    const isChecked = selectedPlaylistIndices.has(aIdx);
    return `
      <div class="choose-item-row" onclick="togglePlaylistSelection(${aIdx})">
        <span class="choose-item-title">${escapeHtml(alb.title)}</span>
        <div class="choose-checkbox ${isChecked ? 'checked' : ''}" id="chk_alb_${aIdx}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
      </div>
    `;
  }).join('');
}

function togglePlaylistSelection(aIdx) {
  if (selectedPlaylistIndices.has(aIdx)) {
    selectedPlaylistIndices.delete(aIdx);
  } else {
    selectedPlaylistIndices.add(aIdx);
  }
  const chk = document.getElementById(`chk_alb_${aIdx}`);
  if (chk) {
    if (selectedPlaylistIndices.has(aIdx)) {
      chk.classList.add('checked');
    } else {
      chk.classList.remove('checked');
    }
  }
}

function confirmBatchAddToPlaylists() {
  const targetAlbums = VINYL_ALBUMS.map((alb, aIdx) => ({ alb, aIdx })).filter(item => item.alb.id !== 'alb_all');
  const song = currentActionSong;
  const batch = window._batchAddSongs;

  if (batch && batch.length > 0) {
    targetAlbums.forEach(({ alb, aIdx }) => {
      const isSelected = selectedPlaylistIndices.has(aIdx);
      const wasSelected = choosePlaylistInitialState.get(aIdx);
      if (isSelected && !wasSelected) {
        batch.forEach(s => {
          if (!alb.songs.some(as => as.id === s.id)) {
            alb.songs.push(s);
            if (alb.id === 'alb_fav') {
              s.isFav = true;
              const libS = ALL_LIBRARY_SONGS.find(ls => ls.id === s.id);
              if (libS) libS.isFav = true;
            }
          }
        });
      } else if (!isSelected && wasSelected) {
        batch.forEach(s => {
          const idx = alb.songs.findIndex(as => as.id === s.id);
          if (idx !== -1) {
            alb.songs.splice(idx, 1);
            if (alb.id === 'alb_fav') {
              s.isFav = false;
              const libS = ALL_LIBRARY_SONGS.find(ls => ls.id === s.id);
              if (libS) libS.isFav = false;
            }
          }
        });
      }
    });
    window._batchAddSongs = null;
    persistData();
    renderSongList();
    updateUI();
    exitMultiSelectMode();
    exitHomeMultiSelectMode();
    closeChoosePlaylistModalDirect();
    toast('歌单设置已更新');
    return;
  }

  if (song) {
    targetAlbums.forEach(({ alb, aIdx }) => {
      const isSelected = selectedPlaylistIndices.has(aIdx);
      const wasSelected = choosePlaylistInitialState.get(aIdx);
      if (isSelected && !wasSelected) {
        if (!alb.songs.some(as => as.id === song.id)) {
          alb.songs.push(song);
          if (alb.id === 'alb_fav') {
            song.isFav = true;
            const libS = ALL_LIBRARY_SONGS.find(ls => ls.id === song.id);
            if (libS) libS.isFav = true;
          }
        }
      } else if (!isSelected && wasSelected) {
        const idx = alb.songs.findIndex(as => as.id === song.id);
        if (idx !== -1) {
          alb.songs.splice(idx, 1);
          if (alb.id === 'alb_fav') {
            song.isFav = false;
            const libS = ALL_LIBRARY_SONGS.find(ls => ls.id === song.id);
            if (libS) libS.isFav = false;
          }
        }
      }
    });
    persistData();
    renderSongList();
    updateUI();
    closeChoosePlaylistModalDirect();
    toast('歌单设置已更新');
  }
}

function closeChoosePlaylistModalDirect() {
  const modal = document.getElementById('choosePlaylistModal');
  if (modal) modal.classList.remove('active');
}

function closeChoosePlaylistModal(e) {
  if (e && e.target !== document.getElementById('choosePlaylistModal')) return;
  closeChoosePlaylistModalDirect();
}

function updateSongRowCover(song) {
  if (!song || !song.cover) return;
  const sId = song.id ? String(song.id) : '';
  if (!sId) return;

  const miniCovers = document.querySelectorAll(`.song-cover-mini[data-song-id="${CSS.escape ? CSS.escape(sId) : sId}"]`);
  miniCovers.forEach(mini => {
    mini.setAttribute('data-cover', song.cover);
    let img = mini.querySelector('.song-cover-thumb');
    if (!img) {
      img = document.createElement('img');
      img.className = 'song-cover-thumb';
      img.alt = 'cover';
      img.onerror = function() { this.remove(); };
      const bars = mini.querySelector('.playing-bars');
      if (bars) {
        mini.insertBefore(img, bars);
      } else {
        mini.appendChild(img);
      }
    }
    if (img.src !== song.cover) {
      img.src = song.cover;
    }
  });
}

