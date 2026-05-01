const { Plugin } = require('../../../js/core/plugin-base.js');
const { shell } = require('electron');
const tt = require('./games/tictactoe.js');
const gk = require('./games/gomoku.js');
const weiqi = require('./games/go.js');
const xq = require('./games/xiangqi.js');
const jq = require('./games/junqi.js');
const { startServer, stopServer } = require('./server.js');

const GAME_NAMES = {
    tictactoe: '井字棋',
    gomoku: '五子棋',
    go: '围棋',
    xiangqi: '中国象棋',
    junqi: '军棋（明棋）',
};

function wrapTools(defs) {
    return defs.map((tool) => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
        },
    }));
}

function cloneBoard(board) {
    return Array.isArray(board)
        ? board.map((item) => (item && typeof item === 'object' ? { ...item } : item))
        : board;
}

function replaceTokens(template, values) {
    return String(template || '').replace(/\{([a-z_]+)\}/gi, (match, key) => {
        const normalized = key.toLowerCase();
        return Object.prototype.hasOwnProperty.call(values, normalized) ? String(values[normalized]) : match;
    });
}

class FeiniuBoardGamePlugin extends Plugin {
    async onInit() {
        this._reloadCfg();
        this._session = null;
        this._effectEnd = 0;
        this._effectBody = '';
        this._exitEffectPending = false;
        this._exitEffectBody = '';
        this._penaltyCooldownUntil = 0;
        this._server = null;
    }

    async onStart() {
        this._reloadCfg();
        this._server = startServer(this, {
            host: this._webuiHost(),
            port: this._webuiPort(),
        });

        await this._server.ready;

        if (this._server.started) {
            this.context.log('info', `棋盘插件 Web UI 已启动: http://${this._webuiHost()}:${this._server.port}`);
            this._notifyState();
        } else {
            this.context.log('warn', `棋盘插件 Web UI 启动失败: ${this._server.error?.message || 'unknown error'}`);
        }
    }

    async onStop() {
        if (this._session) {
            this.context.log('warn', '棋盘插件：插件停止，当前对局已关闭');
        }
        this._session = null;
        await stopServer();
        this._server = null;
    }

    _reloadCfg() {
        try {
            this._cfg = this.context.getPluginConfig() || {};
        } catch {
            this._cfg = {};
        }
    }

    _webuiHost() {
        return String(this._cfg.webui_host || '127.0.0.1');
    }

    _webuiPort() {
        const port = Number(this._cfg.webui_port);
        return Number.isFinite(port) && port > 0 ? port : 22335;
    }

    _autoOpenBrowser() {
        return this._cfg.auto_open_browser !== false;
    }

    _xiangqiIntersectionStyle() {
        return this._cfg.xiangqi_intersection_style !== false;
    }

    _notifyState() {
        this._server?.broadcast?.(this.serializeState());
    }

    _moodStatus() {
        const mood = global.moodChatModule;
        if (!mood || typeof mood.getMoodStatus !== 'function') {
            return { score: null, tier: 2, line: '对手现在心情一般' };
        }
        const status = mood.getMoodStatus() || {};
        const score = Number(status.score);
        const tier = Number.isFinite(score) ? this._moodTier(score) : 2;
        const moodLines = ['对手现在心情很好', '对手现在心情一般', '对手现在心情不太好', '对手现在心情很差'];
        return {
            score: Number.isFinite(score) ? score : null,
            tier,
            line: moodLines[tier] || '对手现在心情一般',
        };
    }

    _moodTier(score = null) {
        const current = score === null ? this._moodStatus().score : score;
        if (!Number.isFinite(current)) return 2;
        if (current >= 90) return 0;
        if (current >= 80) return 1;
        if (current >= 60) return 2;
        return 3;
    }

    _moodLine() {
        return this._moodStatus().line;
    }

    _undoEnabled() {
        return this._cfg.enable_undo !== false;
    }

    _createGame(kind) {
        switch (kind) {
            case 'tictactoe': return tt.createGame();
            case 'gomoku': return gk.createGame(this._gomokuSize());
            case 'go': return weiqi.createGame(this._goSize());
            case 'xiangqi': return xq.createGame();
            case 'junqi': return jq.createGame();
            default: return tt.createGame();
        }
    }

    _createSession(kind) {
        return {
            kind,
            prevKind: null,
            game: this._createGame(kind),
            sel: null,
            round: 1,
            justRestarted: false,
            lastOutcome: null,
            lastResigned: false,
            lastWinLine: null,
            lastSnapshot: null,
            tttUndoStack: [],
            gomokuUndoStack: [],
        };
    }

    _penaltyContext() {
        const gameKey = this._session?.kind || '';
        const round = this._session?.round || 1;
        const itemName = String(this._cfg.penalty_item_name || '认栽签');
        const sensitivity = Number(this._cfg.penalty_sensitivity);
        return {
            item_name: itemName,
            sensitivity: Number.isFinite(sensitivity) ? sensitivity : 40,
            game: GAME_NAMES[gameKey] || gameKey,
            round,
        };
    }

