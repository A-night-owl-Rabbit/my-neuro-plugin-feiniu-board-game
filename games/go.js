function idx(r, c, n) {
  return r * n + c;
}
function inBounds(r, c, n) {
  return r >= 0 && r < n && c >= 0 && c < n;
}
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;
function createGame(n) {
  const size = n === 9 || n === 13 || n === 19 ? n : 13;
  return {
    n: size,
    board: new Array(size * size).fill(EMPTY),
    toPlay: BLACK,
    koBan: -1,
    passStreak: 0,
    moveNum: 0,
    lastCapture: null,
    lastMove: null,
  };
}
function neighbors(r, c, n) {
  const out = [];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dr, dc] of dirs) {
    const nr = r + dr;
    const nc = c + dc;
    if (inBounds(nr, nc, n)) out.push([nr, nc]);
  }
  return out;
}
function collectGroup(board, n, r, c, color) {
  const start = idx(r, c, n);
  if (board[start] !== color) return [];
  const q = [[r, c]];
  const seen = new Set([start]);
  const cells = [];
  while (q.length) {
    const [cr, cc] = q.pop();
    cells.push([cr, cc]);
    for (const [nr, nc] of neighbors(cr, cc, n)) {
      const i = idx(nr, nc, n);
      if (seen.has(i)) continue;
      if (board[i] === color) {
        seen.add(i);
        q.push([nr, nc]);
      }
    }
  }
  return cells;
}
function liberties(board, n, group) {
  const lib = new Set();
  for (const [r, c] of group) {
    for (const [nr, nc] of neighbors(r, c, n)) {
      const i = idx(nr, nc, n);
      if (board[i] === EMPTY) lib.add(i);
    }
  }
  return lib.size;
}
function tryPlay(game, r, c) {
  const { n, board, toPlay, koBan } = game;
  if (!inBounds(r, c, n)) return false;
  const p = idx(r, c, n);
  if (board[p] !== EMPTY) return false;
  if (p === koBan) return false;
  const opp = toPlay === BLACK ? WHITE : BLACK;
  board[p] = toPlay;
  const toRemove = [];
  for (const [nr, nc] of neighbors(r, c, n)) {
    if (board[idx(nr, nc, n)] !== opp) continue;
    const g = collectGroup(board, n, nr, nc, opp);
    if (liberties(board, n, g) === 0) {
      for (const [gr, gc] of g) toRemove.push(idx(gr, gc, n));
    }
  }
  const captured = [];
  for (const i of toRemove) {
    captured.push(i);
    board[i] = EMPTY;
  }
  const own = collectGroup(board, n, r, c, toPlay);
  if (liberties(board, n, own) === 0) {
    for (const i of captured) board[i] = opp;
    board[p] = EMPTY;
    return false;
  }
  let newKo = -1;
  if (captured.length === 1 && own.length === 1) {
    const capR = Math.floor(captured[0] / n);
    const capC = captured[0] % n;
    const b = board.slice();
    b[p] = EMPTY;
    b[captured[0]] = opp;
    const capGroup = collectGroup(b, n, capR, capC, opp);
    if (capGroup.length === 1) newKo = captured[0];
  }
  game.koBan = newKo;
  game.passStreak = 0;
  game.moveNum++;
  game.lastCapture = captured.length;
  game.lastMove = { r, c, player: toPlay };
  game.toPlay = opp;
  return true;
}
function pass(game) {
  game.koBan = -1;
  game.passStreak++;
  game.toPlay = game.toPlay === BLACK ? WHITE : BLACK;
  game.moveNum++;
}
function gameEndedByPass(game) {
  return game.passStreak >= 2;
}
function listValidMoves(game) {
  const { n, board, toPlay, koBan } = game;
  const moves = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const p = idx(r, c, n);
      if (board[p] !== EMPTY || p === koBan) continue;
      const snap = board.slice();
      const g = {
        n,
        board: snap,
        toPlay,
        koBan,
        passStreak: 0,
        moveNum: game.moveNum,
        lastCapture: null,
      };
      if (tryPlay(g, r, c)) moves.push([r, c]);
    }
  }
  return moves;
}
function aiMove(game, moodTier) {
  const moves = listValidMoves(game);
  if (!moves.length) return null;
  const noise = moodTier <= 1 ? 0.55 : moodTier === 2 ? 0.25 : 0.08;
  const { n, board } = game;
  const opp = game.toPlay === BLACK ? WHITE : BLACK;
  function nearScore(r, c) {
    let s = 0;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (!inBounds(nr, nc, n)) continue;
        const v = board[idx(nr, nc, n)];
        if (v === opp) s += 4 - Math.abs(dr) - Math.abs(dc);
        if (v === game.toPlay) s += 1;
      }
    }
    return s + Math.random() * noise * 12;
  }
  moves.sort((a, b) => nearScore(b[0], b[1]) - nearScore(a[0], a[1]));
  const pickTop = Math.min(moves.length - 1, moodTier <= 1 ? 6 : moodTier === 2 ? 3 : 1);
  const pick = moves[Math.floor(Math.random() * (pickTop + 1))];
  return pick;
}
module.exports = {
  EMPTY,
  BLACK,
  WHITE,
  createGame,
  tryPlay,
  pass,
  gameEndedByPass,
  listValidMoves,
  aiMove,
  idx,
};
