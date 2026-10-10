/* ================== 全网音乐搜索业务核心逻辑 ================== */
function openSearchView() {
  document.getElementById('viewSearchFull').classList.add('active');
  renderSearchHistory();
  const input = document.getElementById('searchKeywordInput');
  setTimeout(() => { if (input) input.focus(); }, 150);
}

function closeSearchView() {
  document.getElementById('viewSearchFull').classList.remove('active');
  renderSongList();
  renderVinylDiscs();
  renderDrawerList();
}

function handleSearchInputChange(el) {
  const clearBtn = document.getElementById('searchClearBtn');
  if (clearBtn) clearBtn.classList.toggle('visible', !!el.value.trim());
}

function clearSearchInput() {
  const input = document.getElementById('searchKeywordInput');
  if (input) {
    input.value = '';
    input.focus();
  }
  const clearBtn = document.getElementById('searchClearBtn');
  if (clearBtn) clearBtn.classList.remove('visible');
  document.getElementById('searchResultsBox').style.display = 'none';
  document.getElementById('searchEmptyState').classList.remove('active');
  document.getElementById('searchDiscoverSection').style.display = 'block';
}

function quickSearch(kw) {
  const input = document.getElementById('searchKeywordInput');
  if (input) input.value = kw;
  handleSearchInputChange(input);
  triggerExecuteSearch();
}

function triggerExecuteSearch() {
  const input = document.getElementById('searchKeywordInput');
  const kw = input ? input.value.trim() : '';
  if (!kw) {
    toast('请输入要搜索的歌曲或歌手');
    return;
  }
  executeSearch(kw);
}

function renderSearchHistory() {
  const historySec = document.getElementById('searchHistorySection');
  const container = document.getElementById('searchHistoryTags');
  if (!historySec || !container) return;

  if (!searchHistory.length) {
    historySec.style.display = 'none';
    return;
  }
  historySec.style.display = 'flex';
  container.innerHTML = searchHistory.map(kw => `
    <span class="search-chip-tag" onclick="quickSearch('${escapeHtml(kw)}')">${escapeHtml(kw)}</span>
  `).join('');
}

function saveSearchHistory(kw) {
  if (!kw) return;
  searchHistory = searchHistory.filter(item => item !== kw);
  searchHistory.unshift(kw);
  if (searchHistory.length > 12) searchHistory.pop();
  try {
    localStorage.setItem('yyrc_search_history', JSON.stringify(searchHistory));
  } catch(e) {}
  renderSearchHistory();
}

