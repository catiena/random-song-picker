(() => {
  'use strict';
  const C = Catalog, el = id => document.getElementById(id);
  let data, blocked = false, remaining = [], editing = -1;
  const message = text => { el('status').textContent = text; };
  const button = (text, action) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'secondary'; b.textContent = text; b.onclick = action; return b;
  };
  const candidates = () => C.filter(data, el('searchSongs').value, el('genreFilter').value, el('tagFilter').value);
  function reset() {
    remaining = candidates().map(C.identity);
    el('resultCard').style.display = 'none';
  }
  function commit(next, preserveResults = false) {
    if (blocked) { alert('保存データを読み込めなかったため変更を停止しています。旧データは保持されています。'); return false; }
    try {
      next = C.validate(next);
      localStorage.setItem(C.KEY, JSON.stringify(next));
      data = next; refresh();
      el('duplicateResults').replaceChildren(); el('duplicateStatus').textContent = 'データが変わったら再チェックしてください。';
      if (preserveResults) {
        const keys = new Set(candidates().map(C.identity)); remaining = remaining.filter(x => keys.has(x));
        el('cycleInfo').textContent = '（曲を削除しました。残りの曲で抽選を続けます）';
      } else reset();
      return true;
    } catch (e) { alert('保存できませんでした。変更前の状態を維持します。\n' + e.message); return false; }
  }
  function options(id, values, title) {
    const select = el(id), selected = select.value;
    select.replaceChildren(new Option(title, ''));
    values.forEach(v => select.add(new Option(v, v)));
    select.value = values.includes(selected) ? selected : '';
  }
  function renderList() {
    const songs = candidates();
    el('filterStatus').textContent = `${songs.length} / ${data.songs.length} 曲が対象`;
    el('listPanelBody').replaceChildren();
    songs.forEach(s => {
      const li = document.createElement('li'), title = document.createElement('strong'), meta = document.createElement('span');
      title.textContent = C.label(s);
      meta.className = 'song-meta'; meta.textContent = `ジャンル：${s.genres.join('・') || '未設定'} ／ タグ：${s.tags.join('・') || '未設定'}`;
      li.append(title, meta, button('編集', () => openEditor(data.songs.indexOf(s))), button('曲を削除', () => {
        if (confirm(`「${C.label(s)}」を削除しますか？`)) commit({...data, songs: data.songs.filter(x => x !== s)});
      }));
      el('listPanelBody').append(li);
    });
    if (!songs.length) { const li = document.createElement('li'); li.textContent = '対象の曲がありません。'; el('listPanelBody').append(li); }
  }
  function refresh() {
    options('genreFilter', data.genres, 'すべてのジャンル'); options('tagFilter', data.tags, 'すべてのタグ');
    message(`現在の保存曲数：${data.songs.length}（ブラウザに保存中）`);
    renderList(); renderManager();
  }
  function renderManager() {
    const host = el('taxonomyManager'); host.replaceChildren();
    [['genres', 'ジャンル'], ['tags', 'タグ']].forEach(([key, title]) => {
      const h = document.createElement('h3'); h.textContent = title; host.append(h);
      const add = document.createElement('input'); add.setAttribute('aria-label', `新しい${title}`); add.placeholder = `新しい${title}`;
      const row = document.createElement('div'); row.className = 'taxonomy-row';
      row.append(add, button('追加', () => {
        const name = add.value.trim(); if (!name) return;
        commit({...data, [key]: C.names([...data[key], name])});
      })); host.append(row);
      data[key].forEach(name => {
        const input = document.createElement('input'); input.value = name; input.setAttribute('aria-label', `${title}「${name}」の名前`);
        const line = document.createElement('div'); line.className = 'taxonomy-row';
        line.append(input, button('名前を保存', () => {
          const next = input.value.trim(); if (!next || next === name) return;
          if (data[key].includes(next) && !confirm(`「${next}」と統合しますか？`)) return;
          commit({...data, [key]: C.names(data[key].map(x => x === name ? next : x)),
            songs: data.songs.map(s => ({...s, [key]: C.names(s[key].map(x => x === name ? next : x))}))});
        }), button('削除', () => {
          if (!confirm(`${title}「${name}」を削除し、曲からも外しますか？ 曲自体は残ります。`)) return;
          if (commit({...data, [key]: data[key].filter(x => x !== name), songs: data.songs.map(s => ({...s, [key]: s[key].filter(x => x !== name)}))})) {
            if (key === 'genres' && el('genreFilter').value === name) el('genreFilter').value = '';
            if (key === 'tags' && el('tagFilter').value === name) el('tagFilter').value = '';
          }
        })); host.append(line);
      });
    });
  }
  function openEditor(index) {
    editing = index; const s = data.songs[index];
    el('editTitle').value = s.title; el('editArtist').value = s.artist;
    el('editNewGenres').value = ''; el('editNewTags').value = '';
    [['genres', 'editGenres'], ['tags', 'editTags']].forEach(([key, id]) => {
      el(id).replaceChildren();
      data[key].forEach(name => {
        const label = document.createElement('label'), input = document.createElement('input');
        label.className = 'choice'; input.type = 'checkbox'; input.value = name; input.checked = s[key].includes(name);
        label.append(input, document.createTextNode(name)); el(id).append(label);
      });
    });
    el('songEditor').showModal();
  }
  el('editForm').onsubmit = event => {
    event.preventDefault();
    const get = (id, extra) => C.names([...el(id).querySelectorAll('input:checked')].map(x => x.value).concat(C.split(el(extra).value)));
    const s = {...data.songs[editing], title: el('editTitle').value.trim(), artist: el('editArtist').value.trim(),
      genres: get('editGenres', 'editNewGenres'), tags: get('editTags', 'editNewTags')};
    if (!s.title) return;
    if (data.songs.some((x, i) => i !== editing && C.identity(x) === C.identity(s))) { alert('同じ曲名・アーティストの曲があります。別の名前にするか、既存曲を編集してください。'); return; }
    if (commit({...data, songs: data.songs.map((x, i) => i === editing ? s : x)})) el('songEditor').close();
  };
  el('cancelEdit').onclick = () => el('songEditor').close();
  function plain(text, clean) {
    return text.split(/\r?\n/).map(x => x.trim()).filter(Boolean).map(x => {
      if (clean && el('stripTimestamp').checked) x = removeTimestamp(x);
      return C.song(normalizeTitle(handleParenArtist(handleTSV(x))));
    });
  }
  el('loadListBtn').onclick = () => {
    try {
      const songs = plain(el('songInput').value, true).map(s => ({...s, genres: C.split(el('addGenres').value), tags: C.split(el('addTags').value)}));
      if (!songs.length) { alert('追加する曲リストが空です。'); return; }
      if (commit({...data, songs: C.merge(data.songs, songs)})) {
        el('songInput').value = '';
        el('duplicateStatus').textContent = '曲を追加しました。「全曲をチェック」で表記違いやタイプミス候補を確認できます。';
      }
    } catch (e) { alert(e.message); }
  };
  el('pickBtn').onclick = () => {
    const pool = candidates(); if (!pool.length) { alert('抽選対象の曲がありません。絞り込みを変更するか曲を登録してください。'); return; }
    if (!remaining.length) remaining = pool.map(C.identity);
    // Finish the current cycle before starting another, even when two were requested.
    const count = Math.min(Number(el('pickCount').value), remaining.length), picked = [];
    for (let i = 0; i < count; i++) {
      const index = Math.floor(Math.random() * remaining.length), key = remaining.splice(index, 1)[0];
      picked.push(pool.find(s => C.identity(s) === key));
    }
    el('resultList').replaceChildren();
    picked.forEach(s => {
      const li = document.createElement('li'), title = document.createElement('span'); title.textContent = C.label(s);
      const meta = document.createElement('small'); meta.className = 'song-meta'; meta.textContent = [...s.genres, ...s.tags].join('・');
      li.append(title, meta, button('ジャンル・タグを編集', () => openEditor(data.songs.findIndex(x => C.identity(x) === C.identity(s)))), button('DBから削除', () => {
        if (!confirm(`「${C.label(s)}」を保存DBから削除しますか？`)) return;
        if (commit({...data, songs: data.songs.filter(x => C.identity(x) !== C.identity(s))}, true)) {
          li.remove();
          if (!el('resultList').children.length) el('resultCard').style.display = 'none';
        }
      })); el('resultList').append(li);
      window.songPickerYoutube.attach(li, C.label(s));
    });
    el('cycleInfo').textContent = `（このサイクル：${pool.length - remaining.length}/${pool.length} 曲）`;
    el('note').textContent = '全曲を引き終えてから次のサイクルへ進みます。残り1曲なら1曲だけ抽選します。';
    el('resultCard').style.display = 'block';
  };
  el('resetCycleBtn').onclick = reset;
  let scanToken = 0;
  el('scanDuplicates').onclick = async () => {
    const token = ++scanToken, source = data.songs, results = [];
    el('duplicateResults').replaceChildren(); el('scanDuplicates').disabled = true;
    let capped = false;
    for (let i = 0; i < source.length && !capped; i++) {
      if (i % 20 === 0) {
        el('duplicateStatus').textContent = `${i} / ${source.length}曲をチェック中…`;
        await new Promise(resolve => setTimeout(resolve, 0));
        if (token !== scanToken || source !== data.songs) { el('scanDuplicates').disabled = false; return; }
      }
      for (let j = i + 1; j < source.length; j++) {
        const reason = C.similar(source[i], source[j]);
        if (reason) results.push([source[i], source[j], reason]);
        if (results.length >= 200) { capped = true; break; }
      }
    }
    el('scanDuplicates').disabled = false;
    el('duplicateStatus').textContent = results.length ? `${results.length}組の候補。自動では削除しません。${capped ? '表示は先頭200組です。整理後に再チェックしてください。' : ''}` : '似ている曲の候補は見つかりませんでした。';
    results.forEach(([a, b, reason]) => {
      const row = document.createElement('section'), text = document.createElement('p'); row.className = 'duplicate-pair';
      text.textContent = `${C.label(a)} ↔ ${C.label(b)} ／ ${reason}`;
      const combine = (keep, drop) => {
        if (!confirm(`「${C.label(keep)}」を残し、「${C.label(drop)}」を削除してジャンル・タグをまとめますか？ その他の情報が競合した場合は残す曲を優先します。`)) return;
        const merged = {...drop, ...keep, genres: C.names([...keep.genres, ...drop.genres]), tags: C.names([...keep.tags, ...drop.tags])};
        commit({...data, songs: data.songs.filter(s => s !== drop).map(s => s === keep ? merged : s)});
      };
      row.append(text, button('左の曲を残して統合', () => combine(a, b)), button('右の曲を残して統合', () => combine(b, a)), button('別の曲として残す', () => row.remove()));
      el('duplicateResults').append(row);
    });
  };
  el('searchSongs').oninput = () => { renderList(); reset(); };
  ['genreFilter', 'tagFilter'].forEach(id => el(id).onchange = () => { renderList(); reset(); });
  el('clearFilters').onclick = () => {
    ['searchSongs', 'genreFilter', 'tagFilter'].forEach(id => el(id).value = ''); renderList(); reset();
  };
  el('toggleListBtn').onclick = () => {
    const show = el('listPanel').style.display !== 'block'; el('listPanel').style.display = show ? 'block' : 'none';
    el('toggleListBtn').textContent = show ? '保存リスト一覧を隠す ▼' : '保存リスト一覧を表示 ▶';
  };
  el('clearAllBtn').onclick = () => {
    if (confirm('全ての曲を削除しますか？ 先にJSONバックアップをおすすめします。')) commit({...data, songs: []});
  };
  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], {type})), a = document.createElement('a');
    a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  el('exportTxtBtn').onclick = () => download('songs.txt', data.songs.map(C.label).join('\n'), 'text/plain;charset=utf-8');
  el('exportCsvBtn').onclick = () => download('songs.csv', C.toCsv(data.songs), 'text/csv;charset=utf-8');
  el('exportJsonBtn').onclick = () => {
    if (blocked) { alert('読み込みエラー中はバックアップできません。ブラウザの元データを確認してください。'); return; }
    download('song-picker-backup.json', JSON.stringify(data, null, 2), 'application/json');
  };
  el('importBtn').onclick = () => el('importFile').click();
  el('importFile').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      const text = await file.text(); let incoming;
      if (/\.json$/i.test(file.name)) incoming = C.validate(JSON.parse(text));
      else incoming = C.validate({songs: /\.csv$/i.test(file.name) ? C.fromCsv(text) : plain(text, false), genres: [], tags: []});
      // Validate the entire file before asking or writing. Restore is deliberately additive.
      if (!confirm(`${incoming.songs.length}曲を読み込み、同じ曲名・アーティストは分類を統合します。現在の曲は残します。続けますか？`)) return;
      if (commit({...data, songs: C.merge(data.songs, incoming.songs), genres: C.names([...data.genres, ...incoming.genres]), tags: C.names([...data.tags, ...incoming.tags])}))
        alert('読み込みました。');
    } catch (e) { alert('読み込みを中止しました。現在のデータは変更されていません。\n' + e.message); }
    finally { event.target.value = ''; }
  };
  try { data = C.load(localStorage); refresh(); reset(); }
  catch (e) {
    blocked = true; data = {version: 6, songs: [], genres: [], tags: []};
    message('保存データを読み込めませんでした。元データを保護するため変更を停止しています。' + e.message);
    document.querySelectorAll('button').forEach(b => b.disabled = true);
  }
})();
