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
  const singerTag = item.singerTag ? `<span class="lyric-singer-tag">${escapeHtml(item.singerTag)}</span>` : '';
  const cleanTxt = item.cleanText || item.text || '';
  return `${singerTag}<span class="lyric-text-body">${escapeHtml(cleanTxt)}</span>`;
}

function parseLrc(lrcText) {
  if (!lrcText || typeof lrcText !== 'string') return null;
  const lines = lrcText.split('\n');
  const items = [];
  const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    const text = line.replace(timeRegex, '').trim();
    if (!text) continue;

    const parsedPrefix = extractSingerPrefix(text);

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
      items.push({
        time: timeInSec,
        text: text,
        singerTag: parsedPrefix.singerTag,
        cleanText: parsedPrefix.cleanText
      });
    }
  }

  if (!items.length) return null;
  items.sort((a, b) => a.time - b.time);

  for (let i = 0; i < items.length; i++) {
    const rawGap = (i < items.length - 1) ? (items[i + 1].time - items[i].time) : 8;
    // 估算本句歌词的人声实际发音时长（按剔除歌手标签后的纯唱词字数估算，每个字约0.34~0.38秒，附加前后呼吸留白）
    const targetText = items[i].cleanText || items[i].text;
    const charLen = targetText.replace(/\s+/g, '').length;
    const estVocalTime = Math.max(1.8, Math.min(8.0, charLen * 0.35 + 1.0));

    // 如果到下一句的空隙超过 (估算发音时长 + 1.6秒)，说明后续进入乐器Solo或纯音乐间奏
    if (rawGap > estVocalTime + 1.6) {
      items[i].hasInterludeAfter = true;
      items[i].duration = estVocalTime;
      items[i].interludeEndTime = (i < items.length - 1) ? items[i + 1].time : (items[i].time + 10);
    } else {
      items[i].hasInterludeAfter = false;
      items[i].duration = Math.max(1.0, Math.min(15, rawGap));
      items[i].interludeEndTime = items[i].time + items[i].duration;
    }
  }
  return items;
}

