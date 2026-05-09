// xiangqi-fen.js - 内部 board 数组（90 格）↔ pikafish UCI/FEN 双向转换
//
// FEN 行序：内部 r=0（黑方北侧第一行）-> r=9（红方南侧第一行）
// 内部 board 索引：r * 9 + c
// FEN 棋子：红方大写、黑方小写；K(帅)/R(车)/N(马)/B(相)/A(仕)/C(炮)/P(兵)
//
// UCI 坐标（pikafish 沿用 ICCS）：
//   列字母 a-i 对应内部 c=0-8
//   行数字 0-9 是从红方底部数（红方第一行=row 0；黑方第一行=row 9）
//   即 row_digit = 9 - 内部 r
//   "h2e2" = 红炮二平五：从 (内部 r=7, c=7) 走到 (内部 r=7, c=4)

const xq = require('./games/xiangqi.js');

const TYPE_TO_FEN = ['', 'K', 'R', 'N', 'B', 'A', 'C', 'P'];

function pieceToFenChar(v) {
    if (!v) return null;
    const t = xq.typ(v);
    const ch = TYPE_TO_FEN[t];
    if (!ch) return null;
    return xq.side(v) === xq.RED ? ch : ch.toLowerCase();
}

/** 把内部 board[90] + turn 编码成 pikafish 接受的完整 FEN（含 side、stub fields） */
function fenFromBoard(board, turn) {
    const rows = [];
    for (let r = 0; r < 10; r++) {
        let row = '';
        let empty = 0;
        for (let c = 0; c < 9; c++) {
            const v = board[r * 9 + c] || 0;
            const ch = pieceToFenChar(v);
            if (!ch) {
                empty++;
            } else {
                if (empty > 0) {
                    row += String(empty);
                    empty = 0;
                }
                row += ch;
            }
        }
        if (empty > 0) row += String(empty);
        rows.push(row);
    }
    const sideChar = turn === xq.RED ? 'w' : 'b';
    return `${rows.join('/')} ${sideChar} - - 0 1`;
}

function colLetterToNum(ch) {
    const code = String(ch || '').toLowerCase().charCodeAt(0) - 'a'.charCodeAt(0);
    return code >= 0 && code < 9 ? code : -1;
}

/** "h2e2" → { from: 内部 idx, to: 内部 idx }；解析失败返回 null */
function uciToInternalMove(uci) {
    if (typeof uci !== 'string' || uci.length < 4) return null;
    const fc = colLetterToNum(uci[0]);
    const fr = 9 - parseInt(uci[1], 10);
    const tc = colLetterToNum(uci[2]);
    const tr = 9 - parseInt(uci[3], 10);
    if (![fc, tc].every((x) => x >= 0 && x < 9)) return null;
    if (![fr, tr].every((x) => Number.isInteger(x) && x >= 0 && x < 10)) return null;
    return { from: fr * 9 + fc, to: tr * 9 + tc };
}

/** 内部 board idx → UCI 单格表示（如 "h2"）。供调试 */
function internalToUciSquare(internalIdx) {
    const r = Math.floor(internalIdx / 9);
    const c = internalIdx % 9;
    const letter = String.fromCharCode('a'.charCodeAt(0) + c);
    const digit = 9 - r;
    return `${letter}${digit}`;
}

module.exports = {
    fenFromBoard,
    uciToInternalMove,
    internalToUciSquare,
};
