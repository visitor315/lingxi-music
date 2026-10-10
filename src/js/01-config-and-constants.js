/* ================== 全局统一玫瑰花矢量路径（与发现页完全一致） ================== */
const ROSE_SVG_PATH = "M281.31 21.217L239.997 127.13l76.01 103.673 97.135-7.532-3.1-79.284-78.2-12.468-1.61 41.535 29.11 7.568-.766-14.1 18.662-1.012 2.15 39.635-68.41-17.788 3.004-77.61 68.65 10.946-2.456-86.044-98.863-13.43zM243.63 66.39l-73.702 39.917L195.885 243.7l141.306 80.704 154.447-80.037-11.252-142.205-79.617-.988.642 22.512 26.705 4.257 4.403 112.57-125.436 9.727-88.227-120.338 24.774-63.51zm-93.107 88.706c-2.992-.017-6.01.004-9.054.06-9.456.174-19.425.853-29.44 1.594 9.427 13.32 18.694 26.165 30.157 35.938 7.894 6.73 16.835 12.308 28.075 16.056l-10.1-53.453c-3.184-.11-6.396-.176-9.64-.194zm25.57 84.51c-14.278 5.27-27.16 13.25-39.437 23.55-17.875 14.995-34.273 35.22-50.625 58.47 56.9 2.6 100.16-6.41 147.316-35.01l-54.223-30.966-3.03-16.045zm270.854 48.968l-50.64 26.244c27.874 20.83 54.865 27.206 90.162 28.557-8.76-21.213-22.617-39.484-39.523-54.8zm-189.853 4.895c-14.566 9.75-28.84 17.8-43.156 24.342.37 10.843 2.813 19.703 6.968 26.47-29.49 37.69-61.714 72.017-96.78 102.843-17.584-1.215-24.577-19.137-17.845-37.344-22.758 18.074-30.427 42.166-20 68.376-6.832 5.23-13.75 10.354-20.78 15.344h45.344c25.65-20.11 49.915-41.82 72.844-65.094 29.485 9.192 54.05-1.51 69.625-27.97-14.975 8.052-31.217 5.627-37.438-6.686 9.653-11.06 19.037-22.436 28.156-34.125 7.25 1.21 15.586.57 24.72-2.03-8.863-17.974-13.326-39.19-11.656-64.126zm18.133 17.065c1.205 25.213 10.463 44.01 24.648 60.12 17.914 20.346 44.73 35.942 73.625 50.814 7.79-33.575 9.555-62.664-2.05-93.77l-34.692 17.978-61.53-35.143z";

/* ================== 歌单作者头像全局矢量定义 ================== */
const LINGXI_CAT_AVATAR_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#D97757" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M19.0993 10.6602C20.2113 11.9744 19.98 13.5815 19.9801 15C19.9801 18.9062 14.7132 20 12 20C9.28677 20 4.01994 18.9062 4.01994 15C4.01995 13.5815 3.78875 11.9744 4.90066 10.6602M19.0993 10.6602C18.9048 10.4303 18.6692 10.2094 18.384 10M19.0993 10.6602C19.7993 11.0634 19.9781 9.55469 19.9801 9.0625V7.18761C19.9801 5.56261 18.8629 5.00011 17.9053 5.00011C16.9477 5.00011 15.0324 6.5625 14.394 6.5625C13.6279 6.5625 13.4804 6.40636 12 6.40636C10.5197 6.40636 10.3721 6.5625 9.60601 6.5625C8.9676 6.5625 7.05236 5 6.09476 5C5.13715 5 4.01995 5.5625 4.01995 7.1875V9.0625C4.02188 9.55469 4.20072 11.0634 4.90066 10.6602M4.90066 10.6602C5.09519 10.4303 5.33082 10.2094 5.61599 10"/><path d="M12.8258 16C12.8258 16.1726 12.4647 16.3125 12.0193 16.3125C11.574 16.3125 11.2129 16.1726 11.2129 16C11.2129 15.8274 11.574 15.6875 12.0193 15.6875C12.4647 15.6875 12.8258 15.8274 12.8258 16Z" fill="#D97757"/><path d="M15.5 13.5938C15.5 14.0252 15.2834 14.375 15.0161 14.375C14.7489 14.375 14.5323 14.0252 14.5323 13.5938C14.5323 13.1623 14.7489 12.8125 15.0161 12.8125C15.2834 12.8125 15.5 13.1623 15.5 13.5938Z" fill="#D97757"/><path d="M9.5 13.5938C9.5 14.0252 9.28336 14.375 9.01613 14.375C8.74889 14.375 8.53226 14.0252 8.53226 13.5938C8.53226 13.1623 8.74889 12.8125 9.01613 12.8125C9.28336 12.8125 9.5 13.1623 9.5 13.5938Z" fill="#D97757"/><path d="M22.0004 15.4688C21.5165 15.1562 19.4197 14.375 18.6133 14.375"/><path d="M20.3871 17.9688C19.9033 17.6562 18.7742 16.875 17.9678 16.875"/><path d="M2 15.4688C2.48387 15.1562 4.58065 14.375 5.3871 14.375"/><path d="M3.61279 17.9688C4.09667 17.6562 5.2257 16.875 6.03215 16.875"/></svg>`;

