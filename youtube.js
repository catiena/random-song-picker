/* YouTube support is isolated from the existing song storage and picker. */
(() => {
  'use strict';
  const KEY_STORAGE = 'songPicker_youtubeApiKey_v1';
  const CACHE_STORAGE = 'songPicker_youtubeCache_v1';
  const TTL = 24 * 60 * 60 * 1000;
  const MAX_CACHE = 100;
  const pending = new Map();
  let generation = 0;
  let apiKey = '';
  const el = id => document.getElementById(id);
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key, value) => {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
      return true;
    } catch { return false; }
  };
  const normalize = song => song.normalize('NFKC').replace(/\s+/g, ' ').trim();
  const query = (song, provider) => window.songPickerSearch.query(song, provider);
  function decode(text) {
    const area = document.createElement('textarea');
    area.innerHTML = text;
    return area.value;
  }
  function rank(items, provider) {
    const seen = new Set();
    const score = item => {
      const title = item.title.normalize('NFKC');
      const channel = item.channel.normalize('NFKC');
      let points = provider.value && channel.toLowerCase().includes(provider.value.normalize('NFKC').toLowerCase()) ? 100 : 0;
      if (/ガイド(?:メロ(?:ディー?)?)?\s*(?:なし|無し|無)|メロディー?なし/i.test(title)) points += 40;
      else if (/ガイド(?:メロ(?:ディー?)?)?\s*(?:あり|有り|有)/i.test(title)) points -= 30;
      if (/カラオケ|karaoke|off\s*vocal|instrumental/i.test(title)) points += 10;
      if (/歌ってみた|cover.*歌唱/i.test(title)) points -= 30;
      return points;
    };
    return items.filter(item => {
      if (!item || !/^[\w-]{11}$/.test(item.id) ||
          typeof item.title !== 'string' || typeof item.channel !== 'string' || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }).sort((a, b) => score(b) - score(a)).slice(0, 3);
  }
  function loadCache() {
    try {
      const data = JSON.parse(read(CACHE_STORAGE) || '{}');
      if (!data || Array.isArray(data) || typeof data !== 'object') return {};
      const entries = Object.entries(data).filter(([, v]) => v &&
        Number.isFinite(v.time) && Date.now() - v.time >= 0 &&
        Date.now() - v.time < TTL && Array.isArray(v.items));
      return Object.fromEntries(entries.sort((a, b) => b[1].time - a[1].time).slice(0, MAX_CACHE));
    } catch { return {}; }
  }
  // Expired entries are removed on startup, lookup, and write.
  write(CACHE_STORAGE, JSON.stringify(loadCache()));
  function saveCache(key, items) {
    const cache = loadCache();
    cache[key] = { time: Date.now(), items };
    const bounded = Object.fromEntries(Object.entries(cache)
      .sort((a, b) => b[1].time - a[1].time).slice(0, MAX_CACHE));
    write(CACHE_STORAGE, JSON.stringify(bounded));
  }
  function errorMessage(status, body) {
    const reason = body?.error?.errors?.[0]?.reason || '';
    if (/quota|dailyLimit|rateLimit/i.test(reason) || status === 429)
      return 'APIの利用上限に達しました。時間をおいて試すか、YouTubeで検索してください。';
    if (/keyInvalid|accessNotConfigured|ipRefererBlocked|forbidden/i.test(reason) || status === 400 || status === 403)
      return 'キー、YouTube Data API v3の有効化、HTTPリファラーとAPI制限を確認してください。';
    return '候補を取得できませんでした。YouTube検索リンクを利用できます。';
  }
  async function search(song, provider) {
    const cacheKey = query(song, provider);
    const cached = loadCache()[cacheKey];
    if (cached) return { items: rank(cached.items, provider), cached: true };
    if (!apiKey) throw new Error('設定を開いてAPIキーを入力すると、動画候補を表示できます。');
    if (pending.has(cacheKey)) return pending.get(cacheKey);
    const keyAtStart = apiKey;
    const generationAtStart = generation;
    const task = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const url = new URL('https://www.googleapis.com/youtube/v3/search');
        url.search = new URLSearchParams({
          part: 'snippet', type: 'video', maxResults: '25',
          q: cacheKey, relevanceLanguage: 'ja', regionCode: 'JP',
          order: 'relevance', key: keyAtStart
        }).toString();
        let response;
        try { response = await fetch(url, { signal: controller.signal }); }
        catch { throw new Error('通信に失敗したか、時間がかかりすぎました。再試行またはYouTube検索をご利用ください。'); }
        let body;
        try { body = await response.json(); }
        catch { throw new Error('APIの応答を読み取れませんでした。再試行してください。'); }
        if (!response.ok) throw new Error(errorMessage(response.status, body));
        if (!Array.isArray(body.items)) throw new Error('APIの応答形式を確認できませんでした。');
        const items = rank(body.items.map(item => ({
          id: item.id?.videoId,
          title: decode(item.snippet?.title || ''),
          channel: decode(item.snippet?.channelTitle || '')
        })), provider);
        if (generationAtStart === generation) saveCache(cacheKey, items);
        return { items, cached: false };
      } finally { clearTimeout(timer); }
    })();
    pending.set(cacheKey, task);
    try { return await task; }
    finally { if (pending.get(cacheKey) === task) pending.delete(cacheKey); }
  }
  function link(text, url) {
    const a = document.createElement('a');
    a.textContent = text;
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }
  function attach(li, song) {
    const box = document.createElement('section');
    box.className = 'youtube-candidates';
    box.setAttribute('aria-label', song + ' のカラオケ動画');
    const searchLink = link('検索 ↗', '#');
    box.append(searchLink);
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    const list = document.createElement('ol');
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'secondary';
    retry.textContent = '動画候補を取得';
    box.append(status, list, retry);
    li.append(box);
    let requestId = 0;
    async function run() {
      const id = ++requestId;
      const provider = window.songPickerSearch.selected();
      searchLink.textContent = provider.name + 'で検索 ↗';
      searchLink.href = window.songPickerSearch.url(song, provider);
      list.replaceChildren();
      if (provider.type !== 'youtube') {
        status.textContent = '上のリンクで選択したサイトを検索できます。'; retry.hidden = true; retry.disabled = false; return;
      }
      retry.hidden = false;
      retry.disabled = true;
      status.textContent = 'カラオケ動画を検索中…';
      list.replaceChildren();
      try {
        const result = await search(song, provider);
        if (id !== requestId || !box.isConnected) return;
        result.items.forEach(item => {
          const row = document.createElement('li');
          row.append(link(item.title, 'https://www.youtube.com/watch?' +
            new URLSearchParams({ v: item.id })));
          const channel = document.createElement('small');
          channel.textContent = item.channel;
          row.append(channel);
          list.append(row);
        });
        status.textContent = result.items.length
          ? 'YouTube候補（最大3件）' + (result.cached ? '・24時間以内のキャッシュ' : '')
          : '動画候補が見つかりませんでした。YouTubeで検索できます。';
      } catch (error) {
        if (id === requestId && box.isConnected) status.textContent = error.message;
      } finally {
        if (id === requestId) {
          retry.disabled = false;
          retry.textContent = '動画候補を取得・再表示';
        }
      }
    }
    retry.onclick = run;
    box.addEventListener('youtube-key-change', run);
    run();
  }
  function refresh() {
    document.querySelectorAll('.youtube-candidates').forEach(box =>
      box.dispatchEvent(new Event('youtube-key-change')));
  }
  window.addEventListener('song-picker-provider-change', refresh);
  apiKey = read(KEY_STORAGE) || '';
  el('youtubeApiKey').value = apiKey;
  el('rememberYoutubeKey').checked = !!apiKey;
  el('youtubeKeyStatus').textContent = apiKey ? '保存済みのキーを使用します。' : 'キー未設定でもYouTube検索リンクは使えます。';
  el('saveYoutubeKey').onclick = () => {
    apiKey = el('youtubeApiKey').value.trim();
    generation++;
    pending.clear();
    const remember = el('rememberYoutubeKey').checked && !!apiKey;
    const saved = write(KEY_STORAGE, remember ? apiKey : null);
    el('youtubeKeyStatus').textContent = !saved
      ? 'ブラウザ保存を更新できませんでした。キーはこのタブ内で使用します。'
      : !apiKey ? 'キーを解除しました。'
      : remember ? 'このブラウザに保存しました。' : 'このタブを閉じるまで使用します。';
    refresh();
  };
  el('forgetYoutubeKey').onclick = () => {
    apiKey = '';
    generation++;
    pending.clear();
    el('youtubeApiKey').value = '';
    el('rememberYoutubeKey').checked = false;
    const removed = write(KEY_STORAGE, null);
    el('youtubeKeyStatus').textContent = removed ? 'キーを削除しました。' : '保存キーを削除できませんでした。ブラウザのサイトデータ設定を確認してください。';
  };
  el('clearYoutubeCache').onclick = () => {
    generation++;
    const removed = write(CACHE_STORAGE, null);
    el('youtubeKeyStatus').textContent = removed ? '検索キャッシュを削除しました。' : '検索キャッシュを削除できませんでした。';
  };
  window.songPickerYoutube = { attach };
})();
