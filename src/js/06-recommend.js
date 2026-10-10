/* ================== 灵犀推荐引擎与交互 ================== */
let currentDiscoverSeeds = [];
let isDiscoverLoading = false;

/* ================== 乐库歌单药丸长按删除交互 ================== */
let pillLongPressTimer = null;
let pillLongPressTriggered = false;
let pillTouchStartX = 0;
let pillTouchStartY = 0;

function handlePillTouchStart(e, idx) {
  pillLongPressTriggered = false;
  if (e.touches && e.touches.length > 0) {
    pillTouchStartX = e.touches[0].clientX;
    pillTouchStartY = e.touches[0].clientY;
  }
  if (pillLongPressTimer) clearTimeout(pillLongPressTimer);
  pillLongPressTimer = setTimeout(() => {
    pillLongPressTriggered = true;
    if (navigator.vibrate) {
      try { navigator.vibrate(30); } catch(err) {}
    }
    handlePillLongPress(idx);
    setTimeout(() => {
      pillLongPressTriggered = false;
    }, 600);
  }, 500);
}

function handlePillTouchMove(e) {
  if (!pillLongPressTimer) return;
  if (e.touches && e.touches.length > 0) {
    const dx = Math.abs(e.touches[0].clientX - pillTouchStartX);
    const dy = Math.abs(e.touches[0].clientY - pillTouchStartY);
    if (dx > 8 || dy > 8) {
      clearTimeout(pillLongPressTimer);
      pillLongPressTimer = null;
    }
  }
}

function handlePillTouchEnd() {
  if (pillLongPressTimer) {
    clearTimeout(pillLongPressTimer);
    pillLongPressTimer = null;
  }
}

function handlePillMouseDown(e, idx) {
  if (e.button !== 0) return;
  if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
  pillLongPressTriggered = false;
  pillTouchStartX = e.clientX;
  pillTouchStartY = e.clientY;
  if (pillLongPressTimer) clearTimeout(pillLongPressTimer);
  pillLongPressTimer = setTimeout(() => {
    pillLongPressTriggered = true;
    handlePillLongPress(idx);
    setTimeout(() => {
      pillLongPressTriggered = false;
    }, 600);
  }, 500);
}

function handlePillMouseMove(e) {
  if (!pillLongPressTimer) return;
  const dx = Math.abs(e.clientX - pillTouchStartX);
  const dy = Math.abs(e.clientY - pillTouchStartY);
  if (dx > 8 || dy > 8) {
    clearTimeout(pillLongPressTimer);
    pillLongPressTimer = null;
  }
}

function handlePillMouseUp() {
  if (pillLongPressTimer) {
    clearTimeout(pillLongPressTimer);
    pillLongPressTimer = null;
  }
}

function handlePillContextMenu(e, idx) {
  e.preventDefault();
  e.stopPropagation();
  if (pillLongPressTriggered) return false;
  handlePillLongPress(idx);
  return false;
}

function handlePillClick(e, idx) {
  if (pillLongPressTriggered) {
    pillLongPressTriggered = false;
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    return;
  }
  selectLibraryAlbum(idx);
}

function handlePillLongPress(idx) {
  if (typeof isHomeMultiSelectMode !== 'undefined' && isHomeMultiSelectMode) return;
  if (idx < 0 || idx >= VINYL_ALBUMS.length) return;
  const alb = VINYL_ALBUMS[idx];
  if (!alb) return;

  const isDefaultAlbum = (alb.id === 'alb_all' || alb.id === 'alb_fav' || alb.id === 'alb_local' || idx <= 2);
  if (isDefaultAlbum) {
    toast('系统默认歌单不可删除');
    return;
  }

  openUniversalConfirm({
    title: '删除歌单',
    desc: `确定要删除自建歌单「${alb.title}」吗？其中的歌曲仍将保留在全部歌曲中。`,
    confirmText: '删除歌单',
    isDanger: true,
    onConfirm: () => {
      const wasActive = (activeRadioIndex === idx);
      VINYL_ALBUMS.splice(idx, 1);
      if (wasActive) {
        activeRadioIndex = 0;
      } else if (activeRadioIndex > idx) {
        activeRadioIndex--;
      }
      persistData();
      renderLibraryAlbumPills();
      renderVinylDiscs();
      renderSongList();
      if (typeof renderDrawerList === 'function') renderDrawerList();
      toast(`已删除歌单「${alb.title}」`);
    }
  });
}

function renderLibraryAlbumPills() {
  const bar = document.getElementById('libraryAlbumPills');
  if (!bar) return;
  const albumPillsHtml = VINYL_ALBUMS.map((alb, idx) => {
    const isActive = (activeRadioIndex === idx);
    const count = (alb.songs ? alb.songs.length : 0);
    return `<div class="library-album-pill ${isActive ? 'active' : ''}"
      data-idx="${idx}"
      onclick="handlePillClick(event, ${idx})"
      oncontextmenu="handlePillContextMenu(event, ${idx})"
      ontouchstart="handlePillTouchStart(event, ${idx})"
      ontouchmove="handlePillTouchMove(event)"
      ontouchend="handlePillTouchEnd(event)"
      ontouchcancel="handlePillTouchEnd(event)"
      onmousedown="handlePillMouseDown(event, ${idx})"
      onmousemove="handlePillMouseMove(event)"
      onmouseup="handlePillMouseUp(event)">${escapeHtml(alb.title)} (${count})</div>`;
  }).join('');

  const addPillHtml = `<div class="library-album-pill" onclick="openCreatePlaylistPrompt(event)" style="display:inline-flex; align-items:center; gap:3px;"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>新建歌单</div>`;

  bar.innerHTML = albumPillsHtml + addPillHtml;
}

function selectLibraryAlbum(idx) {
  if (typeof exitHomeMultiSelectMode === 'function') exitHomeMultiSelectMode();
  activeRadioIndex = idx;
  renderLibraryAlbumPills();
  renderSongList();
}

let isHomeTabAnimating = false;

function switchHomeNavTab(tab, immediate = false) {
  if (tab === currentHomeTab && !immediate) return;
  currentHomeTab = tab;

  const tabNavLibrary = document.getElementById('tabNavLibrary');
  const tabNavDiscover = document.getElementById('tabNavDiscover');
  const homeTabTrack = document.getElementById('homeTabTrack');

  if (tab === 'library') {
    exitHomeMultiSelectMode();
    if (tabNavLibrary) tabNavLibrary.classList.add('active');
    if (tabNavDiscover) tabNavDiscover.classList.remove('active');
    const songContainer = document.getElementById('homeSongItemsList');
    if (!songContainer || !songContainer.children.length) {
      renderLibraryAlbumPills();
      renderSongList();
    }
  } else {
    exitHomeMultiSelectMode();
    if (tabNavLibrary) tabNavLibrary.classList.remove('active');
    if (tabNavDiscover) tabNavDiscover.classList.add('active');
  }

  if (!homeTabTrack) return;

  const targetTranslate = (tab === 'library') ? '-50%' : '0%';

  if (immediate) {
    homeTabTrack.style.transition = 'none';
    homeTabTrack.style.transform = `translate3d(${targetTranslate}, 0, 0)`;
    return;
  }

  homeTabTrack.style.transition = 'transform 0.28s cubic-bezier(0.25, 1, 0.5, 1)';
  homeTabTrack.style.transform = `translate3d(${targetTranslate}, 0, 0)`;
}

function formatCleanTitle(title) {
  if (!title) return '';
  return String(title)
    .replace(/\s*[\(\[（【](?:Live|现场|伴奏|Inst|Instrumental|Remix|Cover|翻唱|改编|重制版|重置版|重录版|新版|原声|纯享版|纯音乐|DJ版|高品质|正式版|片段|超清|无损|精选|完整版|20\d\d|19\d\d).*?[\)\]）】]/gi, '')
    .replace(/\s*[-_—]\s*(?:电视剧|电影|网剧|橙光|游戏|动漫|动画|主题曲|片尾曲|插曲|推广曲|原声|官方版).*?$/gi, '')
    .replace(/\s*[-_—]\s*《.*?》.*?$/gi, '')
    .replace(/\s*[\(\[（【].*?[\)\]）】]$/gi, '')
    .trim();
}

function formatCleanArtist(artist) {
  if (!artist) return '未知歌手';
  let str = String(artist).replace(/\s*[\(\[（【].*?[\)\]）】]/g, '').trim();
  const parts = str.split(/[\/,、&]/).map(p => p.trim()).filter(Boolean);
  if (parts.length > 2) {
    return parts.slice(0, 2).join(' / ');
  }
  return str || '未知歌手';
}

let topRecommendedTracks = [];
let activeTopTrackIndex = 0;
let isDiscoverRecommendationQueue = false;
let isAppendingRecommendations = false;
let nextStreamSeedIndex = 0;

const STREAM_RECOMMEND_SEEDS = [
  '流行', '民谣', '治愈', '轻音乐', '经典流行', '摇滚', '爵士', '纯音乐', '粤语',
  '周杰伦', '陈奕迅', '林俊杰', '孙燕姿', '毛不易', '王菲', '李健', '薛之谦', '邓紫棋',
  '张学友', '朴树', '赵雷', '房东的猫', '郭顶', '梁静茹', '莫文蔚', '陶喆', '许巍',
  '五月天', '苏打绿', '郁可唯', '汪苏泷', '胡夏', '告五人', '落日飞车', '久石让', '阿鲲'
];

function isSameSongIdentifier(a, b) {
  if (!a || !b) return false;
  const aId = a.onlineId || (a.id ? String(a.id).replace('online_', '') : '');
  const bId = b.onlineId || (b.url_id || b.id ? String(b.url_id || b.id).replace('online_', '') : '');
  if (aId && bId && aId === bId) return true;
  const aTitle = (formatCleanTitle(a.title || a.name || '')).toLowerCase().trim();
  const bTitle = (formatCleanTitle(b.title || b.name || '')).toLowerCase().trim();
  const aArtist = (formatCleanArtist(a.artist || '')).toLowerCase().trim();
  const bArtist = (formatCleanArtist(b.artist || '')).toLowerCase().trim();
  if (aTitle && bTitle && aTitle === bTitle) {
    if (!aArtist || !bArtist || aArtist === bArtist || aArtist.includes(bArtist) || bArtist.includes(aArtist)) {
      return true;
    }
  }
  return false;
}

