const express = require('express');
const http = require('http');
const path = require('path');

let current = null;

function emptyState() {
    return {
        kind: 'idle',
        prevKind: null,
        round: 0,
        mood: null,
        toolbar: { canUndo: false, canPass: false, canResign: false },
        board: null,
        sel: null,
        ended: false,
        outcome: null,
        resigned: false,
        winLine: null,
        boardText: '',
        config: {},
    };
}

function sendSse(res, payload) {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function createApp(plugin, state) {
    const app = express();
    const webDir = path.join(__dirname, 'web');

    app.use(express.json({ limit: '256kb' }));
    app.get('/', (req, res) => res.sendFile(path.join(webDir, 'index.html')));
    app.use('/static', express.static(webDir, { fallthrough: false }));
    app.get('/api/state', (req, res) => res.json(plugin ? plugin.serializeState() : emptyState()));

    app.get('/api/state/stream', (req, res) => {
        res.status(200);
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();

        state.clients.add(res);
        sendSse(res, plugin ? plugin.serializeState() : emptyState());

        const ping = setInterval(() => {
            if (!state.clients.has(res)) {
                clearInterval(ping);
                return;
            }
            res.write(`event: ping\ndata: ${Date.now()}\n\n`);
        }, 25000);

        req.on('close', () => {
            clearInterval(ping);
            state.clients.delete(res);
        });
    });

    app.post('/api/open', (req, res) => {
        const message = plugin.openGame(req.body?.game);
        const payload = plugin.serializeState();
        state.broadcast(payload);
        res.json({ ok: true, message, state: payload });
    });

    app.post('/api/click', (req, res) => {
        const body = req.body || {};
        const kind = body.kind || plugin.serializeState().kind;
        const message = plugin.handleClick(kind, body);
        const payload = plugin.serializeState();
        state.broadcast(payload);
        res.json({ ok: true, message, state: payload });
    });

    app.post('/api/pass', (req, res) => {
        const message = plugin.pass();
        const payload = plugin.serializeState();
        state.broadcast(payload);
        res.json({ ok: true, message, state: payload });
    });

    app.post('/api/undo', (req, res) => {
        const message = plugin.undo();
        const payload = plugin.serializeState();
        state.broadcast(payload);
        res.json({ ok: true, message, state: payload });
    });

    app.post('/api/restart', (req, res) => {
        const message = plugin.restart();
        const payload = plugin.serializeState();
        state.broadcast(payload);
        res.json({ ok: true, message, state: payload });
    });

    app.post('/api/resign', (req, res) => {
        const message = plugin.resign();
        const payload = plugin.serializeState();
        state.broadcast(payload);
        res.json({ ok: true, message, state: payload });
    });

    app.post('/api/close', (req, res) => {
        const message = plugin.close();
        const payload = plugin.serializeState();
        state.broadcast(payload);
        res.json({ ok: true, message, state: payload });
    });

    return app;
}

function startServer(plugin, options = {}) {
    stopServer();

    const state = {
        plugin,
        host: String(options.host || '127.0.0.1'),
        port: Number.isFinite(Number(options.port)) ? Number(options.port) : 22335,
        clients: new Set(),
        server: null,
        started: false,
        error: null,
        ready: null,
        broadcast(payload) {
            if (!state.server || !state.started) return;
            for (const client of state.clients) {
                try {
                    sendSse(client, payload);
                } catch {
                    state.clients.delete(client);
                }
            }
        },
    };

    const app = createApp(plugin, state);
    const server = http.createServer(app);
    state.server = server;

    state.ready = new Promise((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            resolve(state);
        };

        server.once('error', (error) => {
            state.error = error;
            state.started = false;
            const level = error && error.code === 'EADDRINUSE' ? 'warn' : 'error';
            const prefix = error && error.code === 'EADDRINUSE' ? '端口已被占用' : 'Web 服务启动失败';
            try {
                plugin.context?.log?.(level, `${prefix}: ${state.host}:${state.port} (${error.message})`);
            } catch {
                console.warn(`[feiniu-board-game] ${prefix}: ${state.host}:${state.port} (${error.message})`);
            }
            finish();
        });

        server.listen(state.port, state.host, () => {
            state.started = true;
            state.port = server.address().port;
            finish();
        });
    });

    current = state;
    return state;
}

async function stopServer() {
    const state = current;
    if (!state) return;
    current = null;

    for (const client of state.clients) {
        try {
            client.end();
        } catch {
            // ignore
        }
    }
    state.clients.clear();

    if (!state.server) return;

    await new Promise((resolve) => {
        try {
            state.server.close(() => resolve());
        } catch {
            resolve();
        }
    });
}

module.exports = { startServer, stopServer };
