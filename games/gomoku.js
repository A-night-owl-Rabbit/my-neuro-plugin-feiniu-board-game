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

/**
 * 全盘静态评估：扫描所有 5 长度滑窗，按窗口内黑子/白子组合打分。
 * 站在 AI（player=2）视角，返回 (AI 优势 - 人类优势)。
 * 进攻 vs 防御权重略偏防御，避免被对手活四逼着送命。
 */
function evaluateBoard(board, n) {
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  let score = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      for (const [dr, dc] of dirs) {
        const er = r + dr * 4;
        const ec = c + dc * 4;
        if (er < 0 || er >= n || ec < 0 || ec >= n) continue;
        let ai = 0;
        let hu = 0;
        for (let s = 0; s < 5; s++) {
          const v = board[(r + dr * s) * n + (c + dc * s)];
          if (v === 2) ai++;
          else if (v === 1) hu++;
        }
        if (ai > 0 && hu > 0) continue;
        if (ai === 5) score += 1000000;
        else if (ai === 4) score += 10000;
        else if (ai === 3) score += 500;
        else if (ai === 2) score += 50;
        else if (ai === 1) score += 1;
        if (hu === 5) score -= 1000000;
        else if (hu === 4) score -= 12000;
        else if (hu === 3) score -= 600;
        else if (hu === 2) score -= 50;
        else if (hu === 1) score -= 1;
      }
    }
  }
  return score;
}

function expandCandidates(board, n, candSet, lastIdx, radius = 2) {
  const next = new Set(candSet);
  next.delete(lastIdx);
  const r0 = Math.floor(lastIdx / n);
  const c0 = lastIdx % n;
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      const r = r0 + dr;
      const c = c0 + dc;
      if (!inBounds(r, c, n)) continue;
      const i = idx(r, c, n);
      if (board[i] === 0) next.add(i);
    }
  }
  return next;
}

function orderCandidates(board, n, candidates, topK) {
  const scored = candidates.map((i) => {
    const r = Math.floor(i / n);
    const c = i % n;
    return [i, cellHeuristic(board, n, r, c)];
  });
  scored.sort((a, b) => b[1] - a[1]);
  return scored.slice(0, topK).map((x) => x[0]);
}

/** alpha-beta 搜索；返回 { score, move } */
function alphaBeta(board, n, depth, alpha, beta, maximizing, candSet, topK) {
  if (depth === 0) {
    return { score: evaluateBoard(board, n), move: -1 };
  }
  const player = maximizing ? 2 : 1;
  const candidates = [];
  for (const i of candSet) if (board[i] === 0) candidates.push(i);
  if (candidates.length === 0) {
    return { score: evaluateBoard(board, n), move: -1 };
  }

  for (const i of candidates) {
    const r = Math.floor(i / n);
    const c = i % n;
    board[i] = player;
    if (checkWin(board, n, r, c, player)) {
      board[i] = 0;
      return { score: maximizing ? 900000 + depth : -900000 - depth, move: i };
    }
    board[i] = 0;
  }

  const ordered = orderCandidates(board, n, candidates, topK);

  if (maximizing) {
    let bestScore = -Infinity;
    let bestIdx = ordered[0];
    for (const i of ordered) {
      board[i] = 2;
      const next = expandCandidates(board, n, candSet, i);
      const child = alphaBeta(board, n, depth - 1, alpha, beta, false, next, topK);
      board[i] = 0;
      if (child.score > bestScore) {
        bestScore = child.score;
        bestIdx = i;
      }
      if (bestScore > alpha) alpha = bestScore;
      if (alpha >= beta) break;
    }
    return { score: bestScore, move: bestIdx };
  } else {
    let bestScore = Infinity;
    let bestIdx = ordered[0];
    for (const i of ordered) {
      board[i] = 1;
      const next = expandCandidates(board, n, candSet, i);
      const child = alphaBeta(board, n, depth - 1, alpha, beta, true, next, topK);
      board[i] = 0;
      if (child.score < bestScore) {
        bestScore = child.score;
        bestIdx = i;
      }
      if (bestScore < beta) beta = bestScore;
      if (alpha >= beta) break;
    }
    return { score: bestScore, move: bestIdx };
  }
}

function shallowBestMove(board, n, randomChance) {
  const all = emptyCells(board);
  if (all.length === 0) return -1;
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

/**
 * tier 与搜索强度映射：
 *   tier 0 (心情很好/最弱): 1 层启发式 + 40% 随机性
 *   tier 1 (心情不错):       1 层启发式 + 15% 随机性
 *   tier 2 (心情一般):       alpha-beta 2 层 + top 12
 *   tier 3 (心情很差/最强):  alpha-beta 3 层 + top 10（业余中段水平，能算双活三）
 */
function bestMove(board, n, tier) {
  const all = emptyCells(board);
  if (all.length === 0) return -1;

  if (all.length === n * n) {
    const mid = Math.floor(n / 2);
    return idx(mid, mid, n);
  }

  if (tier <= 0) return shallowBestMove(board, n, 0.4);
  if (tier === 1) return shallowBestMove(board, n, 0.15);

  const candSet = neighborsMask(board, n);
  if (candSet.size === 0) return shallowBestMove(board, n, 0);

  for (const i of candSet) {
    if (board[i] !== 0) continue;
    const r = Math.floor(i / n);
    const c = i % n;
    board[i] = 2;
    const win = checkWin(board, n, r, c, 2);
    board[i] = 0;
    if (win) return i;
  }
  for (const i of candSet) {
    if (board[i] !== 0) continue;
    const r = Math.floor(i / n);
    const c = i % n;
    board[i] = 1;
    const win = checkWin(board, n, r, c, 1);
    board[i] = 0;
    if (win) return i;
  }

  const depth = tier >= 3 ? 3 : 2;
  const topK = tier >= 3 ? 10 : 12;
  const result = alphaBeta(board, n, depth, -Infinity, Infinity, true, candSet, topK);
  if (result.move >= 0) return result.move;
  return shallowBestMove(board, n, 0);
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
