// chess-chatter.js - 棋局事件解说器
// 旁路主 LLM，直接调用插件配置的 DeepSeek（或兼容 OpenAI 格式的 chat/completions endpoint）
// 生成 1-2 句短台词，通过 context.speakText 直接送 TTS（不进 voiceChat.messages 持久历史）。
// 借鉴 N.E.K.O sts2_autoplay/neko_reporting.py 的设计：
//   - observed/spoken 三态分离（避免沉默轮卡死转场识别）
//   - critical 事件突破节流
//   - 60 秒滚动窗口供主 LLM 临时可见，避免用户接茬时穿帮

const { appState } = require('../../../js/core/app-state.js');

const TIER_VALUE = { L0: 0, L1: 1, L2: 2, L3: 3 };

class ChessChatter {
    constructor(plugin) {
        this._plugin = plugin;
        this._reset();
    }

    _reset() {
        this._lastObservedEvent = null;
        this._lastSpokenAt = 0;
        this._lastSpokenEventKind = null;
        this._inflight = null;
        this._recentLines = [];
    }

    _cfg() {
        return this._plugin._cfg || {};
    }

    isEnabled() {
        const cfg = this._cfg();
        if (cfg.chess_chat_enabled === false) return false;
        if (!cfg.chess_chat_deepseek_api_key || !String(cfg.chess_chat_deepseek_api_key).trim()) return false;
        return true;
    }

    /** 每次 diff 都调用：更新 observed 状态用于事件类型变化检测 */
    recordObservedEvent(event) {
        if (event && event.kind) this._lastObservedEvent = event;
    }

    /** 主入口：根据事件级别决定要不要说，并并发安全地生成 + 朗读 */
    async maybeSpeak(event) {
        if (!this.isEnabled()) return;
        if (!event || !event.kind) return;
        const cfg = this._cfg();

        const tier = TIER_VALUE[event.tier] ?? TIER_VALUE.L1;
        if (tier === TIER_VALUE.L0) return;

        if (tier === TIER_VALUE.L1) {
            const prob = this._clamp01(cfg.chess_chat_normal_move_prob, 0.45);
            if (Math.random() > prob) return;
        }

        if (event.kind === 'capture' && cfg.chess_chat_say_on_capture === false) return;
        if (event.kind === 'check' && cfg.chess_chat_say_on_check === false) return;
        if (event.kind === 'threat' && cfg.chess_chat_say_on_threat === false) return;

        if (!this._passThrottle(event, tier)) return;

        try {
            if (appState && appState.isPlayingTTS && appState.isPlayingTTS()) return;
        } catch (_) { /* ignore */ }

        if (this._inflight) return;

        const task = this._generateAndSpeak(event).catch((err) => {
            const msg = err && err.message ? err.message : String(err);
            const isAbort = err && (err.name === 'AbortError' || /aborted/i.test(msg));
            if (isAbort) {
                this._safeLog('warn', `解说生成超时（>${this._coerceInt(this._cfg().chess_chat_request_timeout_ms, 12000)}ms 未返回）；可在配置里把 chess_chat_request_timeout_ms 调大，或换更快的 model/网关`);
            } else {
                this._safeLog('warn', `解说生成失败：${msg}`);
            }
        }).finally(() => {
            if (this._inflight === task) this._inflight = null;
        });
        this._inflight = task;
    }

    _passThrottle(event, tier) {
        if (tier >= TIER_VALUE.L3) return true;
        const cfg = this._cfg();
        const now = Date.now();
        const minInterval = tier >= TIER_VALUE.L2
            ? this._coerceInt(cfg.chess_chat_capture_min_interval_ms, 4000)
            : this._coerceInt(cfg.chess_chat_min_interval_ms, 8000);
        if (now - this._lastSpokenAt < minInterval && event.kind === this._lastSpokenEventKind) {
            return false;
        }
        return true;
    }

    async _generateAndSpeak(event) {
        const text = await this._callDeepSeek(event);
        if (!text || !String(text).trim()) return;
        const finalText = this._trimToMaxChars(text, this._cfg().chess_chat_max_chars);
        if (!finalText) return;

        try {
            if (appState && appState.isPlayingTTS && appState.isPlayingTTS()) {
                this._pushRecentLine(finalText, event);
                this._lastSpokenAt = Date.now();
                this._lastSpokenEventKind = event.kind;
                return;
            }
        } catch (_) { /* ignore */ }

        const ctx = this._plugin && this._plugin.context;
        try {
            if (ctx && typeof ctx.speakText === 'function') {
                ctx.speakText(finalText);
            }
        } catch (err) {
            this._safeLog('warn', `speakText 失败：${err && err.message ? err.message : String(err)}`);
        }

        this._pushRecentLine(finalText, event);
        this._lastSpokenAt = Date.now();
        this._lastSpokenEventKind = event.kind;
    }