function clearSearchHistory() {
  searchHistory = [];
  try {
    localStorage.removeItem('yyrc_search_history');
  } catch(e) {}
  renderSearchHistory();
  toast('已清空搜索历史');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const searchResultCache = new Map();

/* 核心异步搜索请求：融合本地已存曲库与全网检索（本地秒出+全网无阻塞异步汇流） */
async function executeSearch(keyword) {
  saveSearchHistory(keyword);
  document.getElementById('searchDiscoverSection').style.display = 'none';
  document.getElementById('searchEmptyState').classList.remove('active');

  // 1. 优先实时检索本地音频曲库（自动过滤50秒以下与试听片段）
  const lowerKw = keyword.toLowerCase().trim();
  const trialKeywords = ['试听', '片段', '铃声', '30s', '30秒', '副歌', '高潮版', '截取'];
  const localMatches = ALL_LIBRARY_SONGS.filter(s => {
    if (s.duration > 0 && s.duration < 50) return false;
    const title = (s.title || '').toLowerCase();
    if (trialKeywords.some(k => title.includes(k))) return false;
    return (title && title.includes(lowerKw)) || (s.artist && s.artist.toLowerCase().includes(lowerKw));
  }).map(s => ({
    id: s.id,
    name: s.title,
    artist: s.artist,
    album: '本地已存音频',
    cover: s.cover || '',
    isLocal: true,
    fileUrl: s.fileUrl,
    duration: s.duration,
    lrc: s.lrc
  }));

  // 本地曲库命中时立即呈现，实现 0ms 秒出
  if (localMatches.length > 0) {
    currentSearchResults = [...localMatches];
    renderSearchResults();
  } else {
    document.getElementById('searchResultsBox').style.display = 'none';
  }

  document.getElementById('searchLoadingState').classList.add('active');

  try {
    const onlineResults = await requestOnlineSearch(keyword, 30);
    document.getElementById('searchLoadingState').classList.remove('active');

    currentSearchResults = [...localMatches, ...onlineResults];

    if (currentSearchResults.length > 0) {
      renderSearchResults();
    } else {
      document.getElementById('searchResultsBox').style.display = 'none';
      document.getElementById('searchEmptyMsg').textContent = `未找到「${keyword}」，可尝试换个关键词`;
      document.getElementById('searchEmptyState').classList.add('active');
    }
  } catch (err) {
    console.warn("网络搜索异常:", err);
    document.getElementById('searchLoadingState').classList.remove('active');
    if (localMatches.length > 0) {
      currentSearchResults = [...localMatches];
      renderSearchResults();
      toast(`网络波动，已为您呈现本地 ${localMatches.length} 首匹配曲目`);
    } else {
      document.getElementById('searchResultsBox').style.display = 'none';
      document.getElementById('searchEmptyMsg').textContent = `网络搜索失败，本地亦无匹配曲目`;
      document.getElementById('searchEmptyState').classList.add('active');
    }
  }
}

// 网易云原生高速批量高清封面获取服务（批量接口直达官方最新图床，秒级解析且绝不404）
async function batchFillNetEaseCovers(songList) {
  if (!Array.isArray(songList) || songList.length === 0) return;
  const targetSongs = songList.filter(s => {
    if (!s) return false;
    const isNetease = (!s.source || s.source === 'netease');
    const hasBadCover = !s.cover || s.cover.includes('param=300y300') || s.cover.includes('injahow.cn') || !s.cover.startsWith('http');
    const rawId = s.onlineId || s.url_id || (s.id ? String(s.id).replace('online_', '').replace('init_', '') : '');
    return isNetease && hasBadCover && rawId && /^\d+$/.test(String(rawId));
  });

  if (targetSongs.length === 0) return;

  for (let i = 0; i < targetSongs.length; i += 30) {
    const chunk = targetSongs.slice(i, i + 30);
    const ids = chunk.map(s => {
      const rawId = s.onlineId || s.url_id || (s.id ? String(s.id).replace('online_', '').replace('init_', '') : '');
      return Number(rawId);
    }).filter(id => !isNaN(id) && id > 0);
    if (ids.length === 0) continue;
    const idsParam = '%5B' + ids.join('%2C') + '%5D';
    const url = `https://music.163.com/api/song/detail/?ids=${idsParam}`;
    try {
      const res = await universalFetch(url, { timeout: 3500 });
      if (res.ok) {
        const data = await res.json();
        const songs = data.songs || [];
        const coverMap = new Map();
        const picIdMap = new Map();
        songs.forEach(item => {
          if (item && item.id && item.album && item.album.picUrl) {
            coverMap.set(String(item.id), item.album.picUrl);
            if (item.album.picId) picIdMap.set(String(item.id), String(item.album.picId));
          }
        });
        chunk.forEach(s => {
          const sid = String(s.onlineId || s.url_id || (s.id ? String(s.id).replace('online_', '').replace('init_', '') : ''));
          if (coverMap.has(sid)) {
            s.cover = coverMap.get(sid);
            if (picIdMap.has(sid)) s.pic_id = picIdMap.get(sid);
            updateSongRowCover(s);
          }
        });
      }
    } catch(e) {
      console.warn('Batch cover resolution error:', e);
    }
  }
}

// 多源高可用全网音乐检索服务（智能级联：用户自建API -> Meting官方云源 -> 多平台备用源，全异步无阻塞）
async function requestOnlineSearch(keyword, count = 30, page = 1, bypassCache = false) {
  const cacheKey = `${keyword.toLowerCase().trim()}_p${page}`;
  if (!bypassCache && searchResultCache.has(cacheKey)) {
    const cached = searchResultCache.get(cacheKey);
    if (cached && cached.length > 0) return cached;
  }

  const encodedKw = encodeURIComponent(keyword);
  const candidates = [];

  // 1. GDStudio 稳定极速公共网易云搜索通道（国内高可用CDN，带分页）
  candidates.push({
    url: `https://music-api.gdstudio.xyz/api.php?types=search&count=${count}&source=netease&pages=${page}&name=${encodedKw}`,
    defaultSource: 'netease',
    timeout: 3600
  });

  // 2. Meting/Injahow 聚合搜索通道
  candidates.push({
    url: `https://api.injahow.cn/meting/?server=netease&type=search&id=${encodedKw}`,
    defaultSource: 'netease',
    timeout: 3600
  });

  // 3. GDStudio 腾讯音乐备用搜索通道
  candidates.push({
    url: `https://music-api.gdstudio.xyz/api.php?types=search&count=${count}&source=tencent&pages=${page}&name=${encodedKw}`,
    defaultSource: 'tencent',
    timeout: 3600
  });

  // 4. 用户自建或备用自定义通道
  if (currentApiBase && !currentApiBase.includes('injahow') && !currentApiBase.includes('gdstudio')) {
    candidates.push({
      url: `${currentApiBase}?types=search&count=${count}&source=netease&pages=${page}&name=${encodedKw}`,
      defaultSource: 'netease',
      timeout: 3200
    });
  }

  for (const c of candidates) {
    try {
      const res = await universalFetch(c.url, { timeout: c.timeout || 3600 });
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) continue;

      const normalized = data.map(item => {
        let songId = item.url_id || item.id;
        if (!songId && item.url) {
          const m = item.url.match(/[?&]id=([^&]+)/);
          if (m) songId = m[1];
        }
        let server = item.source || c.defaultSource || 'netease';
        if (item.url) {
          const m = item.url.match(/[?&]server=([^&]+)/);
          if (m) server = m[1];
        }
        const name = item.name || item.title || '未知歌曲';
        let artist = item.artist || item.author || '未知歌手';
        if (Array.isArray(artist)) artist = artist.join(' / ');
        const picId = item.pic_id || songId;
        let cover = item.pic || item.cover || '';
        if (!cover && picId) {
          cover = `https://api.injahow.cn/meting/?server=${server}&type=pic&id=${picId}`;
        }
        const dur = Number(item.duration || item.interval || item.length) || 0;
        return {
          id: String(songId || Math.random().toString(36).slice(2)),
          name: name,
          artist: artist,
          album: item.album || '',
          cover: cover,
          duration: dur,
          pic_id: item.pic_id || String(songId || ''),
          url_id: String(songId || ''),
          lyric_id: item.lyric_id || String(songId || ''),
          source: server
        };
      }).filter(s => {
        if (!s.name || !s.url_id) return false;
        // 自动屏蔽 50 秒以下或带有试听/片段/铃声标签的音源
        if (s.duration > 0 && s.duration < 50) return false;
        const lowName = s.name.toLowerCase();
        const trialKw = ['试听', '片段', '铃声', '30s', '30秒', '副歌', '高潮版', '截取'];
        if (trialKw.some(k => lowName.includes(k))) return false;
        return true;
      });

      if (normalized.length > 0) {
        // 后台异步自动补充网易原生高清封面
        batchFillNetEaseCovers(normalized);
        if (searchResultCache.size > 50) {
          const firstKey = searchResultCache.keys().next().value;
          searchResultCache.delete(firstKey);
        }
        searchResultCache.set(cacheKey, normalized);
        return normalized;
      }
    } catch(e) {
      console.warn("Search attempt error:", c.url, e);
    }
  }
  return [];
}

