/* Storage schema and import/export helpers. No browser dependencies. */
(function(root) {
  'use strict';
  const KEY = 'songPicker_catalog_v6';
  const OLD = 'songPicker_allSongs_v5';
  const defaults = ['J-POP', 'アニメ', 'ボーカロイド', 'ロック', 'ポップス', '洋楽', 'ゲーム', 'アイドル', '演歌', 'その他'];
  const names = values => {
    if (!Array.isArray(values) || values.some(x => typeof x !== 'string')) throw Error('分類は文字列の配列で指定してください。');
    return [...new Set(values.map(x => x.trim()).filter(Boolean))];
  };
  const split = text => names(text.split(/[,、]/));
  const label = song => song.title + (song.artist ? ' / ' + song.artist : '');
  const identity = song => JSON.stringify([song.title, song.artist]);
  function song(value) {
    if (typeof value === 'string') {
      const i = value.indexOf(' / ');
      value = { title: i < 0 ? value : value.slice(0, i), artist: i < 0 ? '' : value.slice(i + 3) };
    }
    if (!value || typeof value.title !== 'string' || !value.title.trim() ||
        (value.artist !== undefined && typeof value.artist !== 'string')) throw Error('曲名またはアーティストの形式が不正です。');
    return {...value, title: value.title.trim(), artist: (value.artist || '').trim(),
      genres: names(value.genres || []), tags: names(value.tags || [])};
  }
  function merge(a, b) {
    const map = new Map();
    [...a, ...b].map(song).forEach(s => {
      const key = identity(s), old = map.get(key);
      map.set(key, old ? {...old, ...s, genres: names([...old.genres, ...s.genres]), tags: names([...old.tags, ...s.tags])} : s);
    });
    return [...map.values()];
  }
  function validate(value) {
    if (Array.isArray(value)) value = {songs: value, genres: defaults, tags: []};
    if (!value || !Array.isArray(value.songs) || (value.version !== undefined && value.version !== 6)) throw Error('対応していないバックアップ形式です。');
    const songs = merge([], value.songs);
    return {...value, version: 6, songs, genres: names([...names(value.genres || []), ...songs.flatMap(s => s.genres)]),
      tags: names([...names(value.tags || []), ...songs.flatMap(s => s.tags)])};
  }
  function load(storage) {
    const current = storage.getItem(KEY);
    if (current !== null) return validate(JSON.parse(current));
    const old = storage.getItem(OLD);
    const data = validate(old === null ? {songs: [], genres: defaults, tags: []} : JSON.parse(old));
    // Write and verify new storage before reporting a successful migration. Never change v5.
    const serialized = JSON.stringify(data);
    storage.setItem(KEY, serialized);
    if (storage.getItem(KEY) !== serialized) throw Error('保存内容を確認できません。');
    return data;
  }
  function csvRows(text) {
    text = text.replace(/^\uFEFF/, '');
    const rows = []; let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
        else if (quoted || cell === '') quoted = !quoted;
        else throw Error('CSVの引用符が不正です。');
      } else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
      else if ((c === '\r' || c === '\n') && !quoted) {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); if (row.some(x => x !== '')) rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (quoted) throw Error('CSVの引用符が閉じていません。');
    row.push(cell); if (row.some(x => x !== '')) rows.push(row);
    return rows;
  }
  function fromCsv(text) {
    const rows = csvRows(text);
    if (!rows.length) throw Error('CSVが空です。');
    const header = rows[0].map(x => x.trim().toLowerCase());
    const hasHeader = header[0] === 'title';
    const cols = hasHeader ? header : ['title', 'artist'];
    return (hasHeader ? rows.slice(1) : rows).map(row => {
      const get = key => row[cols.indexOf(key)] || '';
      const category = key => {
        const raw = get(key);
        return !raw ? [] : raw.trim().startsWith('[') ? names(JSON.parse(raw)) : split(raw);
      };
      return song({title: get('title'), artist: get('artist'), genres: category('genres'), tags: category('tags')});
    });
  }
  function toCsv(songs) {
    return '\uFEFF' + [['title', 'artist', 'genres', 'tags'], ...songs.map(s => [s.title, s.artist, JSON.stringify(s.genres), JSON.stringify(s.tags)])]
      .map(row => row.map(x => '"' + x.replace(/"/g, '""') + '"').join(',')).join('\r\n');
  }
  function filter(data, query, genre, tag) {
    const words = query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return data.songs.filter(s => (!genre || s.genres.includes(genre)) && (!tag || s.tags.includes(tag)) &&
      words.every(w => [s.title, s.artist, ...s.genres, ...s.tags].join(' ').normalize('NFKC').toLocaleLowerCase().includes(w)));
  }
  const comparable = text => text.normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/[\p{P}\p{S}\s]/gu, '');
  function distance(a, b, limit = 2) {
    if (Math.abs(a.length - b.length) > limit) return limit + 1;
    let prev = Array.from({length: b.length + 1}, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const row = [i];
      for (let j = 1; j <= b.length; j++) row[j] = Math.min(row[j-1]+1, prev[j]+1, prev[j-1]+(a[i-1] === b[j-1] ? 0 : 1));
      if (Math.min(...row) > limit) return limit + 1;
      prev = row;
    }
    return prev[b.length];
  }
  function similar(a, b) {
    const x = comparable(a.title), y = comparable(b.title), u = comparable(a.artist), v = comparable(b.artist);
    if (!x || !y) return '';
    if (x === y) return u === v ? '空白・記号・全角半角・かななどの表記違い' : !u || !v ? '同じ曲名（アーティスト未設定あり）' : '同じ曲名（別アーティストの可能性あり）';
    const n = Math.min(x.length, y.length), limit = n >= 8 ? 2 : n >= 4 ? 1 : 0;
    if (!limit || !u || !v || (u !== v && (Math.min(u.length, v.length) < 6 || distance(u, v, 1) > 1))) return '';
    return distance(x, y, limit) <= limit ? '曲名の軽微なタイプミス候補' : '';
  }
  const api = {KEY, OLD, defaults, names, split, label, identity, song, merge, validate, load, csvRows, fromCsv, toCsv, filter, comparable, distance, similar};
  if (typeof module !== 'undefined') module.exports = api;
  else root.Catalog = api;
})(typeof window === 'undefined' ? globalThis : window);
