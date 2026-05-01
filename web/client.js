(function () {
  const icons = window.FeiniuPieceIcons;
  const state = { current: null, source: null, message: null };
  const $ = (selector) => document.querySelector(selector);
  const gameNames = { idle: '未打开棋局', tictactoe: '🍡 井字棋', gomoku: '🌸 五子棋', go: '🐼 围棋', xiangqi: '🏮 中国象棋', junqi: '🚩 军棋（明棋）', ended: '终局界面' };

  function escapeHtml(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function api(path, body = null) {
    return fetch(path, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }).then(async (response) => {
      const data = await response.json().catch(() => null);
      if (!response.ok) { const error = new Error(data?.error || response.statusText || '请求失败'); error.data = data; throw error; }
      return data;
    });
  }
  function setConnection(text, tone = 'neutral') { const el = $('#connection-status'); if (!el) return; el.textContent = text; el.dataset.tone = tone; }
  function setFeedback(text, tone = 'info') { state.message = text ? { text, tone } : null; }
  function boardState() { return state.current || { kind: 'idle', prevKind: null, board: null, mood: { line: '心情信息未加载' }, toolbar: { canUndo: false, canPass: false, canResign: false }, boardText: '', config: {}, hintMoves: [], lastMove: null }; }
  function pieceIsLast(s, payload) {
    const lm = s.lastMove;
    if (!lm || !payload) return false;
    if (s.kind === 'gomoku' || s.kind === 'go') return lm.r === payload.r && lm.c === payload.c;
    if (s.kind === 'xiangqi') return lm.to === payload.i;
    return false;
  }
  function renderControls() {
    const root = $('#game-controls'); if (!root) return; const s = boardState(); const active = s.kind !== 'idle'; const ended = s.kind === 'ended'; const restartLabel = ended ? '重开本局' : '重开一局'; const title = gameNames[s.kind] || gameNames[s.prevKind] || '棋局';
    const feedback = state.message?.text ? `<span class="pill pill-feedback" data-tone="${escapeHtml(state.message.tone || 'info')}">${escapeHtml(state.message.text)}</span>` : '';
    root.innerHTML = `<div class="control-row"><div><div class="section-title">游戏入口</div><div class="section-subtitle">${escapeHtml(title)} · 第 ${s.round || 0} 局</div></div><div class="button-group"><button class="btn btn-primary" data-open="tictactoe">井字棋</button><button class="btn btn-primary" data-open="gomoku">五子棋</button><button class="btn btn-primary" data-open="go">围棋</button><button class="btn btn-primary" data-open="xiangqi">象棋</button><button class="btn btn-primary" data-open="junqi">军棋</button></div></div><div class="control-row control-row--actions"><div class="button-group"><button class="btn btn-secondary" data-action="undo" ${s.toolbar?.canUndo ? '' : 'disabled'}>悔棋</button><button class="btn btn-secondary" data-action="pass" ${s.toolbar?.canPass ? '' : 'disabled'}>停一手</button><button class="btn btn-secondary" data-action="restart" ${active ? '' : 'disabled'}>${restartLabel}</button><button class="btn btn-danger" data-action="resign" ${s.toolbar?.canResign ? '' : 'disabled'}>认输</button><button class="btn btn-secondary" data-action="close">关闭</button></div><div class="status-strip"><span class="pill">${escapeHtml(s.mood?.line || '心情未知')}</span><span class="pill">${s.ended ? '终局' : s.kind === 'idle' ? '待机' : '进行中'}</span>${feedback}</div></div>`;
    root.querySelectorAll('[data-open]').forEach((button) => button.addEventListener('click', () => openGame(button.dataset.open)));
    root.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => runAction(button.dataset.action)));
  }
  function renderTictactoe(s, ended = false) {
    const board = s.board?.cells || []; const win = new Set(s.winLine || []); const cells = Array.from({ length: 9 }, (_, i) => { const value = board[i] || 0; const classes = ['ttt-cell']; if (value === 1) classes.push('ttt-cell--x'); if (value === 2) classes.push('ttt-cell--o'); if (win.has(i)) classes.push('ttt-cell--win'); if (ended || value) classes.push('is-static'); return `<button class="${classes.join(' ')}" data-idx="${i}" ${ended || value ? 'disabled' : ''}>${icons.tttMarkHtml(value)}</button>`; }).join('');
    return `<div class="board-head"><div><h2>井字棋 🍡</h2><p>你执 X，AI 执 O 哦~</p></div><div class="chip-row"><span class="chip">${ended ? '已终局' : '对弈中...'}</span></div></div><div class="board-grid board-grid--ttt">${cells}</div><p class="board-hint">✨ 点击空位就可以落子啦~</p>`;
  }
  function renderWoodBoard(s, kind, n, cells, opts = {}) {
    const lines = [];
    const stars = [];
    const points = [];
    const lastMoves = [];
    const padCls = ['board-wood', `board-wood--${kind}`].join(' ');
    const boardSize = n;
    const step = 100 / (boardSize - 1);
    const starPos = opts.stars || [];
    const toPos = (i) => i * step;
    for (let i = 0; i < boardSize; i++) {
      lines.push(`<span class="bw-line bw-line--v" style="left:${toPos(i)}%;"></span>`);
      lines.push(`<span class="bw-line bw-line--h" style="top:${toPos(i)}%;"></span>`);
    }
    for (const [r, c] of starPos) stars.push(`<span class="bw-star" style="left:${toPos(c)}%; top:${toPos(r)}%;"></span>`);
    for (const cell of cells) points.push(cell);
    if (s.lastMove) {
      const last = opts.lastMovePos ? opts.lastMovePos(s.lastMove) : null;
      if (last) lastMoves.push(`<span class="bw-last" style="left:${toPos(last.c)}%; top:${toPos(last.r)}%;"></span>`);
    }
    return `<div class="${padCls}"><div class="board-pad"><div class="board-lines">${lines.join('')}</div><div class="board-stars">${stars.join('')}</div><div class="board-points">${points.join('')}</div><div class="board-lastmove">${lastMoves.join('')}</div></div></div>`;
  }
  function renderGomoku(s, ended = false) {
    const n = s.board?.n || 15; const board = s.board?.cells || []; const win = new Set((s.winLine || []).map((pair) => pair.join(','))); const stars = n === 15 ? [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]] : n === 13 ? [[3, 3], [3, 9], [9, 3], [9, 9], [6, 6]] : [];
    const cells = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { const idx = r * n + c; const value = board[idx] || 0; const classes = ['bw-point', 'gomoku-cell']; if (value === 1) classes.push('gomoku-cell--black'); if (value === 2) classes.push('gomoku-cell--white'); if (win.has(`${r},${c}`)) classes.push('gomoku-cell--win'); if (ended || value) classes.push('is-static'); if (s.lastMove && s.lastMove.r === r && s.lastMove.c === c) classes.push('is-last'); cells.push(`<button class="${classes.join(' ')}" data-r="${r}" data-c="${c}" style="left:${n === 1 ? 50 : (c / (n - 1)) * 100}%; top:${n === 1 ? 50 : (r / (n - 1)) * 100}%" ${ended || value ? 'disabled' : ''}>${icons.stoneHtml(value === 1 ? 'black' : value === 2 ? 'white' : '', { isLast: s.lastMove && s.lastMove.r === r && s.lastMove.c === c })}</button>`); }
    return `<div class="board-head"><div><h2>五子棋 🌸</h2><p>你执黑先手，要连成五颗哦！</p></div><div class="chip-row"><span class="chip">${ended ? '已终局' : '对弈中...'}</span></div></div>${renderWoodBoard(s, 'gomoku', n, cells, { stars, lastMovePos: (lm) => lm })}<p class="board-hint">✨ 点击空位就可以落子啦~</p>`;
  }
  function renderGo(s, ended = false) {
    const n = s.board?.n || 13; const board = s.board?.cells || []; const starsBySize = { 9: [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]], 13: [[3, 3], [3, 9], [9, 3], [9, 9], [6, 6]], 19: [[3, 3], [3, 9], [3, 15], [9, 3], [9, 9], [9, 15], [15, 3], [15, 9], [15, 15]] };
    const stars = starsBySize[n] || [];
    const cells = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { const idx = r * n + c; const value = board[idx] || 0; const classes = ['bw-point', 'go-cell']; if (value === 1) classes.push('go-cell--black'); if (value === 2) classes.push('go-cell--white'); if (ended || value) classes.push('is-static'); if (s.lastMove && s.lastMove.r === r && s.lastMove.c === c) classes.push('is-last'); cells.push(`<button class="${classes.join(' ')}" data-r="${r}" data-c="${c}" style="left:${n === 1 ? 50 : (c / (n - 1)) * 100}%; top:${n === 1 ? 50 : (r / (n - 1)) * 100}%" ${ended || value ? 'disabled' : ''}>${icons.stoneHtml(value === 1 ? 'black' : value === 2 ? 'white' : '', { isLast: s.lastMove && s.lastMove.r === r && s.lastMove.c === c })}</button>`); }
    return `<div class="board-head"><div><h2>围棋 🐼</h2><p>你执黑，AI 执白；可以停一手哦。</p></div><div class="chip-row"><span class="chip">${ended ? '已终局' : `轮到 ${s.board?.toPlay === 1 ? '黑棋' : '白棋'}啦`}</span></div></div>${renderWoodBoard(s, 'go', n, cells, { stars, lastMovePos: (lm) => lm })}<p class="board-hint">✨ 点击空位就可以落子啦~</p>`;
  }
  function renderXiangqi(s, ended = false) {
    const board = s.board?.cells || []; const intersection = s.config?.xiangqi_intersection_style !== false; const hints = new Set(s.hintMoves || []);
    if (intersection) {
      const pieces = []; const columns = 9; const rows = 10;
      for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
        const idx = r * columns + c; const value = board[idx] || 0; const selected = s.sel === idx; const isHint = hints.has(idx); const isLast = s.lastMove && s.lastMove.to === idx;
        pieces.push(`<button class="xq-point ${selected ? 'is-selected' : ''} ${value ? 'has-piece' : ''} ${isHint ? 'is-hint' : ''} ${isLast ? 'is-last' : ''}" data-i="${idx}" style="left:${columns === 1 ? 50 : (c / (columns - 1)) * 100}%; top:${rows === 1 ? 50 : (r / (rows - 1)) * 100}%" ${ended ? 'disabled' : ''}>${icons.xiangqiPieceHtml(value)}</button>`);
      }
      const vertical = Array.from({ length: columns }, (_, c) => `<span class="xq-line xq-line--v" style="left:${columns === 1 ? 50 : (c / (columns - 1)) * 100}%;"></span>`).join('');
      const horizontal = Array.from({ length: rows }, (_, r) => `<span class="xq-line xq-line--h" style="top:${rows === 1 ? 50 : (r / (rows - 1)) * 100}%;"></span>`).join('');
      const marks = ['xq-board-mark xq-board-mark--tl', 'xq-board-mark xq-board-mark--tr', 'xq-board-mark xq-board-mark--bl', 'xq-board-mark xq-board-mark--br', 'xq-board-mark xq-board-mark--mid-l', 'xq-board-mark xq-board-mark--mid-r', 'xq-board-mark xq-board-mark--river-l', 'xq-board-mark xq-board-mark--river-r'];
      const diagonals = '<span class="xq-diag xq-diag--top-left"></span><span class="xq-diag xq-diag--top-right"></span><span class="xq-diag xq-diag--bot-left"></span><span class="xq-diag xq-diag--bot-right"></span>';
    return `<div class="board-head"><div><h2>中国象棋 🏮</h2><p>交叉点落子，红方先行哦~</p></div><div class="chip-row"><span class="chip">${ended ? '已终局' : '对弈中...'}</span></div></div><div class="xiangqi-board xiangqi-board--intersection ${ended ? 'is-ended' : ''}"><div class="board-wood board-wood--xiangqi"><div class="board-pad"><div class="board-lines">${vertical}${horizontal}</div><div class="board-overlays"><span class="xq-river">楚河 汉界</span>${diagonals}${marks.map((cls) => `<span class="${cls}"></span>`).join('')}</div><div class="xq-pieces">${pieces.join('')}</div></div></div></div><p class="board-hint">✨ 先点自己的小棋子，再点目标位置~</p>`;
    }
    const cells = []; for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) { const idx = r * 9 + c; const value = board[idx] || 0; const selected = s.sel === idx; cells.push(`<button class="xq-cell ${selected ? 'is-selected' : ''} ${value ? 'has-piece' : ''}" data-i="${idx}" ${ended ? 'disabled' : ''}>${icons.xiangqiPieceHtml(value)}</button>`); }
    return `<div class="board-head"><div><h2>中国象棋 🏮</h2><p>红方先行哦~</p></div><div class="chip-row"><span class="chip">${ended ? '已终局' : '对弈中...'}</span></div></div><div class="board-grid board-grid--xiangqi">${cells.join('')}</div><p class="board-hint">✨ 先点自己的小棋子，再点目标位置~</p>`;
  }
  function renderJunqi(s, ended = false) {
    const board = s.board?.cells || []; const w = s.board?.w || 5; const h = s.board?.h || 10; const sel = Array.isArray(s.sel) ? s.sel.join(',') : null; const hints = new Set((s.hintMoves || []).map((pair) => Array.isArray(pair) ? pair.join(',') : String(pair))); const lastTo = s.lastMove?.to ? s.lastMove.to.join(',') : null; const cells = [];
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) { const idx = r * w + c; const piece = board[idx] || null; const pos = `${r},${c}`; const selected = sel === pos; const isHint = hints.has(pos); const isLast = lastTo === pos; cells.push(`<button class="jq-cell ${selected ? 'is-selected' : ''} ${isHint ? 'is-hint' : ''} ${isLast ? 'is-last' : ''} ${piece ? (piece.side === 1 ? 'is-red' : 'is-black') : 'is-empty'}" data-r="${r}" data-c="${c}" ${ended ? 'disabled' : ''}>${icons.junqiPieceHtml(piece)}</button>`); }
    return `<div class="board-head"><div><h2>军棋 🚩</h2><p>红方由你操作，黑方由 AI 代下~</p></div><div class="chip-row"><span class="chip">${ended ? '已终局' : '对弈中...'}</span></div></div><div class="board-grid board-grid--junqi" style="grid-template-columns: repeat(${w}, minmax(0, 1fr));">${cells.join('')}</div><p class="board-hint">✨ 先点自己的小棋子，粉色高亮格就是可以走的位置~</p>`;
  }
  function renderBoard() {
    const root = $('#board-card'); const s = boardState();
    if (s.kind === 'idle') { root.innerHTML = `<div class="empty-state"><h2>🎀 选一个游戏开始吧~</h2><p>点击上方按钮选择棋种，我随时准备好陪你玩啦！AI 落子会自动刷新哦 (๑>◡<๑)</p></div>`; return; }
    if (s.kind === 'tictactoe') { root.innerHTML = renderTictactoe(s); bindBoardClicks('.ttt-cell', (button) => clickBoard('tictactoe', { idx: Number(button.dataset.idx) })); return; }
    if (s.kind === 'gomoku') { root.innerHTML = renderGomoku(s); bindBoardClicks('.gomoku-cell', (button) => clickBoard('gomoku', { r: Number(button.dataset.r), c: Number(button.dataset.c) })); return; }
    if (s.kind === 'go') { root.innerHTML = renderGo(s); bindBoardClicks('.go-cell', (button) => clickBoard('go', { r: Number(button.dataset.r), c: Number(button.dataset.c) })); return; }
    if (s.kind === 'xiangqi') { root.innerHTML = renderXiangqi(s); bindBoardClicks('.xq-point, .xq-cell', (button) => clickBoard('xiangqi', { i: Number(button.dataset.i) })); return; }
    if (s.kind === 'junqi') { root.innerHTML = renderJunqi(s); bindBoardClicks('.jq-cell', (button) => clickBoard('junqi', { r: Number(button.dataset.r), c: Number(button.dataset.c) })); return; }
    if (s.kind === 'ended') { const prev = s.prevKind || 'idle'; if (prev === 'tictactoe') root.innerHTML = renderTictactoe(s, true); else if (prev === 'gomoku') root.innerHTML = renderGomoku(s, true); else if (prev === 'go') root.innerHTML = renderGo(s, true); else if (prev === 'xiangqi') root.innerHTML = renderXiangqi(s, true); else if (prev === 'junqi') root.innerHTML = renderJunqi(s, true); else root.innerHTML = `<div class="empty-state"><h2>🎉 游戏结束啦</h2><p>当前对局已经结束，要再来一局吗？(๑•̀ㅂ•́)و✧</p></div>`; }
  }
  function bindBoardClicks(selector, handler) { $('#board-card').querySelectorAll(selector).forEach((button) => button.addEventListener('click', () => handler(button))); }
  async function openGame(game) { try { const result = await api('/api/open', { game }); state.current = result.state; setFeedback(result.message || '已打开棋局'); render(); } catch (error) { setFeedback(`操作失败：${error.message}`, 'warn'); renderControls(); setConnection(`操作失败：${error.message}`, 'warn'); } }
  async function runAction(action) { if (action === 'resign') { const ok = await confirmDialog('确定认输？本局将立即判对手方获胜，并可能触发局后互动（以插件配置为准，须遵守安全边界）。'); if (!ok) return; } const route = { undo: '/api/undo', pass: '/api/pass', restart: '/api/restart', resign: '/api/resign', close: '/api/close' }[action]; if (!route) return; try { const result = await api(route, {}); state.current = result.state; setFeedback(result.message || '操作完成'); render(); } catch (error) { setFeedback(`操作失败：${error.message}`, 'warn'); renderControls(); setConnection(`操作失败：${error.message}`, 'warn'); } }
  async function clickBoard(kind, payload) { try { const result = await api('/api/click', { kind, ...payload }); state.current = result.state; setFeedback(result.message || '操作完成'); render(); } catch (error) { setFeedback(`操作失败：${error.message}`, 'warn'); renderControls(); setConnection(`操作失败：${error.message}`, 'warn'); } }
  async function loadState() { const result = await api('/api/state'); state.current = result; render(); }
  function render() { renderControls(); renderBoard(); const s = boardState(); $('#board-text').textContent = s.boardText || ''; setConnection(s.kind === 'idle' ? '等待打开棋局' : `${gameNames[s.kind] || '棋局'} 已同步`, 'ok'); }
  function connectSse() { if (state.source) state.source.close(); const source = new EventSource('/api/state/stream'); state.source = source; source.onopen = () => setConnection('Web UI 已连接', 'ok'); source.onmessage = (event) => { try { state.current = JSON.parse(event.data); render(); } catch {} }; source.onerror = () => setConnection('连接重试中...', 'warn'); }
  function confirmDialog(message) { const dialog = $('#confirm-dialog'); const msg = $('#confirm-message'); msg.textContent = message; dialog.showModal(); return new Promise((resolve) => { const onClose = () => resolve(dialog.returnValue === 'confirm'); dialog.addEventListener('close', onClose, { once: true }); }); }
  async function bootstrap() { setConnection('正在加载...'); await loadState(); connectSse(); const game = new URLSearchParams(window.location.search).get('game'); if (game && boardState().kind !== game) { try { await openGame(game); } catch (error) { setConnection(`打开失败：${error.message}`, 'warn'); } } }
  window.addEventListener('DOMContentLoaded', bootstrap);
})();