function convertSongToQueueTrack(song, topTrackIndex = -1) {
  const sTitle = song.name || song.title || '';
  const sArtist = song.artist || '';
  return {
    id: 'online_' + (song.id || song.url_id || Math.random().toString(36).slice(2)),
    onlineId: song.url_id || song.id,
    topTrackIndex: topTrackIndex,
    source: song.source || 'netease',
    title: sTitle,
    artist: sArtist,
    album: song.album || '',
    duration: song.duration || 240,
    fileUrl: song.fileUrl || '',
    urlFetchedAt: song.urlFetchedAt || 0,
    cover: song.cover || song.pic || '',
    pic_id: song.pic_id || song.url_id || song.id,
    lyric_id: song.lyric_id || song.url_id || song.id,
    isFav: ALL_LIBRARY_SONGS.some(s => 
      (s.id === 'online_' + song.id || s.onlineId === (song.url_id || song.id) || (s.title === sTitle && s.artist === sArtist)) && s.isFav
    )
  };
}

async function ensureMoreRecommendationsSilently(isTriggeredByScroll = false) {
  if (isAppendingRecommendations) return;
  if (!isDiscoverRecommendationQueue && !isTriggeredByScroll) return;

  const currentCount = topRecommendedTracks ? topRecommendedTracks.length : 0;
  const isNearEndInVinyl = activeTopTrackIndex >= currentCount - 3;
  const isNearEndInQueue = currentIndex >= currentPlaybackQueue.length - 3;

  if (!isNearEndInVinyl && !isNearEndInQueue && !isTriggeredByScroll) return;

  isAppendingRecommendations = true;

  try {
    // 阶段一：优先从发现页现有板块 currentDiscoverSongs 中查找尚未加入顶部卡片的歌曲
    const pendingFromDiscover = (currentDiscoverSongs || []).filter(dSong => {
      return !topRecommendedTracks.some(t => isSameSongIdentifier(t, dSong));
    });

    if (pendingFromDiscover.length > 0) {
      // 预加载几个（每次取 4 首）
      const batch = pendingFromDiscover.slice(0, 4);
      appendTracksToTopAndQueue(batch);
      return;
    }

    // 阶段二：发现页已有歌曲已全部加入顶部卡片，在线拉取新的推荐歌曲
    const newOnlineBatch = await fetchNextOnlineRecommendationBatch();
    if (newOnlineBatch && newOnlineBatch.length > 0) {
      appendTracksToTopAndQueue(newOnlineBatch);
    }
  } catch (err) {
    console.warn('静默预加载推荐曲目失败:', err);
  } finally {
    isAppendingRecommendations = false;
  }
}