    _buildExitEffectBody() {
        const ctx = this._penaltyContext();
        return replaceTokens('用户刚刚说了安全词，立刻从《{game}》的惩罚模式退出。现在只保留一次简短确认：已经停止，{item_name} 和后续约定都先收起，语气恢复自然、轻松、干净，不要继续推动任何约定。', ctx);
    }

    _setEndedSession(kind, outcome, extras = {}) {
        if (!this._session) return;
        this._session = {
            ...this._session,
            kind: 'ended',
            prevKind: kind,
            lastOutcome: outcome,
            lastResigned: !!extras.resigned,
            lastWinLine: extras.winLine || null,
            sel: null,
        };
    }

    openGame(kind) {
        const game = ['tictactoe', 'gomoku', 'go', 'xiangqi', 'junqi'].includes(kind) ? kind : 'tictactoe';
        this._session = this._createSession(game);
        this._notifyState();
        return `已打开${GAME_NAMES[game]}。`;
    }

    handleClick(kind, payload = {}) {
        if (!this._session) return '当前没有打开棋局。';
        if (this._session.kind !== kind) return `当前棋局不是 ${GAME_NAMES[kind] || kind}。`;
        if (kind === 'tictactoe') return this._handleTictactoeClick(payload);
        if (kind === 'gomoku') return this._handleGomokuClick(payload);
        if (kind === 'go') return this._handleGoClick(payload);
        if (kind === 'xiangqi') return this._handleXiangqiClick(payload);
        if (kind === 'junqi') return this._handleJunqiClick(payload);
        return '不支持的棋种。';
    }

    undo() {
        if (!this._session || this._session.kind === 'ended') return '当前没有可悔棋的对局。';
        if (!this._undoEnabled()) return '悔棋已关闭。';

        if (this._session.kind === 'tictactoe') {
            const snap = this._session.tttUndoStack.pop();
            if (!snap) return '没有可悔的步骤。';
            this._session.game.board = cloneBoard(snap);
            this._notifyState();
            return '已悔棋。';
        }

        if (this._session.kind === 'gomoku') {
            const snap = this._session.gomokuUndoStack.pop();
            if (!snap) return '没有可悔的步骤。';
            this._session.game.board = cloneBoard(snap.board);
            this._session.game.n = snap.n;
            this._session.game.lastMove = snap.lastMove ? { ...snap.lastMove } : null;
            this._notifyState();
            return '已悔棋。';
        }

        return '当前棋种不支持悔棋。';
    }

    pass() {
        if (!this._session || this._session.kind !== 'go' || this._session.kind === 'ended') return '当前不是围棋对局。';
        const g = this._session.game;
        if (g.toPlay !== weiqi.BLACK) return '现在还没轮到你停一手。';
        weiqi.pass(g);
        if (weiqi.gameEndedByPass(g)) {
            this._finishGo('draw');
            return '双方连续停一手，本局和棋。';
        }
        this._runGoAi();
        return '你已停一手。';
    }

    restart() {
        if (!this._session) return '当前没有棋局。';
        const kind = this._session.kind === 'ended' ? this._session.prevKind : this._session.kind;
        if (!kind) return '当前没有可重开的棋局。';
        const nextRound = (this._session.round || 1) + 1;
        this._session = this._createSession(kind);
        this._session.round = nextRound;
        this._session.justRestarted = true;
        this._notifyState();
        return `已重开${GAME_NAMES[kind] || kind}，进入第 ${nextRound} 局。`;
    }

    resign() {
        if (!this._session || this._session.kind === 'ended') return '当前没有可认输的棋局。';
        const kind = this._session.kind;
        if (kind === 'tictactoe') return this._finishTictactoe('feiniu', { resigned: true });
        if (kind === 'gomoku') return this._finishGomoku('feiniu', { resigned: true });
        if (kind === 'go') return this._finishGo('feiniu', { resigned: true });
        if (kind === 'xiangqi') return this._finishXiangqi('feiniu', { resigned: true });
        if (kind === 'junqi') return this._finishJunqi('feiniu', { resigned: true });
        return '当前棋种不支持认输。';
    }

    close() {
        if (this._session) {
            this.context.log('warn', `棋盘插件：关闭对弈窗口（${this._session.kind}）`);
        }
        this._session = null;
        this._notifyState();
        return '棋盘已关闭。';
    }