function renderSearchResults() {
  const container = document.getElementById('searchResultsContainer');
  const countText = document.getElementById('searchResultCountText');
  const box = document.getElementById('searchResultsBox');
  if (!container || !box) return;

  countText.textContent = `共找到 ${currentSearchResults.length} 首歌曲`;
  box.style.display = 'block';

  container.innerHTML = currentSearchResults.map((song, idx) => `
    <div class="song-row" onclick="playOnlineTrack(${idx})">
      <div class="song-cover-mini" onclick="event.stopPropagation(); playOnlineTrack(${idx}); openPlayerFull();" title="点击查看详情">
        <div class="static-icon">
          <svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        </div>
        ${(useExtractedCover && song.cover) ? `
          <img src="${song.cover}" class="song-cover-thumb" alt="cover" onerror="this.remove()">
        ` : ''}
      </div>
      <div class="song-info">
        <div class="song-title">
          ${escapeHtml(song.name)}
          <span class="search-result-meta-tag ${song.isLocal ? 'local-tag' : ''}">${song.isLocal ? '本地' : '超清'}</span>
        </div>
        <div class="song-artist">${escapeHtml(song.artist)}${song.album ? ' - ' + escapeHtml(song.album) : ''}</div>
      </div>
      <div class="song-actions-cluster">
        <div class="more-dots-btn" onclick="openSearchResultMenu(event, ${idx})" title="更多选项">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="12" cy="7" r="2.2"></circle>
            <circle cx="12" cy="17" r="2.2"></circle>
          </svg>
        </div>
      </div>
    </div>
  `).join('');
}