function appendTracksToTopAndQueue(batch) {
  if (!batch || batch.length === 0) return;
  const container = document.getElementById('vinylDiscStream');

  batch.forEach(song => {
    const newTopIdx = topRecommendedTracks.length;
    topRecommendedTracks.push(song);

    // 保证在 currentDiscoverSongs 中也有记录
    if (!currentDiscoverSongs.some(s => isSameSongIdentifier(s, song))) {
      song._globalIdx = currentDiscoverSongs.length;
      currentDiscoverSongs.push(song);
    }

    // 增量追加卡片至 #vinylDiscStream
    if (container) {
      const coverUrl = song.cover || song.pic || '';
      const cardHtml = `
        <div class="vinyl-stream-card" onclick="handleStreamCardClick(${newTopIdx})">
          <div class="stream-disc" id="streamDisc${newTopIdx}" style="position:relative; overflow:hidden;">
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
      container.insertAdjacentHTML('beforeend', cardHtml);
    }

    // 若当前播放队列处于推荐流，同步追加到当前播放队列
    if (isDiscoverRecommendationQueue) {
      const queueIdx = currentPlaybackQueue.findIndex(q => isSameSongIdentifier(q, song));
      if (queueIdx === -1) {
        currentPlaybackQueue.push(convertSongToQueueTrack(song, newTopIdx));
      } else {
        currentPlaybackQueue[queueIdx].topTrackIndex = newTopIdx;
      }
    }
  });

  // 如果抽屉已展开，局部更新抽屉计数和列表
  const drawerEl = document.getElementById('playlistDrawer');
  if (drawerEl && drawerEl.classList.contains('active')) {
    renderDrawerPlaylist();
  }

  // 异步补齐封面
  fetchCoversForBatch(batch);
}

function updateStreamDiscCover(idx, coverUrl) {
  const disc = document.getElementById(`streamDisc${idx}`);
  if (!disc || !coverUrl) return;
  const core = disc.querySelector('.stream-disc-core');
  let img = disc.querySelector('.stream-disc-cover-img');
  if (!img) {
    img = document.createElement('img');
    img.className = 'stream-disc-cover-img';
    img.alt = '';
    img.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; border-radius:50%; object-fit:cover; pointer-events:none; z-index:2;';
    img.onload = () => { if (core) core.style.display = 'none'; };
    img.onerror = () => { img.style.display = 'none'; if (core) core.style.display = 'flex'; };
    disc.appendChild(img);
  }
  img.src = coverUrl;
  img.style.display = 'block';
}

async function resolveSongCoverUrl(song) {
  if (!song) return '';
  if (song.cover && song.cover.startsWith('http') && !song.cover.includes('injahow.cn/meting/?server=') && !song.cover.includes('param=300y300')) {
    return song.cover;
  }
  const source = song.source || 'netease';
  const rawSongId = song.onlineId || song.url_id || (song.id ? String(song.id).replace('online_', '').replace('init_', '') : '');
  const cleanSongId = (rawSongId && /^\d+$/.test(String(rawSongId))) ? String(rawSongId) : '';
  const picId = song.pic_id ? String(song.pic_id).replace('online_', '') : '';

  // 1. 对于网易云音乐，直接通过官方歌曲详情接口拉取真实专辑高清大图，100% 官方有效且绝不 404
  if ((!source || source === 'netease') && cleanSongId) {
    try {
      const detailRes = await universalFetch(`https://music.163.com/api/song/detail/?ids=%5B${cleanSongId}%5D`, { timeout: 2500 });
      if (detailRes.ok) {
        const detailData = await detailRes.json();
        const songs = detailData.songs || [];
        if (songs.length > 0 && songs[0].album && songs[0].album.picUrl) {
          const picUrl = songs[0].album.picUrl;
          if (picUrl && picUrl.startsWith('http')) {
            song.cover = picUrl;
            if (songs[0].album.picId) song.pic_id = String(songs[0].album.picId);
            return picUrl;
          }
        }
      }
    } catch(e) {}
  }

  // 2. 如果存在真实的 picId，尝试通过 GDStudio 获取 300x300 高清图直链（必须传 picId，严禁传 songId 防 404）
  if (picId && /^\d+$/.test(picId)) {
    try {
      const gdRes = await universalFetch(`https://music-api.gdstudio.xyz/api.php?types=pic&id=${picId}&source=${source}`, { timeout: 2500 });
      if (gdRes.ok) {
        const gdData = await gdRes.json();
        if (gdData && gdData.url && gdData.url.startsWith('http')) {
          song.cover = gdData.url;
          return gdData.url;
        }
      }
    } catch(e) {}
  }

  // 3. 用户自建或备用聚合接口（仅当 picId 有效时）
  if (currentApiBase && !currentApiBase.includes('injahow') && picId) {
    try {
      const picApi = `${currentApiBase}?types=pic&id=${picId}&source=${source}`;
      const res = await universalFetch(picApi, { timeout: 2500 });
      if (res.ok) {
        const d = await res.json();
        if (d && d.url && d.url.startsWith('http')) {
          song.cover = d.url;
          return d.url;
        }
      }
    } catch(e) {}
  }

  // 4. Fallback 到 Injahow 302 直链（优先用 picId，其次用 cleanSongId）
  const finalId = picId || cleanSongId;
  if (finalId) {
    const metingUrl = `https://api.injahow.cn/meting/?server=${source}&type=pic&id=${finalId}`;
    song.cover = metingUrl;
    return metingUrl;
  }

  return song.cover || '';
}

function fetchCoversForBatch(batch) {
  const needPicSongs = batch.filter(s => !s.cover && (s.pic_id || s.url_id || s.id));
  if (needPicSongs.length === 0) return;

  Promise.all(needPicSongs.map(async song => {
    try {
      const url = await resolveSongCoverUrl(song);
      if (url) {
        song.cover = url;
        const idx = topRecommendedTracks.indexOf(song);
        if (idx !== -1) {
          updateStreamDiscCover(idx, url);
        }
        const qItem = currentPlaybackQueue.find(q => isSameSongIdentifier(q, song));
        if (qItem) qItem.cover = url;
      }
    } catch(e) {}
  }));
}

async function fetchNextOnlineRecommendationBatch() {
  const seed = STREAM_RECOMMEND_SEEDS[nextStreamSeedIndex % STREAM_RECOMMEND_SEEDS.length];
  nextStreamSeedIndex++;

  try {
    const list = await requestOnlineSearch(seed, 15);
    if (!Array.isArray(list) || list.length === 0) return [];

    const result = [];
    for (const song of list) {
      const alreadyInTop = topRecommendedTracks.some(t => isSameSongIdentifier(t, song));
      const alreadyInQueue = currentPlaybackQueue.some(q => isSameSongIdentifier(q, song));
      const alreadyInLib = (ALL_LIBRARY_SONGS || []).some(s => isSameSongIdentifier(s, song));
      if (!alreadyInTop && !alreadyInQueue && !alreadyInLib) {
        song.reason = DISCOVER_NOTE_TEMPLATES[result.length % DISCOVER_NOTE_TEMPLATES.length];
        result.push(song);
        if (result.length >= 4) break;
      }
    }
    return result;
  } catch(e) {
    console.warn('获取在线推荐流异常:', e);
    return [];
  }
}

const DIVERSE_INITIAL_SONG_POOL = [
  { id: 'pool_1', name: '晴天', artist: '周杰伦', album: '叶惠美', source: 'netease', duration: 269, url_id: '186016', cover: 'https://p1.music.126.net/ZGffiDQZrGj5s_hnR1CNbg==/109951165566379710.jpg', reason: '经典流行' },
  { id: 'pool_2', name: '水星记', artist: '郭顶', album: '飞行器的执行周期', source: 'netease', duration: 325, url_id: '441491828', cover: 'https://p1.music.126.net/wSMfGvFzOAYRU_yVIfquAA==/2946691248081599.jpg', reason: '温润治愈' },
  { id: 'pool_3', name: '起风了', artist: '买辣椒也用券', album: '起风了', source: 'netease', duration: 325, url_id: '1330348068', cover: 'https://p1.music.126.net/diGAyEmpymX8G7JcnElncQ==/109951163699673355.jpg', reason: '清雅悠远' },
  { id: 'pool_4', name: '消愁', artist: '毛不易', album: '平凡的一天', source: 'netease', duration: 258, url_id: '569213220', cover: 'https://p1.music.126.net/b4Wz_l02K7uP0b7_l_G97Q==/109951163311849102.jpg', reason: '深情低语' },
  { id: 'pool_5', name: '云与海', artist: '胡夏', album: '云与海', source: 'netease', duration: 241, url_id: '1492323898', cover: 'https://p1.music.126.net/bcT_08OyUcsPAt9NU6hCxQ==/109951165434199148.jpg', reason: '温润治愈' },
  { id: 'pool_6', name: '像风一样', artist: '薛之谦', album: '渡', source: 'netease', duration: 255, url_id: '516657051', cover: 'https://p1.music.126.net/fNbj5uDwltSDLbETdnEYYQ==/109951163069265719.jpg', reason: '伴茶细酌' },
  { id: 'pool_7', name: '年轮', artist: '汪苏泷', album: '花千骨 电视剧原声带', source: 'netease', duration: 273, url_id: '32507038', cover: 'https://p1.music.126.net/H4aJb090l81W2B0l1W73uA==/109951163456381628.jpg', reason: '细腻婉转' },
  { id: 'pool_8', name: '平凡之路', artist: '朴树', album: '猎户星座', source: 'netease', duration: 301, url_id: '28815250', cover: '', reason: '清亮自由' },
  { id: 'pool_9', name: '成都', artist: '赵雷', album: '无法长大', source: 'netease', duration: 328, url_id: '439915614', cover: '', reason: '城市民谣' },
  { id: 'pool_10', name: '贝加尔湖畔', artist: '李健', album: '依然', source: 'netease', duration: 240, url_id: '36897723', cover: '', reason: '余韵悠长' },
  { id: 'pool_11', name: '红豆', artist: '王菲', album: '唱游', source: 'netease', duration: 259, url_id: '386538', cover: '', reason: '经典流传' },
  { id: 'pool_12', name: '蓝莲花', artist: '许巍', album: '时光 - 漫步', source: 'netease', duration: 270, url_id: '168036', cover: '', reason: '辽阔自由' },
  { id: 'pool_13', name: '下一站天后', artist: 'Twins', album: 'Touch Of Love', source: 'netease', duration: 204, url_id: '316892', cover: '', reason: '青春回忆' },
  { id: 'pool_14', name: '遇见', artist: '孙燕姿', album: 'The Moment', source: 'netease', duration: 210, url_id: '287035', cover: '', reason: '随心听赏' },
  { id: 'pool_15', name: '十年', artist: '陈奕迅', album: '黑白灰', source: 'netease', duration: 205, url_id: '65766', cover: '', reason: '岁月流声' },
  { id: 'pool_16', name: '江南', artist: '林俊杰', album: '第二天堂', source: 'netease', duration: 257, url_id: '108485', cover: '', reason: '江南烟雨' },
  { id: 'pool_17', name: '暖暖', artist: '梁静茹', album: '亲亲', source: 'netease', duration: 243, url_id: '253748', cover: '', reason: '暖心陪伴' },
  { id: 'pool_18', name: '爱我还是他', artist: '陶喆', album: '太平盛世', source: 'netease', duration: 292, url_id: '108242', cover: '', reason: '深情吟唱' },
  { id: 'pool_19', name: '慢慢喜欢你', artist: '莫文蔚', album: '我们在中场相遇', source: 'netease', duration: 222, url_id: '541687281', cover: '', reason: '温润人心' },
  { id: 'pool_20', name: '达尔文', artist: '蔡健雅', album: 'Goodbye & Hello', source: 'netease', duration: 264, url_id: '208902', cover: '', reason: '慢调品味' },
  { id: 'pool_21', name: '云烟成雨', artist: '房东的猫', album: '云烟成雨', source: 'netease', duration: 242, url_id: '512359195', cover: '', reason: '清澈温暖' },
  { id: 'pool_22', name: '爱人错过', artist: '告五人', album: '我肯定在几百年前就说过爱你', source: 'netease', duration: 293, url_id: '1371939273', cover: '', reason: '独立声动' },
  { id: 'pool_23', name: 'My Jinji', artist: '落日飞车', album: 'JINJI KIKKO', source: 'netease', duration: 400, url_id: '407000293', cover: '', reason: '复古浪漫' },
  { id: 'pool_24', name: 'Summer', artist: '久石让', album: '菊次郎の夏', source: 'netease', duration: 185, url_id: '443242', cover: '', reason: '清灵纯音' },
  { id: 'pool_25', name: '风居住的街道', artist: '矶村由纪子', album: '风居住的街道', source: 'netease', duration: 279, url_id: '22707008', cover: '', reason: '琴瑟共鸣' },
  { id: 'pool_26', name: '夜的钢琴曲五', artist: '石进', album: '夜的钢琴曲', source: 'netease', duration: 164, url_id: '139774', cover: '', reason: '深夜静听' },
  { id: 'pool_27', name: '总有一天会再见', artist: '棱镜', album: '总有一天会再见', source: 'netease', duration: 248, url_id: '1381755293', cover: '', reason: '真挚释怀' },
  { id: 'pool_28', name: '夜空中最亮的星', artist: '逃跑计划', album: '世界', source: 'netease', duration: 252, url_id: '25706282', cover: '', reason: '辽远明亮' },
  { id: 'pool_29', name: '卡布达', artist: '昼夜', album: '指尖的星河', source: 'netease', duration: 200, url_id: '509512338', cover: '', reason: '指尖独奏' },
  { id: 'pool_30', name: '冬天的秘密', artist: '张仲谋', album: '冬天的秘密', source: 'netease', duration: 265, url_id: '1859245776', cover: 'https://p1.music.126.net/e5cvcdgeosDKTDrkTfZXnQ==/109951166155165682.jpg', reason: '深情低语' }
];

function generateRandomDiscoverSections() {
  const shuffledPool = [...DIVERSE_INITIAL_SONG_POOL].sort(() => 0.5 - Math.random());
  const selected = shuffledPool.slice(0, 18);
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');

  const titlesPool = [
    ['灵犀新推 - 今日佳作', `灵犀精选 - ${m}.${d}私享`, '随心漫游心选'],
    ['私人专属好歌', '温润治愈慢调', '深夜私享共鸣'],
    ['小众宝藏佳作', '独立声动集萃', '慢调时光漫行']
  ];

  const secTitles = titlesPool.map(options => options[Math.floor(Math.random() * options.length)]);

  return [
    {
      title: secTitles[0],
      songs: selected.slice(0, 6)
    },
    {
      title: secTitles[1],
      songs: selected.slice(6, 12)
    },
    {
      title: secTitles[2],
      songs: selected.slice(12, 18)
    }
  ];
}

function initTopRecommendedTracks() {
  if (topRecommendedTracks && topRecommendedTracks.length > 0) return;
  const allInitSongs = [];
  currentDiscoverSections.forEach(sec => {
    (sec.songs || []).forEach(s => allInitSongs.push(s));
  });
  const shuffled = [...allInitSongs].sort(() => 0.5 - Math.random());
  topRecommendedTracks = shuffled.slice(0, 10);
  activeTopTrackIndex = 0;
}

let currentDiscoverSections = generateRandomDiscoverSections();
let currentDiscoverSongs = [];
currentDiscoverSections.forEach((sec, secIdx) => {
  sec.songs.forEach(song => {
    song._globalIdx = currentDiscoverSongs.length;
    song._secIdx = secIdx;
    currentDiscoverSongs.push(song);
  });
});

setTimeout(() => {
  if (typeof batchFillNetEaseCovers === 'function') {
    batchFillNetEaseCovers(currentDiscoverSongs).then(() => {
      renderDiscoverPane();
      renderVinylDiscs();
      updateFixedRadioCardUI();
    });
  }
}, 500);

const DISCOVER_NOTE_TEMPLATES = [
  '古典意境',
  '空谷幽兰',
  '余韵悠长',
  '弦音入耳',
  '温润人心',
  '水墨诗画',
  '百转千回',
  '灵犀心选',
  '清欢静听',
  '深情治愈'
];

function extractSongBaseKey(title) {
  if (!title) return '';
  return title
    .replace(/\(.*?\)|\[.*?\]|（.*?）|【.*?】|《.*?》/g, '')
    .replace(/-?\s*20\d\d/g, '')
    .replace(/(live|现场版|翻唱|重制版|原版|伴奏|纯伴奏|remix|dj|版本)/gi, '')
    .replace(/[\s\-_/\u00b7]/g, '')
    .toLowerCase();
}

function checkUserListensToEnglish() {
  const songs = [...(ALL_LIBRARY_SONGS || [])];
  (VINYL_ALBUMS || []).forEach(a => {
    if (a.songs) songs.push(...a.songs);
  });
  if (songs.length === 0) return false;
  // 遍历用户所有曲目，只要有任意一首纯外文/英文歌（歌名与歌手均无汉字），判定为听英文歌
  return songs.some(s => {
    const title = (s.title || s.name || '').trim();
    const artist = (s.artist || '').trim();
    if (!title && !artist) return false;
    const hasChinese = /[\u4e00-\u9fa5]/.test(title) || /[\u4e00-\u9fa5]/.test(artist);
    return !hasChinese;
  });
}

function isQualityMusic(song, allowEnglish = true) {
  if (!song) return false;
  const name = (song.name || song.title || '').trim();
  const artist = (song.artist || '').trim();
  if (!name) return false;

  // 1. 严格过滤非正规音频、片段、试听、铃声、纯伴奏等杂音
  const lowName = name.toLowerCase();
  const lowArtist = artist.toLowerCase();
  const junkKws = ['试听', '片段', '铃声', '30s', '30秒', '副歌', '高潮版', '截取', '伴奏', '纯伴奏', 'inst', 'instrumental'];
  if (junkKws.some(k => lowName.includes(k) || lowArtist.includes(k))) return false;

  // 2. 动态语言过滤：检测用户听不听英文歌，不听就加校验（必须包含中文字符），听就不加校验
  if (!allowEnglish) {
    const hasChinese = /[\u4e00-\u9fa5]/.test(name) || /[\u4e00-\u9fa5]/.test(artist);
    if (!hasChinese) return false;
  }

  // 3. 统一消毒间隔号，确保UI遵循无间隔点规范
  if (song.name) song.name = song.name.replace(/[\u00b7]/g, '-');
  if (song.title) song.title = song.title.replace(/[\u00b7]/g, '-');
  if (song.artist) song.artist = song.artist.replace(/[\u00b7]/g, '-');

  return true;
}

async function refreshRecommendations(showToast = false) {
  if (isDiscoverLoading) return;
  isDiscoverLoading = true;
  const container = document.getElementById('discoverSectionsContainer');
  if (container && (!currentDiscoverSections || currentDiscoverSections.length === 0)) {
    container.innerHTML = `
      <div style="padding:56px 20px; text-align:center; color:var(--ink-light); font-size:13px; display:flex; flex-direction:column; align-items:center; gap:12px;">
        <div style="width:26px; height:26px; border:2px solid var(--border-input); border-top-color:var(--ink-dark); border-radius:50%; animation:iconSpin 0.8s linear infinite;"></div>
        <span>正在为你探索精选好歌...</span>
      </div>
    `;
  }

  try {
    // 0. 检测使用者当前是否收听外文/英文歌曲
    const userListensEnglish = checkUserListensToEnglish();

    // 1. 深度聚合使用者的真实多维偏好画像（喜爱歌手、收藏常听、搜索足迹）
    const artistScores = {};
    const searchCandidates = [];

    // 统计收藏与曲库歌曲中喜爱的歌手（收藏歌手权重更高）
    (ALL_LIBRARY_SONGS || []).forEach(s => {
      const weight = s.isFav ? 5 : 2;
      if (s.artist && s.artist !== '未知歌手') {
        const parts = s.artist.split(/[\/,、&]/).map(a => a.trim()).filter(Boolean);
        parts.forEach(a => {
          if (userListensEnglish || /[\u4e00-\u9fa5]/.test(a)) {
            artistScores[a] = (artistScores[a] || 0) + weight;
          }
        });
      }
    });

    // 统计自建歌单歌曲
    (VINYL_ALBUMS || []).forEach(alb => {
      (alb.songs || []).forEach(s => {
        if (s.artist && s.artist !== '未知歌手') {
          const parts = s.artist.split(/[\/,、&]/).map(a => a.trim()).filter(Boolean);
          parts.forEach(a => {
            if (userListensEnglish || /[\u4e00-\u9fa5]/.test(a)) {
              artistScores[a] = (artistScores[a] || 0) + 2;
            }
          });
        }
      });
    });

    // 统计搜索历史
    (searchHistory || []).forEach(kw => {
      const trimmed = (kw || '').trim();
      if (trimmed.length >= 2 && trimmed.length <= 20) {
        if (userListensEnglish || /[\u4e00-\u9fa5]/.test(trimmed)) {
          searchCandidates.push(trimmed);
          if (artistScores[trimmed] !== undefined) {
            artistScores[trimmed] += 4;
          }
        }
      }
    });

    // 按偏好权重降序排列喜爱歌手
    const preferredArtists = Object.keys(artistScores).sort((a, b) => artistScores[b] - artistScores[a]);

    // 2. 智能种子生成（严禁单一歌手扎堆，选出 6 个完全不同的种子）
    const selectedSeeds = [];
    const usedSeedKeys = new Set();

    // 优先：从用户喜爱的歌手中随机抽取至多 6 位完全不同的歌手（绝不重复）
    if (preferredArtists.length > 0) {
      const topPool = preferredArtists.slice(0, 16).sort(() => 0.5 - Math.random());
      for (const art of topPool) {
        if (selectedSeeds.length >= 6) break;
        const low = art.toLowerCase().trim();
        if (!usedSeedKeys.has(low)) {
          usedSeedKeys.add(low);
          selectedSeeds.push({
            keyword: art,
            reason: `源自常听 - ${art}`
          });
        }
      }
    }

    // 补充：检查搜索历史中的关键词
    if (selectedSeeds.length < 6 && searchCandidates.length > 0) {
      const shuffledSearch = [...searchCandidates].sort(() => 0.5 - Math.random());
      for (const kw of shuffledSearch) {
        if (selectedSeeds.length >= 6) break;
        const low = kw.toLowerCase().trim();
        if (!usedSeedKeys.has(low)) {
          usedSeedKeys.add(low);
          selectedSeeds.push({
            keyword: kw,
            reason: '根据搜索偏好'
          });
        }
      }
    }

    // 冷启动兜底：若偏好数据不足 6 个，根据用户是否收听英文歌动态选择对应流派的歌手池
    const DIVERSE_FALLBACK_ARTISTS = userListensEnglish
      ? [
          '周杰伦', 'Taylor Swift', '林俊杰', 'Ed Sheeran', '毛不易',
          'Coldplay', '陈奕迅', 'Adele', '薛之谦', 'Billie Eilish',
          '王菲', 'Maroon 5', '许嵩', 'OneRepublic', '李健',
          'Michael Jackson', '朴树', 'Bruno Mars', '胡夏', 'Post Malone',
          '双笙', 'Avril Lavigne', '伦桑', 'Katy Perry', '汪苏泷'
        ]
      : [
          '周杰伦', '许嵩', '陈奕迅', '林俊杰', '薛之谦', '毛不易',
          '王菲', '李健', '朴树', '胡夏', '伦桑', '银临', '双笙',
          '汪苏泷', '郁可唯', '司南', '房东的猫', '蔡健雅', '郭顶',
          '梁静茹', '孙燕姿', '张惠妹', '陶喆', '莫文蔚', '赵雷', '许巍'
        ];

    const shuffledFallbacks = [...DIVERSE_FALLBACK_ARTISTS].sort(() => 0.5 - Math.random());
    for (const fbArt of shuffledFallbacks) {
      if (selectedSeeds.length >= 6) break;
      const low = fbArt.toLowerCase().trim();
      if (!usedSeedKeys.has(low)) {
        usedSeedKeys.add(low);
        selectedSeeds.push({
          keyword: fbArt,
          reason: `精选推荐 - ${fbArt}`
        });
      }
    }

    currentDiscoverSeeds = selectedSeeds.map(s => s.keyword);

    // 3. 并行拉取线上曲目（随机翻页保证每次刷新换一批，bypassCache 绕过静态缓存）
    const randomPage = Math.floor(Math.random() * 3) + 1;
    const searchPromises = selectedSeeds.map(s => requestOnlineSearch(s.keyword, 20, randomPage, true));
    const resultsLists = await Promise.all(searchPromises);

    // 4. 构建排重与合并歌曲池
    // 本地曲库歌曲核心标题库（绝不向用户推荐本地已有曲目）
    const localBaseTitles = new Set(
      (ALL_LIBRARY_SONGS || []).map(s => extractSongBaseKey(s.title || s.name || ''))
    );

    const merged = [];
    const seenOnlineIds = new Set();
    const seenBaseSongTitles = new Set();
    const artistSongCount = {};
    const seedSongCount = {};

    const maxLen = Math.max(...resultsLists.map(list => (Array.isArray(list) ? list.length : 0)));

    for (let i = 0; i < maxLen; i++) {
      for (let sIdx = 0; sIdx < selectedSeeds.length; sIdx++) {
        // 单个种子最多贡献 3 首歌曲，保障不同偏好歌手均衡呈现
        if ((seedSongCount[sIdx] || 0) >= 3) {
          continue;
        }

        const list = resultsLists[sIdx];
        if (list && list[i]) {
          const song = list[i];
          const rawTitle = song.name || song.title || '';
          const baseTitleKey = extractSongBaseKey(rawTitle);
          const rawArtist = (song.artist || '未知').trim();
          const artists = rawArtist.split(/[\/,、&]/).map(a => a.trim().toLowerCase()).filter(Boolean);
          const songKey = `${song.source || ''}_${song.url_id || song.id}`;

          // 核心拦截 1：歌名去重，严禁同一首歌（包括翻唱、版本、同名曲）出现第二次！
          if (!baseTitleKey || seenBaseSongTitles.has(baseTitleKey) || localBaseTitles.has(baseTitleKey)) {
            continue;
          }

          // 核心拦截 2：单个歌手在整份推荐中最多出现 2 首歌
          const exceedsLimit = artists.some(a => (artistSongCount[a] || 0) >= 2);
          if (exceedsLimit) {
            continue;
          }

          if (!seenOnlineIds.has(songKey) && isQualityMusic(song, userListensEnglish)) {
            seenOnlineIds.add(songKey);
            seenBaseSongTitles.add(baseTitleKey);
            seedSongCount[sIdx] = (seedSongCount[sIdx] || 0) + 1;
            artists.forEach(a => {
              artistSongCount[a] = (artistSongCount[a] || 0) + 1;
            });
            song.reason = (selectedSeeds[sIdx].reason || '精选推荐').replace(/[\u00b7]/g, '-');
            merged.push(song);
          }
        }
      }
      if (merged.length >= 24) break;
    }

    // 若依然不足 18 首，循环使用优质词汇连续补充直至填满 18 首
    if (merged.length < 18) {
      const fallbackKws = userListensEnglish
        ? ['经典流行', '热门金曲', '悠扬旋律', '宝藏好歌', '流行榜单']
        : ['国风雅韵', '经典华语', '深情好歌', '诗意古风', '清欢民谣'];
      for (const fbKw of fallbackKws) {
        if (merged.length >= 18) break;
        const fallbackList = await requestOnlineSearch(fbKw, 25, Math.floor(Math.random() * 3) + 1, true);
        if (Array.isArray(fallbackList)) {
          for (const fbSong of fallbackList) {
            const rawTitle = fbSong.name || fbSong.title || '';
            const baseTitleKey = extractSongBaseKey(rawTitle);
            const rawArtist = (fbSong.artist || '未知').trim();
            const artists = rawArtist.split(/[\/,、&]/).map(a => a.trim().toLowerCase()).filter(Boolean);
            const songKey = `${fbSong.source || ''}_${fbSong.url_id || fbSong.id}`;

            if (!baseTitleKey || seenBaseSongTitles.has(baseTitleKey) || localBaseTitles.has(baseTitleKey)) {
              continue;
            }

            const exceedsLimit = artists.some(a => (artistSongCount[a] || 0) >= 2);
            if (exceedsLimit) continue;

            if (!seenOnlineIds.has(songKey) && isQualityMusic(fbSong, userListensEnglish)) {
              seenOnlineIds.add(songKey);
              seenBaseSongTitles.add(baseTitleKey);
              artists.forEach(a => {
                artistSongCount[a] = (artistSongCount[a] || 0) + 1;
              });
              const template = DISCOVER_NOTE_TEMPLATES[(merged.length) % DISCOVER_NOTE_TEMPLATES.length];
              fbSong.reason = template.replace(/[\u00b7]/g, '-');
              merged.push(fbSong);
            }
            if (merged.length >= 24) break;
          }
        }
      }
    }

    // 5. 构建多板块双列横滑流分组（每个板块 6 首歌曲，每列 3 首）
    // 100% 采用线上动态精选歌曲，绝不向板块尾部追加硬编码静态歌曲！
    const sec1Songs = merged.slice(0, 6);
    const sec2Songs = merged.slice(6, 12);
    const sec3Songs = merged.slice(12, 18);

    const nowMonthDay = (() => {
      const now = new Date();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      return `${m}.${d}`;
    })();

    currentDiscoverSections = [
      {
        title: `灵犀新推 - ${nowMonthDay}佳作`,
        songs: sec1Songs
      },
      {
        title: '私人专属好歌',
        songs: sec2Songs
      },
      {
        title: '小众宝藏佳作',
        songs: sec3Songs
      }
    ];

    // 同步展平为扁平数组供查找与播放
    currentDiscoverSongs = [];
    currentDiscoverSections.forEach((sec, secIdx) => {
      sec.songs.forEach(song => {
        song._globalIdx = currentDiscoverSongs.length;
        song._secIdx = secIdx;
        currentDiscoverSongs.push(song);
      });
    });

    // 立即通过网易云原生批量接口补齐全部曲目的高清专辑封面
    await batchFillNetEaseCovers(currentDiscoverSongs);

    // 6. 更新顶部黑胶唱片的随机推荐曲目流，并自动滚动回第一张唱片
    const freshTop = [...currentDiscoverSongs].sort(() => 0.5 - Math.random()).slice(0, 10);
    topRecommendedTracks = freshTop;
    activeTopTrackIndex = 0;
    renderVinylDiscs();
    if (typeof scrollVinylToTrack === 'function') {
      scrollVinylToTrack(0, false);
    } else {
      updateFixedRadioCardUI();
    }

    renderDiscoverPane();
    if (showToast) toast('已为您换了一批精选好歌');
  } catch (err) {
    console.warn('推荐生成异常:', err);
    if (showToast) toast('网络连接较慢，推荐获取失败');
  } finally {
    isDiscoverLoading = false;
  }
}

function renderDiscoverPane() {
  const container = document.getElementById('discoverSectionsContainer');
  if (!container) return;

  if (!currentDiscoverSections || currentDiscoverSections.length === 0 || currentDiscoverSongs.length === 0) {
    container.innerHTML = `
      <div style="padding:60px 20px; text-align:center; color:var(--ink-light); font-size:13px; display:flex; flex-direction:column; align-items:center; gap:12px;">
        <span>暂无推荐歌曲，点击下方刷新探索</span>
        <button class="discover-btn-refresh" onclick="refreshRecommendations(true)" style="margin-top:6px;">
          <span>探索好歌</span>
        </button>
      </div>
    `;
    return;
  }

  const curPlayingSong = currentPlaybackQueue[currentIndex];

  container.innerHTML = `
    <div class="discover-sections-wrap">
      ${currentDiscoverSections.map((sec, secIdx) => `
        <div class="discover-section-block">
          <div class="discover-section-header">
            <div class="discover-section-title-wrap" onclick="playDiscoverSection(${secIdx})">
              <span class="discover-section-title">${escapeHtml(sec.title)}</span>
              <div class="discover-section-play-btn" title="播放此板块">
                <svg viewBox="0 0 24 24"><polygon points="7 4 19 12 7 20 7 4"/></svg>
              </div>
            </div>
            <div class="discover-section-more" onclick="refreshRecommendations(true)" title="换一组推荐">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          </div>
          <div class="discover-columns-scroll">
            ${(() => {
              const cols = [];
              for (let i = 0; i < sec.songs.length; i += 3) {
                cols.push(sec.songs.slice(i, i + 3));
              }
              return cols.map(colSongs => `
                <div class="discover-column">
                  ${colSongs.map(song => {
                    const globalIdx = song._globalIdx;
                    const isCurPlaying = curPlayingSong && 
                      (curPlayingSong.id === 'online_' + song.id || (curPlayingSong.title === song.name && curPlayingSong.artist === song.artist)) && 
                      isPlaying;

                    const isFav = ALL_LIBRARY_SONGS.some(item => 
                      (item.id === 'online_' + song.id || 
                       item.onlineId === (song.url_id || song.id) || 
                       (item.title === song.name && item.artist === song.artist)) && 
                      item.isFav
                    );

                    const coverUrl = song.cover || song.pic || '';

                    return `
                      <div class="discover-card-row ${isCurPlaying ? 'playing' : ''}" data-song-id="${song.id}" onclick="playDiscoverTrack(${globalIdx})">
                        <div class="discover-card-cover-wrap">
                          ${coverUrl ? `
                            <img src="${coverUrl}" class="discover-card-cover" alt="cover" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                          ` : ''}
                          <div style="display:${coverUrl ? 'none' : 'flex'}; width:100%; height:100%; align-items:center; justify-content:center; color:var(--ink-light); background:var(--claude-pill-bg);">
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                          </div>
                          ${isCurPlaying ? `
                            <div class="playing-bars" style="z-index:4;"><div class="bar"></div><div class="bar"></div><div class="bar"></div></div>
                          ` : ''}
                        </div>
                        <div class="discover-card-info">
                          <div class="discover-card-title">${escapeHtml(formatCleanTitle(song.name || song.title))}</div>
                          <div class="discover-card-artist">${escapeHtml(formatCleanArtist(song.artist))}</div>
                          <div class="discover-card-reason">${escapeHtml(song.reason || '灵犀心选')}</div>
                        </div>
                        <div class="discover-card-fav ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleDiscoverSongFav(${globalIdx})" title="收藏">
                          <svg viewBox="0 0 24 24" width="20" height="20" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.4">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                          </svg>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              `).join('');
            })()}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function updateDiscoverCardPlayingStates() {
  const curPlayingSong = currentPlaybackQueue[currentIndex];
  const rows = document.querySelectorAll('.discover-card-row');
  rows.forEach(row => {
    const sId = row.getAttribute('data-song-id');
    const isThisPlaying = isPlaying && curPlayingSong && sId && (
      curPlayingSong.id === 'online_' + sId ||
      String(curPlayingSong.onlineId) === sId ||
      String(curPlayingSong.id).replace('online_', '') === sId
    );
    row.classList.toggle('playing', !!isThisPlaying);
    let bars = row.querySelector('.playing-bars');
    if (isThisPlaying) {
      if (!bars) {
        const coverWrap = row.querySelector('.discover-card-cover-wrap');
        if (coverWrap) {
          bars = document.createElement('div');
          bars.className = 'playing-bars';
          bars.style.zIndex = '4';
          bars.innerHTML = '<div class="bar"></div><div class="bar"></div><div class="bar"></div>';
          coverWrap.appendChild(bars);
        }
      }
    } else {
      if (bars) bars.remove();
    }
  });
}

function updateAllPlayingRowStates() {
  const curPlayingSong = currentPlaybackQueue[currentIndex];
  const curId = curPlayingSong ? (curPlayingSong.id || '') : '';
  const curOnlineId = curPlayingSong ? (curPlayingSong.onlineId || (curId.startsWith('online_') ? curId.replace('online_', '') : '')) : '';

  const rows = document.querySelectorAll('.song-row');
  rows.forEach(row => {
    const sId = row.getAttribute('data-song-id');
    const sIdxStr = row.getAttribute('data-song-idx');
    let isThisPlaying = false;

    if (row.closest('#drawerItemsList') && sIdxStr !== null) {
      const rowIdx = parseInt(sIdxStr, 10);
      const isCurrentRow = (rowIdx === currentIndex);
      row.classList.toggle('playing', isCurrentRow);
      const col = row.querySelector('.song-index-col');
      if (col) {
        if (isCurrentRow) {
          col.innerHTML = `
            <div class="playing-equalizer-bars ${isPlaying ? 'animated' : 'paused'}">
              <span class="eq-bar bar-1"></span>
              <span class="eq-bar bar-2"></span>
              <span class="eq-bar bar-3"></span>
            </div>
          `;
        } else {
          col.innerHTML = `<span class="drawer-song-index">${rowIdx + 1}</span>`;
        }
      }
    } else {
      if (isPlaying && curPlayingSong) {
        if (sId && curId && (sId === curId || (curOnlineId && (sId === curOnlineId || sId === 'online_' + curOnlineId)))) {
          isThisPlaying = true;
        }
      }
      row.classList.toggle('playing', isThisPlaying);
    }
  });
}

function playDiscoverSection(secIdx) {
  const sec = currentDiscoverSections[secIdx];
  if (!sec || !sec.songs || sec.songs.length === 0) return;

  isDiscoverRecommendationQueue = true;

  // 当前板块歌曲排在最前，随后连接顶部卡片与发现页余下歌曲
  const queue = (sec.songs || []).map(song => convertSongToQueueTrack(song, -1));

  (topRecommendedTracks || []).forEach((song, sIdx) => {
    if (!queue.some(q => isSameSongIdentifier(q, song))) {
      queue.push(convertSongToQueueTrack(song, sIdx));
    }
  });

  (currentDiscoverSongs || []).forEach(dSong => {
    if (!queue.some(q => isSameSongIdentifier(q, dSong))) {
      queue.push(convertSongToQueueTrack(dSong, -1));
    }
  });

  currentPlaybackQueue = queue;
  currentIndex = 0;
  openPlayerFull();
  playSongAtQueue(0);
  toast(`开始播放「${sec.title}」`);

  if (currentPlaybackQueue.length <= 3) {
    ensureMoreRecommendationsSilently();
  }
}

function playDiscoverTrack(idx) {
  const item = currentDiscoverSongs[idx];
  if (!item) return;

  isDiscoverRecommendationQueue = true;

  // 构建包含全部推荐歌曲的队列
  const queue = (topRecommendedTracks || []).map((song, sIdx) => convertSongToQueueTrack(song, sIdx));

  (currentDiscoverSongs || []).forEach(dSong => {
    const exists = queue.some(q => isSameSongIdentifier(q, dSong));
    if (!exists) {
      queue.push(convertSongToQueueTrack(dSong, -1));
    }
  });

  let targetIdx = queue.findIndex(q => isSameSongIdentifier(q, item));
  if (targetIdx === -1) {
    queue.push(convertSongToQueueTrack(item, -1));
    targetIdx = queue.length - 1;
  }

  currentPlaybackQueue = queue;
  currentIndex = targetIdx;

  openPlayerFull();
  playSongAtQueue(currentIndex);

  if (currentIndex >= currentPlaybackQueue.length - 3) {
    ensureMoreRecommendationsSilently();
  }
}

function playAllDiscoverTracks() {
  if (!currentDiscoverSongs || currentDiscoverSongs.length === 0) {
    toast('暂无可播放的推荐歌曲');
    return;
  }

  isDiscoverRecommendationQueue = true;
  const queue = (topRecommendedTracks || []).map((song, sIdx) => convertSongToQueueTrack(song, sIdx));

  (currentDiscoverSongs || []).forEach(dSong => {
    if (!queue.some(q => isSameSongIdentifier(q, dSong))) {
      queue.push(convertSongToQueueTrack(dSong, -1));
    }
  });

  currentPlaybackQueue = queue;
  currentIndex = 0;
  openPlayerFull();
  playSongAtQueue(0);
  toast('开始播放灵犀推荐');
}

function toggleDiscoverSongFav(idx) {
  const item = currentDiscoverSongs[idx];
  if (!item) return;

  let targetInLib = ALL_LIBRARY_SONGS.find(s => 
    s.id === 'online_' + item.id || 
    s.onlineId === (item.url_id || item.id) || 
    (s.title === item.name && s.artist === item.artist)
  );

  let isNowFav = false;

  if (targetInLib) {
    targetInLib.isFav = !targetInLib.isFav;
    isNowFav = targetInLib.isFav;
    const favAlb = VINYL_ALBUMS.find(a => a.id === 'alb_fav') || VINYL_ALBUMS[1];
    if (favAlb && favAlb.songs) {
      if (isNowFav) {
        if (!favAlb.songs.some(s => s.id === targetInLib.id)) {
          favAlb.songs.unshift(targetInLib);
        }
      } else {
        favAlb.songs = favAlb.songs.filter(s => s.id !== targetInLib.id);
      }
    }
  } else {
    isNowFav = true;
    targetInLib = {
      id: 'online_' + item.id,
      onlineId: item.url_id || item.id,
      source: item.source || 'netease',
      title: item.name,
      artist: item.artist,
      album: item.album || '',
      duration: item.duration || 240,
      fileUrl: '',
      urlFetchedAt: 0,
      cover: item.cover || item.pic || '',
      pic_id: item.pic_id || item.url_id || item.id,
      lyric_id: item.lyric_id || item.url_id || item.id,
      isFav: true
    };
    ALL_LIBRARY_SONGS.unshift(targetInLib);
    const favAlb = VINYL_ALBUMS.find(a => a.id === 'alb_fav') || VINYL_ALBUMS[1];
    if (favAlb && !favAlb.songs.some(s => s.id === targetInLib.id)) {
      favAlb.songs.unshift(targetInLib);
    }
    ensureSongCover(targetInLib);
  }

  // 同步当前播放队列状态
  const qSong = currentPlaybackQueue.find(s => s.id === targetInLib.id || (s.title === targetInLib.title && s.artist === targetInLib.artist));
  if (qSong) qSong.isFav = isNowFav;

  persistData();

  // 100% 精准局部更新发现页爱心图标，绝不重绘发现页，绝不刷新正方形卡片
  const cardRow = document.querySelector(`.discover-card-row[data-song-id="${item.id}"]`);
  if (cardRow) {
    const favBtn = cardRow.querySelector('.discover-card-fav');
    if (favBtn) {
      favBtn.classList.toggle('active', isNowFav);
      const svg = favBtn.querySelector('svg');
      if (svg) svg.setAttribute('fill', isNowFav ? 'currentColor' : 'none');
    }
  }

  // 同步曲库列表（如果存在）
  const libFavBtns = document.querySelectorAll(`.fav-btn[data-song-id="${targetInLib.id}"]`);
  libFavBtns.forEach(btn => {
    btn.classList.toggle('active', isNowFav);
    const svg = btn.querySelector('svg');
    if (svg) svg.setAttribute('fill', isNowFav ? 'currentColor' : 'none');
  });

  toast(isNowFav ? `已收藏《${item.name}》` : `已取消收藏《${item.name}》`);
}

function openDiscoverSongMenu(e, idx) {
  if (e && e.stopPropagation) e.stopPropagation();
  const item = currentDiscoverSongs[idx];
  if (!item) return;

  window._isSearchResultMenu = true;
  currentActionSong = {
    id: 'online_' + item.id,
    onlineId: item.url_id || item.id,
    pic_id: item.pic_id || '',
    source: item.source || 'netease',
    title: item.name,
    artist: item.artist,
    album: item.album || '',
    duration: 240,
    fileUrl: '',
    cover: item.cover || '',
    isFav: false
  };

  if (!currentActionSong.cover && (currentActionSong.pic_id || currentActionSong.onlineId)) {
    ensureSongCover(currentActionSong);
  }

  const isFav = ALL_LIBRARY_SONGS.some(itemInLib => 
    (itemInLib.id === currentActionSong.id || 
     (itemInLib.title === currentActionSong.title && itemInLib.artist === currentActionSong.artist)) && 
    itemInLib.isFav
  );

  currentActionSong.isFav = isFav;
  document.getElementById('sheetSongTitle').textContent = `歌曲：${item.name}`;
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
  document.getElementById('songMenuOverlay').classList.add('active');
}

/* 自定义音源弹窗与接口通道选择器管理 */
const API_CHANNELS = {
  injahow: {
    title: 'Injahow 镜像 (高可用)',
    desc: '推荐 - 实时鉴权 302 直链',
    url: 'https://api.injahow.cn/meting/'
  },
  gdstudio: {
    title: 'GDStudio 聚合',
    desc: '备用 - 多音源聚合解析通道',
    url: 'https://music-api.gdstudio.xyz/api.php'
  },
  custom: {
    title: '自定义私有接口',
    desc: '填入第三方或自建兼容 API',
    url: ''
  }
};

let selectedApiChannelKey = 'injahow';

function openApiConfigModal() {
  const overlay = document.getElementById('apiConfigModal');
  if (!overlay) return;

  let currentKey = 'injahow';
  if (!currentApiBase || currentApiBase.includes('injahow')) {
    currentKey = 'injahow';
  } else if (currentApiBase === DEFAULT_API_BASE || currentApiBase.includes('gdstudio')) {
    currentKey = 'gdstudio';
  } else {
    currentKey = 'custom';
  }

  selectedApiChannelKey = currentKey;

  ['injahow', 'gdstudio', 'custom'].forEach(k => {
    const row = document.getElementById(`apiOpt_${k}`);
    if (row) row.classList.toggle('selected', k === currentKey);
  });

  overlay.classList.add('active');
}

function closeApiConfigModal(e) {
  if (!e || e.target === e.currentTarget) {
    const el = document.getElementById('apiConfigModal');
    if (el) el.classList.remove('active');
  }
}

function selectApiChannelDirect(key, rowEl) {
  if (key === 'custom') {
    openCustomApiModal();
    return;
  }

  selectedApiChannelKey = key;
  ['injahow', 'gdstudio', 'custom'].forEach(k => {
    const row = document.getElementById(`apiOpt_${k}`);
    if (row) row.classList.toggle('selected', k === key);
  });

  if (key === 'injahow') {
    currentApiBase = API_CHANNELS.injahow.url;
    localStorage.setItem('yyrc_api_base', currentApiBase);
    updateApiDescText();
    setTimeout(() => {
      const modal = document.getElementById('apiConfigModal');
      if (modal) modal.classList.remove('active');
    }, 120);
    toast('已切换至 Injahow 镜像通道');
  } else if (key === 'gdstudio') {
    currentApiBase = API_CHANNELS.gdstudio.url;
    localStorage.setItem('yyrc_api_base', currentApiBase);
    updateApiDescText();
    setTimeout(() => {
      const modal = document.getElementById('apiConfigModal');
      if (modal) modal.classList.remove('active');
    }, 120);
    toast('已切换至 GDStudio 聚合解析');
  }
}

function openCustomApiModal() {
  const modal = document.getElementById('customApiModal');
  if (!modal) return;
  const inputEl = document.getElementById('apiServerInput');
  if (inputEl) {
    if (currentApiBase && !currentApiBase.includes('injahow') && !currentApiBase.includes('gdstudio')) {
      inputEl.value = currentApiBase;
    } else {
      inputEl.value = '';
    }
  }
  modal.classList.add('active');
  if (inputEl) {
    setTimeout(() => inputEl.focus(), 150);
  }
}

function closeCustomApiModal(e) {
  if (!e || e.target === e.currentTarget || (e.target && e.target.closest && e.target.closest('.modern-pill-cancel'))) {
    const modal = document.getElementById('customApiModal');
    if (modal) modal.classList.remove('active');
  }
}

function saveCustomApiUrl() {
  const inputEl = document.getElementById('apiServerInput');
  const val = inputEl ? inputEl.value.trim() : '';
  if (!val) {
    toast('请输入有效的自定义接口地址');
    return;
  }
  selectedApiChannelKey = 'custom';
  currentApiBase = val;
  localStorage.setItem('yyrc_api_base', currentApiBase);
  updateApiDescText();

  ['injahow', 'gdstudio', 'custom'].forEach(k => {
    const row = document.getElementById(`apiOpt_${k}`);
    if (row) row.classList.toggle('selected', k === 'custom');
  });

  toast('已应用自定义私有接口');
  closeCustomApiModal();
}

function updateApiDescText() {
  const descEl = document.getElementById('currentApiServerDesc');
  if (descEl) {
    if (!currentApiBase || currentApiBase.includes('injahow')) {
      descEl.textContent = 'Injahow 镜像 (高可用)';
    } else if (currentApiBase === DEFAULT_API_BASE || currentApiBase.includes('gdstudio')) {
      descEl.textContent = 'GDStudio 聚合解析通道';
    } else {
      descEl.textContent = '私有接口 - ' + currentApiBase.replace(/^https?:\/\//, '').slice(0, 18) + '...';
    }
  }
}

// 动态注入并呈现应用实际版本号（从 Android 系统 PackageInfo 动态获取）
function updateDynamicAppVersion(ver) {
  if (!ver && window.AndroidBridge && window.AndroidBridge.getAppVersion) {
    try {
      ver = window.AndroidBridge.getAppVersion();
    } catch(e) {}
  }
  if (!ver) ver = '2.1.8';
  APP_CONFIG.version = ver;
  const descEl = document.getElementById('aboutAppVersionDesc');
  if (descEl) {
    descEl.textContent = '自用无损音乐播放器 - v' + ver;
  }
}
window.updateDynamicAppVersion = updateDynamicAppVersion;

let isAudioFocusEnabled = true;
let isVideoAutoPauseEnabled = localStorage.getItem('lingxi_video_auto_pause') !== 'false';

function initAudioFocusSetting() {
  isAudioFocusEnabled = true;
  updateAudioFocusUI();
  updateVideoAutoPauseUI();
  if (window.AndroidBridge) {
    if (window.AndroidBridge.setAudioFocusEnabled) {
      try { window.AndroidBridge.setAudioFocusEnabled(true); } catch(e) {}
    }
    if (window.AndroidBridge.setVideoAutoPauseEnabled) {
      try { window.AndroidBridge.setVideoAutoPauseEnabled(isVideoAutoPauseEnabled); } catch(e) {}
    }
  }
}

function updateAudioFocusUI() {
  const toggle = document.getElementById('audioFocusToggle');
  if (toggle) {
    toggle.classList.add('active');
  }
}

function toggleAudioFocusSetting() {
  toast('通话与录音自动暂停已强制开启，确保通话清晰与录音纯净');
}

function updateVideoAutoPauseUI() {
  const toggle = document.getElementById('videoAutoPauseToggle');
  const desc = document.getElementById('videoAutoPauseDesc');
  if (toggle) {
    toggle.classList.toggle('active', isVideoAutoPauseEnabled);
  }
  if (desc) {
    desc.textContent = isVideoAutoPauseEnabled
      ? '已开启 - 其他应用播放视频时自动暂停音乐'
      : '已关闭 - 允许与其他应用视频声音并存';
  }
}

function toggleVideoAutoPauseSetting() {
  isVideoAutoPauseEnabled = !isVideoAutoPauseEnabled;
  localStorage.setItem('lingxi_video_auto_pause', isVideoAutoPauseEnabled ? 'true' : 'false');
  if (window.AndroidBridge && window.AndroidBridge.setVideoAutoPauseEnabled) {
    try {
      window.AndroidBridge.setVideoAutoPauseEnabled(isVideoAutoPauseEnabled);
    } catch(e) {}
  }
  updateVideoAutoPauseUI();
  toast(isVideoAutoPauseEnabled ? '已开启播放视频时自动暂停' : '已关闭播放视频时自动暂停');
}

async function updateCacheStorageDisplay() {
  const descEl = document.getElementById('cacheStorageDesc');
  if (!descEl) return;
  let totalBytes = 0;
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      if (estimate && estimate.usage) {
        totalBytes = estimate.usage;
      }
    }
  } catch(e) {}

  try {
    const lrcCache = localStorage.getItem('yyrc_lyrics_cache');
    if (lrcCache) totalBytes += (lrcCache.length * 2);
  } catch(e) {}

  let sizeStr = '0 KB';
  if (totalBytes > 1024 * 1024) {
    sizeStr = (totalBytes / (1024 * 1024)).toFixed(1) + ' MB';
  } else if (totalBytes > 0) {
    sizeStr = Math.max(1, Math.round(totalBytes / 1024)) + ' KB';
  }
  descEl.textContent = `释放临时存储 - 当前占用 ${sizeStr}`;
}

async function clearCachedMedia() {
  let freedBytes = 0;

  // 1. 估算清理前实际占用
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      if (estimate && estimate.usage) freedBytes += estimate.usage;
    }
  } catch(e) {}

  // 2. 真实清理浏览器 Cache Storage
  try {
    if ('caches' in window) {
      const names = await caches.keys();
      for (const name of names) {
        await caches.delete(name);
      }
    }
  } catch(e) {}

  // 3. 真实清理已缓存歌词 (yyrc_lyrics_cache)
  try {
    const lrcCache = localStorage.getItem('yyrc_lyrics_cache');
    if (lrcCache) {
      freedBytes += (lrcCache.length * 2);
      localStorage.removeItem('yyrc_lyrics_cache');
    }
  } catch(e) {}

  // 4. 释放正在缓冲的音频 blob 内存
  try {
    if (audioPlayer && audioPlayer.src && audioPlayer.src.startsWith('blob:')) {
      URL.revokeObjectURL(audioPlayer.src);
    }
  } catch(e) {}

  // 5. 格式化真实释放的容量
  let freedStr = '';
  if (freedBytes > 1024 * 1024) {
    freedStr = (freedBytes / (1024 * 1024)).toFixed(1) + ' MB';
  } else if (freedBytes > 0) {
    freedStr = Math.max(1, Math.round(freedBytes / 1024)) + ' KB';
  }

  // 6. 动态更新设置描述文案
  const descEl = document.getElementById('cacheStorageDesc');
  if (descEl) descEl.textContent = '释放临时存储 - 当前占用 0 KB';

  if (freedStr && freedBytes > 1024) {
    toast(`已清理临时媒体与歌词缓存，释放 ${freedStr}`);
  } else {
    toast('已清理全部临时媒体与歌词缓存');
  }
}

