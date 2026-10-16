function removeTimestamp(line) {
  const pattern =
    /^\s*[・\-*●]?[\s　]*\(?\[?(\d{1,2}:\d{2}(?::\d{2})?)\)?\]?[\s\-–—_：:、　]+(.+)$/;
  const match = line.match(pattern);
  if (match) return match[2].trim();
  return line;
}

// TSV → 「曲名 / アーティスト」
function handleTSV(line) {
  if (line.includes("\t")) {
    const parts = line.split("\t").map(v => v.trim()).filter(v => v);
    if (parts.length >= 2) {
      return `${parts[0]} / ${parts.slice(1).join(" ")}`;
    }
  }
  return line;
}

// 「曲名（アーティスト）」 → 「曲名 / アーティスト」
function handleParenArtist(line) {
  if (line.includes("/")) return line;
  const m = line.match(/^(.*?)[\s　]*[（(]\s*([^()（）]+?)\s*[)）]\s*$/);
  if (m) {
    return `${m[1].trim()} / ${m[2].trim()}`;
  }
  return line;
}

// 書式ゆれ統一
function normalizeTitle(str) {
  return str
    // 「曲名 – アーティスト」系のダッシュをスラッシュに
    .replace(/\s*[-‐-‒–—―]\s*/g, " / ")
    // 全角スラッシュを統一
    .replace(/／/g, "/")
    // 全角スペース → 半角
    .replace(/\u3000/g, " ")
    // スラッシュ前後の空白揃え
    .replace(/\s*\/\s*/g, " / ")
    // 連続スペースを1つに
    .replace(/\s+/g, " ")
    .trim();
}

