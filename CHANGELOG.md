# 更新日志

本插件遵循语义化版本（SemVer）：`MAJOR.MINOR.PATCH`。

## v0.5.0 — 2026-01

本次大更新围绕**棋力升级**与**过程解说**两条主线，并修复了一些早期版本的体验缺陷。

### 新增

#### 中国象棋接 pikafish 引擎
- 通过 `child_process` 子进程封装 [pikafish](https://github.com/official-pikafish/Pikafish)（Stockfish 中国象棋分支），棋力可达**职业级**
- 完整 UCI 协议握手 + FEN 双向转换 + 超时回退
- 字节级匹配 pikafish 文档示例的 FEN 编码（`rnbakabnr/9/1c5c1/.../RNBAKABNR w - - 0 1`）
- 引擎不可用/超时/失败时**自动静默降级**到内置 1 步前瞻 AI，不影响下子
- 配置：`xiangqi_engine`、`xiangqi_engine_path`、`xiangqi_engine_depth`、`xiangqi_engine_timeout_ms`
- 详细安装步骤见 README「中国象棋接 pikafish 引擎」章节
- 实测 i9-14900K + BMI2 版本：depth 12 中位耗时 9ms / 最大 38ms

#### 五子棋/军棋 alpha-beta 升级
- **五子棋**：tier 2 用 2 层搜索 top12，tier 3 用 3 层 + top10 + cellHeuristic 排序剪枝；能识别"双活三"必胜组合、能堵活四、算 2-3 步攻防转换；从原"业余初学者"提升到"业余中段"
- **军棋**：tier 2 用 2 层 top16，tier 3 用 4 层 + 渐宽搜索 top12 + 棋子价值表（司令 100/旅长 50/工兵 18 含挖雷加成/旗 1000）；会算"换子是不是赚"、避免送大子
- 内置 5 长度滑窗静态评估器，进攻/防御权重略偏防御，避免被对手活四逼死
- 围棋未升级（业余强引擎需要 MCTS + 神经网络，本期成本超出范围）；井字棋本就是 9 层 minimax 完美算法，无需升级

#### 棋局过程 LLM 解说（DeepSeek 旁路）
- 棋局进行中，关键事件（吃子、将军、活三/活四、提子等）触发肥牛主动开口
- 插件直接调用 DeepSeek（或其它 OpenAI chat/completions 兼容 endpoint）生成 1-2 句口语化短台词
- **完全旁路主 sendToLLM**：不走截图、不抢主 LLM 单飞锁，响应延迟仅一次 API + TTS
- **不进 voiceChat.messages 持久历史**，但 60 秒内的解说会通过 onLLMRequest 钩子临时注入主 LLM 的 system，玩家接茬时主 LLM 不会发懵
- 设计借鉴 [N.E.K.O sts2_autoplay/neko_reporting](https://github.com/Project-N-E-K-O/N.E.K.O/tree/main/plugin/plugins/sts2_autoplay)：observed/spoken 三态分离 + critical 事件突破节流 + 短期窗口注入
- **反敷衍策略**：prompt 内置敷衍套话黑名单 + 强制细节锚定 + frequency_penalty 0.6
- 配置：所有 `chess_chat_*` 字段（17 项）；详见 README「棋局过程 LLM 解说」章节
- API Key 留空 = 自动关闭过程解说，行为完全等同旧版

#### 棋力 tier 与说话心情解耦
- 新增 `chess_chat_difficulty_override`：`-1` 跟随 mood-chat 心情（默认行为）；`0~3` 强制锁定棋力档位
- 解决"mood-chat 默认初始心情 80 = 棋力只在 tier 1 偏弱"的体感问题
- 可以做到"心情很好但下棋一招致命"或"心情很差但下棋温柔"的解耦组合

#### 中国象棋走子轨迹（红/黑双色）
- 玩家/AI 走完后，棋盘同时高亮**起点**（虚线圆环）和**终点**（粉色或深色高亮 + 弹跳动画）
- 起→止之间叠加 SVG 流光虚线箭头
- 红方走的画粉色，黑方（AI）走的画深色——一眼就能看清"AI 是从哪走到哪"
- 解决了 0.4.0 版本"AI 走完只标终点、玩家不知从何走来"的盲区

#### 异步 AI 派发 + 棋盘锁定
- 中国象棋玩家走子立即 HTTP 响应（前端马上看到自己的子落上）
- AI 走子异步进行，pikafish 计算期间通过 SSE 广播 `aiThinking=true`
- 前端棋盘进入「思考中」状态：所有按钮 `disabled` + 半透明 + cursor not-allowed + 全屏遮罩 `🤔 肥牛思考中…`
- AI 走完自动解锁，玩家可以继续下子
- 解决了 0.4.0「AI 还没走完玩家又能继续点棋盘」的并发歧义

### 改动

#### 修复
- 修复事件文本视角 bug：肥牛走子时 actor 从 `"你"` 改成 `"我"`，避免发给 LLM 的 prompt 里"你刚刚形成活三"被模型当主人的事件，导致解说全是无意义套话
- 修复 `is-last` CSS 类在象棋上完全没有专属样式的问题（之前只是空类名）
- 修复 `injection_user_win`/`injection_feiniu_win`/`injection_feiniu_resign_win` 三条 prompt 容易被主 LLM 误解为"让主人接受装置"，新版加强角色边界硬性禁令、明确第一/第二人称、给出正面示范台词

#### 默认值升级
- `chess_chat_request_timeout_ms`: 4000 → 12000（兼容国内中转网关首字延迟）
- `chess_chat_temperature`: 0.85 → 1.0（让模型更有发挥）
- `chess_chat_max_tokens`: 80 → 100
- `chess_chat_role_seed_max_chars`: 200 → 280

### 自测

selftest 从 9 项扩展到 13 项，新增：
- `xiangqi fen round-trip matches pikafish doc`
- `pikafish engine handshake + bestmove (opening)`（条件触发：仅当 `bin/pikafish[.exe]` 与 `bin/pikafish.nnue` 同时存在时执行）

### 文件变化

新增：
- `chess-chatter.js`：DeepSeek 解说器（节流三态分离 + 滑动窗口 + 并发锁 + 反敷衍 prompt）
- `pikafish-engine.js`：pikafish 子进程 UCI 包装器
- `xiangqi-fen.js`：内部 board ↔ FEN/UCI 双向转换
- `CHANGELOG.md`：本文件

变更：
- `index.js`：6 个新 `_diffXxx` 事件识别 + `_emitMoveEvent` + `_difficultyTier` + `_xiangqiEngineMove` 异步派发 + 5 个 click handler 末尾接事件 + onLLMRequest 末尾追加近 60 秒解说窗口 + 异步 `_scheduleXiangqiAi`
- `games/gomoku.js`：新增 `evaluateBoard` + `alphaBeta` + 候选剪枝；`bestMove` 按 tier 路由到不同搜索深度
- `games/junqi.js`：新增 `PIECE_VALUE` 棋子价值表 + `evaluateBoard` + `alphaBeta`；`aiMove` 按 tier 路由
- `web/client.js`：象棋走子起→止双端高亮 + SVG 轨迹箭头；`aiThinking` 状态下棋盘锁定
- `web/styles.css`：起点虚线圈圈样式 + 终点弹跳高亮 + 红/黑两色轨迹线 + 思考中遮罩
- `plugin_config.json`：新增 21 个配置项（17 个 `chess_chat_*` + 4 个 `xiangqi_engine_*`）；3 条惩罚 prompt 加强"装置仅属于肥牛、永远不在主人身上"的硬性边界
- `run-selftest.mjs`：新增 2 项端到端测试

## v0.4.0

- 从 Electron 主窗浮层迁移到内置 HTTP 服务 + 浏览器网页版
- 井字棋/五子棋悔棋、终局胜负线高亮
- 象棋默认按交叉点渲染，选中红方棋子后显示合法目标点提示
- 围棋练习规则（打劫占位、双方连续停两手作和）；军棋明棋简化规则
- 关闭页面不销毁会话，重新打开继续同一局
