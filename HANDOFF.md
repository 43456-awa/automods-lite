# automods-lite 交接文档

更新时间：2026-09-16  
仓库：https://github.com/43456-awa/automods-lite  
本地路径：`C:\Users\a1390\Claude Code\automods-lite`  
已推送版本：**v0.3.17**（`e035ed0`）  
本地未推送改动：静默中断修复 + 思考心跳（见下文「待推送」）

---

## 1. 项目是什么

本地对话式 NeoForge 模组工作台（纯 Node，无 npm 依赖）：

- 学习：内置章节 + 章内提问 + AI 生成章节
- 工作台：对话驱动 `write_file` / `read_file` / `list_files` / `run_gradle`
- 每个对话独立工程目录：`workspace/projects/<id>/`
- 配置：`config.json`（key、baseUrl、模型、推理强度等；已 gitignore）
- 启动：双击 `启动.bat` 或 `node boot.js`（默认 `http://127.0.0.1:8787`）

---

## 2. 本轮已修复 / 新增

### 稳定性（超时 / 中断）

| 问题 | 处理 |
|------|------|
| 连接超时信号会掐断整段思考流 | 连接超时只约束「拿到响应头」，随后 `clearTimeout`，body 只受用户停止 / idle 约束 |
| max/xhigh 首包慢被 60s abort | 连接超时：max/xhigh→180s，high→120s，其它 60s |
| 只有思考、无正文/工具时静默结束 | 现在会 `error` 明确提示（截断 / 空输出两种文案），并 `think_keep` |
| 思考阶段上游断开无提示 | 明确报错 + 保留思考 |
| 长思考像卡死 | 每 15s 心跳：`思考中…（约 Nk 字，有数据不会超时）` |
| 出错后思考框被清空 | `run_end` 在 3s 内有 error 时只 collapse，不 hard clear |
| 工具回执撑爆上下文 | 最近 4 条 tool 全文；更早 write/read/gradle 压成一行摘要 |
| 配置被 BOM / 并发写坏 | `loadConfig` 去 BOM + 短重试；`saveConfig` 先写 tmp 再 rename |

### 行为 / 提示词

| 项 | 处理 |
|----|------|
| 思考只用中文 | 系统提示硬规则 |
| 思考框自动滚到底 | `syncThinkScroll` |
| 获取模型列表只见 deepseek-chat | datalist 按输入过滤；改为可点模型名列表 |
| 拉到模型但对话报未配置 key | 获取列表成功且表单有 key 时自动 POST 保存；发送前 `ensureApiKey` |
| 一直闷头推理不写文件 | 系统提示强制「短思考 → 同轮 write_file → 分轮落盘」 |

### UI

| 项 | 处理 |
|----|------|
| 输入框被顶出屏幕 | `.view` 改 flex；`.split { height:100% }`；dock 限高 |
| 对话无滚动条 | 去掉 `justify-content:flex-end`；`::before` 压底；对话区滚动条加粗 |
| 文件区只有平铺路径 | 可展开目录树 |
| 无法下文件夹/整包 | 目录旁 zip、顶栏「下载整包」 |
| 无成品 jar 版本 | 顶栏「编译 Jar」+ `run_gradle build` 成功自动发布 `releases/<modId>-1.0.0-rN.jar` |

### 更新器

- 白名单只覆盖源码；**保留** `config.json`、`chats/`、`workspace/`、`chapters/`、`memory.json`
- 应用内「检查更新」→ 一键更新 → **必须重启** 才换 `server.js`

---

## 3. 已推送版本

| 版本 | commit | 要点 |
|------|--------|------|
| v0.3.15 | `07ee7d1` | 布局/滚动、中文思考、max 超时加长、工具回执瘦身、自动存 key |
| v0.3.16 | `c5347fd` | **流式不被连接超时杀掉**；目录树；zip；rN jar |
| v0.3.17 | `e035ed0` | 强制 action-first 节奏（短思考、立刻 write_file） |