const PLAY_MODES = [
  {
    key: 'list',
    name: '列表循环',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>`
  },
  {
    key: 'single',
    name: '单曲循环',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/><path d="M11.4 10.3l1.2-.8v5" stroke-width="1.2"/></svg>`
  },
  {
    key: 'random',
    name: '随机播放',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17.5h3.5c2.4 0 4.2-2.2 5.6-5.5s3.2-5.5 5.6-5.5H20"/><path d="M17.5 4l3 2.5-3 2.5"/><path d="M4 6.5h3.5c2.4 0 4.2 2.2 5.6 5.5s3.2 5.5 5.6 5.5H20"/><path d="M17.5 15l3 2.5-3 2.5"/></svg>`
  }
];

function applyPlayModeUI(modeKey) {
  const modeObj = PLAY_MODES.find(m => m.key === modeKey) || PLAY_MODES[0];
  const playBtn = document.getElementById('playModeBtn');
  if (playBtn) {
    playBtn.innerHTML = modeObj.svg;
    playBtn.title = `播放模式: ${modeObj.name}`;
  }
  const drawerIcon = document.getElementById('drawerPlayModeIcon');
  const drawerText = document.getElementById('drawerPlayModeText');
  if (drawerIcon) {
    drawerIcon.innerHTML = modeObj.svg;
    const s = drawerIcon.querySelector('svg');
    if (s) { s.style.width = '14px'; s.style.height = '14px'; }
  }
  if (drawerText) {
    drawerText.textContent = modeObj.name;
  }
  const islandBtn = document.getElementById('islandModeBtn');
  if (islandBtn) {
    islandBtn.innerHTML = modeObj.svg;
    islandBtn.title = `播放模式: ${modeObj.name}`;
  }
}

