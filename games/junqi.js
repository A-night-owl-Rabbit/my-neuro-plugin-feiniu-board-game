/** 明棋军棋简化：5 列，上下各三行营区 + 中间战场；仅orthogonal一步（不含铁路飞线） */
const W = 5;
const H = 10;
const BOMB = 10;
const MINE = 11;
const FLAG = 12;
const NAMES = { 1: "工", 2: "排", 3: "连", 4: "营", 5: "团", 6: "旅", 7: "师", 8: "军", 9: "司", 10: "炸", 11: "雷", 12: "旗" };

function idx(r, c, w = W) {
  return r * w + c;
}
function inB(r, c, h, w) {
  return r >= 0 && r < h && c >= 0 && c < w;
}
function createGame() {
  const board = new Array(W * H).fill(null);
  const place = (r, c, side, rank) => {
    board[idx(r, c, W)] = { side, rank };
  };
  // 黑方（肥牛）营区 0–2 行，每方 14 子 + 1 空格
  place(0, 0, 0, 7);
  place(0, 1, 0, 6);
  place(0, 2, 0, FLAG);
  place(0, 3, 0, BOMB);
  place(0, 4, 0, MINE);
  place(1, 0, 0, 1);
  place(1, 1, 0, 2);
  place(1, 2, 0, 9);
  place(1, 3, 0, 8);
  place(1, 4, 0, BOMB);
  place(2, 0, 0, 3);
  place(2, 1, 0, 4);
  place(2, 2, 0, 5);
  place(2, 3, 0, MINE);
  // (2,4) 空
  // 红方（主人）营区 7–9 行
  place(9, 0, 1, 7);
  place(9, 1, 1, 6);
  place(9, 2, 1, FLAG);
  place(9, 3, 1, BOMB);
  place(9, 4, 1, MINE);
  place(8, 0, 1, 1);
  place(8, 1, 1, 2);
  place(8, 2, 1, 9);
  place(8, 3, 1, 8);
  place(8, 4, 1, BOMB);
  place(7, 0, 1, 3);
  place(7, 1, 1, 4);
  place(7, 2, 1, 5);
  place(7, 3, 1, MINE);
  // (7,4) 空
  return { board, w: W, h: H, turn: 1, winner: null, lastMove: null };
}
function movable(p) {
  if (!p) return false;
  if (p.rank === MINE || p.rank === FLAG) return false;
  return true;
}
function combat(attRank, defRank) {
  if (attRank === BOMB || defRank === BOMB) return "both";
  if (defRank === MINE) {
    if (attRank === 1) return "att";
    return "def";
  }
  if (defRank === FLAG) return "att";
  if (attRank === defRank) return "both";
  return attRank > defRank ? "att" : "def";
}
function applyMove(game, fr, fc, tr, tc) {
  const { board, w, h } = game;
  if (game.winner !== null) return false;
  if (!inB(fr, fc, h, w) || !inB(tr, tc, h, w)) return false;
  const fi = idx(fr, fc, w);
  const ti = idx(tr, tc, w);
  const a = board[fi];
  const b = board[ti];
  if (!a || a.side !== game.turn) return false;
  if (!movable(a)) return false;
  const dr = Math.abs(tr - fr);
  const dc = Math.abs(tc - fc);
  if (dr + dc !== 1) return false;
  const captured = b ? { side: b.side, rank: b.rank } : null;
  let result = "move";
  if (!b) {
    board[ti] = a;
    board[fi] = null;
    game.lastMove = { from: [fr, fc], to: [tr, tc], side: a.side, rank: a.rank, captured, result };
    game.turn = 1 - game.turn;
    return true;
  }
  if (b.side === a.side) return false;
  const out = combat(a.rank, b.rank);
  result = out;
  if (out === "both") {
    if (b.rank === FLAG) game.winner = a.side;
    board[fi] = null;
    board[ti] = null;
  } else if (out === "att") {
    if (b.rank === FLAG) game.winner = a.side;
    board[ti] = a;
    board[fi] = null;
  } else {
    board[fi] = null;
  }
  game.lastMove = { from: [fr, fc], to: [tr, tc], side: a.side, rank: a.rank, captured, result };
  game.turn = 1 - game.turn;
  return true;
}
function label(p) {
  if (!p) return "";
  const ch = NAMES[p.rank] || "?";
  return (p.side === 1 ? "红" : "黑") + ch;
}
function listMoves(game, side) {
  const { board, w, h } = game;
  const out = [];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const p = board[idx(r, c, w)];
      if (!p || p.side !== side || !movable(p)) continue;
      for (const [dr, dc] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const tr = r + dr;
        const tc = c + dc;
        if (!inB(tr, tc, h, w)) continue;
        const t = board[idx(tr, tc, w)];
        if (t && t.side === side) continue;
        out.push([r, c, tr, tc]);
      }
    }
  }
  return out;
}
function listMovesFrom(game, r, c) {
  const { board, w, h } = game;
  if (!inB(r, c, h, w)) return [];
  const p = board[idx(r, c, w)];
  if (!p || p.side !== game.turn || !movable(p)) return [];
  return listMoves(game, p.side).filter(([fr, fc]) => fr === r && fc === c);
}
/** 走子后若轮到的一方无子可动（只剩雷/旗或被困死），该方判负，对方获胜；返回是否已分出胜负 */
function checkNoMoveLoss(game) {
  if (game.winner !== null) return true;
  if (listMoves(game, game.turn).length === 0) {
    game.winner = 1 - game.turn;
    return true;
  }
  return false;
}
function cloneGame(g) {
  return {
    board: g.board.map((x) => (x ? { side: x.side, rank: x.rank } : null)),
    w: g.w,
    h: g.h,
    turn: g.turn,
    winner: g.winner,
    lastMove: g.lastMove ? { ...g.lastMove, from: [...g.lastMove.from], to: [...g.lastMove.to], captured: g.lastMove.captured ? { ...g.lastMove.captured } : null } : null,
  };
}
/** 棋子价值表（参考 yyjxx2010xyu/Junqi 启发式）。旗最重要；工兵能挖雷价值高于排长 */
const PIECE_VALUE = {
  9: 100, // 司令
  8: 80,  // 军长
  7: 60,  // 师长
  6: 50,  // 旅长
  5: 40,  // 团长
  4: 30,  // 营长
  3: 20,  // 连长
  2: 12,  // 排长
  1: 18,  // 工兵（能挖雷+穿越营区）
  10: 28, // 炸弹（同归于尽武器）
  11: 30, // 地雷（不能动但能炸大子）
  12: 1000, // 旗（终结游戏）
};

