# automods-lite 交接文档

更新时间：2026-09-17  
仓库：https://github.com/43456-awa/automods-lite  
本地路径：`C:\Users\a1390\Claude Code\automods-lite`  
已推送版本：**v0.4.0**（`53e7faf`）

---

## 1. 项目是什么

本地对话式 NeoForge 模组工作台。前端 1:1 复刻 [automods.cn](https://automods.cn) 的 UI 与交互，能力来自本地 server.js（不用云端）：

- 学习：教程页 + 章内提问 + AI 生成章节（侧栏「教程」入口）
- 工作台：对话驱动 `write_file` / `read_file` / `list_files` / `run_gradle` / `delete_file`
- 每个对话独立工程目录：`workspace/projects/<id>/`
- 配置：`config.json`（key、baseUrl、模型、推理强度等；已 gitignore）
- 启动：双击 `启动.bat` 或 `node boot.js`（默认 `http://127.0.0.1:8787`）

---

## 2. v0.4.0 这一轮做了什么

### UI 复刻

| 区域 | 主站是什么 | 本地版是什么 |
|---|---|---|
| 启动页 | 微信扫码 | 本机就绪卡（密钥 / 模型 / 编译环境 三项红绿黄圆点） |
| 侧栏 | 历史项目 / + 新建 / 贴图 / 建模 / 市场 / 我的资产 | 历史项目 / + 新建 / 贴图 / 建模 / 教程（点击云端入口会提示「本地版未接入」） |
| 顶栏 | 标题 / 编号 / 状态 / 停止 / 活动 / 积分 / 主题 / 个人中心 | 标题 / 编号 / 状态 / 停止 / 用量 / 主题 / 本机设置 |
| 输入栏 | + / 麦克风 / AI 构建 / 模型 / 集群 / 上下文 / 发送 | 同上；麦克风走浏览器 `webkit SpeechRecognition`；集群是占位；上下文改为「条数」选择 |
| 资产栏 | 产物文件 + 整包下载 + 改名 | 产物文件 + 整包下载 + 「编译 Jar」按钮 + 项目改名 |
| 弹窗 | 构建配置 / AI 规划 / 改名 / 公告 | 同上；公告兼作「本机用量 / 检查更新」面板 |
| 引导 | 首次进入选新手/老手 + 4 步巡览 | 同上（hero / 输入栏 / 模型 / 资产栏） |

### 实跑验证

| 任务 | 耗时 | 文件数 | 工具调用 | 备注 |
|---|---|---|---|---|
| 加一个会发光的方块 | 84 s | 15 | 11× write_file | 实跑通过 |
| 加一把会喷火的剑 | 90 s | 11 | 11× write_file | 思考 11255 字 / 正文 699 字 |

### 实跑暴露并修掉的两个 bug

1. **server 状态心跳刷屏**：`readStreamWithIdleTimeout` 按 2% 概率发 status，90 秒刷出几百条 → 改成 `Date.now() - lastBeat > 15000` 时间节流（90 秒只发 14 条）。
2. **前端 `think_delta` 每条一列**：deepseek 把思考按 token 流推下来，一次跑 **3776** 条 think_delta，前端会建 3776 行步骤 → 攒成一行 `.hx-brief`，整段原文藏在 `<details>看它想了什么</details>`，`say_delta / tool / say_settled` 触发 `closeThink()` 定稿。

### 新增

- `tools/smoke.mjs`：冒烟脚本，`node tools/smoke.mjs "做一把剑"` 把 SSE 事件按时间打出来 + 汇总。
- `?chat=<id>` URL 参数直接定位某个项目，可收藏 / 分享。
- `/api/env`：检测系统 gradle + 工程 gradlew（启动页用）。
- `/api/usage`：累计请求次数 + 当次输出字节（写到 `usage.json`，已 gitignore）。
- `/api/bench` + 预览台（`.hx-bench`）：扫工程目录自动汇总物品 / 方块 / 配方 / 模型，输入栏上方 4 个 tab，无产物时整块 hidden。配方按 `pattern` 摆 3×3 网格，材料名连到物品 / 方块的 lang 显示名。

---

## 3. 已推送版本

| 版本 | commit | 要点 |
|---|---|---|
| v0.3.15 | `07ee7d1` | 布局/滚动、中文思考、max 超时加长、工具回执瘦身、自动存 key |
| v0.3.16 | `c5347fd` | 流式不被连接超时杀掉；目录树；zip；rN jar |
| v0.3.17 | `e035ed0` | 强制 action-first 节奏（短思考、立刻 write_file） |
| **v0.4.0** | **`53e7faf` + `b44d5a1` + `cb67ea8`** | **1:1 复刻 automods.cn UI + 实跑验证 + status/think 修复 + 预览台** |

---

## 4. 关键配置（config.json）

当前本机示例（勿提交到 git）：

- `baseUrl`: `https://token.sensenova.cn/v1`
- `model`: `deepseek-v4-pro`
- `reasoningEffort`: **high**（曾用 max，大需求会烧光 token 只思考）
- `apiTimeoutSec`: 180
- `apiRetries`: 4
- `historyLimit`: 160（偏大；长对话建议 24–36）
- `maxTokens`: 32768
- `gradleCmd`: 空（工程内需 `gradlew`，或设置里填本机 gradle）

**教训：**

- 推理 **max** + 复杂世界/大型需求 → 模型可思考 8 分钟+ 仍不 `write_file`
- **high** 更稳；先骨架再细节
- `historyLimit` 过大 + 未压缩工具全文 → 请求体膨胀、易 429/慢

---

## 5. 工程 / 数据位置

```
automods-lite/
  config.json          # 密钥与模型（gitignore）
  usage.json           # 本机用量（gitignore，v0.4.0 起）
  chats/               # 对话 JSON（gitignore）
  workspace/projects/  # 每对话工程（gitignore）
  releases/            # 在各 project 下：rN jar + revision.txt + index.json
  public/
    index.html         # 启动页 + 工作台（v0.4.0 重写）
    app.js / app.css   # 前端逻辑与本地补充样式
    learn.html / learn.css / learn.js  # 教程页
    legacy/            # v0.3.x 旧前端备份
    vendor/            # 抓回的 automods.cn 线上 CSS/JS（tokens/simple/hx/skins/mobile + mc-icons/skin/mobile）
    assets/            # logo + loader 图标
  tools/
    smoke.mjs          # 冒烟脚本
  server.js            # 主服务
  updater.mjs          # 应用内更新
  boot.js              # 启动入口（应用 pending server.js）
```

测试用工程示例：`workspace/projects/p_f239d44f/`（发光方块，15 文件，已写完未编译）；`workspace/projects/p_15dfe7ca/`（喷火剑，11 文件，已写完未编译）。

---

## 6. 已知限制 / 后续可做

1. **未推送** 0.4.0 之前的「静默中断与心跳修复」已在 v0.4.0 一起提交
2. 无真正的本地「语义压缩」；仅 tool 回执瘦身 + history 条数窗口
3. 编译 jar 依赖本机 Gradle/`gradlew`；默认超时 180s（`gradleTimeoutSec`）
4. 贴图 png 无法生成，只能写路径
5. 官方 DeepSeek / 中转：长思考仍可能被上游掐；客户端已尽量保留思考并提示
6. `historyLimit=160` 对长写文件对话仍偏大
7. 应用内更新后若不重启，`server.js` 热更可能走 `server.pending.js`
8. 主站的粒子监视器（`.hx-monitor` / `.hx-bench` 画布动画）本地版只留 DOM 占位，未接 canvas 动效
9. `.bbmodel` 模型用 three.js 渲染缩略图，本地版没下 three.js，只下文件不渲图
10. 主站的「贴图 / 建模 / 模型市场 / 我的资产」四项云端服务本地版只占位，点击提示「主站云端服务，本地版没接」

---

## 7. 给接手人的操作清单

**本地跑起来**

```powershell
cd "C:\Users\a1390\Claude Code\automods-lite"
# 若 8787 被占用：先结束旧 node boot.js，再
node boot.js
# 浏览器 http://127.0.0.1:8787  强刷 Ctrl+Shift+R
# 跳过启动页：访问 http://127.0.0.1:8787/?app=1
# 直接看某个项目：http://127.0.0.1:8787/?app=1&chat=<项目id>
```

**出问题先看**

- 对话里是否有中文 `error` 气泡 / toast
- `config.json` 是否还在、`apiKeySet` 是否为 true（启动页 hint）
- 是否仍在用旧版：`update.json` 的 `version`
- 8787 是否被旧进程占用（`netstat -ano | findstr 8787`）

**冒烟一次**

```powershell
node tools/smoke.mjs "加一个会发光的方块"
# 看到 files / run_end 即通过；脚本收到 files 后主动退出
```

**推新版本**

1. 改 `package.json` + `update.json` 的 version/notes  
2. `git add` 相关文件（**不要** add `config.json` `usage.json` `chats/` `workspace/`）  
3. `git commit -m "vX.Y.Z: …"`  
4. `git push origin main`

---

## 8. 相关路径速查

| 用途 | 路径 |
|---|---|
| 主服务 | `server.js` |
| 前端逻辑 | `public/app.js` |
| 本地补充样式 | `public/app.css` |
| 启动页/工作台 | `public/index.html` |
| 教程页 | `public/learn.html` + `learn.js` |
| 主站样式源 | `public/vendor/` |
| 旧前端备份 | `public/legacy/` |
| 更新器 | `updater.mjs` |
| 启动 | `boot.js` / `启动.bat` |
| 冒烟脚本 | `tools/smoke.mjs` |
| 远端版本清单 | `update.json` |