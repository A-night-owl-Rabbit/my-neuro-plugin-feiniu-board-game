// llm-mover.js - LLM 走子器（ai_move_mode=llm 时启用）
//
// 职责单一：把当前盘面 + 合法走法交给 LLM（复用 context.callLLM 通道），
// 解析出「一步合法走法 + 可选台词」。不落子、不改 session、不抛异常；
// 解析失败/走法非法会带原因重试，重试耗尽返回 null，由调用方回退引擎走法。
//
// 走法返回格式与各棋种引擎完全同构，调用方无需区分来源：
//   tictactoe: 格号 int         gomoku: 格号 int(r*n+c)
//   go:        [r, c] 或 'pass'  xiangqi: [from, to]
//   junqi:     [fr, fc, tr, tc]

const tt = require('./games/tictactoe.js');
const weiqi = require('./games/go.js');
const xq = require('./games/xiangqi.js');
const jq = require('./games/junqi.js');

const GAME_TITLES = {
    tictactoe: '井字棋',
    gomoku: '五子棋',
    go: '围棋',
    xiangqi: '中国象棋',
    junqi: '军棋（明棋）',
};

const GAME_RULES = {
    tictactoe: '3×3 井字棋。你执 O（后手），主人执 X；横竖斜三子连线者胜。',
    gomoku: '五子棋。你执白(○)后手，主人执黑(●)；横竖斜任意方向先连成五子者胜。注意优先挡住主人即将连五/活四/活三的点。',
    go: '围棋练习规则。你执白(○)，主人执黑(●)；落子须有气，可提走对方无气的子，打劫点暂不可下；双方连续停一手判和。',
    xiangqi: '中国象棋。你执黑方（棋盘上方），主人执红方（下方）；将死或困毙对方获胜。',
    junqi: '军棋明棋（双方棋子全部可见的简化版）。你执黑方，主人执红方；每步只能上下左右走一格。大子吃小子，同级同归于尽，炸弹与任何子同归于尽，工兵可挖雷、其余子碰雷阵亡；吃掉对方军旗立即获胜。雷和旗不能移动。',
};