    _handleTictactoeClick({ idx }) {
        const g = this._session.game;
        const index = Number(idx);
        if (!Number.isInteger(index)) return '缺少落子位置。';
        if (tt.checkWinner(g.board)) return '当前对局已结束。';

        if (this._undoEnabled()) {
            this._session.tttUndoStack.push(tt.cloneBoard(g.board));
            if (this._session.tttUndoStack.length > 30) this._session.tttUndoStack.shift();
        }

        if (!tt.applyMove(g, index, 1)) {
            if (this._undoEnabled()) this._session.tttUndoStack.pop();
            return '该位置不能落子。';
        }

        let result = tt.checkWinner(g.board);
        if (result) return this._finishTictactoe(result);

        const ai = tt.bestMove(g.board, this._moodTier());
        if (ai >= 0) {
            tt.applyMove(g, ai, 2);
            result = tt.checkWinner(g.board);
            if (result) return this._finishTictactoe(result);
        }

        this._notifyState();
        return '已落子。';
    }

    _handleGomokuClick({ r, c }) {
        const g = this._session.game;
        const row = Number(r);
        const col = Number(c);
        if (!Number.isInteger(row) || !Number.isInteger(col)) return '缺少落子位置。';
        if (g.board[gk.idx(row, col, g.n)] !== 0) return '该位置不能落子。';

        if (this._undoEnabled()) {
            this._session.gomokuUndoStack.push({ board: g.board.slice(), n: g.n, lastMove: g.lastMove ? { ...g.lastMove } : null });
            if (this._session.gomokuUndoStack.length > 30) this._session.gomokuUndoStack.shift();
        }

        if (!gk.applyMove(g, row, col, 1)) {
            if (this._undoEnabled()) this._session.gomokuUndoStack.pop();
            return '该位置不能落子。';
        }

        const afterHuman = gk.gameStatus(g, row, col, 1);
        if (afterHuman !== 'playing') {
            const winLine = afterHuman === 'human' ? gk.winningLine(g.board, g.n, row, col, 1) : null;
            return this._finishGomoku(afterHuman === 'draw' ? 'draw' : afterHuman, { winLine });
        }

        const ai = gk.bestMove(g.board, g.n, this._moodTier());
        if (ai >= 0) {
            const ar = Math.floor(ai / g.n);
            const ac = ai % g.n;
            gk.applyMove(g, ar, ac, 2);
            const afterAi = gk.gameStatus(g, ar, ac, 2);
            if (afterAi !== 'playing') {
                const winLine = afterAi === 'ai' ? gk.winningLine(g.board, g.n, ar, ac, 2) : null;
                return this._finishGomoku(afterAi === 'draw' ? 'draw' : afterAi, { winLine });
            }
        }

        this._notifyState();
        return '已落子。';
    }

    _handleGoClick({ r, c }) {
        const g = this._session.game;
        const row = Number(r);
        const col = Number(c);
        if (!Number.isInteger(row) || !Number.isInteger(col)) return '缺少落子位置。';
        if (g.toPlay !== weiqi.BLACK) return '现在还没轮到你落子。';
        if (!weiqi.tryPlay(g, row, col)) return '该位置不能落子。';
        if (weiqi.gameEndedByPass(g)) return this._finishGo('draw');
        this._runGoAi();
        return '已落子。';
    }

    _handleXiangqiClick({ i }) {
        const g = this._session.game;
        const idx = Number(i);
        if (!Number.isInteger(idx)) return '缺少落子位置。';
        if (g.turn !== xq.RED) return '现在还没轮到你走子。';

        const piece = g.board[idx];
        if (this._session.sel == null) {
            if (piece && xq.side(piece) === xq.RED) {
                this._session.sel = idx;
                this._notifyState();
                return '已选中棋子。';
            }
            return '请选择己方棋子。';
        }

        if (idx === this._session.sel) {
            this._session.sel = null;
            this._notifyState();
            return '已取消选中。';
        }

        if (piece && xq.side(piece) === xq.RED) {
            this._session.sel = idx;
            this._notifyState();
            return '已改选棋子。';
        }

        const from = this._session.sel;
        this._session.sel = null;
        if (!xq.tryMove(g, from, idx)) {
            this._notifyState();
            return '该步不合法。';
        }

        if (this._xqTerminal()) return '对局已结束。';

        const ai = xq.aiMove(g, this._moodTier());
        if (ai) {
            xq.tryMove(g, ai[0], ai[1]);
            if (this._xqTerminal()) return '对局已结束。';
        }

        this._notifyState();
        return '已落子。';
    }