function togglePlayMode() {
  const curIdx = PLAY_MODES.findIndex(m => m.key === playMode);
  const nextIdx = (curIdx + 1) % PLAY_MODES.length;
  playMode = PLAY_MODES[nextIdx].key;
  localStorage.setItem('yyrc_play_mode', playMode);
  applyPlayModeUI(playMode);
  toast(PLAY_MODES[nextIdx].name);
}

function playPrev() {
  if (!currentPlaybackQueue.length) return;
  if (playMode === 'random') {
    let prev = Math.floor(Math.random() * currentPlaybackQueue.length);
    if (currentPlaybackQueue.length > 1 && prev === currentIndex) {
      prev = (prev - 1 + currentPlaybackQueue.length) % currentPlaybackQueue.length;
    }
    playSongAtQueue(prev);
  } else if (playMode === 'order') {
    if (currentIndex > 0) {
      playSongAtQueue(currentIndex - 1);
    } else {
      toast('已是列表第一首');
    }
  } else {
    let prev = currentIndex - 1;
    if (prev < 0) prev = currentPlaybackQueue.length - 1;
    playSongAtQueue(prev);
  }
}

function playNext() {
  if (!currentPlaybackQueue.length) return;
  if (isDiscoverRecommendationQueue && currentIndex >= currentPlaybackQueue.length - 3) {
    if (typeof ensureMoreRecommendationsSilently === 'function') {
      ensureMoreRecommendationsSilently();
    }
  }
  if (playMode === 'random') {
    let next = Math.floor(Math.random() * currentPlaybackQueue.length);
    if (currentPlaybackQueue.length > 1 && next === currentIndex) {
      next = (next + 1) % currentPlaybackQueue.length;
    }
    playSongAtQueue(next);
  } else if (playMode === 'order') {
    if (currentIndex < currentPlaybackQueue.length - 1) {
      playSongAtQueue(currentIndex + 1);
    } else {
      toast('已是列表最后一首');
    }
  } else {
    let next = currentIndex + 1;
    if (next >= currentPlaybackQueue.length) next = 0;
    playSongAtQueue(next);
  }
}

