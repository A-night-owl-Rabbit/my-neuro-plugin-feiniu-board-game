import { createRequire } from "module";
import { pathToFileURL } from "url";
const require = createRequire(import.meta.url);
const base = new URL(".", pathToFileURL(process.argv[1] || import.meta.url)).pathname;
const root = process.platform === "win32" && base.startsWith("/") ? base.slice(1).replace(/\//g, "\\") : base;

async function ok(name, fn) {
  try {
    await fn();
    console.log("[ok]", name);
  } catch (e) {
    console.error("[fail]", name, e);
    process.exitCode = 1;
  }
}

await ok("require games", () => {
  require(root + "games/go.js");
  require(root + "games/junqi.js");
  require(root + "games/xiangqi.js");
  require(root + "games/gomoku.js");
  require(root + "games/tictactoe.js");
});

await ok("xiangqi random play", () => {
  const xq = require(root + "games/xiangqi.js");
  const g = xq.createGame();
  for (let i = 0; i < 80; i++) {
    const m = xq.listLegalMoves(g);
    if (!m.length) break;
    const [fr, to] = m[Math.floor(Math.random() * m.length)];
    xq.tryMove(g, fr, to);
    if (xq.findKing(g.board, xq.RED) < 0 || xq.findKing(g.board, xq.BLACK) < 0) break;
  }
});

await ok("go passes and stone", () => {
  const w = require(root + "games/go.js");
  const g = w.createGame(9);
  w.tryPlay(g, 4, 4);
  w.pass(g);
  w.pass(g);
  if (!w.gameEndedByPass(g)) throw new Error("double pass");
});

await ok("junqi apply", () => {
  const j = require(root + "games/junqi.js");
  const g = j.createGame();
  j.applyMove(g, 7, 2, 6, 2);
  if (g.board[j.idx(6, 2, g.w)].side !== 1) throw new Error("move");
});

await ok("plugin index.js parse", () => {
  require(root + "index.js");
});

await ok("plugin junqi click flow", async () => {
  const Plugin = require(root + "index.js");
  const plugin = new Plugin({}, { getPluginConfig() { return {}; }, log() {} });
  await plugin.onInit();
  plugin.openGame("junqi");
  if (plugin.serializeState().kind !== "junqi") throw new Error("junqi not opened");
  const selected = plugin.handleClick("junqi", { r: 7, c: 0 });
  if (!/选中/.test(selected)) throw new Error(`select failed: ${selected}`);
  const hints = plugin.serializeState().hintMoves.map((x) => x.join(","));
  if (!hints.includes("6,0")) throw new Error("missing junqi move hint");
  const moved = plugin.handleClick("junqi", { r: 6, c: 0 });
  if (!/落子|结束|获胜/.test(moved)) throw new Error(`move failed: ${moved}`);
  const state = plugin.serializeState();
  if (state.kind !== "junqi" && state.kind !== "ended") throw new Error("unexpected state after move");
});

await ok("async ai scheduling closes loop (tictactoe)", async () => {
  const Plugin = require(root + "index.js");
  const plugin = new Plugin({}, { getPluginConfig() { return {}; }, log() {} });
  await plugin.onInit();
  plugin.openGame("tictactoe");
  const msg = plugin.handleClick("tictactoe", { idx: 4 });
  if (!/落子/.test(msg)) throw new Error(`click failed: ${msg}`);
  let st = plugin.serializeState();
  if (!st.aiThinking) throw new Error("aiThinking should be true right after user move");
  if (st.toolbar.canUndo || st.toolbar.canResign) throw new Error("toolbar should lock while thinking");
  await new Promise((r) => setTimeout(r, 80));
  st = plugin.serializeState();
  if (st.aiThinking) throw new Error("aiThinking should clear after AI move");
  const oCount = st.board.cells.filter((v) => v === 2).length;
  if (oCount !== 1) throw new Error(`AI should have placed one O, got ${oCount}`);
});

await ok("stale ai task discarded after restart", async () => {
  const Plugin = require(root + "index.js");
  const plugin = new Plugin({}, { getPluginConfig() { return {}; }, log() {} });
  await plugin.onInit();
  plugin.openGame("gomoku");
  plugin.handleClick("gomoku", { r: 7, c: 7 });
  plugin.restart();
  await new Promise((r) => setTimeout(r, 80));
  const st = plugin.serializeState();
  if (st.kind !== "gomoku") throw new Error("should be gomoku");
  const stones = st.board.cells.filter((v) => v !== 0).length;
  if (stones !== 0) throw new Error(`new game should be empty, got ${stones} stones`);
  if (st.aiThinking) throw new Error("new session should not be thinking");
});

await ok("llm mover retries illegal index then succeeds (xiangqi)", async () => {
  const { LlmMover } = require(root + "llm-mover.js");
  const xq = require(root + "games/xiangqi.js");
  const responses = [
    '我觉得编号 999 不错 {"move": 999, "say": "嘿"}',
    '```json\n{"move": 1, "say": "就这步！"}\n```',
  ];
  let calls = 0;
  const fakePlugin = {
    _cfg: { ai_move_mode: "llm", llm_play_max_retries: 2, llm_play_timeout_ms: 5000 },
    _aiMoveMode() { return "llm"; },
    _chatter: { getRoleSeed() { return "肥牛人设摘录"; } },
    context: { log() {}, async callLLM() { calls++; return responses.shift() || "{}"; } },
  };
  const mover = new LlmMover(fakePlugin);
  const g = xq.createGame();
  g.turn = xq.BLACK;
  const res = await mover.pickMove({ kind: "xiangqi", game: g });
  if (!res) throw new Error("mover should succeed after retry");
  if (calls !== 2) throw new Error(`expected 2 llm calls, got ${calls}`);
  const legal = xq.listLegalMoves(g).some(([f, t]) => f === res.move[0] && t === res.move[1]);
  if (!legal) throw new Error("returned move is not legal");
  if (res.say !== "就这步！") throw new Error(`say mismatch: ${res.say}`);
});

await ok("llm mover gives up on garbage -> null (gomoku)", async () => {
  const { LlmMover } = require(root + "llm-mover.js");
  const g = require(root + "games/gomoku.js").createGame(15);
  let calls = 0;
  const fakePlugin = {
    _cfg: { ai_move_mode: "llm", llm_play_max_retries: 2, llm_play_timeout_ms: 5000 },
    _aiMoveMode() { return "llm"; },
    _chatter: { getRoleSeed() { return ""; } },
    context: { log() {}, async callLLM() { calls++; return "我不知道该怎么走呢"; } },
  };
  const mover = new LlmMover(fakePlugin);
  const res = await mover.pickMove({ kind: "gomoku", game: g });
  if (res !== null) throw new Error("should give up and return null");
  if (calls !== 3) throw new Error(`expected 3 attempts (1+2 retries), got ${calls}`);
});

await ok("plugin llm mode end-to-end with spoken line (tictactoe)", async () => {
  const Plugin = require(root + "index.js");
  const spoken = [];
  const cfg = { ai_move_mode: "llm", llm_play_max_retries: 1, llm_play_timeout_ms: 5000 };
  const plugin = new Plugin({}, {
    getPluginConfig() { return cfg; },
    log() {},
    speakText(t) { spoken.push(t); },
    async callLLM() { return JSON.stringify({ move: 1, say: "亲自出手！" }); },
  });
  await plugin.onInit();
  plugin.openGame("tictactoe");
  plugin.handleClick("tictactoe", { idx: 4 });
  await new Promise((r) => setTimeout(r, 120));
  const st = plugin.serializeState();
  const oCount = st.board.cells.filter((v) => v === 2).length;
  if (oCount !== 1) throw new Error(`llm move not applied, O count = ${oCount}`);
  if (st.board.cells[0] !== 2) throw new Error("llm should pick option 1 = cell 0");
  if (!spoken.length || spoken[0] !== "亲自出手！") throw new Error(`say not spoken: ${JSON.stringify(spoken)}`);
  if (st.aiThinking) throw new Error("aiThinking should clear after llm move");
  if (st.config.ai_move_mode !== "llm") throw new Error("state should expose ai_move_mode");
});

await ok("plugin llm mode falls back to engine on failure", async () => {
  const Plugin = require(root + "index.js");
  const cfg = { ai_move_mode: "llm", llm_play_max_retries: 0, llm_play_timeout_ms: 5000 };
  const plugin = new Plugin({}, {
    getPluginConfig() { return cfg; },
    log() {},
    speakText() {},
    async callLLM() { throw new Error("gateway down"); },
  });
  await plugin.onInit();
  plugin.openGame("tictactoe");
  plugin.handleClick("tictactoe", { idx: 4 });
  await new Promise((r) => setTimeout(r, 120));
  const st = plugin.serializeState();
  const oCount = st.board.cells.filter((v) => v === 2).length;
  if (oCount !== 1) throw new Error(`engine fallback should still move, O count = ${oCount}`);
  if (st.aiThinking) throw new Error("aiThinking should clear after fallback move");
});

await ok("tictactoe winning line", () => {
  const tt = require(root + "games/tictactoe.js");
  const b = [1, 1, 1, 0, 2, 0, 0, 2, 0];
  const line = tt.winningLineIndices(b);
  if (!line || line.length !== 3) throw new Error("line");
});

await ok("gomoku winning line coords", () => {
  const g = require(root + "games/gomoku.js");
  const n = 9;
  const board = new Array(n * n).fill(0);
  for (let c = 0; c < 5; c++) board[g.idx(4, c, n)] = 1;
  const wl = g.winningLine(board, n, 4, 4, 1);
  if (!wl || wl.length < 5) throw new Error("wl");
});

await ok("xiangqi isInCheck opening", () => {
  const xq = require(root + "games/xiangqi.js");
  const g = xq.createGame();
  if (xq.RED !== 1 || xq.BLACK !== -1) throw new Error("side constants");
  if (xq.isInCheck(g.board, xq.RED) !== false) throw new Error("opening should not be check");
  if (xq.terminal(g) !== null) throw new Error("opening should not be terminal");
});

await ok("web server smoke", async () => {
  const { startServer, stopServer } = require(root + "server.js");
  const plugin = {
    context: { log() {} },
    serializeState() {
      return { kind: "idle", prevKind: null, round: 0, mood: null, toolbar: { canUndo: false, canPass: false, canResign: false }, board: null, sel: null, ended: false, outcome: null, resigned: false, winLine: null, boardText: "", config: {} };
    },
    openGame() { return "ok"; },
    handleClick() { return "ok"; },
    pass() { return "ok"; },
    undo() { return "ok"; },
    restart() { return "ok"; },
    resign() { return "ok"; },
    close() { return "ok"; },
  };
  const server = startServer(plugin, { host: "127.0.0.1", port: 0 });
  await server.ready;
  if (!server.started) throw new Error(server.error?.message || "server failed");
  const res = await fetch(`http://${server.host}:${server.port}/api/state`);
  if (!res.ok) throw new Error(`state request failed: ${res.status}`);
  await stopServer();
});

await ok("xiangqi fen round-trip matches pikafish doc", () => {
  const xq = require(root + "games/xiangqi.js");
  const { fenFromBoard, uciToInternalMove } = require(root + "xiangqi-fen.js");
  const g = xq.createGame();
  const fen = fenFromBoard(g.board, g.turn);
  const expected = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";
  if (fen !== expected) throw new Error(`fen mismatch:\n  got ${fen}\n  want ${expected}`);
  const m = uciToInternalMove("h2e2");
  if (!m || m.from !== 70 || m.to !== 67) throw new Error(`uci h2e2 -> ${JSON.stringify(m)} (want from=70 to=67)`);
});

const fs = require("fs");
const enginePath = root + "bin/" + (process.platform === "win32" ? "pikafish.exe" : "pikafish");
const nnuePath = root + "bin/pikafish.nnue";
if (fs.existsSync(enginePath) && fs.existsSync(nnuePath)) {
  await ok("pikafish engine handshake + bestmove (opening)", async () => {
    const { PikafishEngine } = require(root + "pikafish-engine.js");
    const engine = new PikafishEngine({
      binPath: enginePath,
      timeoutMs: 15000,
      initTimeoutMs: 10000,
      logger: { log() {} },
    });
    const ready = await engine.init();
    if (!ready) {
      engine.stop();
      throw new Error(engine.lastError ? engine.lastError.message : "uciok/readyok timeout");
    }
    const move = await engine.bestMove("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1", 6);
    engine.stop();
    if (!move || typeof move.from !== "number" || typeof move.to !== "number") {
      throw new Error(`expected bestmove for opening, got ${JSON.stringify(move)}`);
    }
  });
} else {
  console.log("[skip] pikafish engine handshake (bin/pikafish[.exe] or bin/pikafish.nnue missing)");
}