/* 核心：点播全网检索曲目（点击瞬间即刻滑出全屏详情页，后台异步拉取真实音频与歌词） */
async function playOnlineTrack(idx) {
  const item = currentSearchResults[idx];
  if (!item) return;

  if (item.isLocal) {
    const localSong = ALL_LIBRARY_SONGS.find(s => s.id === item.id) || item;
    if (!currentPlaybackQueue.some(s => s.id === localSong.id)) {
      currentPlaybackQueue.unshift(localSong);
      currentIndex = 0;
    } else {
      currentIndex = currentPlaybackQueue.findIndex(s => s.id === localSong.id);
    }
    openedPlayerFromSearch = true;
    openPlayerFull();
    playSongAtQueue(currentIndex);
    return;
  }

  // 1. 立即构建歌曲对象并入队，瞬间展开全屏播放页，提供丝滑即时反馈
  const initialCover = item.cover || '';
  const cleanOnlineId = String(item.url_id || item.id || '').replace('online_', '');
  const trackObj = {
    id: 'online_' + cleanOnlineId,
    onlineId: cleanOnlineId,
    url_id: cleanOnlineId,
    pic_id: item.pic_id || '',
    source: item.source || 'netease',
    title: item.name,
    artist: item.artist,
    album: item.album || '',
    duration: item.duration || 240,
    fileUrl: '',
    urlFetchedAt: 0,
    cover: initialCover,
    isFav: false
  };

  // 插入曲库与播放队列
  const existingIdx = ALL_LIBRARY_SONGS.findIndex(s => s.id === trackObj.id || (s.title === trackObj.title && s.artist === trackObj.artist));
  let libSong = trackObj;
  if (existingIdx !== -1) {
    const [removed] = ALL_LIBRARY_SONGS.splice(existingIdx, 1);
    Object.assign(removed, trackObj);
    ALL_LIBRARY_SONGS.unshift(removed);
    libSong = removed;
  } else {
    ALL_LIBRARY_SONGS.unshift(trackObj);
  }
  if (VINYL_ALBUMS[0]) {
    VINYL_ALBUMS[0].songs = ALL_LIBRARY_SONGS;
  }

  let qIdx = currentPlaybackQueue.findIndex(s => s.id === trackObj.id || (s.title === trackObj.title && s.artist === trackObj.artist));
  let queueSong = trackObj;
  if (qIdx !== -1) {
    const [removed] = currentPlaybackQueue.splice(qIdx, 1);
    Object.assign(removed, trackObj);
    currentPlaybackQueue.unshift(removed);
    queueSong = removed;
  } else {
    currentPlaybackQueue.unshift(trackObj);
  }
  currentIndex = 0;

  // 立即滑出全屏播放页与黑胶唱片
  openedPlayerFromSearch = true;
  openPlayerFull();
  updateUI();
  if (initialCover) {
    applySongCoverToUI(initialCover);
  }

  toast(`正在加载《${item.name}》...`);

  // 2. 异步拉取真实音频播放 URL
  let realAudioUrl = '';
  try {
    const urlApi = `${currentApiBase}?types=url&id=${item.url_id}&source=${item.source}&br=${currentAudioQuality}`;
    const urlRes = await universalFetch(urlApi, { timeout: 2500 });
    if (urlRes.ok) {
      const uData = await urlRes.json();
      if (uData && uData.url && typeof uData.url === 'string' && uData.url.startsWith('http')) {
        realAudioUrl = uData.url;
      }
    }
  } catch(e) {
    console.warn("Direct URL resolve failed, fallback to meting", e);
  }

  if (!realAudioUrl) {
    realAudioUrl = `https://api.injahow.cn/meting/?server=${item.source || 'netease'}&type=url&id=${item.url_id || item.id}`;
  }

  // 3. 异步获取真实封面
  let coverUrl = initialCover;
  if (!coverUrl || coverUrl.includes('param=300y300') || coverUrl.includes('injahow.cn')) {
    coverUrl = await resolveSongCoverUrl(libSong) || initialCover;
  }

  // 4. 更新歌曲数据并启动播放
  item.cover = coverUrl;
  trackObj.fileUrl = realAudioUrl;
  trackObj.urlFetchedAt = Date.now();
  libSong.fileUrl = realAudioUrl;
  libSong.urlFetchedAt = Date.now();
  queueSong.fileUrl = realAudioUrl;
  queueSong.urlFetchedAt = Date.now();
  if (coverUrl) {
    trackObj.cover = coverUrl;
    libSong.cover = coverUrl;
    queueSong.cover = coverUrl;
    updateSongRowCover(libSong);
  }

  // 5. 异步拉取歌词
  fetchLyricForSong(item.lyric_id || item.id, trackObj.title, item.source || 'netease');

  persistData();
  renderSongList();
  renderVinylDiscs();
  renderDrawerList();

  if (coverUrl) {
    applySongCoverToUI(coverUrl);
    updateUI();
  }

  // 开始播放歌曲
  playSongAtQueue(0);
}