const USER_CAT_AVATAR_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

const OTHER_AVATAR_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

const APP_CONFIG = {
  name: '灵犀音乐',
  version: '2.5.8',
  build: '2026.10.09',
  codename: 'Pure Sound'
};

/* ================== 设置页主页面切换（发现 vs 乐库） ================== */
let defaultHomeTab = localStorage.getItem('lingxi_default_tab') || 'discover';
let currentHomeTab = defaultHomeTab;

function updateDefaultHomeTabUI() {
  const descEl = document.getElementById('defaultHomeTabDesc');
  if (descEl) {
    const curTab = localStorage.getItem('lingxi_default_tab') || 'discover';
    descEl.textContent = curTab === 'library' ? '当前：乐库（我的曲库）' : '当前：发现（精选推荐）';
  }
}

function toggleDefaultHomeTabSetting() {
  let curTab = localStorage.getItem('lingxi_default_tab') || 'discover';
  curTab = (curTab === 'discover') ? 'library' : 'discover';
  localStorage.setItem('lingxi_default_tab', curTab);
  defaultHomeTab = curTab;
  updateDefaultHomeTabUI();
  toast(curTab === 'library' ? '已设为启动默认进入「乐库」' : '已设为启动默认进入「发现」');
}

/* ================== 全局完整曲库源（核心：仅保留 1 首演示曲目，支持全网收录） ================== */
const DEFAULT_LIBRARY_SONGS = [
  { id: 's1', title: '空谷幽兰', artist: '阿鲲', album: '新萧十一郎 电视剧原声带', onlineId: '405485307', source: 'netease', duration: 186, isFav: true, cover: '', fileUrl: 'https://api.injahow.cn/meting/?server=netease&type=url&id=405485307' }
];

/* 3大歌单定义（全部歌曲、我喜欢、本地歌曲） */
const DEFAULT_VINYL_ALBUMS = [
  {
    id: 'alb_all',
    title: "全部歌曲",
    author: "灵犀音乐",
    sub: "包含所有听过的歌",
    hasRose: false,
    songs: []
  },
  {
    id: 'alb_fav',
    title: "我喜欢",
    author: "我",
    sub: "心选好歌 - 点击进入",
    hasRose: true,
    songs: []
  },
  {
    id: 'alb_local',
    title: "本地歌曲",
    author: "本地音乐",
    sub: "离线曲库 - 随心畅听",
    hasRose: false,
    songs: []
  }
];

let ALL_LIBRARY_SONGS = [];
let VINYL_ALBUMS = [];