    _handleJunqiClick({ r, c }) {
        const g = this._session.game;
        const row = Number(r);
        const col = Number(c);
        if (!Number.isInteger(row) || !Number.isInteger(col)) return '缺少落子位置。';
        if (g.turn !== 1 || g.winner !== null) return '现在还没轮到你走子。';

        const piece = g.board[jq.idx(row, col, g.w)];
        if (!this._session.sel) {
            if (piece && piece.side === 1 && piece.rank !== jq.FLAG && piece.rank !== jq.MINE) {
                this._session.sel = [row, col];
                this._notifyState();
                return '已选中棋子。';
            }
            return '请选择己方可移动棋子。';
        }

        const [fr, fc] = this._session.sel;
        if (fr === row && fc === col) {
            this._session.sel = null;
            this._notifyState();
            return '已取消选中。';
        }

        if (piece && piece.side === 1 && piece.rank !== jq.FLAG && piece.rank !== jq.MINE) {
            this._session.sel = [row, col];
            this._notifyState();
            return '已改选棋子。';
        }

        if (!jq.applyMove(g, fr, fc, row, col)) {
            this._notifyState();
            return '该步不合法。';
        }

        this._session.sel = null;
        if (g.winner !== null) return this._finishJunqi(g.winner === 1 ? 'user' : 'feiniu');

        const ai = jq.aiMove(g, this._moodTier());
        if (ai) {
            jq.applyMove(g, ai[0], ai[1], ai[2], ai[3]);
            if (g.winner !== null) return this._finishJunqi(g.winner === 1 ? 'user' : 'feiniu');
        }

        this._notifyState();
        return '已落子。';
    }

    _runGoAi() {
        const g = this._session?.game;
        if (!g || g.toPlay !== weiqi.WHITE) {
            this._notifyState();
            return;
        }

        const move = weiqi.aiMove(g, this._moodTier());
        if (!move) {
            weiqi.pass(g);
            if (weiqi.gameEndedByPass(g)) {
                this._finishGo('draw');
                return;
            }
            this._notifyState();
            return;
        }

        weiqi.tryPlay(g, move[0], move[1]);
        if (weiqi.gameEndedByPass(g)) {
            this._finishGo('draw');
            return;
        }

        this._notifyState();
    }

    _xqTerminal() {
        const g = this._session?.game;
        if (!g) return false;
        if (xq.findKing(g.board, xq.RED) < 0) {
            this._finishXiangqi('feiniu');
            return true;
        }
        if (xq.findKing(g.board, xq.BLACK) < 0) {
            this._finishXiangqi('user');
            return true;
        }

        const term = xq.terminal(g);
        if (term === 'lose' || term === 'checkmate') {
            this._finishXiangqi(g.turn === xq.RED ? 'feiniu' : 'user');
            return true;
        }
        if (term === 'stalemate_draw') {
            this._finishXiangqi('draw', { xqStalemate: true });
            return true;
        }
        return false;
    }

    _gomokuSize() {
        const n = Number(this._cfg.gomoku_size);
        return n === 13 ? 13 : 15;
    }

    _goSize() {
        const n = Number(this._cfg.go_board_size);
        return n === 9 || n === 13 || n === 19 ? n : 13;
    }

    _applyOutcome(kind, fromResign) {
        const now = Date.now();
        const cooldownSeconds = Math.max(0, Number(this._cfg.penalty_cooldown_seconds) || 0);
        if (cooldownSeconds > 0 && now < this._penaltyCooldownUntil) {
            this._effectEnd = 0;
            this._effectBody = '';
            return;
        }

        const duration = Math.max(30, Number(this._cfg.effect_duration_seconds) || 180) * 1000;
        const ctx = this._penaltyContext();
        if (kind === 'user') {
            this._effectBody = replaceTokens(this._cfg.injection_user_win || '', ctx);
        } else if (kind === 'feiniu') {
            const resignBody = fromResign ? String(this._cfg.injection_feiniu_resign_win || '').trim() : '';
            this._effectBody = replaceTokens(resignBody || this._cfg.injection_feiniu_win || '', ctx);
        } else {
            this._effectBody = '';
        }

        this._effectEnd = this._effectBody ? Date.now() + duration : 0;
        this._penaltyCooldownUntil = this._effectBody && cooldownSeconds > 0 ? Date.now() + (cooldownSeconds * 1000) : 0;

        if (this._cfg.enable_adjust_mood !== false && global.moodChatModule && typeof global.moodChatModule.adjustMood === 'function') {
            const mood = global.moodChatModule;
            if (kind === 'user') {
                const delta = Number(this._cfg.mood_delta_user_win);
                mood.adjustMood(Number.isFinite(delta) ? delta : 3, '棋局：用户获胜');
            } else if (kind === 'feiniu') {
                const delta = Number(this._cfg.mood_delta_feiniu_win);
                mood.adjustMood(Number.isFinite(delta) ? delta : 4, fromResign ? '棋局：用户认输·对手胜' : '棋局：对手获胜');
            }
        }
    }

    _outcomeLabel(outcome) {
        if (outcome === 'user') return '用户获胜';
        if (outcome === 'feiniu') return '对手获胜';
        return '和棋';
    }

