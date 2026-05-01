function idx(r, c, n) {
  return r * n + c;
}

function inBounds(r, c, n) {
  return r >= 0 && r < n && c >= 0 && c < n;
}

function checkWin(board, n, r, c, player) {
  return winningLine(board, n, r, c, player) !== null;
}
/** 返回连成五子的格子坐标 [[r,c],...]（至少 5 个），供终局高亮（参考常见五子棋 Web 演示） */
function winningLine(board, n, r, c, player) {
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (const [dr, dc] of dirs) {
    const cells = [[r, c]];
    for (let s = 1; s < n; s++) {
      const nr = r + dr * s;
      const nc = c + dc * s;
      if (!inBounds(nr, nc, n) || board[idx(nr, nc, n)] !== player) break;
      cells.push([nr, nc]);
    }
    for (let s = 1; s < n; s++) {
      const nr = r - dr * s;
      const nc = c - dc * s;
      if (!inBounds(nr, nc, n) || board[idx(nr, nc, n)] !== player) break;
      cells.unshift([nr, nc]);
    }
    if (cells.length >= 5) return cells;
  }
  return null;
}

function lineScore(board, n, r, c, dr, dc, player) {
  let cnt = 0;
  let openEnd = 0;
  let tr = r;
  let tc = c;
  while (inBounds(tr, tc, n) && board[idx(tr, tc, n)] === player) {
    cnt++;
    tr += dr;
    tc += dc;
  }
  if (inBounds(tr, tc, n) && board[idx(tr, tc, n)] === 0) openEnd++;
  tr = r - dr;
  tc = c - dc;
  while (inBounds(tr, tc, n) && board[idx(tr, tc, n)] === player) {
    cnt++;
    tr -= dr;
    tc -= dc;
  }
  if (inBounds(tr, tc, n) && board[idx(tr, tc, n)] === 0) openEnd++;
  return { cnt, openEnd };
}

function threatScore(board, n, r, c, player) {
  board[idx(r, c, n)] = player;
  let s = 0;
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (const [dr, dc] of dirs) {
    const { cnt, openEnd } = lineScore(board, n, r, c, dr, dc, player);
    if (cnt >= 5) s += 100000;
    else if (cnt === 4 && openEnd >= 1) s += 10000;
    else if (cnt === 3 && openEnd >= 2) s += 500;
    else if (cnt === 3 && openEnd === 1) s += 120;
    else if (cnt === 2 && openEnd >= 2) s += 40;
  }
  board[idx(r, c, n)] = 0;
  return s;
}

function cellHeuristic(board, n, r, c) {
  if (board[idx(r, c, n)] !== 0) return -Infinity;
  const off = threatScore(board, n, r, c, 2);
  const def = threatScore(board, n, r, c, 1);
  return off * 1.05 + def;
}

function emptyCells(board) {
  const r = [];
  for (let i = 0; i < board.length; i++) if (board[i] === 0) r.push(i);
  return r;
}

function neighborsMask(board, n) {
  const set = new Set();
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (board[idx(r, c, n)] === 0) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (inBounds(nr, nc, n) && board[idx(nr, nc, n)] === 0) {
            set.add(idx(nr, nc, n));
          }
        }
      }
    }
  }
  return set;
}

function bestMove(board, n, tier) {
  const all = emptyCells(board);
  if (all.length === 0) return -1;

  let randomChance = 0;
  if (tier <= 0) randomChance = 0.4;
  else if (tier === 1) randomChance = 0.15;
  else if (tier === 2) randomChance = 0.03;

  const candSet = neighborsMask(board, n);
  let candidates = all.filter((i) => candSet.has(i));
  if (candidates.length === 0) candidates = all;

  for (const i of candidates) {
    const r = Math.floor(i / n);
    const c = i % n;
    board[i] = 2;
    const win = checkWin(board, n, r, c, 2);
    board[i] = 0;
    if (win) return i;
  }
  for (const i of candidates) {
    const r = Math.floor(i / n);
    const c = i % n;
    board[i] = 1;
    const win = checkWin(board, n, r, c, 1);
    board[i] = 0;
    if (win) return i;
  }

  if (Math.random() < randomChance) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  let best = -Infinity;
  let picks = [];
  for (const i of candidates) {
    const r = Math.floor(i / n);
    const c = i % n;
    const h = cellHeuristic(board, n, r, c);
    if (h > best) {
      best = h;
      picks = [i];
    } else if (h === best) picks.push(i);
  }
  return picks[Math.floor(Math.random() * picks.length)];
}

function createGame(size) {
  const n = size === 13 ? 13 : 15;
  return { board: new Array(n * n).fill(0), n, humanMark: 1, aiMark: 2, lastMove: null };
}

function applyMove(game, r, c, player) {
  const { n, board } = game;
  if (!inBounds(r, c, n) || board[idx(r, c, n)] !== 0) return false;
  board[idx(r, c, n)] = player;
  game.lastMove = { r, c, player };
  return true;
}

function gameStatus(game, lastR, lastC, lastPlayer) {
  const { n, board } = game;
  const full = board.every((x) => x !== 0);
  if (lastR >= 0 && lastC >= 0 && lastPlayer) {
    if (checkWin(board, n, lastR, lastC, lastPlayer)) {
      return lastPlayer === 1 ? 'human' : 'ai';
    }
  }
  if (full) return 'draw';
  return 'playing';
}

module.exports = {
  createGame,
  applyMove,
  bestMove,
  checkWin,
  winningLine,
  gameStatus,
  idx
};
