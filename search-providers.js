(() => {
  'use strict';
  const KEY = 'songPicker_searchProviders_v1', el = id => document.getElementById(id);
  const defaults = [{id: 'utao', name: 'YouTube：歌っちゃ王', type: 'youtube', value: '歌っちゃ王'}, {id: 'all', name: 'YouTube：指定なし', type: 'youtube', value: ''}];
  let settings = {selected: 'utao', custom: []};
  function valid(p) {
    if (!p || typeof p.id !== 'string' || typeof p.name !== 'string' || !p.name.trim() || typeof p.value !== 'string') return false;
    if (p.type === 'youtube') return !!p.value.trim();
    try { const url = new URL(p.value.replaceAll('{query}', 'test')); return p.type === 'website' && p.value.includes('{query}') && url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
  }
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && Array.isArray(saved.custom)) settings = {selected: saved.selected, custom: saved.custom.filter(p => valid(p) && !defaults.some(d => d.id === p.id))};
  } catch { el('providerStatus').textContent = '検索先設定を読み込めなかったため基本候補を使用します。'; }
  const all = () => [...defaults, ...settings.custom];
  const selected = () => all().find(p => p.id === settings.selected) || defaults[0];
  function save(next) {
    try { localStorage.setItem(KEY, JSON.stringify(next)); settings = next; render(); window.dispatchEvent(new Event('song-picker-provider-change')); return true; }
    catch { el('providerStatus').textContent = '検索先を保存できませんでした。変更前の設定を維持します。'; render(); return false; }
  }
  function render() {
    el('searchProvider').replaceChildren(); all().forEach(p => el('searchProvider').add(new Option(p.name, p.id)));
    el('searchProvider').value = selected().id;
    el('deleteProvider').disabled = defaults.some(p => p.id === selected().id);
  }
  el('searchProvider').onchange = () => save({...settings, selected: el('searchProvider').value});
  el('saveProvider').onclick = () => {
    const p = {id: 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2), name: el('providerName').value.trim(), type: el('providerType').value, value: el('providerValue').value.trim()};
    if (!valid(p)) { el('providerStatus').textContent = '表示名とキーワード、または {query} を含むhttpsの検索URLを入力してください。'; return; }
    if (save({selected: p.id, custom: [...settings.custom, p]})) {
      el('providerName').value = ''; el('providerValue').value = ''; el('providerStatus').textContent = '検索先を登録しました。';
    }
  };
  el('deleteProvider').onclick = () => {
    const p = selected(); if (!settings.custom.some(x => x.id === p.id) || !confirm(`検索先「${p.name}」を削除しますか？`)) return;
    save({selected: 'utao', custom: settings.custom.filter(x => x.id !== p.id)});
  };
  window.songPickerSearch = {
    selected,
    query: (song, provider = selected()) => song.normalize('NFKC').replace(/\s+\/\s+/g, ' ').replace(/\s+/g, ' ').trim() + ' カラオケ' + (provider.type === 'youtube' && provider.value ? ' ' + provider.value : ''),
    url(song, provider = selected()) {
      const q = this.query(song, provider);
      return provider.type === 'website' ? provider.value.replaceAll('{query}', encodeURIComponent(q)) : 'https://www.youtube.com/results?' + new URLSearchParams({search_query: q});
    }
  };
  render();
})();