function loadPersistedData() {
  const obsoleteIds = new Set(['s2', 's3', 's4', 's5', 's6']);
  try {
    const savedSongs = localStorage.getItem('yyrc_lib_songs_v2');
    if (savedSongs) {
      ALL_LIBRARY_SONGS = JSON.parse(savedSongs);
    } else {
      ALL_LIBRARY_SONGS = JSON.parse(JSON.stringify(DEFAULT_LIBRARY_SONGS));
    }
  } catch(e) {
    ALL_LIBRARY_SONGS = JSON.parse(JSON.stringify(DEFAULT_LIBRARY_SONGS));
  }

  // 深度清理历史残留旧演示曲目 s2~s6，并更正 s1 演示标示与预置直接播放直链
  ALL_LIBRARY_SONGS = ALL_LIBRARY_SONGS.filter(s => !obsoleteIds.has(s.id));
  const s1Track = ALL_LIBRARY_SONGS.find(s => s.id === 's1');
  if (s1Track) {
    s1Track.title = '空谷幽兰'; s1Track.artist = '阿鲲'; s1Track.onlineId = '405485307'; s1Track.source = 'netease'; s1Track.album = '新萧十一郎 电视剧原声带';
    if (!s1Track.fileUrl) s1Track.fileUrl = 'https://api.injahow.cn/meting/?server=netease&type=url&id=405485307';
    if (s1Track.cover === 'https://p1.music.126.net/109951169987201212.jpg') s1Track.cover = '';
  }
  if (ALL_LIBRARY_SONGS.length === 0) {
    ALL_LIBRARY_SONGS = JSON.parse(JSON.stringify(DEFAULT_LIBRARY_SONGS));
  }

  try {
    const savedAlbums = localStorage.getItem('yyrc_albums_v2');
    if (savedAlbums) {
      VINYL_ALBUMS = JSON.parse(savedAlbums);
      // 清理歌单内的旧演示曲
      VINYL_ALBUMS.forEach(alb => {
        if (alb.songs) alb.songs = alb.songs.filter(s => !obsoleteIds.has(s.id));
        // 清理古风作者名字并升级歌单名
        if (alb.id === 'alb_all') { alb.author = '灵犀音乐'; alb.sub = '包含所有听过的歌'; }
        if (alb.id === 'alb_fav') { alb.title = '我喜欢'; alb.author = '我'; alb.sub = '心选好歌 - 点击进入'; alb.hasRose = true; }
        if (alb.id === 'alb_local') { alb.author = '本地音乐'; alb.sub = '离线曲库 - 随心畅听'; }
        if (alb.desc && alb.id !== 'alb_all' && alb.id !== 'alb_fav' && alb.id !== 'alb_local') {
          alb.sub = alb.desc;
        }
      });
      // 若包含已废弃的清心歌单(alb_qx)或不包含本地歌曲歌单，则自动升级迁移至全新 3 歌单结构
      if (VINYL_ALBUMS.some(a => a.id === 'alb_qx') || !VINYL_ALBUMS.some(a => a.id === 'alb_local')) {
        initDefaultAlbums();
      }
    } else {
      initDefaultAlbums();
    }
  } catch(e) {
    initDefaultAlbums();
  }

  // 清理所有已失效或过期的直链（如死链 outer/url，或超过20分钟的在线鉴权 CDN 直链），使在线歌曲能自动重新获取新鲜直链
  const cleanExpiredUrls = (song) => {
    if (!song) return;
    const isOuterUrl = song.fileUrl && song.fileUrl.includes('music.163.com/song/media/outer/url');
    const isExpiredToken = (song.onlineId || (song.fileUrl && song.fileUrl.startsWith('http'))) && (!song.urlFetchedAt || (Date.now() - song.urlFetchedAt > 20 * 60 * 1000));
    if (isOuterUrl || isExpiredToken) {
      delete song.fileUrl;
      delete song.urlFetchedAt;
    }
  };
  ALL_LIBRARY_SONGS.forEach(cleanExpiredUrls);
  VINYL_ALBUMS.forEach(alb => {
    if (alb.songs) alb.songs.forEach(cleanExpiredUrls);
  });

  // 清理带 param=300y300 等失效或导致404的旧封面缓存
  const cleanBadCovers = (song) => {
    if (!song) return;
    if (song.cover && song.cover.includes('param=300y300')) {
      song.cover = '';
    }
  };
  ALL_LIBRARY_SONGS.forEach(cleanBadCovers);
  VINYL_ALBUMS.forEach(alb => {
    if (alb.songs) alb.songs.forEach(cleanBadCovers);
  });

  // 保证全部歌曲和我喜欢与 ALL_LIBRARY_SONGS 动态实时同步
  if (VINYL_ALBUMS[0]) {
    VINYL_ALBUMS[0].songs = ALL_LIBRARY_SONGS;
    VINYL_ALBUMS[0].sub = "包含所有听过的歌";
  }
  if (VINYL_ALBUMS[1]) {
    VINYL_ALBUMS[1].title = "我喜欢";
    VINYL_ALBUMS[1].author = "我";
    VINYL_ALBUMS[1].songs = ALL_LIBRARY_SONGS.filter(s => s.isFav);
  }

  // 启动后台静默补全曲库封面
  setTimeout(() => {
    if (typeof batchFillNetEaseCovers === 'function') {
      batchFillNetEaseCovers(ALL_LIBRARY_SONGS).then(() => {
        persistData();
        if (typeof renderSongList === 'function') renderSongList();
      });
    }
  }, 1000);
}

