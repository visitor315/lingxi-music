/* ================== 标准 LRC 歌词时间轴解析器 ================== */

/* ================== 歌词持久化与多层缓存机制 ================== */
function getCachedLyric(title, artist) {
  if (!title) return '';
  try {
    const cache = JSON.parse(localStorage.getItem('yyrc_lyrics_cache') || '{}');
    const key = (title + '_' + (artist || '')).toLowerCase().trim();
    if (cache[key]) return cache[key];
    return cache[title.toLowerCase().trim()] || '';
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
  const text = item.text || item.cleanText || '';
  return `<span class="lyric-text-body">${escapeHtml(text)}</span>`;
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

  // 2. 匹配 KRC / LX 逐字格式: <offsetMs,durationMs>字
  const krcWordRegex = /<(\d+),(\d+)>([^<]+)/g;
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
  const lines = lrcText.split('\n');
  const items = [];
  const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
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
      // 普通 LRC：基于人声吐字声学速率基准（每个字 0.30s + 0.35s 自然起伏）
      const cleanChars = (items[i].text || '').replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '').length || (items[i].text || '').length || 4;
      const naturalVocalTime = cleanChars * 0.30 + 0.35;
      const maxAllowedVocalTime = Math.max(0.8, rawGap - Math.max(0.2, Math.min(0.45, rawGap * 0.12)));
      const effectiveVocalDur = Math.min(naturalVocalTime, maxAllowedVocalTime);
      items[i].duration = Math.max(0.8, effectiveVocalDur);

      // 若两句实际间隔比唱词时长多出 1.5 秒以上，判定唱毕后进入伴奏/间奏
      if (rawGap > items[i].duration + 1.5) {
        items[i].hasInterludeAfter = true;
        items[i].interludeEndTime = (i < items.length - 1) ? items[i + 1].time : (items[i].time + items[i].duration + 4);
      } else {
        items[i].hasInterludeAfter = false;
        items[i].interludeEndTime = items[i].time + items[i].duration;
      }
    }
  }
  return items;
}