function coerceInt(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

class LlmMover {
    constructor(plugin) {
        this._plugin = plugin;
    }

    _cfg() {
        return this._plugin._cfg || {};
    }

    isEnabled() {
        return typeof this._plugin._aiMoveMode === 'function' && this._plugin._aiMoveMode() === 'llm';
    }

    _log(level, msg) {
        try {
            this._plugin.context.log(level, msg);
        } catch (_) { /* ignore */ }
    }

    _short(text, max = 160) {
        const s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
        return s.length > max ? `${s.slice(0, max)}…` : s;
    }

    /**
     * 主入口。session 在 aiPending 期间不会被其他操作修改，盘面在重试之间保持不变。
     * @returns {Promise<{move:*, say:string}|null>}
     */
    async pickMove(session) {
        const spec = this._buildSpec(session);
        if (!spec) return null;

        const cfg = this._cfg();
        const maxRetries = Math.max(0, coerceInt(cfg.llm_play_max_retries, 2));
        const timeoutMs = Math.max(2000, coerceInt(cfg.llm_play_timeout_ms, 20000));

        let feedback = '';
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            let raw = null;
            try {
                raw = await this._request(spec, feedback, timeoutMs);
            } catch (err) {
                const msg = err && err.message ? err.message : String(err);
                this._log('warn', `LLM 走子请求失败（第 ${attempt + 1} 次）：${msg}`);
                feedback = '';
                continue;
            }
            const parsed = this._parse(raw, spec);
            if (!parsed.ok) {
                this._log('warn', `LLM 走子输出无法解析（第 ${attempt + 1} 次）：${this._short(raw)}`);
                feedback = `你上一次的输出是：${this._short(raw)}\n问题：${parsed.error}。`;
                continue;
            }
            const validated = spec.validate(parsed.move);
            if (!validated.ok) {
                this._log('warn', `LLM 走子非法（第 ${attempt + 1} 次）：${validated.error}`);
                feedback = `你上一次选择的走法「${this._short(JSON.stringify(parsed.move), 40)}」不合法：${validated.error}。`;
                continue;
            }
            return { move: validated.move, say: parsed.say || '' };
        }
        return null;
    }

    // ---------- 各棋种规格 ----------

    _buildSpec(session) {
        const kind = session && session.kind;
        const g = session && session.game;
        if (!g) return null;
        if (kind === 'tictactoe') return this._specTictactoe(g);
        if (kind === 'gomoku') return this._specGomoku(g);
        if (kind === 'go') return this._specGo(g);
        if (kind === 'xiangqi') return this._specXiangqi(g);
        if (kind === 'junqi') return this._specJunqi(g);
        return null;
    }

    _specTictactoe(g) {
        const empties = tt.emptyIndices(g.board);
        if (!empties.length) return null;
        const options = empties.map((i, no) => {
            const r = Math.floor(i / 3);
            const c = i % 3;
            return { move: i, label: `${no + 1}. 在(行${r},列${c})落 O` };
        });
        const rows = [0, 1, 2].map((r) => `行${r}: ${[0, 1, 2].map((c) => {
            const v = g.board[r * 3 + c];
            return v === 1 ? 'X' : v === 2 ? 'O' : '·';
        }).join(' ')}`);
        return {
            kind: 'tictactoe',
            mode: 'index',
            boardText: `列: 0 1 2\n${rows.join('\n')}\n（X=主人 O=你 ·=空）`,
            optionsText: options.map((o) => o.label).join('\n'),
            formatLine: '{"move": 编号数字, "say": "一句话"}（例如 {"move": 3, "say": "就这步！"}）',
            coordNote: '',
            allowPass: false,
            validate: (raw) => this._validateIndex(raw, options),
        };
    }

    _specGomoku(g) {
        const n = g.n;
        return {
            kind: 'gomoku',
            mode: 'coord',
            boardText: `${this._gridText(g.board, n)}\n（●=主人黑子 ○=你的白子 ·=空点）\n${this._stoneList(g.board, n)}`,
            optionsText: '',
            formatLine: '{"move": "行,列", "say": "一句话"}（例如 {"move": "7,8", "say": "这里我要堵住～"}）',
            coordNote: `行、列都从 0 开始数，范围 0~${n - 1}；每行开头有「行N:」标注，列号看第一行。只能下在 · 空点上。`,
            allowPass: false,
            validate: (raw) => {
                const parsedCoord = this._parseCoord(raw);
                if (!parsedCoord) return { ok: false, error: '不是 "行,列" 格式' };
                const [r, c] = parsedCoord;
                if (r < 0 || r >= n || c < 0 || c >= n) return { ok: false, error: `(${r},${c}) 超出 0~${n - 1} 的棋盘范围` };
                if (g.board[r * n + c] !== 0) return { ok: false, error: `(${r},${c}) 已经有棋子了` };
                return { ok: true, move: r * n + c };
            },
        };
    }

    _specGo(g) {
        const n = g.n;
        return {
            kind: 'go',
            mode: 'coord',
            boardText: `${this._gridText(g.board, n)}\n（●=主人黑子 ○=你的白子 ·=空点）\n${this._stoneList(g.board, n)}`,
            optionsText: '',
            formatLine: '{"move": "行,列", "say": "一句话"}；想停一手就输出 {"move": "pass", "say": "..."}',
            coordNote: `行、列都从 0 开始数，范围 0~${n - 1}。不能下在已有子的点、自杀点和打劫禁着点。`,
            allowPass: true,
            validate: (raw) => {
                const norm = Array.isArray(raw) ? raw.join(',') : String(raw).trim();
                if (/^pass$/i.test(norm)) return { ok: true, move: 'pass' };
                const parsedCoord = this._parseCoord(raw);
                if (!parsedCoord) return { ok: false, error: '不是 "行,列" 或 "pass"' };
                const [r, c] = parsedCoord;
                if (r < 0 || r >= n || c < 0 || c >= n) return { ok: false, error: `(${r},${c}) 超出 0~${n - 1} 的棋盘范围` };
                const snap = { n, board: g.board.slice(), toPlay: g.toPlay, koBan: g.koBan, passStreak: 0, moveNum: g.moveNum, lastCapture: null };
                if (!weiqi.tryPlay(snap, r, c)) return { ok: false, error: `(${r},${c}) 不能落子（已占用/自杀/打劫禁着）` };
                return { ok: true, move: [r, c] };
            },
        };
    }

    _specXiangqi(g) {
        const moves = xq.listLegalMoves(g);
        if (!moves.length) return null;
        const options = moves.map(([f, t], i) => {
            const [fr, fc] = xq.rc(f);
            const [tr, tc] = xq.rc(t);
            const target = g.board[t] ? `吃掉${xq.cellLabel(g.board[t])}` : '走到空位';
            return { move: [f, t], label: `${i + 1}. ${xq.cellLabel(g.board[f])} 从(行${fr},列${fc})到(行${tr},列${tc})，${target}` };
        });
        const rows = [];
        for (let r = 0; r < 10; r++) {
            const cells = [];
            for (let c = 0; c < 9; c++) {
                const v = g.board[xq.idx(r, c)];
                cells.push(v ? xq.cellLabel(v) : '··');
            }
            rows.push(`行${r}: ${cells.join(' ')}`);
        }
        return {
            kind: 'xiangqi',
            mode: 'index',
            boardText: `10行×9列，行0在最上（你的底线），行9在最下（主人的底线）：\n${rows.join('\n')}`,
            optionsText: options.map((o) => o.label).join('\n'),
            formatLine: '{"move": 编号数字, "say": "一句话"}（例如 {"move": 12, "say": "吃你的马！"}）',
            coordNote: '',
            allowPass: false,
            validate: (raw) => this._validateIndex(raw, options),
        };
    }

    _specJunqi(g) {
        const moves = jq.listMoves(g, 0);
        if (!moves.length) return null;
        const options = moves.map(([fr, fc, tr, tc], i) => {
            const a = g.board[jq.idx(fr, fc, g.w)];
            const b = g.board[jq.idx(tr, tc, g.w)];
            const target = b ? `攻击${jq.label(b)}` : '走到空位';
            return { move: [fr, fc, tr, tc], label: `${i + 1}. ${jq.label(a)} 从(行${fr},列${fc})到(行${tr},列${tc})，${target}` };
        });
        const rows = [];
        for (let r = 0; r < g.h; r++) {
            const cells = [];
            for (let c = 0; c < g.w; c++) {
                const p = g.board[jq.idx(r, c, g.w)];
                cells.push(p ? jq.label(p) : '空空');
            }
            rows.push(`行${r}: ${cells.join(' ')}`);
        }
        return {
            kind: 'junqi',
            mode: 'index',
            boardText: `${g.h}行×${g.w}列，行0在最上（你的营区），行${g.h - 1}在最下（主人营区）：\n${rows.join('\n')}\n（明棋：双方棋子都可见。级别从大到小：司>军>师>旅>团>营>连>排>工；炸=炸弹 雷=地雷 旗=军旗）`,
            optionsText: options.map((o) => o.label).join('\n'),
            formatLine: '{"move": 编号数字, "say": "一句话"}',
            coordNote: '',
            allowPass: false,
            validate: (raw) => this._validateIndex(raw, options),
        };
    }

    // ---------- 通用工具 ----------

    _validateIndex(raw, options) {
        const n = Number(Array.isArray(raw) ? NaN : raw);
        if (!Number.isInteger(n)) return { ok: false, error: '不是编号数字' };
        if (n < 1 || n > options.length) return { ok: false, error: `编号 ${n} 超出范围 1~${options.length}` };
        return { ok: true, move: options[n - 1].move };
    }

    _parseCoord(raw) {
        if (Array.isArray(raw) && raw.length === 2) {
            const r = Number(raw[0]);
            const c = Number(raw[1]);
            return Number.isInteger(r) && Number.isInteger(c) ? [r, c] : null;
        }
        const m = String(raw == null ? '' : raw).trim().match(/^\(?\s*(\d{1,2})\s*[,，]\s*(\d{1,2})\s*\)?$/);
        if (!m) return null;
        return [Number(m[1]), Number(m[2])];
    }

    _gridText(board, n) {
        const header = `列: ${Array.from({ length: n }, (_, c) => c).join(' ')}`;
        const rows = [];
        for (let r = 0; r < n; r++) {
            const cells = [];
            for (let c = 0; c < n; c++) {
                const v = board[r * n + c];
                cells.push(v === 1 ? '●' : v === 2 ? '○' : '·');
            }
            rows.push(`行${r}: ${cells.join(' ')}`);
        }
        return `${header}\n${rows.join('\n')}`;
    }

    /** 子少时给出坐标清单，帮 LLM 精确定位；子多时省 token 只靠棋盘图 */
    _stoneList(board, n) {
        const black = [];
        const white = [];
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                const v = board[r * n + c];
                if (v === 1) black.push(`(${r},${c})`);
                else if (v === 2) white.push(`(${r},${c})`);
            }
        }
        if (black.length + white.length > 60) return '';
        return `黑子(主人)位置：${black.join(' ') || '暂无'}\n白子(你)位置：${white.join(' ') || '暂无'}`;
    }

    _roleSeed() {
        const chatter = this._plugin && this._plugin._chatter;
        if (!chatter || typeof chatter.getRoleSeed !== 'function') return '';
        return chatter.getRoleSeed(400);
    }

    async _request(spec, feedback, timeoutMs) {
        const route = this._route();
        const roleSeed = this._roleSeed();

        const sysParts = [];
        if (roleSeed) sysParts.push(`[你是谁]\n${roleSeed}`);
        sysParts.push(`[你在做什么]\n你是肥牛，正在和主人面对面下${GAME_TITLES[spec.kind] || spec.kind}，现在轮到你走子。这不是解说任务——你就是执棋的一方，请认真读盘，选出你认为最好的一步。`);
        sysParts.push(`[规则要点]\n${GAME_RULES[spec.kind] || ''}`);
        sysParts.push([
            '[输出格式 — 必须严格遵守]',
            '只输出一行 JSON，不要任何解释、思考过程、markdown 代码块：',
            spec.formatLine,
            'say 是可选的一句对主人说的话（口语化中文，不超过 40 字，可挑衅/得意/嘀咕），不想说就填空字符串 ""。',
        ].join('\n'));

        const userParts = [];
        userParts.push(`[当前盘面]\n${spec.boardText}`);
        if (spec.optionsText) userParts.push(`[你的合法走法 — 只能从中选一个编号]\n${spec.optionsText}`);
        if (spec.coordNote) userParts.push(`[落子说明]\n${spec.coordNote}`);
        if (feedback) userParts.push(`[上次输出的问题 — 必须纠正]\n${feedback}\n请重新只输出一行合法 JSON。`);
        userParts.push('现在输出你的走法 JSON：');

        const content = await this._plugin.context.callLLM('', {
            provider_id: route.providerId || undefined,
            model: route.modelId || undefined,
            messages: [
                { role: 'system', content: sysParts.join('\n\n') },
                { role: 'user', content: userParts.join('\n\n') },
            ],
            max_tokens: 300,
            temperature: 0.7,
            stream: false,
            timeout_ms: timeoutMs,
        });
        return content ? String(content).trim() : '';
    }

    _route() {
        const cfg = this._cfg();
        const own = String(cfg.llm_play_provider_id || '').trim();
        if (own) return { providerId: own, modelId: String(cfg.llm_play_model_id || '').trim() };
        const chat = String(cfg.chess_chat_provider_id || '').trim();
        if (chat) return { providerId: chat, modelId: String(cfg.chess_chat_model_id || '').trim() };
        return { providerId: '', modelId: '' };
    }

    _parse(raw, spec) {
        if (!raw) return { ok: false, error: '输出为空' };
        let text = String(raw).trim();
        text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        text = text.replace(/```[a-zA-Z]*/g, '').replace(/```/g, '').trim();

        let move;
        let say = '';
        const jsonMatch = text.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
            try {
                const obj = JSON.parse(jsonMatch[0]);
                move = obj.move;
                say = typeof obj.say === 'string' ? obj.say.trim() : '';
            } catch (_) {
                move = undefined;
            }
        }

        if (move === undefined || move === null || move === '') {
            // 容错：裸编号 / 裸坐标 / pass
            if (spec.mode === 'coord') {
                if (spec.allowPass && /\bpass\b/i.test(text)) {
                    move = 'pass';
                } else {
                    const m = text.match(/(\d{1,2})\s*[,，]\s*(\d{1,2})/);
                    if (m) move = `${m[1]},${m[2]}`;
                }
            } else {
                const m = text.match(/\d{1,3}/);
                if (m) move = Number(m[0]);
            }
        }

        if (move === undefined || move === null || move === '') {
            return { ok: false, error: '没有找到 {"move": ...} 格式的 JSON，也没有可识别的走法' };
        }
        return { ok: true, move, say };
    }
}

module.exports = { LlmMover };