    _boardStateText() {
        const s = this._session;
        if (!s) return '';
        if (s.kind === 'ended') return s.lastSnapshot ? String(s.lastSnapshot) : '';
        if (this._cfg.enable_board_snapshot_injection === false) return '';

        const g = s.game;
        if (!g) return '';

        if (s.kind === 'tictactoe') {
            const row = (r) => [0, 1, 2].map((c) => {
                const v = g.board[r * 3 + c];
                return v === 1 ? 'X' : v === 2 ? 'O' : '·';
            }).join(' ');
            return ['【井字棋 3×3 当前盘面】行1→3：', row(0), row(1), row(2)].join('\n');
        }

        if (s.kind === 'gomoku') {
            const { n, board } = g;
            let text = `【五子棋 ${n}×${n} 当前盘面】●=你(黑) ○=对手(白) ·=空\n`;
            let black = 0;
            let white = 0;
            for (let r = 0; r < n; r++) {
                let line = '';
                for (let c = 0; c < n; c++) {
                    const v = board[gk.idx(r, c, n)];
                    if (v === 1) { line += '●'; black++; }
                    else if (v === 2) { line += '○'; white++; }
                    else { line += '·'; }
                }
                text += `${line}\n`;
            }
            return `${text.trim()}\n子数：黑${black} 白${white}`;
        }

        if (s.kind === 'go') {
            const { n, board } = g;
            let text = `【围棋 ${n} 路 当前盘面】●=黑(用户) ○=白(对手) ·=空\n`;
            let black = 0;
            let white = 0;
            for (let r = 0; r < n; r++) {
                let line = '';
                for (let c = 0; c < n; c++) {
                    const v = board[weiqi.idx(r, c, n)];
                    if (v === weiqi.BLACK) { line += '●'; black++; }
                    else if (v === weiqi.WHITE) { line += '○'; white++; }
                    else { line += '·'; }
                }
                text += `${line}\n`;
            }
            const side = g.toPlay === weiqi.BLACK ? '该黑方（用户）落子或停一手' : '该白方（对手，引擎代下）';
            return `${text.trim()}\n子数：黑${black} 白${white}；下一手：${side}。pass连计=${g.passStreak || 0}`;
        }

        if (s.kind === 'xiangqi') {
            const { board } = g;
            let text = '【象棋 当前盘面】10 行×9 列，上黑下红；格内为棋子标签，· 为空\n';
            for (let r = 0; r < 10; r++) {
                const cells = [];
                for (let c = 0; c < 9; c++) {
                    const v = board[xq.idx(r, c)];
                    cells.push(v ? xq.cellLabel(v) : '·');
                }
                text += `${cells.join(' ')}\n`;
            }
            const side = g.turn === xq.RED ? '该红方（用户）走子' : '该黑方（对手，引擎代下）';
            const checkNote = g.turn === xq.RED && xq.isInCheck(g.board, xq.RED) ? '\n提示：你方正在被将军。' : '';
            return `${text.trim()}\n下一手：${side}。${checkNote}`;
        }

        if (s.kind === 'junqi') {
            const { board, w, h } = g;
            let text = `【军棋 明棋 当前盘面】${h} 行×${w} 列；红=用户 黑=对手\n`;
            for (let r = 0; r < h; r++) {
                const cells = [];
                for (let c = 0; c < w; c++) {
                    const p = board[jq.idx(r, c, w)];
                    cells.push(p ? jq.label(p) : '空');
                }
                text += `${cells.join(' ')}\n`;
            }
            const side = g.turn === 1 ? '该红方（用户）' : '该黑方（对手）';
            return `${text.trim()}\n下一手：${side}。`;
        }

        return '';
    }

    _activeBoardLLMBlock() {
        if (!this._session) return '';

        const kind = this._session.kind;
        if (kind === 'ended') {
            const prev = this._session.prevKind;
            const name = GAME_NAMES[prev] || prev;
            const outcome = this._session.lastOutcome;
            let outcomeLabel = outcome ? this._outcomeLabel(outcome) : '未定';
            if (this._session.lastResigned) outcomeLabel += '（用户认输）';
            return `[棋局·终局界面] 「${name}」本局已结束（浮层第 ${this._session.round || 1} 局）。结果：${outcomeLabel}。用户若再开口，可简短承接复盘语气；可建议重开或结束对弈。终局盘面文本见同条注入中的「终局盘面留档」。不要编造未发生的落子；若用户重开，上一局进程即作废。`;
        }

        const name = GAME_NAMES[kind] || kind;
        const round = this._session.round || 1;
        const restarted = this._session.justRestarted
            ? ' 本局是刚刚「重开一局」后的全新对局，上一局的盘面与进程全部作废，请勿再引用上一局。'
            : '';

        let turn = '';
        if (kind === 'tictactoe' || kind === 'gomoku') turn = '轮到玩家执子，对手由引擎代下。';
        if (kind === 'go') {
            const game = this._session.game;
            turn = game.toPlay === weiqi.BLACK ? '轮到玩家（黑）。对手执白，由引擎代下。' : '轮到对手（白），引擎将代为落子。';
        }
        if (kind === 'xiangqi') {
            const game = this._session.game;
            turn = game.turn === xq.RED ? '轮到玩家（红方）。对手执黑，由引擎代下。' : '轮到对手（黑方），引擎将代为走子。';
        }
        if (kind === 'junqi') {
            const game = this._session.game;
            turn = game.turn === 1 ? '轮到玩家（红方）。对手执黑，由引擎代下。' : '轮到对手（黑方），引擎将代为走子。';
        }

        return `[棋局·进行中] 当前桌面浮层内正在进行「${name}」对局（本浮层内第 ${round} 局）。${restarted}${turn} 请保持角色一致：你知道自己在和用户下棋，语气可自然、轻松；下方「盘面概要」为当前真实棋形，可帮你把握局势，但不要向用户背诵坐标或格子编号。落子以界面为准。不要假装已离开棋局。`;
    }

