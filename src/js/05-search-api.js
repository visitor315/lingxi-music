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
async function requestOnlineSearch(keyword, count = 30, page = 1, bypassCache = false, preferredSource = '') {
  const cacheKey = `${keyword.toLowerCase().trim()}_p${page}_${preferredSource}`;
  if (!bypassCache && searchResultCache.has(cacheKey)) {
    const cached = searchResultCache.get(cacheKey);
    if (cached && cached.length > 0) return cached;
  }

  const encodedKw = encodeURIComponent(keyword);
  const candidates = [];

  const neteaseCandidate = {
    url: `https://music-api.gdstudio.xyz/api.php?types=search&count=${count}&source=netease&pages=${page}&name=${encodedKw}`,
    defaultSource: 'netease',
    timeout: 3600
  };

  const injahowCandidate = {
    url: `https://api.injahow.cn/meting/?server=netease&type=search&id=${encodedKw}`,
    defaultSource: 'netease',
    timeout: 3600
  };

  const tencentCandidate = {
    url: `https://music-api.gdstudio.xyz/api.php?types=search&count=${count}&source=tencent&pages=${page}&name=${encodedKw}`,
    defaultSource: 'tencent',
    timeout: 3600
  };

  if (preferredSource === 'tencent') {
    candidates.push(tencentCandidate, neteaseCandidate, injahowCandidate);
  } else {
    candidates.push(neteaseCandidate, injahowCandidate, tencentCandidate);
  }

  // 用户自建或备用自定义通道
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
  if (typeof resetLyricStateOnSongSwitch === 'function') resetLyricStateOnSongSwitch(trackObj);
  if (typeof showLyricTransitionAnimation === 'function') showLyricTransitionAnimation(trackObj);
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
        if (!uData.url.includes('musicrep-ts')) {
          realAudioUrl = uData.url;
        } else {
          console.warn("Direct URL is trial sample snippet (musicrep-ts), skipping direct url");
        }
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

/* ============ QQ 音乐 QRC 商业级逐字歌词引擎（免签直连 + 3DES 解密） ============ */
const QRC_DES_BLOCK_SIZE = 8;
const QRC_KEY_1 = new TextEncoder().encode("!@#)(*$%");
const QRC_KEY_2 = new TextEncoder().encode("123ZXC!@");
const QRC_KEY_3 = new TextEncoder().encode("!@#)(NHL");

const QRC_S_BOXES = [
  [14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7,0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8,4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0,15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13],
  [15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10,3,13,4,7,15,2,8,14,12,0,1,10,6,9,11,5,0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15,13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9],
  [10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8,13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1,13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7,1,10,13,0,6,9,8,7,4,15,14,3,11,5,2,12],
  [7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15,13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9,10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4,3,15,0,6,10,1,13,8,9,4,5,11,12,7,2,14],
  [2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9,14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6,4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14,11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3],
  [12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11,10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8,9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6,4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13],
  [4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1,13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6,1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2,6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12],
  [13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7,1,15,13,8,10,3,7,4,12,5,6,11,0,14,9,2,7,11,4,1,9,12,14,2,0,6,10,13,15,3,5,8,2,1,14,7,4,10,8,13,15,12,9,0,3,5,6,11]
];

function qrcPermuteFromKeyBytes(e) {
  const t = new Uint8Array(48);
  for (let r = 0; r < 48; ++r) {
    const o = 8 * Math.floor(r / 6);
    const n = Math.floor(r / 6) % 2 == 0 ? 1 : 2;
    const a = (r + n) % 6;
    const s = 1 << a;
    t[r] = (e[o + a] & s) >> a;
  }
  return t;
}

class QrcSingleDesCodec {
  constructor(keyBytes) {
    this.keys = new Uint8Array(768);
    for (let r = 0; r < 16; ++r) {
      const o = qrcPermuteFromKeyBytes(keyBytes);
      this.keys.set(o, 48 * r);
    }
  }
  decryptBlock(src, out) {
    const l = new Uint8Array(4);
    const r = new Uint8Array(4);
    l.set(src.subarray(0, 4));
    r.set(src.subarray(4, 8));
    for (let round = 15; round >= 0; --round) {
      const roundKey = this.keys.subarray(round * 48, (round + 1) * 48);
      const f = this._feistel(r, roundKey);
      const nextR = new Uint8Array(4);
      for (let j = 0; j < 4; ++j) nextR[j] = l[j] ^ f[j];
      l.set(r);
      r.set(nextR);
    }
    out.set(r, 0);
    out.set(l, 4);
  }
  encryptBlock(src, out) {
    const l = new Uint8Array(4);
    const r = new Uint8Array(4);
    l.set(src.subarray(0, 4));
    r.set(src.subarray(4, 8));
    for (let round = 0; round < 16; ++round) {
      const roundKey = this.keys.subarray(round * 48, (round + 1) * 48);
      const f = this._feistel(r, roundKey);
      const nextR = new Uint8Array(4);
      for (let j = 0; j < 4; ++j) nextR[j] = l[j] ^ f[j];
      l.set(r);
      r.set(nextR);
    }
    out.set(r, 0);
    out.set(l, 4);
  }
  _feistel(halfBlock, roundKey) {
    const expanded = new Uint8Array(48);
    for (let i = 0; i < 48; ++i) {
      const byteIdx = Math.floor(i / 8);
      const bitIdx = i % 8;
      expanded[i] = ((halfBlock[byteIdx] >> (7 - bitIdx)) & 1) ^ roundKey[i];
    }
    const sBoxOut = new Uint8Array(4);
    for (let s = 0; s < 8; ++s) {
      const chunk = expanded.subarray(s * 6, (s + 1) * 6);
      const row = (chunk[0] << 1) | chunk[5];
      const col = (chunk[1] << 3) | (chunk[2] << 2) | (chunk[3] << 1) | chunk[4];
      const val = QRC_S_BOXES[s][row * 16 + col];
      if (s % 2 === 0) sBoxOut[Math.floor(s / 2)] |= (val << 4);
      else sBoxOut[Math.floor(s / 2)] |= (val & 0x0f);
    }
    return sBoxOut;
  }
}

class QrcTripleDesCodec {
  constructor(k1, k2, k3) {
    this.c1 = new QrcSingleDesCodec(k1);
    this.c2 = new QrcSingleDesCodec(k2);
    this.c3 = new QrcSingleDesCodec(k3);
  }
  decryptBlock(src, out) {
    const tmp1 = new Uint8Array(8);
    const tmp2 = new Uint8Array(8);
    this.c3.decryptBlock(src, tmp1);
    this.c2.encryptBlock(tmp1, tmp2);
    this.c1.decryptBlock(tmp2, out);
  }
}

const QRC_CODEC = new QrcTripleDesCodec(QRC_KEY_1, QRC_KEY_2, QRC_KEY_3);

function qrcHexToUint8Array(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function decryptQrcString(encryptedHexString) {
  if (!encryptedHexString || typeof encryptedHexString !== 'string') return '';
  const encryptedBytes = qrcHexToUint8Array(encryptedHexString);
  if (encryptedBytes.length % QRC_DES_BLOCK_SIZE !== 0) return '';
  const decryptedData = new Uint8Array(encryptedBytes.length);
  for (let i = 0; i < encryptedBytes.length; i += QRC_DES_BLOCK_SIZE) {
    const chunk = encryptedBytes.subarray(i, i + QRC_DES_BLOCK_SIZE);
    const outChunk = decryptedData.subarray(i, i + QRC_DES_BLOCK_SIZE);
    QRC_CODEC.decryptBlock(chunk, outChunk);
  }
  let trailingZeros = 0;
  for (let i = decryptedData.length - 1; i >= 0; i--) {
    if (decryptedData[i] === 0) trailingZeros++;
    else break;
  }
  const trimmed = decryptedData.subarray(0, decryptedData.length - trailingZeros);
  try {
    const stream = new Blob([trimmed]).stream().pipeThrough(new DecompressionStream('deflate'));
    return await new Response(stream).text();
  } catch(e) {
    console.warn('QRC DecompressionStream failed:', e);
    return '';
  }
}

/* 将 QRC 文本格式（每字自带绝对时间戳）标准化转换为内部兼容的 KRC 逐字格式 */
function convertQrcToKrcFormat(qrcText) {
  if (!qrcText) return '';
  const lines = qrcText.split('\n');
  const out = [];

  for (let rawLine of lines) {
    let line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('<Lyric_') && line.includes('LyricContent="')) {
      line = line.slice(line.indexOf('LyricContent="') + 'LyricContent="'.length);
    }
    if (line.endsWith('"/>') || line.endsWith('</LyricInfo>') || line.endsWith('</QrcInfos>')) {
      line = line.replace(/\"\/>$|<\/LyricInfo>$|<\/QrcInfos>$/, '').trim();
    }
    if (!line || line.startsWith('<?xml') || line.startsWith('<Qrc') || line.startsWith('<Lyric')) continue;

    const lm = line.match(/^\[(\d+),(\d+)\](.*)$/);
    if (!lm) {
      out.push(line);
      continue;
    }
    const lineStart = parseInt(lm[1], 10);
    const lineDur = parseInt(lm[2], 10);
    const rest = lm[3];

    // QRC 每字格式: word(wordStartMs,wordDurMs)
    const wordRegex = /([^(]+)\((\d+),(\d+)\)/g;
    let wm;
    let newWords = '';
    let hasWords = false;

    while ((wm = wordRegex.exec(rest)) !== null) {
      hasWords = true;
      const wordText = wm[1];
      const wordStart = parseInt(wm[2], 10);
      const wordDur = parseInt(wm[3], 10);
      const offset = Math.max(0, wordStart - lineStart);
      newWords += `<${offset},${wordDur},0>${wordText}`;
    }

    if (hasWords) {
      out.push(`[${lineStart},${lineDur}]${newWords}`);
    } else {
      out.push(line);
    }
  }

  return out.join('\n');
}

/* 原生直连 / 浏览器代理 QQ 音乐 API 路径统一封装 */
function qrcNetUrl(hostAndPath) {
  if (window.AndroidBridge && window.AndroidBridge.fetchHttpAsync) {
    return `https://${hostAndPath}`;
  }
  return `/krcp/${hostAndPath}`;
}

/* 官方免签 QQ 音乐商业逐字歌词拉取全链路 */
async function fetchQrcWordLyric(title, artist, durationSec) {
  try {
    const cleanTitle = (typeof formatCleanTitle === 'function') ? formatCleanTitle(title || '') : (title || '');
    const cleanArtist = (typeof formatCleanArtist === 'function') ? formatCleanArtist(artist || '') : (artist || '');
    if (!cleanTitle) return '';

    const q = encodeURIComponent(`${cleanTitle} ${cleanArtist}`.trim());
    const searchUrl = qrcNetUrl(`c.y.qq.com/soso/fcgi-bin/client_search_cp?p=1&n=10&w=${q}&format=json`);
    const sRes = await universalFetch(searchUrl, {
      timeout: 3000,
      headers: { 'Referer': 'https://y.qq.com/' }
    });
    if (!sRes || !sRes.ok) return '';
    const sData = await sRes.json();
    const list = (sData && sData.data && sData.data.song && sData.data.song.list) || [];
    if (!list.length) return '';

    // 智能选取最匹配母带版本的歌曲 mid（过滤旧版/伴奏/翻唱，优先按真实时长严格对齐录音母带）
    const norm = (s) => (s || '').replace(/[\s'’‘""“”（）()\[\]【】\-—~～,，.。!！?？:：;；、\u00b7]/g, '').toLowerCase();
    const nt = norm(cleanTitle);
    const na = norm(cleanArtist);

    let cleanCandidates = list.filter(s => {
      const sn = s.songname || '';
      if (/旧版|伴奏|翻唱|伤感版|片段|铃声/i.test(sn)) return false;
      return true;
    });
    if (!cleanCandidates.length) cleanCandidates = list;

    // 强规则过滤：必须满足歌名与歌手归一化匹配，坚决拒绝与歌名完全无关的曲目！
    const titleHintMatch = String(title || '').match(/[\(（]([^\)）]{2,8})[\)）]/);
    const titleHint = titleHintMatch ? norm(titleHintMatch[1]) : '';

    const validCandidates = cleanCandidates.filter(s => {
      const sn = norm(s.songname || '');
      const sa = norm((s.singer || []).map(x => x.name).join(''));
      const isTitleMatch = (sn === nt) || (sn.includes(nt)) || (nt.includes(sn));
      const isArtistMatch = !na || (sa.includes(na)) || (na.includes(sa)) || !sa ||
                            (titleHint && (sa.includes(titleHint) || titleHint.includes(sa)));
      return isTitleMatch && isArtistMatch;
    });
    if (!validCandidates.length) return '';

    let picked = null;
    if (durationSec > 0) {
      picked = validCandidates.find(s => Math.abs((s.interval || 0) - durationSec) <= 6) ||
               validCandidates.find(s => Math.abs((s.interval || 0) - durationSec) <= 12);
    }
    if (!picked) {
      picked = validCandidates[0];
    }

    if (!picked || !picked.songmid) return '';

    const payload = JSON.stringify({
      'music.musichallSong.PlayLyricInfo': {
        method: 'GetPlayLyricInfo',
        module: 'music.musichallSong.PlayLyricInfo',
        param: { songMID: picked.songmid, qrc: 1, crc: 1, type: 1 }
      }
    });

    const lyricUrl = qrcNetUrl(`u.y.qq.com/cgi-bin/musicu.fcg?data=${encodeURIComponent(payload)}`);
    const lRes = await universalFetch(lyricUrl, {
      timeout: 3500,
      headers: { 'Referer': 'https://y.qq.com/' }
    });
    if (!lRes || !lRes.ok) return '';
    const lData = await lRes.json();
    const hex = lData && lData['music.musichallSong.PlayLyricInfo'] && lData['music.musichallSong.PlayLyricInfo'].data && lData['music.musichallSong.PlayLyricInfo'].data.lyric;
    if (!hex) return '';

    const rawQrc = await decryptQrcString(hex);
    if (!rawQrc) return '';

    return convertQrcToKrcFormat(rawQrc);
  } catch(e) {
    console.warn('fetchQrcWordLyric failed:', e);
    return '';
  }
}

/* ============ 酷狗 KRC 词级逐字歌词引擎（毫秒级词时间轴，公开接口免鉴权） ============ */
const KRC_XOR_KEY = [0x40, 0x47, 0x61, 0x77, 0x5E, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2D, 0xCE, 0xD2, 0x6E, 0x69];

// 原生桥直连酷狗（无 CORS 限制）；纯浏览器环境走本地开发服务器的 /krcp 代理规避跨域
function krcNetUrl(hostAndPath) {
  if (window.AndroidBridge && window.AndroidBridge.fetchHttpAsync) {
    return `http://${hostAndPath}`;
  }
  return `/krcp/${hostAndPath}`;
}

async function decodeKrcContent(base64Content) {
  if (typeof DecompressionStream !== 'function') return '';
  try {
    const bin = atob(base64Content);
    // 跳过 4 字节 krc1 魔数，余下按 16 字节密钥循环异或后 zlib 解压
    const bytes = new Uint8Array(bin.length - 4);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = bin.charCodeAt(i + 4) ^ KRC_XOR_KEY[i % 16];
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    return await new Response(stream).text();
  } catch(e) {
    console.warn('KRC decode failed:', e);
    return '';
  }
}

async function fetchKrcWordLyric(title, artist, durationSec) {
  try {
    const cleanTitle = (typeof formatCleanTitle === 'function') ? formatCleanTitle(title || '') : (title || '');
    const cleanArtist = (typeof formatCleanArtist === 'function') ? formatCleanArtist(artist || '') : (artist || '');
    if (!cleanTitle) return '';
    const keyword = (cleanArtist && cleanArtist !== '未知歌手') ? `${cleanTitle} ${cleanArtist}` : cleanTitle;
    const searchRes = await universalFetch(krcNetUrl('mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=' + encodeURIComponent(keyword) + '&page=1&pagesize=8'), { timeout: 3000 });
    if (!searchRes || !searchRes.ok) return '';
    const searchData = await searchRes.json();
    const norm = (s) => (s || '').replace(/[\s'’‘""“”（）()\[\]【】\-—~～,，.。!！?？:：;；、\u00b7]/g, '').toLowerCase();
    const nt = norm(cleanTitle);
    const na = norm(cleanArtist);

    const allInfo = (searchData.data || {}).info || [];
    if (!allInfo.length) return '';

    // 强规则过滤：歌名与歌手归一化双重核验，彻底拦截酷狗把《演员》等无关热门推荐当做歌词源！
    const titleHintMatch = String(title || '').match(/[\(（]([^\)）]{2,8})[\)）]/);
    const titleHint = titleHintMatch ? norm(titleHintMatch[1]) : '';

    const validCandidates = allInfo.filter(s => {
      const sn = norm(s.songname || '');
      const sa = norm(s.singername || '');
      const isTitleMatch = (sn === nt) || (sn.includes(nt)) || (nt.includes(sn));
      const isArtistMatch = !na || (sa.includes(na)) || (na.includes(sa)) || !sa ||
                            (titleHint && (sa.includes(titleHint) || titleHint.includes(sa)));
      const isNotBadRemix = !/伴奏|dj|remix/i.test(s.songname || '');
      return isTitleMatch && isArtistMatch && isNotBadRemix;
    });
    if (!validCandidates.length) return '';

    // 优先过滤 live/现场，若过滤后还有满足候选则优先使用非 live
    let studioCandidates = validCandidates.filter(s => !/live|现场/i.test(s.songname || ''));
    if (!studioCandidates.length) studioCandidates = validCandidates;

    let candidate = null;
    if (durationSec > 0) {
      candidate = studioCandidates.find(s => Math.abs((s.duration || 0) - durationSec) <= 8) ||
                  studioCandidates.find(s => Math.abs((s.duration || 0) - durationSec) <= 15);
    }
    if (!candidate) candidate = studioCandidates[0];
    await new Promise(r => setTimeout(r, 250));
    const krcSearch = await universalFetch(krcNetUrl(`krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword=&duration=${(candidate.duration || 0) * 1000}&hash=${candidate.hash}`), { timeout: 3000 });
    if (!krcSearch || !krcSearch.ok) return '';
    const krcData = await krcSearch.json();
    const krcCand = (krcData.candidates || [])[0];
    if (!krcCand || !krcCand.id) return '';
    await new Promise(r => setTimeout(r, 250));
    const dl = await universalFetch(krcNetUrl(`krcs.kugou.com/download?ver=1&client=pc&id=${krcCand.id}&accesskey=${krcCand.accesskey}&fmt=krc&alpha=0`), { timeout: 3000 });
    if (!dl || !dl.ok) return '';
    const dlData = await dl.json();
    if (!dlData || !dlData.content || dlData.fmt !== 'krc') return '';
    const krcText = await decodeKrcContent(dlData.content);
    return (krcText && /\[\d+,\d+\]/.test(krcText)) ? krcText : '';
  } catch(e) {
    console.warn('KRC word lyric fetch failed:', e);
    return '';
  }
}

/* 存量普通 LRC 后台升级：拉取商业/词级逐字歌词（QRC 优先，KRC 备选），与网易云锚点逐行对齐后无缝替换当前歌词与缓存 */
async function upgradeLyricToWordLevel(song, anchorRawHint) {
  if (!song || !song.title) return;
  if (isKrcRecentlyAttempted(song)) {
    if (anchorRawHint) {
      const fallbackParsed = parseLrc(anchorRawHint);
      if (fallbackParsed && fallbackParsed.length) {
        isLyricLoadingTransition = false;
        LYRICS_DATA = fallbackParsed;
        lastActiveIdx = -1;
        displayedPreviewIdx = -1;
        initLyricsList();
        syncCurrentLyricToDesktop();
        return;
      }
    }
    setNoLyricsState(song);
    return;
  }

  // 1. 优先尝试 QQ 音乐商业级 QRC 歌词（真发声轴，含小节发音留白，彻底杜绝首字冒头）
  let wordLrcText = await fetchQrcWordLyric(song.title, song.artist, song.duration || 0);
  // 2. 备选尝试酷狗 KRC 词级逐字歌词
  if (!wordLrcText) {
    wordLrcText = await fetchKrcWordLyric(song.title, song.artist, song.duration || 0);
  }

  // 3. 两种逐字源均落空时才记入冷却表并安全回退
  if (!wordLrcText) {
    markKrcAttempt(song);
    if (anchorRawHint) {
      const fallbackParsed = parseLrc(anchorRawHint);
      if (fallbackParsed && fallbackParsed.length) {
        isLyricLoadingTransition = false;
        LYRICS_DATA = fallbackParsed;
        lastActiveIdx = -1;
        displayedPreviewIdx = -1;
        initLyricsList();
        syncCurrentLyricToDesktop();
        return;
      }
    }
    setNoLyricsState(song);
    return;
  }

  const parsed = parseLrc(wordLrcText);
  if (!parsed || !parsed.length || !parsed.some(l => l.words && l.words.length > 0)) {
    if (anchorRawHint) {
      const fallbackParsed = parseLrc(anchorRawHint);
      if (fallbackParsed && fallbackParsed.length) {
        isLyricLoadingTransition = false;
        LYRICS_DATA = fallbackParsed;
        lastActiveIdx = -1;
        displayedPreviewIdx = -1;
        initLyricsList();
        syncCurrentLyricToDesktop();
        return;
      }
    }
    setNoLyricsState(song);
    return;
  }

  const curSong = currentPlaybackQueue[currentIndex];
  if (!curSong || (curSong.id !== song.id && curSong.title !== song.title)) return;
  const anchorRaw = anchorRawHint || await fetchAnchorRawLrc(song);
  const merged = anchorRaw ? mergeKrcWithAnchorLyric(wordLrcText, anchorRaw, song.duration || 0) : { text: wordLrcText, matched: 0 };
  const finalText = merged.matched > 0 ? '[krc-anchor:8]\n' + merged.text : wordLrcText;
  isLyricLoadingTransition = false;
  LYRICS_DATA = parseLrc(finalText) || parsed;
  lastActiveIdx = -1;
  displayedPreviewIdx = -1;
  initLyricsList();
  syncCurrentLyricToDesktop();
  saveLyricToCache(song.title, song.artist, finalText);
  curSong.lrc = finalText;
  persistData();
}

/* 最优歌词极速装载：直源极速拉取优先（0.3秒上屏），后台静默升级逐字，最长 2.5 秒全局硬性熔断 */
async function loadBestAvailableLyric(song) {
  if (!song) return;
  const currentSongSnapshot = song;

  // 全局硬性看门狗：最长 2.5 秒，若未能装填出任何歌词，强制收敛为“暂无歌词”，绝不永久加载！
  const masterTimeout = setTimeout(() => {
    if (isLyricLoadingTransition) {
      const cur = currentPlaybackQueue[currentIndex] || currentSongSnapshot;
      setNoLyricsState(cur, '此歌曲暂无同步歌词');
    }
  }, 2500);

  try {
    // 1. 若为在线曲目（具备 onlineId），先极速拉取直源歌词（通常仅需 200-400ms）
    let directLrc = '';
    if (song.onlineId) {
      try {
        directLrc = await fetchRawLrcFromNet(song.onlineId, song.title, song.source || 'netease', song.artist);
      } catch(e) {}
    }

    const curSong = currentPlaybackQueue[currentIndex];
    if (!curSong || (curSong.id !== song.id && curSong.title !== song.title)) {
      return;
    }

    // 若直源歌词已秒级拉取成功，立即解除加载状态并上屏！
    if (directLrc) {
      const parsedDirect = parseLrc(directLrc);
      if (parsedDirect && parsedDirect.length) {
        clearTimeout(masterTimeout);
        isLyricLoadingTransition = false;
        LYRICS_DATA = parsedDirect;
        lastActiveIdx = -1;
        displayedPreviewIdx = -1;
        initLyricsList();
        syncCurrentLyricToDesktop();
        curSong.lrc = directLrc;
        saveLyricToCache(curSong.title, curSong.artist, directLrc);
        persistData();

        // 在后台静默尝试升级为 QRC/KRC 逐字，绝不阻塞当前界面显示
        upgradeLyricToWordLevel(curSong, directLrc);
        return;
      }
    }

    // 2. 若直源无歌词（如本地曲目或无 onlineId），尝试快速匹配 QRC/KRC 逐字
    if (song.title && !isKrcRecentlyAttempted(song)) {
      let wordLrcText = await fetchQrcWordLyric(song.title, song.artist, song.duration || 0);
      if (!wordLrcText) {
        wordLrcText = await fetchKrcWordLyric(song.title, song.artist, song.duration || 0);
      }
      const stillActive = currentPlaybackQueue[currentIndex];
      if (wordLrcText && stillActive && (stillActive.id === song.id || stillActive.title === song.title)) {
        const parsed = parseLrc(wordLrcText);
        if (parsed && parsed.length && parsed.some(l => l.words && l.words.length > 0)) {
          clearTimeout(masterTimeout);
          isLyricLoadingTransition = false;
          LYRICS_DATA = parsed;
          lastActiveIdx = -1;
          displayedPreviewIdx = -1;
          initLyricsList();
          syncCurrentLyricToDesktop();
          saveLyricToCache(stillActive.title, stillActive.artist, wordLrcText);
          stillActive.lrc = wordLrcText;
          persistData();
          return;
        }
      }
    }

    // 3. 兜底通用反查
    if (song.title) {
      await fetchLyricForSong(song.onlineId || '', song.title, song.source || 'netease', song.artist);
    } else {
      setNoLyricsState(curSong, '此歌曲暂无同步歌词');
    }
  } catch(e) {
    console.warn('loadBestAvailableLyric error:', e);
    const cur = currentPlaybackQueue[currentIndex] || currentSongSnapshot;
    setNoLyricsState(cur, '此歌曲暂无同步歌词');
  } finally {
    clearTimeout(masterTimeout);
    if (isLyricLoadingTransition) {
      const cur = currentPlaybackQueue[currentIndex] || currentSongSnapshot;
      setNoLyricsState(cur, '此歌曲暂无同步歌词');
    }
  }
}

/* 纯净抓取网易云系普通 LRC 原文（短超时、防阻塞），供歌词链路复用 */
async function fetchRawLrcFromNet(songId, songTitle, source = 'netease', artistName = '') {
  let rawLrc = '';
  if (songId) {
    try {
      const apiLrcUrl = `${currentApiBase}?types=lyric&id=${songId}&source=${source}`;
      const res = await universalFetch(apiLrcUrl, { timeout: 2500 });
      if (res && res.ok) {
        const data = await res.json();
        if (data && data.lyric && typeof data.lyric === 'string' && data.lyric.includes('[')) {
          rawLrc = data.lyric;
        }
      }
    } catch(e) {}

    if (!rawLrc) {
      try {
        const lyricApi = `https://music.163.com/api/song/lyric?id=${songId}&lv=1&kv=1&tv=-1`;
        const res = await universalFetch(lyricApi, { timeout: 2000 });
        if (res && res.ok) {
          const data = await res.json();
          if (data && data.lrc && data.lrc.lyric && data.lrc.lyric.includes('[')) {
            rawLrc = data.lrc.lyric;
          }
        }
      } catch(e) {}
    }
  }

  // 关键兜底：如果直查无果（或 songId 缺失/失效/小众翻唱源），按歌名与歌手全网反查网易云对应歌词！
  if (!rawLrc && songTitle) {
    try {
      const cleanTitle = (typeof formatCleanTitle === 'function') ? formatCleanTitle(songTitle) : songTitle;
      const cleanArtist = (typeof formatCleanArtist === 'function') ? formatCleanArtist(artistName || '') : (artistName || '');
      const titleHintMatch = String(songTitle || '').match(/[\(（]([^\)）]{2,8})[\)）]/);
      const titleHint = titleHintMatch ? titleHintMatch[1] : '';

      const queryStr = `${cleanTitle} ${cleanArtist}`.trim();
      const q = encodeURIComponent(queryStr);
      const searchUrl = `${currentApiBase}?types=search&source=netease&name=${q}&count=3&pages=1`;
      const sRes = await universalFetch(searchUrl, { timeout: 2500 });
      if (sRes && sRes.ok) {
        const list = await sRes.json();
        if (Array.isArray(list) && list.length > 0) {
          for (const item of list.slice(0, 2)) {
            const candId = item.id || item.url_id;
            if (candId) {
              try {
                const candLrcUrl = `${currentApiBase}?types=lyric&id=${candId}&source=netease`;
                const cRes = await universalFetch(candLrcUrl, { timeout: 2000 });
                if (cRes && cRes.ok) {
                  const cData = await cRes.json();
                  if (cData && cData.lyric && typeof cData.lyric === 'string' && cData.lyric.includes('[')) {
                    rawLrc = cData.lyric;
                    break;
                  }
                }
              } catch(e) {}
            }
          }
        }
      }

      // 若带副标（如后弦）且前次未找到，尝试按副标极速反查一次
      if (!rawLrc && titleHint) {
        const q2 = encodeURIComponent(`${cleanTitle} ${titleHint}`.trim());
        const sRes2 = await universalFetch(`${currentApiBase}?types=search&source=netease&name=${q2}&count=2&pages=1`, { timeout: 2000 });
        if (sRes2 && sRes2.ok) {
          const list2 = await sRes2.json();
          if (Array.isArray(list2) && list2.length > 0) {
            const candId = list2[0].id || list2[0].url_id;
            if (candId) {
              try {
                const cRes = await universalFetch(`${currentApiBase}?types=lyric&id=${candId}&source=netease`, { timeout: 2000 });
                if (cRes && cRes.ok) {
                  const cData = await cRes.json();
                  if (cData && cData.lyric && typeof cData.lyric === 'string' && cData.lyric.includes('[')) {
                    rawLrc = cData.lyric;
                  }
                }
              } catch(e) {}
            }
          }
        }
      }
    } catch(e) {}
  }

  return rawLrc;
}

/* 获取对齐锚点歌词：优先曲目自带网易云 id，缺失时按标题歌手反查网易云曲目 id */
async function fetchAnchorRawLrc(song) {
  if (!song) return '';
  if (song.onlineId) {
    const direct = await fetchRawLrcFromNet(song.onlineId, song.title, song.source || 'netease');
    if (direct) return direct;
  }
  try {
    const cleanTitle = (typeof formatCleanTitle === 'function') ? formatCleanTitle(song.title || '') : (song.title || '');
    const cleanArtist = (typeof formatCleanArtist === 'function') ? formatCleanArtist(song.artist || '') : (song.artist || '');
    if (!cleanTitle) return '';
    const q = encodeURIComponent(`${cleanTitle} ${cleanArtist}`.trim());
    const res = await universalFetch(`${currentApiBase}?types=search&source=netease&name=${q}&count=1&pages=1`, { timeout: 3000 });
    if (res && res.ok) {
      const arr = await res.json();
      if (arr && arr[0] && arr[0].id) {
        return await fetchRawLrcFromNet(arr[0].id, song.title, 'netease');
      }
    }
  } catch(e) {}
  return '';
}

/* KRC 双源智能锚点对齐合并：
   1. 过滤假演职员打点，支持前后半句拆分匹配；
   2. 智能母带一致性识别：若为同一官方母带，保护 KRC 真实真声发声轴心，拒绝向手工打轴的吸气声提前跑；
   3. 若为异母带（如版本翻录/前奏长短不同），启动逐段平滑插值对齐，保证全曲合拍 */
function mergeKrcWithAnchorLyric(krcText, anchorRaw, audioDurSec) {
  if (!anchorRaw) return { text: krcText, matched: 0 };
  const norm = (s) => (s || '').replace(/[\s'’‘""“”（）()\[\]【】\-—~～,，.。!！?？:：;；、\u00b7]/g, '').toLowerCase();
  const isCreditOrMeta = (s) => /^(作词|作曲|编曲|混音|吉他|贝斯|鼓|录音|制作|发行|出品|策划|文案|母带|演唱|原唱|翻唱|伴唱|和声|题字|美工|海报|特别支持|曲绘|pv)/.test(s);
  const timeTagRe = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  // 1. 严格只收集真实演唱歌词行作锚点，彻底排除演职员假时间戳
  const anchorLines = [];
  anchorRaw.split('\n').forEach(line => {
    line = line.trim();
    if (!line) return;
    timeTagRe.lastIndex = 0;
    let m, times = [], lastEnd = 0;
    while ((m = timeTagRe.exec(line)) !== null) {
      times.push(parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseInt(String(m[3]).padEnd(3, '0'), 10) / 1000 : 0));
      lastEnd = timeTagRe.lastIndex;
    }
    if (!times.length) return;
    const text = line.slice(lastEnd).trim();
    const nk = norm(text);
    if (!nk || isCreditOrMeta(nk)) return;
    anchorLines.push({ time: times[0], text, nk });
  });

  if (!anchorLines.length) return { text: krcText, matched: 0 };

  // 2. 解析 KRC 原始行
  const rawLines = krcText.split('\n');
  const parsedLines = [];
  for (let rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) continue;
    const km = line.match(/^\[(\d+),(\d+)\](.*)$/);
    if (!km) {
      parsedLines.push({ isMeta: true, raw: line });
      continue;
    }
    const origStart = parseInt(km[1], 10);
    const origDur = parseInt(km[2], 10);
    const content = km[3];
    const cleanText = content.replace(/<[^>]*>/g, '').trim();
    const nk = norm(cleanText);
    const isCredit = isCreditOrMeta(nk);
    parsedLines.push({
      isMeta: false,
      isCredit,
      origStart,
      origDur,
      content,
      cleanText,
      nk,
      anchorSec: null,
      newStart: null
    });
  }

  // 3. 演唱歌词对位（同时支持完整匹配与前后半句拆分匹配）
  for (let p of parsedLines) {
    if (p.isMeta || p.isCredit || !p.nk) continue;
    for (let j = 0; j < anchorLines.length; j++) {
      const a = anchorLines[j];
      const deltaSec = a.time - p.origStart / 1000;
      if (Math.abs(deltaSec) > 10) continue;

      if (a.nk === p.nk || a.nk.startsWith(p.nk)) {
        p.anchorSec = a.time;
        p.newStart = Math.round(a.time * 1000);
        break;
      }
    }
  }

  const matchedEntries = parsedLines.map((p, idx) => ({ p, idx })).filter(x => !x.p.isMeta && x.p.anchorSec !== null);
  if (matchedEntries.length < 3) {
    return { text: krcText, matched: matchedEntries.length };
  }

  // 4. 智能母带一致性与吸气声抢拍判定：
  // 提取 KRC 音频时长
  const totalM = krcText.match(/\[total:(\d+)\]/);
  const krcDurSec = totalM ? Math.round(parseInt(totalM[1], 10) / 1000) : 0;
  const audioDur = Math.round(audioDurSec || 0);
  const durDiff = (audioDur > 0 && krcDurSec > 0) ? Math.abs(audioDur - krcDurSec) : 0;

  const rawDeltas = matchedEntries.map(m => (m.p.origStart - m.p.newStart) / 1000);
  const minD = Math.min(...rawDeltas);
  const maxD = Math.max(...rawDeltas);
  const spread = maxD - minD;

  // 若音频时长高度一致（3秒内）且各行差值极差很小（小于2.0秒）：
  // 确认为同一录音母带！此时手工打轴提前的0.5-0.8秒纯属吸气声抢跑，必须坚决保留 KRC 真实真声发声轴！
  if (durDiff <= 3 && spread < 2.0) {
    return { text: krcText, matched: matchedEntries.length };
  }

  // 若时长差大或跨句严重漂移（如起风了不同版本），启动精准逐段插值对齐
  for (let i = 0; i < parsedLines.length; i++) {
    const p = parsedLines[i];
    if (p.isMeta || p.newStart !== null) continue;
    const prev = matchedEntries.filter(x => x.idx < i).pop();
    const next = matchedEntries.find(x => x.idx > i);
    if (prev && next) {
      const denom = (next.p.origStart - prev.p.origStart);
      const ratio = denom > 0 ? (p.origStart - prev.p.origStart) / denom : 0;
      p.newStart = Math.round(prev.p.newStart + ratio * (next.p.newStart - prev.p.newStart));
    } else if (prev) {
      const delta = prev.p.origStart - prev.p.newStart;
      p.newStart = Math.max(0, p.origStart - delta);
    } else if (next) {
      const delta = next.p.origStart - next.p.newStart;
      p.newStart = Math.max(0, p.origStart - delta);
    } else {
      p.newStart = p.origStart;
    }
  }

  const outLines = [];
  for (const p of parsedLines) {
    if (p.isMeta) {
      outLines.push(p.raw);
    } else {
      outLines.push(`[${p.newStart},${p.origDur}]${p.content}`);
    }
  }
  return { text: outLines.join('\n'), matched: matchedEntries.length };
}

/* KRC 拉取失败冷却表：同一曲目 3 天内不重复尝试，避免每次播放空跑请求 */
function krcAttemptKey(song) {
  return ((song.title || '') + '_' + (song.artist || '')).toLowerCase().trim();
}
function isKrcRecentlyAttempted(song) {
  try {
    const m = JSON.parse(localStorage.getItem('krc_attempt_ttl_v8') || '{}');
    const ts = m[krcAttemptKey(song)];
    return ts && (Date.now() - ts < 3 * 24 * 3600 * 1000);
  } catch(e) { return false; }
}
function markKrcAttempt(song) {
  try {
    const m = JSON.parse(localStorage.getItem('krc_attempt_ttl_v8') || '{}');
    m[krcAttemptKey(song)] = Date.now();
    localStorage.setItem('krc_attempt_ttl_v8', JSON.stringify(m));
  } catch(e) {}
}

async function fetchLyricForSong(songId, songTitle, source = 'netease', songArtist = '') {
  const curSong = currentPlaybackQueue[currentIndex];
  const targetSong = curSong || { title: songTitle, artist: songArtist };
  try {
    // 严禁逆向降级：若当前歌曲已拥有高质量商业/逐字词轴（QRC / KRC），坚决禁止普通长句覆盖！
    if (curSong && curSong.lrc && curSong.lrc.includes('<') && (curSong.lrc.includes('[krc-anchor:') || (LYRICS_DATA && LYRICS_DATA.some(l => l.words && l.words.length > 0)))) {
      isLyricLoadingTransition = false;
      return;
    }
    const rawLrc = await fetchRawLrcFromNet(songId, songTitle, source, songArtist || (curSong ? curSong.artist : ''));
    if (rawLrc) {
      const activeSong = currentPlaybackQueue[currentIndex];
      if (!activeSong) {
        setNoLyricsState(targetSong, '此歌曲暂无同步歌词');
        return;
      }
      const cleanActiveTitle = (typeof formatCleanTitle === 'function') ? formatCleanTitle(activeSong.title || '') : (activeSong.title || '');
      const cleanReqTitle = (typeof formatCleanTitle === 'function') ? formatCleanTitle(songTitle || '') : (songTitle || '');
      if (cleanReqTitle && cleanActiveTitle && cleanActiveTitle.toLowerCase().trim() !== cleanReqTitle.toLowerCase().trim()) {
        setNoLyricsState(activeSong, '此歌曲暂无同步歌词');
        return;
      }
      if (activeSong && activeSong.lrc && activeSong.lrc.includes('<') && activeSong.lrc.includes('[krc-anchor:')) {
        isLyricLoadingTransition = false;
        return;
      }
      const parsed = parseLrc(rawLrc);
      if (parsed && parsed.length) {
        isLyricLoadingTransition = false;
        LYRICS_DATA = parsed;
        lastActiveIdx = -1;
        initLyricsList();
        activeSong.lrc = rawLrc;
        if (!activeSong.cover && songId) {
          activeSong.cover = `https://api.injahow.cn/meting/?server=${source}&type=pic&id=${songId}`;
          applySongCoverToUI(activeSong.cover);
          updateUI();
        }
        saveLyricToCache(activeSong.title, activeSong.artist, rawLrc);
        persistData();
        return;
      }
    }

    // 确定性无歌词安全状态：立即呈现“此歌曲暂无同步歌词”
    setNoLyricsState(targetSong, '此歌曲暂无同步歌词');
  } catch(err) {
    console.warn("fetchLyricForSong error:", err);
    setNoLyricsState(targetSong, '此歌曲暂无同步歌词');
  } finally {
    isLyricLoadingTransition = false;
  }
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