---

## 4. 待推送（本地已有、GitHub 还没有）

在 `v0.3.17` 之上，本地 `server.js` / `public/app.js` 还有：

1. 首轮「只有思考」不再静默，会明确 `error`
2. 思考阶段断开会报错并 `think_keep`
3. 思考心跳（15s）
4. `error` 时 toast + 短时间保留思考框

**需要时执行：** 改 `package.json`/`update.json` 为 0.3.18 → commit → `push origin main`。

---

## 5. 关键配置（config.json）

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

## 6. 工程 / 数据位置

```
automods-lite/
  config.json          # 密钥与模型（gitignore）
  chats/               # 对话 JSON（gitignore）
  workspace/projects/  # 每对话工程（gitignore）
  releases/            # 在各 project 下：rN jar + revision.txt + index.json
  public/              # 前端
  server.js            # 主服务
  updater.mjs          # 应用内更新
  boot.js              # 启动入口（应用 pending server.js）
```

测试用工程示例：`workspace/projects/p_2d2b1e00/`（魔力潮汐，约 14 文件，未完成渲染核心）。

---

## 7. 已知限制 / 后续可做

1. **未推送** 静默中断与心跳修复（见第 4 节）
2. 无真正的本地「语义压缩」；仅 tool 回执瘦身 + history 条数窗口
3. 编译 jar 依赖本机 Gradle/`gradlew`；默认超时 180s（`gradleTimeoutSec`）
4. 贴图 png 无法生成，只能写路径
5. 官方 DeepSeek / 中转：长思考仍可能被上游掐；客户端已尽量保留思考并提示
6. `historyLimit=160` 对长写文件对话仍偏大
7. 应用内更新后若不重启，`server.js` 热更可能走 `server.pending.js`

---

## 8. 给接手人的操作清单

**本地跑起来**

```powershell
cd "C:\Users\a1390\Claude Code\automods-lite"
# 若 8787 被占用：先结束旧 node boot.js，再
node boot.js
# 浏览器 http://127.0.0.1:8787  强刷 Ctrl+Shift+R
```

**朋友侧更新**

1. 检查更新 → 确认 ≥ 0.3.16（最好 0.3.17+ 本地修复）
2. 关闭后重新启动
3. 设置：key 已保存、推理 **high**、上游超时 ≥ 180

**出问题先看**

- 对话里是否有中文 `error` 气泡 / toast
- `config.json` 是否还在、`apiKeySet` 是否为 true（设置页 hint）
- 是否仍在用旧版：`update.json` 的 `version`
- 8787 是否被旧进程占用（`netstat -ano | findstr 8787`）

**推新版本**

1. 改 `package.json` + `update.json` 的 version/notes  
2. `git add` 相关文件（**不要** add `config.json`、`chats/`、`workspace/`）  
3. `git commit -m "vX.Y.Z: …"`  
4. `git push origin main`

---

## 9. 本轮用户侧反馈摘要（便于对照）

1. config/key 丢失疑云 → 文件在；多为「获取列表未保存」或 BOM/并发写  
2. 模型列表只见一个 → datalist 过滤  
3. 输入框看不到 / 无滚动条 → 高度链断裂 + flex-end 滚动坑  
4. 一直思考然后突然断、无提示 → 连接超时杀流 + 空输出静默 + 前端清思考框  
5. 要文件树 / zip / rN jar → 已做  
6. 要对照参考站右侧产物区 → 实现了简化版（树 + zip + 编译 rN）

---

## 10. 相关路径速查

| 用途 | 路径 |
|------|------|
| 主服务 | `server.js` |
| 前端逻辑 | `public/app.js` |
| 样式 | `public/style.css` |
| 更新器 | `updater.mjs` |
| 启动 | `boot.js` / `启动.bat` |
| 远端版本清单 | `update.json` |
