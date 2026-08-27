# 肥牛棋盘 `feiniu-board-game`

与肥牛在浏览器里对弈：井字棋、五子棋、围棋（练习规则）、中国象棋、军棋（明棋简化）。棋力随 **mood-chat** 心情分变化；对局与局后可向 LLM 注入盘面与限时状态文案。当前版本已从 Electron 主窗浮层迁移到内置 HTTP 服务 + 浏览器网页版。

棋局过程中肥牛会**主动开口解说**：吃子、将军、活三/活四等关键事件触发，由插件直接调用 DeepSeek（或其它兼容 OpenAI chat/completions 的文本快模型）生成 1–2 句短台词，绕过主 LLM 与截图判断，响应延迟仅一次 API + TTS。

## 设计时参考的开源方向（非直接依赖）

| 类型 | 代表仓库 | 借鉴点 |
|------|----------|--------|
| 桌面/网页棋类 UI | [takaneichinose/tic-tac-toe-electron](https://github.com/takaneichinose/tic-tac-toe-electron)、[e96031413/Gomoku](https://github.com/e96031413/Gomoku) | 难度/手感分级思路、**悔棋**、**胜负连线高亮** |
| 象棋逻辑与体验 | [ryoi/xiangqi](https://github.com/ryoi/xiangqi)、[tjlstar/Chinese-Chess](https://github.com/tjlstar/Chinese-Chess) | **将军检测**、困毙与将杀区分（本插件已实现困毙判和） |
| LLM 棋类状态 | [atomic14/ChessGPT](https://github.com/atomic14/ChessGPT)、[maxim-saplin/llm_chess](https://github.com/maxim-saplin/llm_chess) | 强调**可靠盘面摘要**、避免模型编造落子（本插件以文本概要 + 系统注入实现） |

## 依赖

- 必须启用 `built-in/mood-chat`（心情分影响棋力；局后可 `adjustMood`）。

## 工具

- `feiniu_open_board_game`：`game` = `tictactoe` | `gomoku` | `go` | `xiangqi` | `junqi`
- `feiniu_close_board_game`：关闭对局
- `feiniu_board_clear_effect`：清除局后限时 system 注入

## 功能摘要（v0.5）

- 浏览器 UI 通过本地 HTTP 服务访问，地址默认是 `http://127.0.0.1:22335`。
- AI 调用 `feiniu_open_board_game` 时会先打开/切换棋局，再尝试用系统默认浏览器打开对应页面。
- **肥牛走子两种模式**（`ai_move_mode`）：`engine` 引擎/内置算法代下（默认）；`llm` 调用 LLM 让肥牛亲自决定每一步，详见下方「LLM 亲自下棋模式」。
- **全棋种异步走子**：五个棋种的肥牛走子统一走异步调度，思考期间棋盘锁定并显示"肥牛思考中"动画（军棋高难度深搜、pikafish、LLM 调用都不再阻塞页面响应）。
- 井字棋 / 五子棋：**悔棋**（撤销你与肥牛各一手，可关）、终局 **胜负线高亮**，五子棋终局还会画出贯穿五连的**胜利连线**。
- 象棋：默认按 **交叉点** 渲染；`xiangqi_intersection_style` 可切换，选中红方棋子后会显示合法目标点提示。
- 五子棋 / 围棋：交叉点落子、最近一手标记、悬停落子预览、木纹棋盘和落子动画。
- 围棋：练习规则（打劫占位、双方连续停两手作和）；军棋：明棋简化规则，地雷/军旗有专属配色。
- 终局有胜负横幅；页面顶部徽章实时显示走子模式与肥牛心情。
- 关闭页面不会销毁会话，重新打开可继续同一局。

## LLM 亲自下棋模式（v0.5 新增）

把 `ai_move_mode` 设为 `llm` 后，肥牛这一方的每一步棋不再由 pikafish/内置算法决定，而是由插件把**盘面文本 + 合法走法**发给一个 LLM，让"肥牛本人"读盘选步：

- 井字棋 / 象棋 / 军棋：给 LLM 一份**编号走法清单**（含棋子名与坐标），它回编号。
- 五子棋 / 围棋：空点太多不列清单，LLM 直接回 `"行,列"` 坐标（围棋还可以回 `"pass"` 停一手）。
- 每步 LLM 还可附带一句台词（`llm_play_speak_line`，默认开），直接走 TTS 朗读，并与过程解说自动去重（一步棋不会说两次话）。
- 主对话注入文案会同步变化：肥牛"知道"是自己在亲自下棋，不会再自称由引擎代下。

### 可靠性设计（不会卡死）

1. LLM 输出解析失败或走法非法 → 把错误原因发回去重试（`llm_play_max_retries`，默认 2 次）。
2. 重试耗尽 / 请求超时（`llm_play_timeout_ms`，默认 20 秒）→ **该手自动回退引擎/内置算法**，棋局继续。
3. 连续 3 手回退会打一条明显 warn，提醒检查提供商/模型配置。

### 配置

| 键 | 默认 | 说明 |
|---|---|---|
| `ai_move_mode` | `engine` | `engine`=引擎代下；`llm`=LLM 亲自下 |
| `llm_play_provider_id` | 空 | 走子用的提供商；留空复用 `chess_chat_provider_id`；都空用主对话模型 |
| `llm_play_model_id` | 空 | 留空用提供商默认模型 |
| `llm_play_timeout_ms` | 20000 | 单步请求超时 |
| `llm_play_max_retries` | 2 | 解析失败/非法走法的重试次数 |
| `llm_play_speak_line` | true | 走子附带一句台词（TTS） |

### 注意

- **棋力**：LLM 下棋普遍偏弱且偏慢（每步一次 API 调用，约 2~15 秒），定位是"拟人陪玩"；想要强棋力请用 `engine` 模式。`chess_chat_difficulty_override` 在 llm 模式下只影响回退手的引擎强度。
- **token 成本**：每步一次调用，象棋单步 prompt 约 1~2K token；围棋 19 路盘面文本较大，建议 llm 模式配 9/13 路。
- 建议选一个**快、便宜、听话**的模型（能稳定输出 JSON 即可）。

## 配置

见 `plugin_config.json`：**走子模式（engine/llm）及 LLM 走子提供商/超时/重试/台词**、局后注入、安全词、心情增量、五子棋/围棋边长、Web UI 端口、是否自动打开浏览器、象棋交叉点渲染、是否注入盘面概要、终局自动对话、**是否启用悔棋** 等。

默认浏览器地址：`http://127.0.0.1:22335/?game=tictactoe`

## 过程解说（DeepSeek 旁路）

与终局对话不同，**过程解说**只在棋局进行中触发，旁路完全不走主 sendToLLM、不触发截图、不抢主 LLM 单飞锁。设计借鉴自 [N.E.K.O sts2_autoplay](https://github.com/Project-N-E-K-O/N.E.K.O/tree/main/plugin/plugins/sts2_autoplay) 的 `neko_reporting`：observed/spoken 三态分离 + critical 事件突破节流 + 短期窗口供主 LLM 临时可见。

### 事件分级

- **L0 不说**：开局首手、连续低价值落子
- **L1 概率说**：普通落子，默认 45% 概率，且要过 `chess_chat_min_interval_ms`（默认 8 秒）
- **L2 必说**：吃子（围棋提子、象棋吃子、军棋碰子）、活三、眠三 — 间隔缩短为 `chess_chat_capture_min_interval_ms`（默认 4 秒）
- **L3 强制说**：将军、活四/连四、围棋一次提 ≥4 子 — 突破最小间隔
- **终局**仍由原有 `_fireEndgameChat` 调用主 LLM 做完整复盘，不在本旁路

### 上下文策略（默认 B）

解说由 `context.speakText` 直接送 TTS+字幕，**不写入 `voiceChat.messages` 持久历史**。但会在内存维护一个 5 条 / 60 秒的滚动窗口，由 `onLLMRequest` 钩子在玩家说话时把窗口临时附加到 system 末尾，让主 LLM 接茬时不发懵；钩子结束自动消失，长期记忆 / MemOS / 对话存档都不受影响。

如想严格模式（窗口都不注入），把 `chess_chat_inject_recent_to_main_llm` 设为 `false`。

### 必填配置

- `chess_chat_deepseek_api_key`：必填。**留空 = 自动关闭过程解说**，行为完全等同于旧版（仅终局对话走主 LLM）
- `chess_chat_deepseek_api_url`：默认 `https://api.deepseek.com/v1/chat/completions`，可换其他 OpenAI 兼容 endpoint
- `chess_chat_deepseek_model`：默认 `deepseek-chat`

DeepSeek API Key 可从 [DeepSeek 开放平台](https://platform.deepseek.com/) 免费申请。

### 调优旋钮

- `chess_chat_min_interval_ms` / `chess_chat_capture_min_interval_ms`：调节话痨程度
- `chess_chat_normal_move_prob`：普通落子说话概率
- `chess_chat_max_chars` / `chess_chat_max_tokens`：单句长度上限（默认 30 字 / 100 tokens）
- `chess_chat_temperature`：默认 1.0；觉得太跳就降到 0.8，觉得太死板就升到 1.1
- `chess_chat_frequency_penalty` / `chess_chat_presence_penalty`：防"哼/喵/主人厉害"刷屏；默认 0.6 / 0.4
- `chess_chat_request_timeout_ms`：DeepSeek 单次请求超时，超时静默降级、不影响下子
- `chess_chat_role_seed_max_chars`：从主程序角色基底注入到 prompt 的字数（保持人设一致）
- `chess_chat_style_hint`：留空即默认人设；填一段补充指令可以个性化口吻，例如 `"喜欢用'啧'起句、爱拿主人发型开玩笑、绝不主动认输"`，会原样塞进 system prompt 的角色立场后面

### 觉得说话太敷衍/形式化？

我们的反敷衍策略默认已开启：

- 黑名单：禁用 "哼，主人厉害"、"嗯～看来你不简单"、"有点意思"、"这局有得打"、"我可不会客气" 等万能模板
- 强制细节锚定：必须引用本次具体事件（吃掉的子名、刚形成的棋型、对方窘迫等）
- 防复读：传 `frequency_penalty=0.6` 给 DeepSeek + 把最近 3 句旧解说原样列在 prompt 里

如果还是觉得不够性格，最有效的调整是 **填 `chess_chat_style_hint`**——一两句话定义你想要的口癖、痛点、关系细节，效果立竿见影。

### 棋力难度调节

棋力 tier 0~3 默认跟随 mood-chat 心情：心情 ≥90 → 0（最弱）/ ≥80 → 1 / ≥60 → 2 / <60 → 3（最强）。所以 mood-chat 默认初始心情 80 时棋力其实只在 1 档，会感觉偏简单。

想直接锁定难度，把 `chess_chat_difficulty_override` 设成 `0/1/2/3`（棋力 tier 与说话心情 tier 解耦）：

| Tier | 五子棋 | 围棋 | 中国象棋（builtin）| 中国象棋（pikafish）| 军棋 |
|---|---|---|---|---|---|
| 0 | 1 步启发 + 40% 随机 | 简单近邻评分 | 1 步评分 | 引擎深度 4 | 1 步评分 |
| 1 | 1 步启发 + 15% 随机 | 同上 | 同上 | 深度 6 | 同上 |
| 2 | **alpha-beta 2 层 + top12** | 同上 | 同上 | 深度 9 | **alpha-beta 2 层** |
| 3 | **alpha-beta 3 层 + top10**（业余中段，能算双活三）| 同上 | 同上 | **深度 12（职业级）** | **alpha-beta 4 层 + 渐宽**（业余中段）|

棋力和说话心情是解耦的——你可以在 mood 开心时把棋力锁到 3，让肥牛"心情很好但下棋很狠"。

围棋仍保持简单陪玩定位（业余强引擎都得 MCTS+神经网络，集成成本太高，本期不动）。

### 想关掉过程解说

把 `chess_chat_enabled` 设为 `false`，或直接清空 `chess_chat_deepseek_api_key`。

### 注意事项

- `chess_chat_deepseek_model` 必须填 endpoint 真实存在的模型名。DeepSeek 官方当前是 `deepseek-chat` / `deepseek-reasoner`；如果用其它兼容网关，按网关文档填即可。模型名错了会 HTTP 404 → 静默降级（不影响下子，仅在终端打 warn）

## 中国象棋接 pikafish 引擎（可选，但强烈推荐）

pikafish 是 Stockfish 中国象棋分支，棋力 **职业级**。如果你想让肥牛下象棋时是真正的高手对局，按以下步骤集成：

### 1. 下载 pikafish 二进制和权重

去 [official-pikafish/Pikafish releases](https://github.com/official-pikafish/Pikafish/releases) 下载最新版本：

- Windows：选 `Pikafish-{date}-Windows.zip` 解压拿 `pikafish-bmi2.exe` 或 `pikafish-avx2.exe`（按你 CPU 选）
- macOS：`Pikafish-{date}-macOS.tar.gz`
- Linux：`Pikafish-{date}-linux.tar.gz`

权重文件 **`pikafish.nnue`**（30-50 MB）通常和二进制一起打包，或者从 release 页面单独下载。

### 2. 放到插件目录

在插件目录下建一个 `bin/` 子目录，把二进制和权重一起放进去：

```
plugins/community/feiniu-board-game/
├── bin/
│   ├── pikafish.exe          # Windows，需重命名为 pikafish.exe
│   └── pikafish.nnue         # 权重，必须和二进制同目录
├── index.js
└── ...
```

或者放任意位置，然后在配置里填绝对路径：`xiangqi_engine_path: "D:/tools/pikafish/pikafish.exe"`。

### 3. 配置插件

在 `plugin_config.json` 或插件管理 UI 里：

- `xiangqi_engine`：默认 `auto`（找到二进制就用，找不到自动回退到内置 AI）；想强制只用 pikafish 改成 `pikafish`
- `xiangqi_engine_depth`：留 `0` 时按棋力 tier 自动给深度（4/6/9/12）。改深度时注意：**深度 12 几乎无敌**，深度 8+ 已是业余高手以上水平
- `xiangqi_engine_timeout_ms`：默认 8 秒。深度太高时若超时则该步回退内置 AI

### 4. 验证

打开象棋对局，玩家走一步后看终端日志：

- 看到 `pikafish 引擎已就绪：...` = 集成成功
- 看到 `pikafish 引擎不可用：...` = 路径错或权重缺失，已自动回退

### 协议提醒

pikafish 是 **GPL-3.0** 协议，本插件通过 `child_process` 子进程调用它，不构成衍生作品，但你打包/分发自己版本时建议在文档里注明 pikafish 的来源和协议。

### 跨平台分发

如果你给别人分发这个插件，`bin/` 目录需要按平台放对应二进制（pikafish 自带 Windows / macOS / Linux 版本）。或者让用户自己按上述步骤下载——这样最省心，避免协议和体积问题。

## 五子棋/军棋棋力提升说明

这次升级给五子棋和军棋都加了 alpha-beta 搜索（不需要任何外部依赖）：

- **五子棋**：tier 2 用 2 层搜索 top12 候选，tier 3 用 3 层搜索 top10 + Zobrist 排序优化。能识别"双活三"必胜组合、能堵住活四、能算 2-3 步的攻防转换。从原来"业余初学者"提升到"业余中段水平"。
- **军棋**：tier 2 用 2 层搜索 top16，tier 3 用 4 层 + 渐宽 top12 + 棋子价值表（司令 100/旅长 50/工兵 18 含挖雷加成/旗 1000）。会算"换子是不是赚"、避免送大子。

围棋和井字棋未动（井字棋本就是完美 minimax；围棋需要 MCTS+神经网络，本期超出范围）。

## 自测

在插件目录执行：

```bash
node run-selftest.mjs
```

自测会检查游戏引擎、主入口语法，以及本地 HTTP 服务是否能启动并返回状态。

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
