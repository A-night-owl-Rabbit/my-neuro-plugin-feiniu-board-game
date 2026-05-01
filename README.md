# my-neuro-plugin-feiniu-board-game肥牛棋盘

适用于 [my-neuro](https://github.com/A-night-owl-Rabbit/my-neuro) / Live-2D 生态的**社区插件**：在本地浏览器中与 AI 对手对弈多种棋类，并通过 **mood-chat** 心情分调节棋力；对局中、局后可向 LLM 注入盘面文本与可配置的「局后限时状态」文案。ps:肥牛输了的话，可以给肥牛装一个小玩具



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

## 想邀请你，做这只小牛的"云饲养员"

做这个桌宠的初衷，其实是因为自己一个人工作学习的时候，总觉得屏幕里空落落的。看到大家都在使用，我就觉得熬夜写代码、调教 AI 的日子都亮闪闪的。

不过，肥牛现在还在长身体（其实是我想给它做更多有趣的插件），养一只数字小牛其实也挺"费草"的哈哈。

如果你在这只小肥牛这里获得过哪怕一秒钟的治愈，或者觉得它算个合格的桌面搭子，要不要考虑成为它的"云饲养员"呀？

你的每一次充电，都不是在打赏我，而是在给这只肥牛注入一点点魔法值。让它能变得更聪明、更通人性、能听懂你更多的碎碎念。

不用有压力哦！你愿意打开它，就是对我最大的鼓励啦。如果刚好有余力，就请肥牛喝瓶快乐水叭，它会记住你的味道的！

爱发电 [https://ifdian.net/a/0923A](https://ifdian.net/a/0923A)

---

## 许可证

本项目采用 **CC BY-NC-SA 4.0** 许可证。