async function fetchLyricForSong(songId, songTitle, source = 'netease') {
  let rawLrc = '';
  try {
    const apiLrcUrl = `${currentApiBase}?types=lyric&id=${songId}&source=${source}`;
    const res = await universalFetch(apiLrcUrl, { timeout: 2500 });
    if (res.ok) {
      const data = await res.json();
      if (data && data.lyric) {
        rawLrc = data.lyric;
      }
    }
  } catch(e) {
    console.warn("Primary lyric fetch failed, trying fallback", e);
  }

  if (!rawLrc) {
    try {
      const lyricApi = `https://music.163.com/api/song/lyric?id=${songId}&lv=1&kv=1&tv=-1`;
      const res = await universalFetch(lyricApi, { timeout: 2500 });
      if (res.ok) {
        const data = await res.json();
        if (data && data.lrc && data.lrc.lyric) rawLrc = data.lrc.lyric;
      }
    } catch(e) {}
  }

  if (!rawLrc && songId) {
    try {
      const res = await universalFetch(`https://api.injahow.cn/meting/?server=${source}&type=lrc&id=${songId}`, { timeout: 2500 });
      if (res.ok) {
        const text = await res.text();
        if (text && text.includes('[')) rawLrc = text;
      }
    } catch(e) {}
  }

  if (rawLrc) {
    const parsed = parseLrc(rawLrc);
    if (parsed && parsed.length) {
      LYRICS_DATA = parsed;
      lastActiveIdx = -1;
      initLyricsList();
      const curSong = currentPlaybackQueue[currentIndex];
      if (curSong) {
        curSong.lrc = rawLrc;
        if (!curSong.cover && songId) {
          curSong.cover = `https://api.injahow.cn/meting/?server=${source}&type=pic&id=${songId}`;
          applySongCoverToUI(curSong.cover);
          updateUI();
        }
        saveLyricToCache(curSong.title, curSong.artist, rawLrc);
        persistData();
      }
      return;
    }
  }

  // 默认简雅歌词占位
  LYRICS_DATA = [
    { time: 0, duration: 6, text: `《${songTitle}》` },
    { time: 6, duration: 15, text: "正在播放网络歌曲" },
    { time: 21, duration: 25, text: "此歌曲暂无同步歌词" }
  ];
  lastActiveIdx = -1;
  initLyricsList();
}