function shallowScore(game, m, moodTier) {
  const [fr, fc, tr, tc] = m;
  const w = game.w;
  const fi = idx(fr, fc, w);
  const ti = idx(tr, tc, w);
  const a = game.board[fi];
  const b = game.board[ti];
  let s = Math.random() * (moodTier <= 1 ? 6 : moodTier === 2 ? 2 : 0.4);
  if (!b) return s + 0.2;
  const out = combat(a.rank, b.rank);
  if (out === 'att' && b.rank === FLAG) return s + 1000;
  if (out === 'both' && b.rank === FLAG) return s + 1000;
  if (out === 'att') return s + 5 + b.rank;
  if (out === 'both') return s + (a.rank <= 3 ? 1 : -2);
  return s - 4;
}

function staticScore(game, m) {
  const w = game.w;
  const a = game.board[idx(m[0], m[1], w)];
  const b = game.board[idx(m[2], m[3], w)];
  if (!b) return 0.1;
  const out = combat(a.rank, b.rank);
  if (out === 'att' && b.rank === FLAG) return 1e6;
  if (out === 'both' && b.rank === FLAG) return 1e6;
  if (out === 'att') return PIECE_VALUE[b.rank] || 0;
  if (out === 'both') return -((PIECE_VALUE[a.rank] || 0) - (PIECE_VALUE[b.rank] || 0)) * 0.5;
  return -(PIECE_VALUE[a.rank] || 0);
}