function syncProgress() {
  if (isDraggingProgressBar) return;
  if (document.hidden) return; // 切后台彻底跳过 DOM 刷新与样式重绘！
  const song = currentPlaybackQueue[currentIndex];
  let duration = (song && song.duration > 0) ? song.duration : 180;
  if (isNativeAudioSupported) {
    const nd = window.AndroidBridge.getNativeDuration ? window.AndroidBridge.getNativeDuration() : 0;
    if (nd > 0) {
      const realDur = Math.floor(nd);
      // 若原生解码上报真实音频流时长与元数据不符，以底层流真实时长为准动态校准
      if (song && Math.abs(song.duration - realDur) >= 1) {
        song.duration = realDur;
        const totalTimeEl = document.getElementById('totalTime');
        if (totalTimeEl) totalTimeEl.textContent = formatTime(realDur);
      }
      duration = realDur;
    }
    if (!isSeekingAudio) {
      const np = window.AndroidBridge.getNativePosition ? window.AndroidBridge.getNativePosition() : currentSec;
      if (typeof np === 'number' && np >= 0) {
        const hasPrepared = window.AndroidBridge.isNativePrepared ? window.AndroidBridge.isNativePrepared() : false;
        if (hasPrepared || np <= duration) {
          currentSec = np;
        } else {
          currentSec = 0;
        }
      }
    }
  } else {
    if (!isNaN(audioPlayer.duration) && audioPlayer.duration > 0) {
      const realDur = Math.floor(audioPlayer.duration);
      if (song && Math.abs(song.duration - realDur) >= 1) {
        song.duration = realDur;
        const totalTimeEl = document.getElementById('totalTime');
        if (totalTimeEl) totalTimeEl.textContent = formatTime(realDur);
      }
      duration = realDur;
    }
    if ((isPlaying || !audioPlayer.paused) && !isNaN(audioPlayer.currentTime) && audioPlayer.currentTime >= 0 && !isSeekingAudio) {
      currentSec = audioPlayer.currentTime;
    }
  }

  if (song && (!song.duration || song.duration <= 0) && duration > 0) {
    song.duration = Math.floor(duration);
    const totalTimeEl = document.getElementById('totalTime');
    if (totalTimeEl) totalTimeEl.textContent = formatTime(song.duration);
  }

  // 严格校准：仅在底层真实准备就绪且时长确实偏大时才动态调整
  const isReallyPrepared = !isNativeAudioSupported || (window.AndroidBridge.isNativePrepared && window.AndroidBridge.isNativePrepared());
  if (isReallyPrepared && currentSec > duration && duration > 0) {
    duration = Math.ceil(currentSec);
    if (song) {
      song.duration = duration;
      const totalTimeEl = document.getElementById('totalTime');
      if (totalTimeEl) totalTimeEl.textContent = formatTime(duration);
    }
  }

  // 严格钳位：当前播放进度绝不允许大于总时间
  if (duration > 0 && currentSec > duration) {
    currentSec = duration;
  }

  const ratio = Math.min(1, Math.max(0, currentSec / (duration > 0 ? duration : 1)));
  const pct = (ratio * 100).toFixed(1);

  const seekFill = document.getElementById('seekFill');
  if (seekFill) seekFill.style.width = pct + '%';
  const seekThumb = document.getElementById('seekThumb');
  if (seekThumb) seekThumb.style.left = pct + '%';
  const curTime = document.getElementById('curTime');
  if (curTime) curTime.textContent = formatTime(Math.min(currentSec, duration));

  const ring = document.getElementById('bottomDiscRing');
  if (ring) ring.style.strokeDashoffset = RING_PERIMETER * (1 - ratio);
}