    _finishTictactoe(result, extras = {}) {
        const resigned = !!extras.resigned;
        const snapshot = this._boardStateText();
        const game = this._session?.game;
        let outcome;
        let message;
        if (resigned) {
            outcome = 'feiniu';
            message = '你已认输，本局判对手胜。接下来将进入插件配置的局后互动（须遵守安全词与内容边界）。';
        } else {
            outcome = result === 'X' ? 'user' : result === 'O' ? 'feiniu' : 'draw';
            message = result === 'X' ? '你赢了！' : result === 'O' ? '对手赢了。' : '平局。';
        }
        this._applyOutcome(outcome, resigned);
        const round = this._session?.round || 1;
        const winLine = resigned ? null : game ? tt.winningLineIndices(game.board) : null;
        this._setEndedSession('tictactoe', outcome, { resigned, winLine });
        if (this._session) {
            this._session.lastSnapshot = snapshot;
            this._session.game = game;
        }
        this._notifyState();
        this._fireEndgameChat('tictactoe', outcome, snapshot, round, { resigned });
        return message;
    }

    _finishGomoku(result, extras = {}) {
        const resigned = !!extras.resigned;
        const snapshot = this._boardStateText();
        const game = this._session?.game;
        let outcome;
        let message;
        if (resigned) {
            outcome = 'feiniu';
            message = '你已认输，本局判对手胜。接下来将进入插件配置的局后互动（须遵守安全词与内容边界）。';
        } else {
            outcome = result === 'human' ? 'user' : result === 'ai' ? 'feiniu' : 'draw';
            message = result === 'human' ? '你赢了！' : result === 'ai' ? '对手赢了。' : '平局。';
        }
        this._applyOutcome(outcome, resigned);
        const round = this._session?.round || 1;
        const winLine = resigned ? null : extras.winLine || null;
        this._setEndedSession('gomoku', outcome, { resigned, winLine });
        if (this._session) {
            this._session.lastSnapshot = snapshot;
            this._session.game = game;
        }
        this._notifyState();
        this._fireEndgameChat('gomoku', outcome, snapshot, round, { resigned });
        return message;
    }

    _finishGo(result, extras = {}) {
        const resigned = !!extras.resigned;
        const snapshot = this._boardStateText();
        const game = this._session?.game;
        const outcome = result === 'user' ? 'user' : result === 'feiniu' ? 'feiniu' : 'draw';
        let message = '对局结束。';
        if (result === 'user') message = '你赢了！（对方认输或规则判负）';
        else if (result === 'feiniu') message = resigned ? '你已认输，本局判对手胜。接下来将进入插件配置的局后互动（须遵守安全词与内容边界）。' : '对手赢了。';
        else if (result === 'draw') message = '双方连续停一手，本局按练习计为和棋。';
        this._applyOutcome(outcome, resigned);
        const round = this._session?.round || 1;
        this._setEndedSession('go', outcome, { resigned });
        if (this._session) {
            this._session.lastSnapshot = snapshot;
            this._session.game = game;
        }
        this._notifyState();
        this._fireEndgameChat('go', outcome, snapshot, round, { resigned });
        return message;
    }

    _finishXiangqi(result, extras = {}) {
        const resigned = !!extras.resigned;
        const snapshot = this._boardStateText();
        const game = this._session?.game;
        let outcome;
        let message;
        if (resigned) {
            outcome = 'feiniu';
            message = '你已认输，本局判对手胜。接下来将进入插件配置的局后互动（须遵守安全词与内容边界）。';
        } else {
            outcome = result === 'user' ? 'user' : result === 'feiniu' ? 'feiniu' : 'draw';
            message = '对局结束。';
            if (result === 'user') message = '你赢了！（将杀）';
            else if (result === 'feiniu') message = '对手赢了。（将杀）';
            else message = extras.xqStalemate ? '困毙（未被将军却无法走子），和棋。' : '和棋。';
        }
        this._applyOutcome(outcome, resigned);
        const round = this._session?.round || 1;
        this._setEndedSession('xiangqi', outcome, { resigned });
        if (this._session) {
            this._session.lastSnapshot = snapshot;
            this._session.game = game;
        }
        this._notifyState();
        this._fireEndgameChat('xiangqi', outcome, snapshot, round, { resigned });
        return message;
    }

