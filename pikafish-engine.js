// pikafish-engine.js - 通过 child_process 启动 pikafish 原生二进制（UCI 协议）
//
// 设计：
//   - 一个进程持久驻留整个对局（避免反复启动开销）
//   - bestMove(fen, depth) 用一次"position + go depth + 等 bestmove"
//   - 全程异步、超时回退、stdout 流缓存
//   - 任何错误都不抛，只把状态置为 unavailable，让 index.js 回退到手写 ai

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class PikafishEngine {
    /**
     * @param {object} opts
     * @param {string} opts.binPath - pikafish 可执行文件绝对路径
     * @param {number} [opts.timeoutMs=8000] - 单次 bestmove 等待上限
     * @param {number} [opts.initTimeoutMs=4000] - uci/isready 握手超时
     * @param {object} [opts.logger] - { log(level, msg) }
     */
    constructor(opts = {}) {
        this.binPath = opts.binPath || '';
        this.timeoutMs = Number(opts.timeoutMs) || 8000;
        this.initTimeoutMs = Number(opts.initTimeoutMs) || 4000;
        this.logger = opts.logger || { log() {} };
        this.proc = null;
        this.ready = false;
        this.unavailable = false;
        this._stdoutBuf = '';
        this._pendingBestMove = null;
        this._initResolve = null;
    }

    isReady() {
        return !this.unavailable && this.ready && !!this.proc;
    }

    async init() {
        if (this.unavailable) return false;
        if (this.ready) return true;
        if (!this.binPath || !fs.existsSync(this.binPath)) {
            this._setUnavailable(new Error(`pikafish binary not found: ${this.binPath || '(empty)'}`));
            return false;
        }
        try {
            this.proc = spawn(this.binPath, [], { cwd: path.dirname(this.binPath), stdio: ['pipe', 'pipe', 'pipe'] });
        } catch (err) {
            this._setUnavailable(err);
            return false;
        }
        this.proc.stdout.on('data', (chunk) => this._onData(chunk.toString('utf8')));
        this.proc.stderr.on('data', () => { /* 忽略 NNUE 加载提示 */ });
        this.proc.on('error', (err) => this._setUnavailable(err));
        this.proc.on('exit', () => {
            this.ready = false;
            this.proc = null;
            if (this._pendingBestMove) {
                const cb = this._pendingBestMove;
                this._pendingBestMove = null;
                cb.resolve(null);
            }
        });

        const okPromise = new Promise((resolve) => {
            this._initResolve = resolve;
        });
        const timer = setTimeout(() => {
            if (this._initResolve) {
                this._initResolve(false);
                this._initResolve = null;
                this._setUnavailable(new Error('pikafish 握手超时（uciok/readyok 未及时返回；通常是 .nnue 权重缺失）'));
            }
        }, this.initTimeoutMs);

        this._write('uci');
        const ok = await okPromise;
        clearTimeout(timer);
        return ok;
    }

    /**
     * @param {string} fen 完整 FEN（含 side 字段）
     * @param {number} depth 搜索深度（5-12 常用）
     * @returns {Promise<{from:number,to:number}|null>} 内部 board idx，失败返回 null
     */
    async bestMove(fen, depth) {
        if (!this.isReady()) return null;
        if (this._pendingBestMove) return null;

        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                if (this._pendingBestMove === holder) {
                    this._pendingBestMove = null;
                    this._safeWrite('stop');
                    this.logger.log('warn', `pikafish bestmove 超时 ${this.timeoutMs}ms`);
                    resolve(null);
                }
            }, this.timeoutMs);
            const holder = {
                resolve: (uciOrNull) => {
                    clearTimeout(timer);
                    if (this._pendingBestMove === holder) this._pendingBestMove = null;
                    resolve(this._uciToMove(uciOrNull));
                },
            };
            this._pendingBestMove = holder;
            this._safeWrite(`position fen ${fen}`);
            this._safeWrite(`go depth ${Math.max(1, Math.min(20, depth | 0))}`);
        });
    }

    stop() {
        if (!this.proc) return;
        try { this._safeWrite('quit'); } catch (_) { /* ignore */ }
        try { this.proc.kill(); } catch (_) { /* ignore */ }
        this.proc = null;
        this.ready = false;
        this._pendingBestMove = null;
    }

    _onData(text) {
        this._stdoutBuf += text;
        const lines = this._stdoutBuf.split('\n');
        this._stdoutBuf = lines.pop() || '';
        for (const raw of lines) {
            const line = raw.trim();
            if (!line) continue;
            if (line === 'uciok') {
                this._safeWrite('isready');
            } else if (line === 'readyok') {
                this.ready = true;
                if (this._initResolve) {
                    const r = this._initResolve;
                    this._initResolve = null;
                    r(true);
                }
            } else if (line.startsWith('bestmove')) {
                const parts = line.split(/\s+/);
                const move = parts[1];
                if (this._pendingBestMove) {
                    this._pendingBestMove.resolve(move);
                }
            }
        }
    }

    _safeWrite(cmd) {
        if (!this.proc || !this.proc.stdin || !this.proc.stdin.writable) return;
        try {
            this.proc.stdin.write(cmd + '\n');
        } catch (err) {
            this._setUnavailable(err);
        }
    }

    _write(cmd) {
        this._safeWrite(cmd);
    }

    _setUnavailable(err) {
        if (this.unavailable) return;
        this.unavailable = true;
        this.ready = false;
        this.logger.log('warn', `pikafish 引擎不可用：${err && err.message ? err.message : String(err)}`);
        if (this._initResolve) {
            const r = this._initResolve;
            this._initResolve = null;
            r(false);
        }
        if (this.proc) {
            try { this.proc.kill(); } catch (_) { /* ignore */ }
            this.proc = null;
        }
    }

    _uciToMove(uci) {
        if (!uci || uci === '(none)') return null;
        const { uciToInternalMove } = require('./xiangqi-fen.js');
        return uciToInternalMove(uci);
    }
}

module.exports = { PikafishEngine };
