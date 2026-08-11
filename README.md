# 肥牛棋盘 `feiniu-board-game`

> **v0.5 大更新（2026-01）**：中国象棋接入 [pikafish](https://github.com/official-pikafish/Pikafish) 引擎可达**职业级**棋力；五子棋/军棋升级 **alpha-beta 多层搜索**；新增**棋局过程 LLM 解说**（旁路主对话流，1-2 句口语化短台词直发 TTS）；象棋落子加**起→止双端高亮 + 轨迹箭头**。

适用于 my-neuro / Live-2D 生态的**社区插件**：在本地浏览器中与 AI 对手对弈五种棋类（井字棋、五子棋、围棋练习规则、中国象棋、军棋明棋简化），并通过 **mood-chat** 心情分调节棋力；对局中、局后可向 LLM 注入盘面文本与可配置的「局后限时状态」文案。

## 功能概览

| 项目  | 说明                                                                              |
| --- | ------------------------------------------------------------------------------- |
| 棋种  | 井字棋、五子棋、围棋（练习规则）、中国象棋、军棋（明棋简化）                                                  |
| 界面  | 内置 HTTP 服务 + 静态网页（默认 `http://127.0.0.1:22335`）                                  |
| 依赖  | **必须**启用 `built-in/mood-chat`（心情影响棋力；局后可 `adjustMood`）                          |
| LLM | 进行中/终局可注入盘面概要；局后可按配置注入限时 system 块；过程中可触发 DeepSeek 等纯文本模型生成短解说直送 TTS；支持安全词中止 |
| 棋力  | 五子棋/军棋手写 alpha-beta；中国象棋可接 pikafish 引擎；棋力 tier 与说话心情解耦                          |

## 安装

1. 将本仓库内容克隆或解压到：`你的项目/live-2d/plugins/community/feiniu-board-game/`
2. 在插件管理器中启用 **feiniu-board-game**，并确保 **mood-chat** 已启用
3. 按需编辑 `plugin_config.json`（端口、局后文案、解说 API、棋力难度等）。**仓库内附带的是通用示例配置**；若你有高度个人化的提示词或 API Key，请仅保存在本机或 `plugin_config.local.json`，勿提交到公开仓库

## 工具（Tools）

* `feiniu_open_board_game`：参数 `game` ∈ `tictactoe` | `gomoku` | `go` | `xiangqi` | `junqi`
* `feiniu_close_board_game`：关闭当前对局
* `feiniu_board_clear_effect`：清除局后限时注入

---

## 棋力档位说明（v0.5 新）

棋力 tier 0~3 默认跟随 mood-chat 心情：

| 心情分数 | tier | 五子棋 | 围棋 | 中国象棋（builtin）| 中国象棋（pikafish）| 军棋 |
|---|---|---|---|---|---|---|
| ≥ 90 | 0 | 1 步启发 + 40% 随机 | 简单近邻评分 | 1 步评分 | 引擎 depth 4 | 1 步评分 |
| ≥ 80 | 1 | 1 步启发 + 15% 随机 | 同上 | 同上 | 引擎 depth 6 | 同上 |
| ≥ 60 | 2 | **alpha-beta 2 层 + top12** | 同上 | 同上 | 引擎 depth 9 | **alpha-beta 2 层 + top16** |
| < 60 | 3 | **alpha-beta 3 层 + top10**（业余中段，能算双活三）| 同上 | 同上 | **引擎 depth 12（职业级）** | **alpha-beta 4 层 + 渐宽**（业余中段）|

**关键提示**：mood-chat 默认初始心情 80，所以默认棋力实际只在 tier 1（depth 6）。想立刻锁定最强档：

- **方法 1**：把 `chess_chat_difficulty_override` 设为 `3`（推荐；棋力锁定 tier 3，但说话心情仍跟随 mood-chat）
- **方法 2**：仅针对象棋固定深度——把 `xiangqi_engine_depth` 设为想要的深度（例如 `12`）

棋力和说话心情**解耦**——可以做到"心情很好但下棋一招致命"或反之。

围棋暂未升级棋力（业余强引擎需要 MCTS + 神经网络，集成成本不在本期范围）。井字棋本就是 9 层 minimax 完美算法，无需升级。

---

## 中国象棋接 pikafish 引擎（可选，但强烈推荐）

pikafish 是 [Stockfish](https://github.com/official-stockfish/Stockfish) 的中国象棋分支，棋力**职业级**。本插件已经写好了 UCI 协议封装、FEN 双向转换、超时回退兜底，只需要你把二进制 + 权重放对位置即可。

### 1. 下载

去 [official-pikafish/Pikafish releases](https://github.com/official-pikafish/Pikafish/releases) 下载最新版（写本文档时是 `Pikafish-2026-01-02.7z`，约 53 MB）。包内含：

- `Windows/pikafish-{avx2|avx512|bmi2|...}.exe`：选与你 CPU 指令集匹配的版本
  - **不知道选哪个？** Intel 4 代之后 → `bmi2`；AMD Zen3 之后 → `bmi2`；老 CPU → `avx2` 或 `sse41-popcnt`
- `Linux/pikafish-{avx2|bmi2|...}`：按 `uname -m` 选
- `MacOS/pikafish-apple-silicon`：M 系列芯片 Mac
- `pikafish.nnue`：神经网络权重（约 53 MB，**必须**）

### 2. 放置

在插件目录下建一个 `bin/` 子目录，把二进制和权重一起放进去：

```
plugins/community/feiniu-board-game/
├── bin/
│   ├── pikafish.exe          # Windows 平台需重命名为 pikafish.exe
│   ├── pikafish              # macOS / Linux 平台需重命名为 pikafish（无后缀）
│   └── pikafish.nnue         # 权重文件，必须与二进制同目录
├── index.js
└── ...
```

或者放任意位置，然后在配置里填绝对路径：

```json
"xiangqi_engine_path": { "value": "D:/tools/pikafish/pikafish.exe" }
```

> `bin/` 目录已被 `.gitignore` 排除，不会误提交。

### 3. 配置

`plugin_config.json` 中相关字段：

| 字段 | 默认 | 说明 |
|---|---|---|
| `xiangqi_engine` | `auto` | `auto`=有就用、没有自动回退内置；`pikafish`=强制使用；`builtin`/`off`=只用内置 |
| `xiangqi_engine_path` | （留空） | 留空走 `bin/pikafish[.exe]`；填绝对/相对路径覆盖 |
| `xiangqi_engine_depth` | `0` | `0` 时按棋力 tier 自动 4/6/9/12；填正整数则强制覆盖（推荐 12） |
| `xiangqi_engine_timeout_ms` | `8000` | 单步搜索上限；超时则该步回退内置，不影响下子 |

### 4. 验证

启动主程序，打开象棋对局走一步，终端日志：

- ✅ `pikafish 引擎已就绪：...` = 集成成功
- ⚠️ `pikafish 引擎不可用：...` = 路径错或权重缺失，已自动回退到内置 1 步前瞻

### 实测耗时（Intel i9-14900K, BMI2 版）

| 深度 | 中位耗时 | 最大耗时 |
|---|---|---|
| 6 | 1ms | 3ms |
| 9 | 2ms | 9ms |
| **12** | **9ms** | **38ms** |

普通家用 CPU 也能 1 秒内出招，体感不会卡顿。

---

## 棋局过程 LLM 解说（v0.5 新）

棋局进行中，肥牛会在**关键事件**触发时主动开口（吃子、将军、活三/活四、围棋提子等），由插件**直接调用 DeepSeek**（或其它 OpenAI chat/completions 兼容 endpoint）生成 1-2 句口语化短台词，**绕过主 sendToLLM、绕过截图、绕过主 LLM 单飞锁**——响应延迟仅一次 API + TTS。


### 事件分级

- **L0 不说**：开局首手、连续低价值落子
- **L1 概率说**：普通落子，默认 45% 概率，且要过 `chess_chat_min_interval_ms`（默认 8 秒）
- **L2 必说**：吃子（围棋提子、象棋吃子、军棋碰子）、活三、眠三 — 间隔缩短为 `chess_chat_capture_min_interval_ms`（默认 4 秒）
- **L3 强制说**：将军、活四/连四、围棋一次提 ≥ 4 子 — 突破最小间隔
- **终局**仍由原有 `_fireEndgameChat` 调用主 LLM 做完整复盘，不在本旁路

### 必填配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `chess_chat_enabled` | `true` | 总开关 |
| `chess_chat_deepseek_api_url` | `https://api.deepseek.com/v1/chat/completions` | OpenAI 兼容 endpoint |
| `chess_chat_deepseek_api_key` | （留空） | **必填**。留空 = 自动关闭过程解说，回退到旧版只在终局对话的行为 |
| `chess_chat_deepseek_model` | `deepseek-chat` | 模型名错了会 HTTP 404 → 静默降级 |

DeepSeek API Key 可从 [DeepSeek 开放平台](https://platform.deepseek.com/) 免费申请。

### 调优旋钮

| 字段 | 默认 | 用途 |
|---|---|---|
| `chess_chat_min_interval_ms` / `chess_chat_capture_min_interval_ms` | 8000 / 4000 | 调节话痨程度 |
| `chess_chat_normal_move_prob` | 0.45 | 普通落子说话概率 |
| `chess_chat_max_chars` / `chess_chat_max_tokens` | 30 / 100 | 单句长度上限 |
| `chess_chat_temperature` | 1.0 | 0.8 更稳；1.1 更跳 |
| `chess_chat_frequency_penalty` / `chess_chat_presence_penalty` | 0.6 / 0.4 | 防"哼/喵/客套"刷屏 |
| `chess_chat_request_timeout_ms` | 12000 | 超时静默降级 |
| `chess_chat_role_seed_max_chars` | 280 | 从主程序角色基底注入到 prompt 的字数 |
| `chess_chat_style_hint` | （留空） | 个性化口吻补充指令；留空即走主程序人设默认 |
| `chess_chat_recent_window_max` / `chess_chat_recent_window_ttl_ms` | 5 / 60000 | 主 LLM 临时可见窗口大小/存活时长 |
| `chess_chat_inject_recent_to_main_llm` | `true` | 关闭即"严格不进上下文"模式 |

### 反敷衍策略（默认开启）

为了避免 LLM 输出"哼，主人厉害"、"嗯～看来你不简单"等万能模板，prompt 内置了：

- **黑名单**：明确列出禁用的套话起手
- **强制细节锚定**：必须引用本次具体事件（吃掉的子名、刚形成的棋型、对方窘迫等）
- **防复读**：`frequency_penalty` 0.6 + 把最近 3 句旧解说原样列在 prompt 里提醒不要重复

如果觉得不够性格，最有效的是 **填 `chess_chat_style_hint`**——一两句话定义口癖、痛点、关系细节，效果立竿见影。

### 关闭过程解说

`chess_chat_enabled` 设为 `false`，或直接清空 `chess_chat_deepseek_api_key`。

---

## 配置说明（`plugin_config.json` 主要键位）

* **Web UI**：`webui_host`、`webui_port`、`auto_open_browser`
* **局后注入**：`effect_duration_seconds`、`injection_prefix`、`injection_user_win`、`injection_feiniu_win`、`injection_feiniu_resign_win`（键名沿用历史命名，指代「AI 对手方」）
* **安全**：`safe_keywords`（命中后清除惩罚类注入并追加退出说明）
* **心情**：`enable_adjust_mood`、`mood_delta_user_win`、`mood_delta_feiniu_win`
* **规则**：`gomoku_size`、`go_board_size`、`enable_undo`、`xiangqi_intersection_style`
* **对话**：`enable_board_snapshot_injection`、`enable_endgame_auto_chat`、`endgame_chat_prompt`
* **过程解说**（v0.5 新）：所有 `chess_chat_*` 字段
* **象棋引擎**（v0.5 新）：所有 `xiangqi_engine_*` 字段

---

## 自测

在**已放入 my-neuro 的 `live-2d/plugins/community/feiniu-board-game` 目录之后**（以便解析宿主里的 `plugin-base.js` 与 `express` 等依赖），于该插件根目录执行：

```bash
node run-selftest.mjs
```

将检查各棋种逻辑、主入口加载、本地 HTTP 服务能否正常响应、FEN 与 UCI 双向转换、以及（若 `bin/pikafish[.exe]` 与 `bin/pikafish.nnue` 存在）pikafish 引擎握手与 bestmove 求解。若单独克隆本仓库到空目录直接跑自测，会因缺少宿主依赖而失败，属正常现象。

---

## 想邀请你，做这只小牛的"云饲养员"

做这个桌宠的初衷，其实是因为自己一个人工作学习的时候，总觉得屏幕里空落落的。看到大家都在使用，我就觉得熬夜写代码、调教 AI 的日子都亮闪闪的。

不过，肥牛现在还在长身体（其实是我想给它做更多有趣的插件），养一只数字小牛其实也挺"费草"的哈哈。

如果你在这只小肥牛这里获得过哪怕一秒钟的治愈，或者觉得它算个合格的桌面搭子，要不要考虑成为它的"云饲养员"呀？

你的每一次充电，都不是在打赏我，而是在给这只肥牛注入一点点魔法值。让它能变得更聪明、更通人性、能听懂你更多的碎碎念。

不用有压力哦！你愿意打开它，就是对我最大的鼓励啦。如果刚好有余力，就请肥牛喝瓶快乐水叭，它会记住你的味道的！

爱发电 <https://ifdian.net/a/0923A>

---

## 许可证

本项目采用 **CC BY-NC-ND 4.0** 许可证。

`pikafish` 引擎遵循 GPL-3.0，本插件通过子进程方式调用，不与本插件的代码合并；用户需自行下载 pikafish 并遵守其协议。
