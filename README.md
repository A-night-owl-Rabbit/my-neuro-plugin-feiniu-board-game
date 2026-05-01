# my-neuro-plugin-feiniu-board-game

适用于 [my-neuro](https://github.com/A-night-owl-Rabbit/my-neuro) / Live-2D 生态的**社区插件**：在本地浏览器中与 AI 对手对弈多种棋类，并通过 **mood-chat** 心情分调节棋力；对局中、局后可向 LLM 注入盘面文本与可配置的「局后限时状态」文案。

本仓库结构与社区插件 [my-neuro-plugin-loki-shadow](https://github.com/A-night-owl-Rabbit/my-neuro-plugin-loki-shadow) 类似：**单目录即插件根**，可直接放入 `live-2d/plugins/community/feiniu-board-game`（或你项目中的等价 `plugins/community` 路径）。

## 功能概览

| 项目 | 说明 |
|------|------|
| 棋种 | 井字棋、五子棋、围棋（练习规则）、中国象棋、军棋（明棋简化） |
| 界面 | 内置 HTTP 服务 + 静态网页（默认 `http://127.0.0.1:22335`） |
| 依赖 | **必须**启用 `built-in/mood-chat`（心情影响棋力；局后可 `adjustMood`） |
| LLM | 进行中/终局可注入盘面概要；局后可按配置注入限时 system 块；支持安全词中止 |

## 安装

1. 将本仓库内容克隆或解压到：`你的项目/live-2d/plugins/community/feiniu-board-game/`。
2. 在插件管理器中启用 **feiniu-board-game**，并确保 **mood-chat** 已启用。
3. 按需编辑 `plugin_config.json`（端口、局后文案、安全词等）。**仓库内附带的是通用示例配置**；若你有高度个人化的提示词，请仅保存在本机，勿提交到公开仓库。

## 工具（Tools）

- `feiniu_open_board_game`：参数 `game` ∈ `tictactoe` | `gomoku` | `go` | `xiangqi` | `junqi`
- `feiniu_close_board_game`：关闭当前对局
- `feiniu_board_clear_effect`：清除局后限时注入

## 配置说明（`plugin_config.json`）

主要键位包括：

- **Web UI**：`webui_host`、`webui_port`、`auto_open_browser`
- **局后注入**：`effect_duration_seconds`、`injection_prefix`、`injection_user_win`、`injection_feiniu_win`、`injection_feiniu_resign_win`（键名沿用历史命名，指代「AI 对手方」）
- **安全**：`safe_keywords`（命中后清除惩罚类注入并追加退出说明）
- **心情**：`enable_adjust_mood`、`mood_delta_user_win`、`mood_delta_feiniu_win`
- **规则**：`gomoku_size`、`go_board_size`、`enable_undo`、`xiangqi_intersection_style`
- **对话**：`enable_board_snapshot_injection`、`enable_endgame_auto_chat`、`endgame_chat_prompt`

## 自测

在 **已放入 my-neuro 的 `live-2d/plugins/community/feiniu-board-game` 目录之后**（以便解析宿主里的 `plugin-base.js` 与 `express` 等依赖），于该插件根目录执行：

```bash
node run-selftest.mjs
```

将检查各棋种逻辑、主入口加载及本地 HTTP 服务能否正常响应。若单独克隆本仓库到空目录直接跑自测，会因缺少宿主依赖而失败，属正常现象。

## 设计参考（非直接依赖）

本插件实现曾参考或借鉴以下开源方向的设计思路（实现为自研代码）：

| 类型 | 代表仓库 | 借鉴点 |
|------|----------|--------|
| 桌面/网页棋类 | [takaneichinose/tic-tac-toe-electron](https://github.com/takaneichinose/tic-tac-toe-electron)、[e96031413/Gomoku](https://github.com/e96031413/Gomoku) | 难度分级、悔棋、胜负线高亮 |
| 象棋 | [ryoi/xiangqi](https://github.com/ryoi/xiangqi)、[tjlstar/Chinese-Chess](https://github.com/tjlstar/Chinese-Chess) | 将军检测、困毙与将杀区分 |
| LLM 棋类状态 | [atomic14/ChessGPT](https://github.com/atomic14/ChessGPT)、[maxim-saplin/llm_chess](https://github.com/maxim-saplin/llm_chess) | 可靠盘面摘要、减少模型编造落子 |

## 许可证与隐私

- 代码以社区插件形式发布；使用前请遵守你所在地区法律及平台规范。
- **请勿**在仓库或 Issue 中粘贴 API Key、Cookie、私人对话或角色完整人设文档。
- 若需二次分发，建议自行审查 `plugin_config.json` 中的文案是否符合你的公开范围。

## 版本

与 `metadata.json` 中 `version` 字段一致（当前示例为 `0.4.0`）。