function evaluateBoard(game, mySide) {
  if (game.winner !== null) {
    return game.winner === mySide ? 1e6 : -1e6;
  }
  let mine = 0;
  let theirs = 0;
  for (const p of game.board) {
    if (!p) continue;
    const v = PIECE_VALUE[p.rank] || 0;
    if (p.side === mySide) mine += v;
    else theirs += v;
  }
  return mine - theirs;
}

function orderMoves(game, moves) {
  const scored = moves.map((m) => [m, staticScore(game, m)]);
  scored.sort((a, b) => b[1] - a[1]);
  return scored.map((x) => x[0]);
}

function alphaBeta(game, depth, alpha, beta, maximizing, mySide, topK) {
  if (game.winner !== null || depth === 0) {
    return { score: evaluateBoard(game, mySide), move: null };
  }
  const moves = listMoves(game, game.turn);
  if (!moves.length) {
    return { score: evaluateBoard(game, mySide), move: null };
  }
  const ordered = orderMoves(game, moves).slice(0, topK);

  if (maximizing) {
    let bestScore = -Infinity;
    let bestMove = ordered[0];
    for (const m of ordered) {
      const next = cloneGame(game);
      if (!applyMove(next, m[0], m[1], m[2], m[3])) continue;
      const child = alphaBeta(next, depth - 1, alpha, beta, false, mySide, topK);
      if (child.score > bestScore) {
        bestScore = child.score;
        bestMove = m;
      }
      if (bestScore > alpha) alpha = bestScore;
      if (alpha >= beta) break;
    }
    return { score: bestScore, move: bestMove };
  } else {
    let bestScore = Infinity;
    let bestMove = ordered[0];
    for (const m of ordered) {
      const next = cloneGame(game);
      if (!applyMove(next, m[0], m[1], m[2], m[3])) continue;
      const child = alphaBeta(next, depth - 1, alpha, beta, true, mySide, topK);
      if (child.score < bestScore) {
        bestScore = child.score;
        bestMove = m;
      }
      if (bestScore < beta) beta = bestScore;
      if (alpha >= beta) break;
    }
    return { score: bestScore, move: bestMove };
  }
}

function shallowAiMove(game, moodTier) {
  if (game.winner !== null) return null;
  const side = game.turn;
  const moves = listMoves(game, side);
  if (!moves.length) return null;
  moves.sort((a, b) => shallowScore(game, b, moodTier) - shallowScore(game, a, moodTier));
  const k = Math.min(moves.length - 1, moodTier <= 1 ? 5 : moodTier === 2 ? 2 : 0);
  return moves[Math.floor(Math.random() * (k + 1))];
}

/**
 * tier 与搜索强度映射：
 *   tier 0/1: 单层启发式 + 随机性（保留原行为）
 *   tier 2:   alpha-beta 2 层，top 16
 *   tier 3:   alpha-beta 4 层，渐宽 top 12
 */
function aiMove(game, moodTier) {
  if (game.winner !== null) return null;
  if (moodTier <= 1) return shallowAiMove(game, moodTier);

  const mySide = game.turn;
  const depth = moodTier >= 3 ? 4 : 2;
  const topK = moodTier >= 3 ? 12 : 16;
  const result = alphaBeta(game, depth, -Infinity, Infinity, true, mySide, topK);
  if (result.move) return result.move;
  return shallowAiMove(game, moodTier);
}
module.exports = {
  createGame,
  applyMove,
  label,
  listMoves,
  listMovesFrom,
  checkNoMoveLoss,
  aiMove,
  FLAG,
  idx,
  BOMB,
  MINE,
};
