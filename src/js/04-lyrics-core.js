/* ================== 标准 LRC 歌词时间轴解析器 ================== */

/* 智能防错校验：核验歌词文本是否明显属于其他歌曲（防止历史错误缓存） */
function isLyricContentMismatched(title, artist, lrcText) {
  if (!title || !lrcText || typeof lrcText !== 'string') return false;
  const norm = (s) => (s || '').replace(/[\s'’‘""“”（）()\[\]【】\-—~～,，.。!！?？:：;；、\u00b7]/g, '').toLowerCase();
  const nt = norm(title);
  if (!nt) return false;

  // 1. 检查歌词头部标签 [ti:xxx]
  const tiMatch = lrcText.match(/\[ti:\s*([^\]]+)\]/i);
  if (tiMatch && tiMatch[1]) {
    const ti = norm(tiMatch[1]);
    if (ti && ti.length >= 2 && !ti.includes(nt) && !nt.includes(ti)) {
      return true;
    }
  }

  // 2. 检查前 8 行是否有明确标明的 "歌手 - 歌名" 或 "歌名 - 歌手"
  const lines = lrcText.split('\n').slice(0, 8);
  for (const line of lines) {
    const cleanLine = line.replace(/\[[^\]]+\]/g, '').replace(/<[^>]+>/g, '').trim();
    if (!cleanLine) continue;
    const dashMatch = cleanLine.match(/^([^\-\—]+)[\-\—](.+)$/);
    if (dashMatch) {
      const part1 = norm(dashMatch[1]);
      const part2 = norm(dashMatch[2]);
      const isTitleInLine = (part1 && part1.length >= 2 && (nt.includes(part1) || part1.includes(nt))) ||
                            (part2 && part2.length >= 2 && (nt.includes(part2) || part2.includes(nt)));
      if (!isTitleInLine && !/作词|作曲|编曲|制作|词|曲/i.test(cleanLine)) {
        return true;
      }
    }
  }
  return false;
}

/* ================== 歌词持久化与多层缓存机制 ================== */
function getCachedLyric(title, artist) {
  if (!title) return '';
  try {
    const cache = JSON.parse(localStorage.getItem('yyrc_lyrics_cache') || '{}');
    const key = (title + '_' + (artist || '')).toLowerCase().trim();
    const lrc = cache[key] || cache[title.toLowerCase().trim()] || '';
    if (!lrc) return '';

    // 智能防污染：若缓存中残留了历史错配歌词（如存量残留的演员歌词），立即自愈清除
    if (isLyricContentMismatched(title, artist, lrc)) {
      delete cache[key];
      delete cache[title.toLowerCase().trim()];
      try { localStorage.setItem('yyrc_lyrics_cache', JSON.stringify(cache)); } catch(e) {}
      return '';
    }
    return lrc;
  } catch(e) {
    return '';
  }
}

function saveLyricToCache(title, artist, lrcText) {
  if (!title || !lrcText) return;
  try {
    const cache = JSON.parse(localStorage.getItem('yyrc_lyrics_cache') || '{}');
    const key = (title + '_' + (artist || '')).toLowerCase().trim();
    cache[key] = lrcText;
    cache[title.toLowerCase().trim()] = lrcText;
    localStorage.setItem('yyrc_lyrics_cache', JSON.stringify(cache));
  } catch(e) {}
}

function extractSingerPrefix(text) {
  if (!text || typeof text !== 'string') return { singerTag: '', cleanText: '' };
  const regex = /^((?:(?:\[|\(|（|【)\s*(?:男|女|合|童|伴|独|合唱|伴唱|主唱|男声|女声|和声|旁白|对白|[A-Za-z\u4e00-\u9fa5\s/&、+]{1,10})\s*(?:\]|\)|）|】)\s*[:：]?|(?:男|女|合|童|伴|独|合唱|伴唱|主唱|男声|女声|和声|旁白|对白|[A-Za-z\u4e00-\u9fa5]{1,8}(?:\s*[\/&、+]\s*[A-Za-z\u4e00-\u9fa5]{1,8})?)\s*[:：]\s*))(.*)$/;
  const m = text.match(regex);
  if (m && m[2] && m[2].trim()) {
    return {
      singerTag: m[1].trim(),
      cleanText: m[2].trim()
    };
  }
  return { singerTag: '', cleanText: text };
}