    _finishJunqi(result, extras = {}) {
        const resigned = !!extras.resigned;
        const snapshot = this._boardStateText();
        const game = this._session?.game;
        let outcome;
        let message;
        if (resigned) {
            outcome = 'feiniu';
            message = '你已认输，本局判对手胜。接下来将进入插件配置的局后互动（须遵守安全词与内容边界）。';
        } else {
            outcome = result === 'user' ? 'user' : result === 'feiniu' ? 'feiniu' : 'draw';
            message = result === 'user' ? '你夺旗获胜！' : result === 'feiniu' ? '对手夺旗获胜！' : '对局结束。';
        }
        this._applyOutcome(outcome, resigned);
        const round = this._session?.round || 1;
        this._setEndedSession('junqi', outcome, { resigned });
        if (this._session) {
            this._session.lastSnapshot = snapshot;
            this._session.game = game;
        }
        this._notifyState();
        this._fireEndgameChat('junqi', outcome, snapshot, round, { resigned });
        return message;
    }

    _fireEndgameChat(gameKey, outcome, snapshot, round, extra = {}) {
        if (this._cfg.enable_endgame_auto_chat === false) return;
        const resigned = !!extra.resigned && outcome === 'feiniu';
        const gameName = GAME_NAMES[gameKey] || gameKey;
        let resultLine = `本局结果：${this._outcomeLabel(outcome)}。`;
        if (resigned) resultLine = '本局结果：用户认输，对手获胜。';
        const template = String(this._cfg.endgame_chat_prompt || '').trim();
        const boardBlock = snapshot ? String(snapshot) : '（无数盘文本摘要）';
        const resignNote = resigned ? '用户已主动点击认输。' : '';
        let body;
        if (template) {
            body = template
                .replace(/\{game\}/g, gameName)
                .replace(/\{result\}/g, resultLine)
                .replace(/\{round\}/g, String(round))
                .replace(/\{board\}/g, boardBlock)
                .replace(/\{resign\}/g, resignNote);
        } else {
            body = `【棋局刚结束 — 请直接对用户说话，走完整回复与朗读]\n我们下的「${gameName}」这一盘结束了（本浮层第 ${round} 局）。${resultLine}\n\n终局盘面概要：\n${boardBlock}\n\n`;
            if (resigned) {
                body += '你是获胜方：请清楚宣布本局的「惩罚/搞怪约定」（轻度、玩笑向，用户可用安全词中止），再自然互动一两句。禁止人身攻击、不当内容与危险行为。\n';
            } else {
                body += '请用自然、贴切的语气说几句：赢可轻松带过、输可自嘲或嘴硬、和棋就平和收尾。禁止人身攻击与不当内容；不要捏造本局没有的细棋步。\n';
            }
        }

        const run = () => {
            this.context.sendMessage(body).catch((error) => this.context.log('warn', `棋局终局对话触发失败：${error && error.message ? error.message : String(error)}`));
        };
        if (typeof setImmediate !== 'undefined') setImmediate(run);
        else setTimeout(run, 0);
    }

    async onLLMRequest(request) {
        const blocks = [];
        const live = this._activeBoardLLMBlock();
        if (live) blocks.push(live);
        const snapshot = this._boardStateText();
        if (snapshot) {
            const label = this._session && this._session.kind === 'ended'
                ? '[终局盘面留档 — 供承接复盘，勿向用户背诵坐标]'
                : '[当前盘面概要 — 供你把握局势，勿向用户背诵坐标]';
            blocks.push(`${label}\n${snapshot}`);
        }
        if (this._effectBody && Date.now() < this._effectEnd) {
            const prefix = String(this._cfg.injection_prefix || '[棋局插件]');
            blocks.push(`${prefix}\n${this._effectBody}`);
        }
        if (this._exitEffectPending && this._exitEffectBody) {
            const prefix = String(this._cfg.injection_prefix || '[棋局插件]');
            blocks.push(`${prefix}\n${this._exitEffectBody}`);
            this._exitEffectPending = false;
            this._exitEffectBody = '';
        }
        if (!blocks.length) return;
        const system = request.messages.find((m) => m.role === 'system');
        if (system) system.content += `\n${blocks.join('\n')}`;
        if (this._session && this._session.justRestarted) this._session.justRestarted = false;
    }

    async onUserInput(event) {
        if (!event || !event.text) return;
        const raw = String(this._cfg.safe_keywords || '');
        const keywords = raw.split(/[,，\n\r]+/).map((s) => s.trim()).filter(Boolean);
        const text = event.text.trim();
        for (const keyword of keywords) {
            if (keyword && text.includes(keyword)) {
                this._effectEnd = 0;
                this._effectBody = '';
                this._exitEffectBody = this._buildExitEffectBody();
                this._exitEffectPending = true;
                break;
            }
        }
    }

