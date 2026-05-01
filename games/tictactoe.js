const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

function cloneBoard(b) {
  return b.slice();
}

function checkWinner(board) {
  const line = winningLineIndices(board);
  if (line) {
    const a = line[0];
    return board[a] === 1 ? 'X' : 'O';
  }
  if (board.every((x) => x !== 0)) return 'draw';
  return null;
}
/** 取胜方三连线上的格子下标 [i,j,k]，无则 null（终局 UI 高亮） */
function winningLineIndices(board) {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return [a, b, c];
  }
  return null;
}

function emptyIndices(board) {
  const r = [];
  for (let i = 0; i < 9; i++) if (board[i] === 0) r.push(i);
  return r;
}

function minimax(board, depth, isMax, maxDepth) {
  const w = checkWinner(board);
  if (w === 'O') return 10 - depth;
  if (w === 'X') return depth - 10;
  if (w === 'draw') return 0;
  if (depth >= maxDepth) return 0;

  const empties = emptyIndices(board);
  if (isMax) {
    let best = -Infinity;
    for (const i of empties) {
      const nb = cloneBoard(board);
      nb[i] = 2;
      const s = minimax(nb, depth + 1, false, maxDepth);
      best = Math.max(best, s);
    }
    return best;
  }
  let best = Infinity;
  for (const i of empties) {
    const nb = cloneBoard(board);
    nb[i] = 1;
    const s = minimax(nb, depth + 1, true, maxDepth);
    best = Math.min(best, s);
  }
  return best;
}

function bestMove(board, tier) {
  const empties = emptyIndices(board);
  if (empties.length === 0) return -1;

  let randomChance = 0;
  let maxDepth = 9;
  if (tier <= 0) randomChance = 0.45;
  else if (tier === 1) {
    randomChance = 0.2;
    maxDepth = 4;
  } else if (tier === 2) {
    randomChance = 0.05;
    maxDepth = 9;
  }

  if (Math.random() < randomChance) {
    return empties[Math.floor(Math.random() * empties.length)];
  }

  let bestScore = -Infinity;
  let choices = [];
  for (const i of empties) {
    const nb = cloneBoard(board);
    nb[i] = 2;
    const s = minimax(nb, 0, false, maxDepth);
    if (s > bestScore) {
      bestScore = s;
      choices = [i];
    } else if (s === bestScore) choices.push(i);
  }
  return choices[Math.floor(Math.random() * choices.length)];
}

function createGame() {
  return { board: new Array(9).fill(0), humanMark: 1, aiMark: 2 };
}

function applyMove(game, idx, player) {
  if (idx < 0 || idx > 8 || game.board[idx] !== 0) return false;
  game.board[idx] = player;
  return true;
}

module.exports = {
  LINES,
  createGame,
  cloneBoard,
  checkWinner,
  winningLineIndices,
  emptyIndices,
  bestMove,
  applyMove
};