    _pushRecentLine(text, event) {
        const cfg = this._cfg();
        const max = Math.max(1, this._coerceInt(cfg.chess_chat_recent_window_max, 5));
        this._recentLines.push({
            text: String(text),
            ts: Date.now(),
            kind: event && event.kind ? String(event.kind) : 'normal',
        });
        while (this._recentLines.length > max) this._recentLines.shift();
    }

    /** 给 onLLMRequest 注入用：返回过期清理后的窗口副本，调用方拿去拼 system 块 */
    getRecentLines(now = Date.now()) {
        const cfg = this._cfg();
        const ttl = Math.max(1000, this._coerceInt(cfg.chess_chat_recent_window_ttl_ms, 60000));
        this._recentLines = this._recentLines.filter((line) => now - line.ts <= ttl);
        return this._recentLines.slice();
    }

    async _callDeepSeek(event) {
        const cfg = this._cfg();
        const url = String(cfg.chess_chat_deepseek_api_url || 'https://api.deepseek.com/v1/chat/completions').trim();
        const key = String(cfg.chess_chat_deepseek_api_key || '').trim();
        const model = String(cfg.chess_chat_deepseek_model || 'deepseek-chat').trim();
        if (!url || !key || !model) return null;

        const timeoutMs = Math.max(500, this._coerceInt(cfg.chess_chat_request_timeout_ms, 4000));
        const maxTokens = Math.max(16, this._coerceInt(cfg.chess_chat_max_tokens, 80));
        const temperature = this._coerceFloat(cfg.chess_chat_temperature, 1.0);
        const frequencyPenalty = this._coerceFloat(cfg.chess_chat_frequency_penalty, 0.6);
        const presencePenalty = this._coerceFloat(cfg.chess_chat_presence_penalty, 0.4);

        const { systemPrompt, userPrompt } = this._buildPrompt(event);
        const body = {
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            max_tokens: maxTokens,
            temperature,
            frequency_penalty: frequencyPenalty,
            presence_penalty: presencePenalty,
            stream: false,
        };

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`,
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            if (!response.ok) {
                const errBody = await response.text().catch(() => '');
                throw new Error(`HTTP ${response.status} ${errBody.slice(0, 200)}`);
            }
            const data = await response.json();
            const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
            return content ? String(content).trim() : null;
        } finally {
            clearTimeout(timer);
        }
    }

    _buildPrompt(event) {
        const cfg = this._cfg();
        const session = this._plugin._session;
        const gameKey = session && session.kind && session.kind !== 'ended' ? session.kind : (session && session.prevKind) || 'tictactoe';
        const gameName = this._plugin._gameDisplayName ? this._plugin._gameDisplayName(gameKey) : gameKey;
        const round = (session && session.round) || 1;
        const moodLine = this._plugin._moodLine ? this._plugin._moodLine() : '';
        const roleSeed = this._extractRoleSeed(this._coerceInt(cfg.chess_chat_role_seed_max_chars, 200));
        const boardSnapshot = this._plugin._boardStateText ? this._plugin._boardStateText() : '';
        const recentTexts = this._recentLines.slice(-3).map((line) => `- ${line.text}`).join('\n');
        const maxChars = this._coerceInt(cfg.chess_chat_max_chars, 30);
        const styleHint = String(cfg.chess_chat_style_hint || '').trim();
        const eventText = String(event.text || '一手平淡的落子').trim();
        const eventTone = this._eventToneHint(event);

        const sysParts = [];
        if (roleSeed) sysParts.push(`[你是谁]\n${roleSeed}`);

        const stagePieces = [
            `- 棋种：${gameName}（本浮层第 ${round} 局）`,
            moodLine ? `- 当前心情：${moodLine}` : '',
            '- 立场：你是肥牛，正坐在主人对面亲自下棋；你想赢，但也享受这盘棋本身；你说话直接、有点傲娇、偶尔损人，但底色是喜欢主人的',
            '- 视角：本次发言由你（肥牛）说出口，事件文本里的「我」=你自己，「主人」=对面的人',
        ].filter(Boolean).join('\n');
        sysParts.push(`[当前对局]\n${stagePieces}`);

        if (styleHint) sysParts.push(`[说话风格补充]\n${styleHint}`);

        sysParts.push([
            '[硬性规则]',
            '1. 严禁敷衍套话：以下黑名单一个字都不许用——',
            '   "哼，主人厉害"、"主人好厉害"、"嗯～看来你不简单"、"有点意思"、"看你怎么应对"、"这局有得打"、"我可不会客气"',
            '2. 必须紧贴本次具体事件：用 1-2 个具体细节锚定（吃掉的子名、刚形成的棋型、对方的窘迫、你自己的心理活动）',
            '3. 不要重复你最近说过话的句式或开头词',
            '4. 别拿 "喵"、"哼" 之类口癖开头堆字数；如果要用口癖，藏在中间或结尾',
            '5. 如果心情好就更得瑟挑衅一点；心情一般就专注吐槽；心情差就少说话冷淡一点',
            `6. 1-2 句口语化中文，最多 ${maxChars} 字；不要 markdown、emoji、坐标、棋谱`,
            '7. 直接输出台词本身，不写"她说"、不要引号、不要前缀',
        ].join('\n'));

        const systemPrompt = sysParts.join('\n\n');

        const userParts = [];
        userParts.push(`[本次要点评的事件]\n${eventText}`);
        if (eventTone) userParts.push(`[这次的情绪基调（仅供参考，不要原样照抄）]\n${eventTone}`);
        if (boardSnapshot) userParts.push(`[盘面摘要 仅供你把握局势 严禁向主人背诵坐标或格子标号]\n${boardSnapshot}`);
        if (recentTexts) userParts.push(`[你最近说过的话 句式/开头词都不要重复]\n${recentTexts}`);
        userParts.push('现在用你的性格直接说一句符合上面所有要求的台词。');

        return { systemPrompt, userPrompt: userParts.join('\n\n') };
    }

    _eventToneHint(event) {
        if (!event || !event.kind) return '';
        const side = event.side === 'feiniu' ? 'me' : 'user';
        const k = event.kind;
        if (k === 'capture' && side === 'me') return '我刚吃了对方一子，可以小得意、损一句、或不动声色但语带刀锋';
        if (k === 'capture' && side === 'user') return '主人吃了我的子，要么咬牙嘴硬、要么夸他一句但留余地、要么自嘲';
        if (k === 'check' && side === 'me') return '我刚刚将军，气势可以足一点，但别说"主人快逃"这种烂梗';
        if (k === 'check' && side === 'user') return '主人将了我的军，承认压力，可以略紧张但保持人设';
        if (k === 'threat' && side === 'me') return '我刚走出威胁性棋型，可以暗示下一步杀招、或假装无所谓';
        if (k === 'threat' && side === 'user') return '主人形成威胁，要么提醒自己要小心、要么给主人下个套';
        return '一手普通落子，可以冷不丁吐槽、可以聊棋外的小话题、不要硬找张力';
    }

    _extractRoleSeed(maxChars) {
        try {
            const voiceChat = global.voiceChat;
            const messages = voiceChat && voiceChat.messages;
            if (!Array.isArray(messages)) return '';
            const sys = messages.find((m) => m && m.role === 'system');
            if (!sys) return '';
            const base = typeof sys._baseContent === 'string' && sys._baseContent.trim()
                ? sys._baseContent
                : (typeof sys.content === 'string' ? sys.content : '');
            if (!base) return '';
            const cleaned = base.split('\n\n--- Plugin Injections ---')[0].trim();
            const limit = Math.max(0, maxChars | 0);
            if (!limit) return cleaned;
            return cleaned.length > limit ? `${cleaned.slice(0, limit)}…` : cleaned;
        } catch (_) {
            return '';
        }
    }

    _trimToMaxChars(text, maxChars) {
        const max = Math.max(8, this._coerceInt(maxChars, 30));
        let s = String(text || '').trim();
        s = s.replace(/^["'“”『「]+|["'“”』」]+$/g, '').trim();
        s = s.replace(/^[\-—•·●>]+\s*/, '').trim();
        s = s.replace(/\n+/g, ' ');
        if (s.length <= max) return s;
        const cut = s.slice(0, max);
        const lastBreak = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('！'), cut.lastIndexOf('？'), cut.lastIndexOf('，'));
        return lastBreak > max * 0.6 ? cut.slice(0, lastBreak + 1) : cut;
    }

    _coerceInt(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? Math.trunc(n) : fallback;
    }

    _coerceFloat(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    _clamp01(value, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(0, Math.min(1, n));
    }

    _safeLog(level, msg) {
        try {
            this._plugin && this._plugin.context && this._plugin.context.log && this._plugin.context.log(level, msg);
        } catch (_) { /* ignore */ }
    }
}

module.exports = { ChessChatter };