let currentAppliedCoverUrl = null;

function applySongCoverToUI(coverUrl) {
  if (useExtractedCover && coverUrl && coverUrl === currentAppliedCoverUrl) {
    return;
  }
  currentAppliedCoverUrl = (useExtractedCover && coverUrl) ? coverUrl : '';

  const plate = document.getElementById('plate');
  const bottomDisc = document.getElementById('bottomDisc');
  const centerEl = document.querySelector('.turntable-center');

  function renderDefaultSvg() {
    if (plate) plate.style.background = '';
    if (centerEl) {
      centerEl.style.background = '#FFFFFF';
      centerEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
      </svg>`;
    }
    if (bottomDisc) {
      bottomDisc.style.background = '';
      bottomDisc.innerHTML = '<div class="disc-center-dot"></div>';
    }
  }

  function renderCover(url) {
    if (plate) {
      plate.style.background = `radial-gradient(circle at 50% 50%, rgba(20,20,20,0.5) 0%, #151413 75%), url('${url}') center/cover no-repeat`;
    }
    if (centerEl) {
      centerEl.style.background = `url('${url}') center/cover no-repeat`;
      centerEl.innerHTML = '';
    }
    if (bottomDisc) {
      bottomDisc.style.background = `url('${url}') center/cover no-repeat`;
      bottomDisc.innerHTML = '';
    }
  }

  if (useExtractedCover && coverUrl) {
    const testImg = new Image();
    testImg.onload = function() {
      if (currentAppliedCoverUrl === coverUrl) {
        renderCover(coverUrl);
      }
    };
    testImg.onerror = function() {
      if (currentAppliedCoverUrl === coverUrl) {
        renderDefaultSvg();
      }
    };
    testImg.src = coverUrl;
    if (testImg.complete && testImg.naturalWidth > 0) {
      renderCover(coverUrl);
    }
  } else {
    renderDefaultSvg();
  }
}

function toggleCoverDisplayMode() {
  useExtractedCover = !useExtractedCover;
  currentAppliedCoverUrl = null;
  localStorage.setItem('yyrc_use_extracted_cover', useExtractedCover ? 'true' : 'false');
  updateCoverDisplayToggleUI();
  const curSong = currentPlaybackQueue[currentIndex];
  if (curSong) {
    applySongCoverToUI(curSong.cover || '');
  }
  renderSongList();
  renderDrawerList();
  if (document.getElementById('viewPlaylistDetail').classList.contains('active')) {
    openPlaylistDetail(activeRadioIndex);
  }
  toast(useExtractedCover ? '外观：展示提取封面' : '外观：恢复原版黑胶');
}

function updateCoverDisplayToggleUI() {
  const toggle = document.getElementById('coverDisplayToggle');
  const desc = document.getElementById('coverDisplayModeDesc');
  if (toggle) {
    toggle.classList.toggle('active', useExtractedCover);
  }
  if (desc) {
    desc.textContent = useExtractedCover ? '真实封面 (显示提取的专辑画作)' : '原版经典 (保持纯净黑胶质感)';
  }
}

function openSearchResultMenu(e, idx) {
  e.stopPropagation();
  activeSearchResultMenuIdx = idx;
  const item = currentSearchResults[idx];
  if (!item) return;
  window._isSearchResultMenu = true;
  const cleanOnlineId = String(item.url_id || item.id || '').replace('online_', '');
  currentActionSong = {
    id: 'online_' + cleanOnlineId,
    onlineId: cleanOnlineId,
    url_id: cleanOnlineId,
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

