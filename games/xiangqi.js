const W = 9;
const H = 10;
const RED = 1;
const BLACK = -1;
const T = { K: 1, R: 2, N: 3, B: 4, A: 5, C: 6, P: 7 };
function idx(r, c) {
  return r * W + c;
}
function rc(i) {
  return [Math.floor(i / W), i % W];
}
function inB(r, c) {
  return r >= 0 && r < H && c >= 0 && c < W;
}
function side(v) {
  if (!v) return 0;
  return v > 0 ? RED : BLACK;
}
function typ(v) {
  return Math.abs(v);
}
function createGame() {
  const L = [
    [-2, -3, -4, -5, -1, -5, -4, -3, -2],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, -6, 0, 0, 0, 0, 0, -6, 0],
    [-7, 0, -7, 0, -7, 0, -7, 0, -7],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [7, 0, 7, 0, 7, 0, 7, 0, 7],
    [0, 6, 0, 0, 0, 0, 0, 6, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [2, 3, 4, 5, 1, 5, 4, 3, 2],
  ];
  const board = new Array(H * W).fill(0);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) board[idx(r, c)] = L[r][c];
  return { board, turn: RED };
}
function palace(r, c, sd) {
  if (sd === BLACK) return r >= 0 && r <= 2 && c >= 3 && c <= 5;
  return r >= 7 && r <= 9 && c >= 3 && c <= 5;
}
function riverBlackHalf(r) {
  return r <= 4;
}
function riverRedHalf(r) {
  return r >= 5;
}
function lineClear(board, r0, c0, r1, c1) {
  const dr = r1 === r0 ? 0 : r1 > r0 ? 1 : -1;
  const dc = c1 === c0 ? 0 : c1 > c0 ? 1 : -1;
  if (dr !== 0 && dc !== 0) return false;
  let r = r0 + dr;
  let c = c0 + dc;
  while (r !== r1 || c !== c1) {
    if (board[idx(r, c)]) return false;
    r += dr;
    c += dc;
  }
  return true;
}
function countBetween(board, r0, c0, r1, c1) {
  const dr = r1 === r0 ? 0 : r1 > r0 ? 1 : -1;
  const dc = c1 === c0 ? 0 : c1 > c0 ? 1 : -1;
  let n = 0;
  let r = r0 + dr;
  let c = c0 + dc;
  while (r !== r1 || c !== c1) {
    if (board[idx(r, c)]) n++;
    r += dr;
    c += dc;
  }
  return n;
}
function addMoves(board, turn, fr, moves) {
  const [r0, c0] = rc(fr);
  const v = board[fr];
  if (!v || side(v) !== turn) return;
  const t = typ(v);
  const opp = -turn;
  const push = (tr, tc) => {
    if (!inB(tr, tc)) return;
    const to = idx(tr, tc);
    const tv = board[to];
    if (tv && side(tv) === turn) return;
    moves.push([fr, to]);
  };
  if (t === T.K) {
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const tr = r0 + dr;
      const tc = c0 + dc;
      if (!palace(tr, tc, turn)) continue;
      push(tr, tc);
    }
  } else if (t === T.A) {
    for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const tr = r0 + dr;
      const tc = c0 + dc;
      if (!palace(tr, tc, turn)) continue;
      push(tr, tc);
    }
  } else if (t === T.B) {
    for (const [dr, dc] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
      const tr = r0 + dr;
      const tc = c0 + dc;
      if (!inB(tr, tc)) continue;
      if (turn === BLACK && !riverBlackHalf(tr)) continue;
      if (turn === RED && !riverRedHalf(tr)) continue;
      const er = r0 + dr / 2;
      const ec = c0 + dc / 2;
      if (board[idx(er, ec)]) continue;
      push(tr, tc);
    }
  } else if (t === T.N) {
    const legs = [
      [[2, 1], [1, 0]],
      [[2, -1], [1, 0]],
      [[-2, 1], [-1, 0]],
      [[-2, -1], [-1, 0]],
      [[1, 2], [0, 1]],
      [[1, -2], [0, -1]],
      [[-1, 2], [0, 1]],
      [[-1, -2], [0, -1]],
    ];
    for (const [[dr, dc], [lr, lc]] of legs) {
      const tr = r0 + dr;
      const tc = c0 + dc;
      const lr0 = r0 + lr;
      const lc0 = c0 + lc;
      if (board[idx(lr0, lc0)]) continue;
      push(tr, tc);
    }
  } else if (t === T.R) {
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let tr = r0 + dr;
      let tc = c0 + dc;
      while (inB(tr, tc)) {
        const to = idx(tr, tc);
        const tv = board[to];
        if (!tv) moves.push([fr, to]);
        else {
          if (side(tv) === opp) moves.push([fr, to]);
          break;
        }
        tr += dr;
        tc += dc;
      }
    }
  } else if (t === T.C) {
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let tr = r0 + dr;
      let tc = c0 + dc;
      let jumped = false;
      while (inB(tr, tc)) {
        const to = idx(tr, tc);
        const tv = board[to];
        if (!jumped) {
          if (!tv) moves.push([fr, to]);
          else jumped = true;
        } else {
          if (tv) {
            if (side(tv) === opp) moves.push([fr, to]);
            break;
          }
        }
        tr += dr;
        tc += dc;
      }
    }
  } else if (t === T.P) {
    if (turn === BLACK) {
      const crossed = r0 >= 5;
      push(r0 + 1, c0);
      if (crossed) {
        push(r0, c0 + 1);
        push(r0, c0 - 1);
      }
    } else {
      const crossed = r0 <= 4;
      push(r0 - 1, c0);
      if (crossed) {
        push(r0, c0 + 1);
        push(r0, c0 - 1);
      }
    }
  }
}
function listMovesFrom(game, fr) {
  const out = [];
  addMoves(game.board, game.turn, fr, out);
  return out.filter(([from, to]) => {
    const nb = game.board.slice();
    const v = nb[from];
    nb[to] = v;
    nb[from] = 0;
    return !kingsFaceOnBoard(nb) && !inCheckAfter(nb, game.turn);
  });
}
function kingsFaceOnBoard(b) {
  let ri = -1;
  let bi = -1;
  for (let i = 0; i < 90; i++) {
    if (typ(b[i]) !== T.K) continue;
    if (side(b[i]) === RED) ri = i;
    else bi = i;
  }
  if (ri < 0 || bi < 0) return false;
  const [rr, rcol] = rc(ri);
  const [br, bcol] = rc(bi);
  if (rcol !== bcol) return false;
  return lineClear(b, rr, rcol, br, bcol);
}
function listRawMovesFor(board, turn, fr) {
  const out = [];
  addMoves(board, turn, fr, out);
  return out;
}
function listLegalMoves(game) {
  const { board, turn } = game;
  const all = [];
  for (let fr = 0; fr < 90; fr++) {
    if (!board[fr] || side(board[fr]) !== turn) continue;
    for (const [f, t] of listRawMovesFor(board, turn, fr)) {
      const nb = board.slice();
      const v = nb[f];
      nb[t] = v;
      nb[f] = 0;
      if (kingsFaceOnBoard(nb)) continue;
      if (inCheckAfter(nb, turn)) continue;
      all.push([f, t]);
    }
  }
  return all;
}
function tryMove(game, fr, to) {
  const { board, turn } = game;
  const v = board[fr];
  if (!v || side(v) !== turn) return false;
  const ok = listRawMovesFor(board, turn, fr).some(([f, t]) => f === fr && t === to);
  if (!ok) return false;
  const nb = board.slice();
  nb[to] = v;
  nb[fr] = 0;
  if (kingsFaceOnBoard(nb)) return false;
  if (inCheckAfter(nb, turn)) return false;
  board[to] = v;
  board[fr] = 0;
  game.lastMove = { fr, to, player: turn };
  game.turn = -turn;
  return true;
}
function findKing(board, sd) {
  for (let i = 0; i < 90; i++) if (typ(board[i]) === T.K && side(board[i]) === sd) return i;
  return -1;
}
/** 走子后本方将/帅是否被将军：扫描对方所有伪合法走法（listRawMovesFor）能否吃到本方将/帅；将/帅不存在也视为被吃。用原始走法避免与合法性过滤相互递归 */
function inCheckAfter(board, sd) {
  const kingIdx = findKing(board, sd);
  if (kingIdx < 0) return true;
  const opp = -sd;
  for (let fr = 0; fr < 90; fr++) {
    const v = board[fr];
    if (!v || side(v) !== opp) continue;
    for (const mv of listRawMovesFor(board, opp, fr)) {
      if (mv[1] === kingIdx) return true;
    }
  }
  return false;
}
/** 当前方是否被将军（复用 inCheckAfter：枚举对方原始走法是否可吃到己方将/帅） */
function isInCheck(board, side) {
  return inCheckAfter(board, side);
}
function terminal(game) {
  const w = findKing(game.board, game.turn);
  if (w < 0) return "lose";
  const m = listLegalMoves(game);
  if (!m.length) return isInCheck(game.board, game.turn) ? "checkmate" : "stalemate";
  return null;
}
const LABELS_BLACK = { 1: "将", 2: "车", 3: "马", 4: "象", 5: "士", 6: "炮", 7: "卒" };
const LABELS_RED = { 1: "帅", 2: "车", 3: "马", 4: "相", 5: "仕", 6: "炮", 7: "兵" };
function cellLabel(v) {
  if (!v) return "";
  const t = typ(v);
  const L = side(v) === RED ? LABELS_RED : LABELS_BLACK;
  const ch = L[t] || "?";
  return (side(v) === RED ? "红" : "黑") + ch;
}
/** 棋面单字（红帅/黑将等），用于 UI 圆饼刻字，与 cellLabel 区分无前缀 */
function pieceFaceChar(v) {
  if (!v) return "";
  const t = typ(v);
  const L = side(v) === RED ? LABELS_RED : LABELS_BLACK;
  return L[t] || "?";
}
function cloneGame(g) {
  return { board: g.board.slice(), turn: g.turn };
}
function aiMove(game, moodTier) {
  const moves = listLegalMoves(game);
  if (!moves.length) return null;
  function scoreMove(fr, to) {
    const g = cloneGame(game);
    const cap = g.board[to];
    tryMove(g, fr, to);
    let s = Math.random() * (moodTier <= 1 ? 5 : moodTier === 2 ? 1.5 : 0.3);
    if (cap) s += 2 + typ(cap);
    if (typ(cap) === T.K) s += 900;
    return s;
  }
  moves.sort((a, b) => scoreMove(b[0], b[1]) - scoreMove(a[0], a[1]));
  const k = Math.min(moves.length - 1, moodTier <= 1 ? 6 : moodTier === 2 ? 3 : 1);
  return moves[Math.floor(Math.random() * (k + 1))];
}
module.exports = {
  createGame,
  tryMove,
  listLegalMoves,
  listMovesFrom,
  aiMove,
  cellLabel,
  pieceFaceChar,
  terminal,
  findKing,
  isInCheck,
  RED,
  BLACK,
  idx,
  rc,
  side,
  typ,
  T,
};