function updateUI() {
  const song = currentPlaybackQueue[currentIndex] || ALL_LIBRARY_SONGS[0];
  applySongCoverToUI(song ? (song.cover || '') : '');
  const pauseSvg = '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="3.5" height="16" fill="currentColor"/><rect x="14.5" y="4" width="3.5" height="16" fill="currentColor"/></svg>';
  const playSvg = '<svg viewBox="0 0 24 24"><polygon points="7 4 20 12 7 20 7 4"/></svg>';

  document.getElementById('bigPlayBtn').innerHTML = isPlaying ? pauseSvg : playSvg;
  document.getElementById('plate').classList.toggle('paused', !isPlaying);
  document.getElementById('tonearm').classList.toggle('paused', !isPlaying);

  document.getElementById('bottomDisc').classList.toggle('playing', isPlaying);
  // 双重系统媒体卡片同步 (Web MediaSession + Android 原生通知栏播控卡片)
  if ('mediaSession' in navigator && song) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title || '灵犀音乐',
        artist: song.artist || '随心听',
        album: '灵犀音乐',
        artwork: [{ src: song.cover || 'icon.png', sizes: '512x512', type: 'image/png' }]
      });
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    } catch(e) {}
  }
  if (window.AndroidBridge && song) {
    try {
      const curSec = isNativeAudioSupported
        ? (window.AndroidBridge.getNativePosition ? window.AndroidBridge.getNativePosition() : currentSec)
        : ((typeof audioPlayer !== 'undefined' && audioPlayer) ? (audioPlayer.currentTime || 0) : 0);
      const durSec = song.duration || 180;
      const isFav = !!song.isFav;
      if (window.AndroidBridge.updateMediaCardFull) {
        window.AndroidBridge.updateMediaCardFull(song.title || '灵犀音乐', song.artist || '随心听', song.cover || '', isPlaying, isFav, curSec, durSec);
      } else if (window.AndroidBridge.updateMediaCardWithCover) {
        window.AndroidBridge.updateMediaCardWithCover(song.title || '灵犀音乐', song.artist || '随心听', song.cover || '', isPlaying);
      } else if (window.AndroidBridge.updateMediaCard) {
        window.AndroidBridge.updateMediaCard(song.title || '灵犀音乐', song.artist || '随心听', isPlaying);
      }
    } catch(e) {}
  }
  if (typeof syncCurrentLyricToDesktop === 'function') {
    syncCurrentLyricToDesktop();
  }

  document.getElementById('fullPlayerSongTitle').textContent = song.title;
  document.getElementById('fullPlayerArtist').textContent = song.artist;
  document.getElementById('totalTime').textContent = formatTime(song.duration);
  const heartBtn = document.getElementById('topHeartBtn') || document.getElementById('bottomHeartBtn');
  if (heartBtn) heartBtn.classList.toggle('unfav', !song.isFav);

  if (typeof updateFixedRadioCardUI === 'function') {
    updateFixedRadioCardUI();
  }

  // 动态同步当前播放列表抽屉内正在播放歌曲的音波跳跃律动
  const drawerBars = document.querySelectorAll('.playlist-items .playing-equalizer-bars');
  drawerBars.forEach(b => {
    b.classList.toggle('animated', isPlaying);
    b.classList.toggle('paused', !isPlaying);
  });

  for (let i = 0; i < (topRecommendedTracks || []).length; i++) {
    const d = document.getElementById('streamDisc' + i);
    const track = topRecommendedTracks[i];
    const isThisPlaying = track && isPlaying && song && isSameSongIdentifier(song, track);
    if (d) d.classList.toggle('playing', !!isThisPlaying);
  }

  const radioCard = document.querySelector('.fixed-radio-card');
  if (radioCard) {
    radioCard.classList.toggle('playing', isPlaying);
  }
  const waveBars = document.getElementById('navWaveBars');
  if (waveBars) {
    waveBars.classList.toggle('playing', isPlaying);
  }

  syncProgress();
  const songsCont = document.getElementById('songsContainer');
  if (!songsCont || !songsCont.children.length) {
    renderSongList();
  }
  const drawerCont = document.getElementById('drawerItemsList');
  if (!drawerCont || !drawerCont.children.length) {
    renderDrawerList();
  }
  const detailView = document.getElementById('viewPlaylistDetail');
  if (detailView && detailView.classList.contains('active')) {
    const pSongsBox = document.getElementById('playlistSongsBox');
    if (!pSongsBox || !pSongsBox.children.length) {
      renderPlaylistDetailSongsOnly();
    }
  }

  updateAllPlayingRowStates();

  if (currentHomeTab === 'discover' && currentDiscoverSongs && currentDiscoverSongs.length > 0) {
    const dContainer = document.getElementById('discoverSectionsContainer');
    if (!dContainer || !dContainer.children.length) {
      renderDiscoverPane();
    } else {
      updateDiscoverCardPlayingStates();
    }
  }
}

