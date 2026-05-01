(function () {
  const XQ_FACE_RED = { 1: '帅', 2: '车', 3: '马', 4: '相', 5: '仕', 6: '炮', 7: '兵' };
  const XQ_FACE_BLACK = { 1: '将', 2: '车', 3: '马', 4: '象', 5: '士', 6: '炮', 7: '卒' };
  const JQ_FACE = { 1: '工', 2: '排', 3: '连', 4: '营', 5: '团', 6: '旅', 7: '师', 8: '军', 9: '司', 10: '炸', 11: '雷', 12: '旗' };

  function esc(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

  function stoneSvg(color, isLast) {
    const cls = ['stone'];
    cls.push(color === 'black' ? 'stone--black' : 'stone--white');
    if (isLast) cls.push('stone--last');
    return `<span class="${cls.join(' ')}" aria-hidden="true"><span class="stone__shine"></span><span class="stone__core"></span></span>`;
  }

  function stoneHtml(color, opts = {}) {
    if (!color) return '';
    return stoneSvg(color, !!opts.isLast);
  }

  function xiangqiEmptyHtml() { return '<span class="piece-empty piece-empty--xiangqi" aria-hidden="true"><span class="piece-empty-dot"></span></span>'; }
  function xiangqiPieceHtml(v) {
    if (!v) return xiangqiEmptyHtml();
    const red = v > 0;
    const face = red ? XQ_FACE_RED : XQ_FACE_BLACK;
    const ch = face[Math.abs(v)] || '?';
    const disc = red ? 'piece-disc piece-disc--red' : 'piece-disc piece-disc--black';
    return `<span class="${disc}" aria-hidden="true"><span class="piece-face">${esc(ch)}</span></span>`;
  }
  function junqiEmptyHtml() { return '<span class="piece-empty piece-empty--junqi" aria-hidden="true"><span class="piece-empty-dot"></span></span>'; }
  function junqiPieceHtml(p) {
    if (!p) return junqiEmptyHtml();
    const red = p.side === 1;
    const ch = JQ_FACE[p.rank] || '?';
    const disc = red ? 'piece-disc piece-disc--red' : 'piece-disc piece-disc--black';
    return `<span class="${disc}" aria-hidden="true"><span class="piece-face">${esc(ch)}</span></span>`;
  }
  function tttMarkHtml(v) {
    if (v === 1) return '<span class="piece-ttt piece-ttt--x" aria-hidden="true"><svg viewBox="0 0 32 32" class="piece-ttt-svg"><path d="M8 8l16 16M24 8L8 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg></span>';
    if (v === 2) return '<span class="piece-ttt piece-ttt--o" aria-hidden="true"><svg viewBox="0 0 32 32" class="piece-ttt-svg"><circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" stroke-width="3.2"/></svg></span>';
    return '';
  }

  window.FeiniuPieceIcons = { stoneHtml, xiangqiPieceHtml, xiangqiEmptyHtml, junqiPieceHtml, junqiEmptyHtml, tttMarkHtml };
})();