function initDefaultAlbums() {
  VINYL_ALBUMS = JSON.parse(JSON.stringify(DEFAULT_VINYL_ALBUMS));
  VINYL_ALBUMS[0].songs = ALL_LIBRARY_SONGS;
  VINYL_ALBUMS[1].songs = ALL_LIBRARY_SONGS.filter(s => s.isFav);
  VINYL_ALBUMS[2].songs = [];
  persistData();
}

function persistData() {
  try {
    if (VINYL_ALBUMS[0]) VINYL_ALBUMS[0].songs = ALL_LIBRARY_SONGS;
    if (VINYL_ALBUMS[1]) VINYL_ALBUMS[1].songs = ALL_LIBRARY_SONGS.filter(s => s.isFav);
    localStorage.setItem('yyrc_lib_songs_v2', JSON.stringify(ALL_LIBRARY_SONGS));
    localStorage.setItem('yyrc_albums_v2', JSON.stringify(VINYL_ALBUMS));
  } catch(e) {
    console.warn("持久化保存受限:", e);
  }
}

loadPersistedData();

let LYRICS_DATA = [
  { time: 0, duration: 5, text: "空谷幽兰 - 系统演示" },
  { time: 5, duration: 13, text: "谁家的枝头鸟儿成双对" },
  { time: 18, duration: 14, text: "蝴蝶翩翩飞" },
  { time: 32, duration: 18, text: "晨光渐照，微风拂过" },
  { time: 50, duration: 22, text: "琴声悠扬，旋律轻快" },
  { time: 72, duration: 24, text: "漫步在林间小道，听泉水叮咚" },
  { time: 96, duration: 26, text: "看天空白云流动，惬意舒适" },
  { time: 122, duration: 26, text: "伴着动听的音乐，沉浸其中" },
  { time: 148, duration: 24, text: "随心聆听每一刻美好旋律" },
  { time: 172, duration: 14, text: "音乐停歇，余音仍在耳畔回响" }
];

// 全局移动端幽灵穿透（Ghost Click）防范拦截引擎
let ghostClickBlockUntil = 0;
function blockGhostClicks(duration = 420) {
  ghostClickBlockUntil = Math.max(ghostClickBlockUntil, Date.now() + duration);
}
function isGhostClickBlocked() {
  return Date.now() < ghostClickBlockUntil;
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    if (isGhostClickBlocked()) {
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, true);
  document.addEventListener('touchend', (e) => {
    if (isGhostClickBlocked()) {
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  }, true);
}