function formatLyricItemHtml(item) {
  if (!item) return '';
  const tag = item.singerTag ? `<span class="lyric-singer-tag">${escapeHtml(item.singerTag)}</span>` : '';
  const text = item.cleanText || item.text || '';
  return `${tag}<span class="lyric-text-body">${escapeHtml(text)}</span>`;
}

function parseLineWords(text, lineStartTime) {
  if (!text || typeof text !== 'string') return null;
  // 1. 匹配 Enhanced LRC 格式: <00:12.34>字 或 <12.34>字
  const enhancedWordRegex = /<(\d{1,2}:)?(\d{1,2})(?:\.(\d{1,3}))?>([^<]+)/g;
  let enhancedMatches = [];
  let m;
  while ((m = enhancedWordRegex.exec(text)) !== null) {
    let min = m[1] ? parseInt(m[1].replace(':', ''), 10) : 0;
    let sec = parseInt(m[2], 10);
    let ms = 0;
    if (m[3]) {
      ms = parseInt(m[3].padEnd(3, '0').slice(0, 3), 10);
    }
    const wordStart = min * 60 + sec + ms / 1000;
    enhancedMatches.push({
      start: wordStart,
      text: m[4]
    });
  }
  if (enhancedMatches.length > 0) {
    const words = [];
    for (let i = 0; i < enhancedMatches.length; i++) {
      const cur = enhancedMatches[i];
      const nextStart = (i < enhancedMatches.length - 1) ? enhancedMatches[i + 1].start : (cur.start + 0.4);
      const dur = Math.max(0.08, nextStart - cur.start);
      words.push({
        text: cur.text,
        start: cur.start,
        duration: dur
      });
    }
    return words;
  }

  // 2. 匹配 KRC / LX 逐字格式: <offsetMs,durationMs>字 或 <offsetMs,durationMs,0>字
  const krcWordRegex = /<(\d+),(\d+)(?:,\d+)?>([^<]+)/g;
  let krcMatches = [];
  while ((m = krcWordRegex.exec(text)) !== null) {
    const offsetMs = parseInt(m[1], 10);
    const durMs = parseInt(m[2], 10);
    krcMatches.push({
      start: lineStartTime + offsetMs / 1000,
      duration: Math.max(0.05, durMs / 1000),
      text: m[3]
    });
  }
  if (krcMatches.length > 0) return krcMatches;

  // 3. 匹配 YRC 风格逐字格式: (startMs,durMs,0)字
  const yrcWordRegex = /\((\d+),(\d+)(?:,\d+)?\)([^(]+)/g;
  let yrcMatches = [];
  while ((m = yrcWordRegex.exec(text)) !== null) {
    const startMs = parseInt(m[1], 10);
    const durMs = parseInt(m[2], 10);
    yrcMatches.push({
      start: startMs / 1000,
      duration: Math.max(0.05, durMs / 1000),
      text: m[3]
    });
  }
  if (yrcMatches.length > 0) return yrcMatches;

  return null;
}

function parseLrc(lrcText) {
  if (!lrcText || typeof lrcText !== 'string') return null;
  lrcText = lrcText.replace(/^\uFEFF/, '');
  const lines = lrcText.split('\n');
  const items = [];
  const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // KRC 词级逐字行: [startMs,durMs]<off,dur,0>字...（毫秒行头，不走 mm:ss 正则）
    const krcLineMatch = line.match(/^\[(\d+),(\d+)\](.*)$/);
    if (krcLineMatch) {
      const timeInSec = parseInt(krcLineMatch[1], 10) / 1000;
      const rawContent = krcLineMatch[3].trim();
      if (!rawContent) continue;
      const parsedWords = parseLineWords(rawContent, timeInSec);
      const cleanLineRaw = rawContent.replace(/<[^>]+>/g, '').replace(/\([^)]+\)/g, '').trim();
      const parsedPrefix = extractSingerPrefix(cleanLineRaw);
      // 过滤前奏区域大段堆砌的混音/母带/和声等幕后制作人报幕名单
      if (timeInSec < 20 && /^(?:编曲|制作人|制作|和声编写|和声|伴唱|录音师|录音|混音师|混音|母带工程师|母带|吉他|贝斯|鼓手|键盘|弦乐|企划|统筹|监制|出品|发行|版权|OP|SP|录音室|混音室|母带室)\s*[:：]/i.test(cleanLineRaw)) {
        continue;
      }
      items.push({
        time: timeInSec,
        text: cleanLineRaw,
        singerTag: parsedPrefix.singerTag,
        cleanText: parsedPrefix.cleanText,
        words: parsedWords
      });
      continue;
    }

    const rawContent = line.replace(timeRegex, '').trim();
    if (!rawContent) continue;

    timeRegex.lastIndex = 0;
    let match;
    while ((match = timeRegex.exec(line)) !== null) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      let ms = 0;
      if (match[3]) {
        const rawMs = match[3].padEnd(3, '0').slice(0, 3);
        ms = parseInt(rawMs, 10);
      }
      const timeInSec = min * 60 + sec + ms / 1000;
      
      // 解析逐字词级时间轴（若歌词源支持）
      const parsedWords = parseLineWords(rawContent, timeInSec);
      // 清除词级时间标记获得干净文本
      const cleanLineRaw = rawContent.replace(/<[^>]+>/g, '').replace(/\([^)]+\)/g, '').trim();
      const parsedPrefix = extractSingerPrefix(cleanLineRaw);

      // 过滤前奏区域大段堆砌的混音/母带/和声等幕后制作人报幕名单
      if (timeInSec < 20 && /^(?:编曲|制作人|制作|和声编写|和声|伴唱|录音师|录音|混音师|混音|母带工程师|母带|吉他|贝斯|鼓手|键盘|弦乐|企划|统筹|监制|出品|发行|版权|OP|SP|录音室|混音室|母带室)\s*[:：]/i.test(cleanLineRaw)) {
        continue;
      }
      items.push({
        time: timeInSec,
        text: cleanLineRaw,
        singerTag: parsedPrefix.singerTag,
        cleanText: parsedPrefix.cleanText,
        words: parsedWords
      });
    }
  }

  if (!items.length) return null;
  items.sort((a, b) => a.time - b.time);

  // 严格自适应乐句发音区间与间奏判定（基于声学人声吐字速率与 AMLL 自适应小节模型）
  for (let i = 0; i < items.length; i++) {
    const rawGap = (i < items.length - 1) ? (items[i + 1].time - items[i].time) : 5.0;

    // 若带有词级逐字时间戳，以实际词尾时间为准
    if (items[i].words && items[i].words.length > 0) {
      const lastWord = items[i].words[items[i].words.length - 1];
      const exactVocalDur = Math.max(0.6, (lastWord.start + lastWord.duration) - items[i].time);
      items[i].duration = exactVocalDur;
      if (rawGap > exactVocalDur + 2.0) {
        items[i].hasInterludeAfter = true;
        items[i].interludeEndTime = (i < items.length - 1) ? items[i + 1].time : (items[i].time + exactVocalDur + 5);
      } else {
        items[i].hasInterludeAfter = false;
        items[i].interludeEndTime = items[i].time + exactVocalDur;
      }
    } else {
      // 普通 LRC（无词级时间轴）：按慢歌实际吐字节奏估算人声区间（每字约0.38秒），
      // 填充到估算人声终点即满格，不硬铺到下一句拖尾；密集句仍铺满整段间隔；仅长间奏唱毕定格
      const isLastLine = (i === items.length - 1);
      const cleanChars = (items[i].text || '').replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '').length || (items[i].text || '').length || 4;
      const estVocalTime = cleanChars * 0.38 + 0.6;
      const spanGap = isLastLine ? 5.0 : rawGap;
      const breathing = isLastLine ? 0 : Math.min(0.35, Math.max(0.15, rawGap * 0.08));

      if (!isLastLine && rawGap > 7.0) {
        // 超过 7 秒的大间隔判定为吉他 Solo、长过门或纯音乐间奏：唱毕定格等待下一句
        items[i].duration = Math.min(Math.max(1.2, estVocalTime), rawGap - 1.5);
        items[i].hasInterludeAfter = true;
        items[i].interludeEndTime = items[i + 1].time;
      } else {
        // 常规演唱：估算人声时长与句间隔取小者，唱完即满格，下一句准时衔接
        items[i].duration = Math.max(0.8, Math.min(spanGap - breathing, estVocalTime));
        items[i].hasInterludeAfter = false;
        items[i].interludeEndTime = items[i].time + items[i].duration;
      }
    }
  }
  return items;
}