    getTools() {
        return wrapTools([
            {
                name: 'feiniu_open_board_game',
                description: '打开棋盘网页并开始一局对弈。需 mood-chat。',
                parameters: {
                    type: 'object',
                    properties: {
                        game: {
                            type: 'string',
                            description: '棋种',
                            enum: ['tictactoe', 'gomoku', 'go', 'xiangqi', 'junqi'],
                        },
                    },
                    required: ['game'],
                },
            },
            {
                name: 'feiniu_close_board_game',
                description: '关闭棋盘对局。',
                parameters: { type: 'object', properties: {} },
            },
            {
                name: 'feiniu_board_clear_effect',
                description: '清除棋局限时注入。',
                parameters: { type: 'object', properties: {} },
            },
        ]);
    }

    async executeTool(name, params) {
        if (name === 'feiniu_open_board_game') {
            const game = params && params.game ? String(params.game) : 'tictactoe';
            const url = `http://${this._webuiHost()}:${this._server?.port || this._webuiPort()}/?game=${encodeURIComponent(game)}`;
            const message = this.openGame(game);
            if (this._autoOpenBrowser()) {
                try {
                    await shell.openExternal(url);
                } catch (error) {
                    this.context.log('warn', `打开系统浏览器失败: ${error.message}`);
                }
            }
            return `${message} ${this._autoOpenBrowser() ? `已尝试打开棋盘 ${url}` : `请手动访问 ${url}`}`;
        }

        if (name === 'feiniu_close_board_game') {
            return this.close();
        }

        if (name === 'feiniu_board_clear_effect') {
            this._effectEnd = 0;
            this._effectBody = '';
            this._notifyState();
            return '已清除注入。';
        }

        throw new Error(`未知工具 ${name}`);
    }

    serializeState() {
        const session = this._session;
        const kind = session ? session.kind : 'idle';
        const mood = this._moodStatus();
        const state = {
            kind,
            prevKind: session && session.kind === 'ended' ? session.prevKind : null,
            round: session ? session.round || 1 : 0,
            mood,
            lastMove: session && session.game ? cloneBoard(session.game.lastMove) : null,
            hintMoves: [],
            toolbar: {
                canUndo: !!session && session.kind !== 'ended' && this._undoEnabled() && (session.kind === 'tictactoe' || session.kind === 'gomoku') && ((session.kind === 'tictactoe' && session.tttUndoStack.length > 0) || (session.kind === 'gomoku' && session.gomokuUndoStack.length > 0)),
                canPass: !!session && session.kind === 'go' && session.kind !== 'ended' && session.game?.toPlay === weiqi.BLACK,
                canResign: !!session && session.kind !== 'ended',
            },
            board: null,
            sel: session ? session.sel ?? null : null,
            ended: kind === 'ended',
            outcome: session ? session.lastOutcome ?? null : null,
            resigned: session ? !!session.lastResigned : false,
            winLine: session ? session.lastWinLine ?? null : null,
            boardText: this._boardStateText(),
            config: {
                webui_port: this._webuiPort(),
                webui_host: this._webuiHost(),
                auto_open_browser: this._autoOpenBrowser(),
                xiangqi_intersection_style: this._xiangqiIntersectionStyle(),
            },
        };

        if (!session || !session.game) return state;

        if (kind === 'tictactoe' || (kind === 'ended' && session.prevKind === 'tictactoe')) {
            state.board = { cells: cloneBoard(session.game.board) };
        } else if (kind === 'gomoku' || (kind === 'ended' && session.prevKind === 'gomoku')) {
            state.board = { cells: cloneBoard(session.game.board), n: session.game.n };
        } else if (kind === 'go' || (kind === 'ended' && session.prevKind === 'go')) {
            state.board = {
                cells: cloneBoard(session.game.board),
                n: session.game.n,
                toPlay: session.game.toPlay,
                koBan: session.game.koBan,
                passStreak: session.game.passStreak,
                moveNum: session.game.moveNum,
            };
        } else if (kind === 'xiangqi' || (kind === 'ended' && session.prevKind === 'xiangqi')) {
            state.board = { cells: cloneBoard(session.game.board), turn: session.game.turn };
            if (session.kind !== 'ended' && session.sel != null) {
                state.hintMoves = xq.listMovesFrom(session.game, session.sel).map(([, to]) => to);
            }
        } else if (kind === 'junqi' || (kind === 'ended' && session.prevKind === 'junqi')) {
            state.board = { cells: cloneBoard(session.game.board), w: session.game.w, h: session.game.h, turn: session.game.turn, winner: session.game.winner };
            if (session.kind !== 'ended' && Array.isArray(session.sel)) {
                state.hintMoves = jq.listMovesFrom(session.game, session.sel[0], session.sel[1]).map(([, , tr, tc]) => [tr, tc]);
            }
        }

        return state;
    }
}

module.exports = FeiniuBoardGamePlugin;
