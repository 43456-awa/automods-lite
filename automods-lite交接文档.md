# automods-lite 交接文档

更新时间：2026-09-17  
仓库：https://github.com/43456-awa/automods-lite  
本地路径：`C:\Users\a1390\Claude Code\automods-lite`  
已推送版本：**v0.5.1**（最新提交 `242e72e`）  
线上分享链接：**0.5.1，2026-09-17 重新发布**（见 3.5）
⚠️ 旧链接当天先下线（那次发布带着主人的 chats/memory），再用干净数据重发；
沙箱被复用，所以**地址没变**。线上开着 `shareMode`，私有接口一律 403。

**先读这三节**：3.5 线上发布（含密钥脱敏流程）→ 3.8 编译环境 → 3.10 前端实时渲染。

---

## 1. 项目是什么

本地对话式 NeoForge 模组工作台。前端 1:1 复刻 [automods.cn](https://automods.cn) 的 UI 与交互，能力来自本地 server.js（不用云端）：

- 学习：教程页 + 章内提问 + AI 生成章节（侧栏「教程」入口）
- 工作台：对话驱动 `write_file` / `read_file` / `list_files` / `run_gradle` / `delete_file`
- 每个对话独立工程目录：`workspace/projects/<id>/`
- 配置：`config.json`（key、baseUrl、模型、推理强度等；已 gitignore）
- 启动：双击 `启动.bat` 或 `node boot.js`（默认 `http://127.0.0.1:8787`）

---

## 2. v0.4.0：UI 复刻与实跑验证（背景）

> 这一节是 v0.4.0 做的事。v0.5.0 的内容在 3.8 / 3.9 / 3.10 三节。

### UI 复刻

| 区域 | 主站是什么 | 本地版是什么 |
|---|---|---|
| 启动页 | 微信扫码 | 本机就绪卡（密钥 / 模型 / 编译环境 三项红绿黄圆点） |
| 侧栏 | 历史项目 / + 新建 / 贴图 / 建模 / 市场 / 我的资产 | 历史项目 / + 新建 / 贴图 / 建模 / 教程（点击云端入口会提示「本地版未接入」） |
| 顶栏 | 标题 / 编号 / 状态 / 停止 / 活动 / 积分 / 主题 / 个人中心 | 标题 / 编号 / 状态 / 停止 / 用量 / 主题 / 本机设置 |
| 输入栏 | + / 麦克风 / AI 构建 / 模型 / 集群 / 上下文 / 发送 | 同上；麦克风走浏览器 `webkit SpeechRecognition`；**「集群」已删**（本地没有多帮手这功能，留着纯误导）；上下文改成 **256K / 1M 的 token 容量**（原来「多少条消息」看不懂，已废弃）；另加「🔨 构建」徽章 |
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
| v0.4.0 | `385b8e0`…`518aefb` | 1:1 复刻 automods.cn UI + 实跑验证 + 预览台 + 贴图工坊 + 上下文 256K/1M |
| **v0.5.0** | **`eda5d5e` 起** | **编译链路打通（真产出 jar）+ 预览台可点开详情 + 编译环境一键准备** |
| **v0.5.1** | **`c73af3f` 起** | **发送键卡灰（SSE 不关流）修复 + 分享模式 + 贴图工坊删除/上传/生成相似 + 表单持久化** |

v0.4.0 期间的提交（`385b8e0` → `518aefb`）：
复刻 UI → 心跳节流/think 攒行 → 版本与文档 → 预览台 → 贴图工坊 →
用量弹窗+归档重命名 → 生图参数全量 → 构建环境徽章 → 上下文 256K/1M →
429 退避放宽 → smoke 改 node:http

v0.5.0 期间的提交（`faa0c5c` → `1d364e7`）：

| commit | 要点 |
|---|---|
| `faa0c5c` | 写完要切出去才刷新（资产栏收起 + 文件不实时刷 + SSE 残留） |
| `88c5da5` | **编译 spawn EINVAL（从来跑不通的根因）** + 一键准备 + JDK 21 检测 |
| `a97932e` | gradlew.bat 吞退出码 / neo_version 编造 / 内存不足 |
| `9ddf7bf` | 残留 java 进程检测 |
| `10765a9` | prompt：写完代码主动编译验证 + NeoForge 1.21 API 陷阱 |
| `147041c` | prompt 反引号截断（服务起不来） |
| `bd6a738` | 版本号 0.4.0 → **0.5.0** |
| `00a3ecc` | **对话区一片空白（「要刷新才看到」的真正原因）** |
| `911f8cf` | 弹窗加「立即更新」按钮 |
| `dd3a740` | update.bat 文件清单还停在 0.3.x（更新完前端样式会全丢） |
| `c3ad574` | update.ps1 补 UTF-8 BOM |
| `f40d74a` | update.bat 自举（新版没 ps1 也能更新；**老版仍会写坏，见 3.9**） |
| `c0695bf` | 干活的脚本挪进 tools/（根目录两个文件容易点错） |
| `ece02ed` | update.bat 去掉所有中文（cmd 按 GBK 解析会吃掉引号） |
| `1d364e7` | tools/update-core.ps1 算错项目根（把代码复制进了 tools/） |

---

## 3.5 线上发布

**分享链接**：https://d1d1030d61b04e28bdf2507b97874763.sg2.agentos-app.run
（sandboxId `d1d1030d61b04e28bdf2507b97874763`，`deployedAs: http-service`）

### ⚠️⚠️ 每次发布前必做：摘掉密钥 + 挪走私有数据（已有脚本）

发布是把整个目录压缩上传，而 `config.json` 里有真实 apiKey。更糟的是
**这样一传，`chats/`（对话记录）和 `memory*.json`（记忆）也会一起上线** ——
实测线上 `curl <link>/api/chats` 能列出全部对话、`/api/memory` 能读到记忆条目。

流程（用脚本，别手做，步骤太多容易漏）：

```powershell
node tools/publish-prepare.mjs     # 挪走私有数据 + 写脱敏 config（带 shareMode）
# 发布（见下面的发布命令）
node tools/publish-restore.mjs     # 发完立刻跑，把数据搬回来
```

`publish-prepare.mjs` 会做四件事并自检：

1. 把 `chats/` / `memory.json` / `memory-store.json` / `usage.json`
   以及 `config.json.bak-*`（`saveConfig` 留的自动备份，里面也有 key）
   挪进**项目目录外**的 `.automods-publish-stash/<时间戳>/`
   —— 留在项目里照样会被传上去
2. 备份 `config.json`，写一份 `apiKey` / `imageApiKey` 为空、**`shareMode: true`** 的
3. 全目录扫 `sk-[A-Za-z0-9]{16,}`，必须干净
4. 全部通过后打印 ✅；有问题退出码 1，**别发布**

`publish-restore.mjs` 搬回来时会：目录**逐项合并**（暂存期服务若被起过、
`chats/` 被重新生成，主人那份仍会并回去，不会被顶成 `chats.restored-xxx`）；
文件以「主人原件」占主路径，暂存期产生的挪成 `<名>.shared-<时间戳>` 可自行删除。
还会断言 `apiKey` 前缀回来了、`shareMode` 已复位成 `false`。

**为什么还要 `shareMode`**：数据一旦传上去，重新发布也删不掉旧文件。
`shareMode: true` 会让服务端把 `/api/chats`、`/api/memory`、`/api/usage`、
`/api/context` 直接挡成 403（`/api/chat`、`/api/env`、`/api/bench` 仍放行，
访客照样能填自己的 key 开新对话）。这是**接口层的第二道保险** ——
哪天忘了挪文件，也不会把本机数据吐出去。本机自用保持 `false`。

### 发布后自检

```bash
curl <link>/api/health                    # version 必须是新版本
curl <link>/api/config                    # apiKeySet=false、shareModeActive=true
curl -o /dev/null -w "%{http_code}" <link>/api/chats    # 必须是 403
```

### 发布命令

```
workbuddy_sites_deploy {
  directory: "C:\\Users\\a1390\\Claude Code\\automods-lite",
  language: "node", startCmd: "node server.js",
  appName: "AutoMods 模组工作台", userAskedToPublish: true
}
```

### 线上环境

- `server.listen` 必须绑 `0.0.0.0`（沙箱反向代理从外部连进来）。
  本机想收回内网就设 `HOST=127.0.0.1`。
- 沙箱里**有 gradle**（实测启动页显示「已找到 gradle 9.3.0」），但没有 JDK 21
  与 NeoForge 依赖缓存，所以真正编译 NeoForge 模组仍可能失败。
- 线上没有主人的 API Key（`apiKeySet: false`），**访客要自己到设置里填**才能对话。

### 线上状态：0.5.1（2026-09-17 下线旧链接后重发）

**线上跑 `0.5.1`**（sandboxId 被复用，所以地址没变）。这一批修复全部生效：

| 已上线的修复 | 效果 |
|---|---|
| `00a3ecc` 对话区空白 | 一开工就出现「正在制作 · 正在连接模型…」 |
| `911f8cf` 立即更新按钮 | 线上弹窗已有「立即更新」 |
| 编译环境一键准备 + 6 个坑的修复 | 线上可走「⚡ 一键准备构建环境」 |
| 发送键卡灰 / 必须刷新（3.12） | 任务结束 2 秒内自动恢复可发送 |
| `shareMode` 私有接口 403 | `/api/chats`、`/api/memory` 等被挡，泄漏堵上 |
| 贴图工坊：删除 / 自上传 / 生成相似 | 线上贴图页带「📁 上传本地贴图」 |

判断线上新旧的最快方法：`curl <link>/api/health` 看 `version`，
或 `curl <link>/app.js | grep -c 正在连接模型`（0 = 旧版，1 = 已同步）。

> **下线后再发布，沙箱会被复用、地址不变**（实测如此）。
> 所以「删掉链接」并不会让下一次发布换个地址 —— 想彻底换地址得换目录名。

> **提醒**：`push` 不等于上线。发布是把当前工作区**整包重新上传**，
> 跟 git 是两条路 —— v0.5.0 早就 push 了，但线上一直停在 0.4.0，
> 直到 9-17 手动重新发布才同步。**改完代码记得单独发布一次。**

### 公开链接会连私有数据一起传上去（已缓解）

发布工具只排除 `node_modules` / `.git` / 构建产物，**不读 `.gitignore`**。
实测线上 `curl <link>/api/chats` 能直接列出全部对话（含标题、消息数），
`curl <link>/api/memory` 能读到记忆条目 —— 也就是**任何拿到链接的人都能翻主人的对话与记忆**。

**已做的两层防护（0.5.1 起）**：① `tools/publish-prepare.mjs` 在发布前
把这些文件挪出项目目录；② `config.shareMode` 在接口层把私有 API 挡成 403。
实测分享模式下 `/api/chats`、`/api/memory`、`/api/usage`、`/api/context` 全 403，
而 `/api/chat`、`/api/env`、`/api/bench`、`/api/health` 照常放行。

> 注意：**已经传上去的文件删不掉**，所以线上那份老数据要靠 `shareMode` 挡。
> 发布后务必按上面「发布后自检」验一遍 `/api/chats` 是 403。
>
> `workspace/`（主人的模组工程）目前仍会上传且可下载 —— 资源共享是刻意的
> （访客才有样例可看），但要是哪天不想给，就把 `workspace/projects/`
> 也加进 `publish-prepare.mjs` 的 `PRIVATE` 列表。

---

## 3.8 编译环境（本地，踩了 6 个坑才通）

**目标**：点「编译 Jar」能出 `build/libs/<mod_id>-<ver>.jar`。
实测已经从一句需求一路跑到产出 19 KB 的可用 jar。要跑通，这 6 件事缺一不可：

| # | 坑 | 症状 | 处理 |
|---|---|---|---|
| 1 | **Node v20+ 不许 spawn `.bat`** | `spawn EINVAL`，编译一启动就死 | `spawn` 时对 `.bat/.cmd` 加 `shell: true`，路径带空格要自己加引号 |
| 2 | **`gradlew.bat` 吞退出码** | gradle 明明 FAILED，却报「构建成功」 | 模板末尾必须 `set EXIT_CODE=%ERRORLEVEL%` → `endlocal & exit /b %EXIT_CODE%`；只写 `endlocal` 会把它抹掉 |
| 3 | **`neo_version` 是编的** | `Could not find net.neoforged:neoforge:21.1.0` | maven 上是 `21.1.250` 这种带 build 号的；一键准备会自动校正 |
| 4 | **JDK 21 不在 PATH** | gradlew 拿到的是 17，报 class file 版本错 | PATH 里是 17，但 `C:\Program Files\Java\jdk-21` 装了；`detectJdk21()` 会翻常见目录并把 `JAVA_HOME`/`PATH` 指过去 |
| 5 | **反编译 Minecraft 内存不够** | JVM 崩：`insufficient memory ... G1 virtual space` | `org.gradle.jvmargs=-Xmx3G -XX:MaxMetaspaceSize=1G`；可用内存 < 4G 时提前拦下 |
| 6 | **僵尸 java 进程占内存** | 总内存 15G 但可用只剩 2.5G | 编译崩掉后 Gradle daemon 不会自己退出（实测见到一个占 4.4 GB 的）；`staleJavaProcesses()` 会列出来 |

### 一键准备

输入栏「🔨 构建」徽章 →「**⚡ 一键准备构建环境**」会依次做：
找 JDK 21 → 装 gradlew（下 43 KB 的 wrapper jar + 生成脚本）→ 校验并校正
`neo_version` → 把 Gradle 堆提到 3G → 报当前可用内存。四步全绿就能编译。

也可直接调接口：`POST /api/build/setup {project}`、`GET /api/build/doctor`。

### 第一次编译要多久

要下 Gradle 8.10（约 130 MB）+ NeoForge 依赖 + **反编译整个 Minecraft**，
实测 5-10 分钟。之后就快了（有缓存）。所以 `gradleTimeoutSec` 建议设 1500。

### 模型会写错 API —— 一定要编译验证

实测：模型写完 37 个文件收工，编译报 14 个错，全是 NeoForge 1.21 的签名差异：

- `ArmorMaterial` 在 1.21.1 是 **record 不是 interface**，别写 `implements`
- `ArmorItem` 要的是 `Holder<ArmorMaterial>`，得用 `DeferredRegister` 注册成 `DeferredHolder`
- `SimpleTier` 第一个参数是 `TagKey<Block>`（如 `BlockTags.INCORRECT_FOR_STONE_TOOL`），不是 int
- 物品用 `props.attributes(...)`，别用旧的 `new SwordItem(tier, atk, spd, props)`

把 javac 输出原样丢回去，模型能自己修（实测它读了文件、改 3 个、**主动调了两次
`run_gradle` 验证**，第二次通过）。system prompt 第 8 条已要求它写完代码主动编译。

---

## 3.9 客户端更新（update.bat）—— 给拿到本地副本的人

**场景**：把项目拷给别人跑（比如朋友手上那份 0.4）。他们不在 git 里，
没法 `git pull`，得靠一个双击就能用的更新脚本。

### 入口只有一个

```
update.bat                      ← 根目录唯一入口，双击它
tools/update-core.ps1           ← 真正干活的（藏在子目录，避免被误点）
```

**这条是踩出来的**：最早 `update.bat` 和 `update.ps1` 都摆在根目录，
朋友**双击了 `.ps1`** —— 他那边 `.ps1` 关联到 cmd，于是 cmd 把 PowerShell
代码逐行当命令执行，报一屏「不是内部或外部命令」。
**给非技术用户的东西，入口只能有一个。**

### 两个编码坑（Windows 特有）

| 文件 | 坑 | 规则 |
|---|---|---|
| `tools/update-core.ps1` | PS 5.1 读 `.ps1` 默认按 ANSI/GBK 解析，UTF-8 无 BOM 的中文注释会全乱 → 字符串截断 → 一屏语法错误 | **必须带 UTF-8 BOM**（`EF BB BF`），且 BOM 要提交进仓库 |
| `update.bat` | cmd.exe 按系统代码页（中文 Windows = GBK）解析 `.bat`，UTF-8 中文被读乱后**会连引号和反斜杠一起吃掉**，整行断成「不是内部或外部命令」 | **bat 里一个非 ASCII 字符都不能有**；中文提示全部交给带 BOM 的 ps1 输出（bat 里保留 `chcp 65001` 保证控制台能显示中文） |

> 自噬注意：`tools/` 目录在更新清单里，所以 `update-core.ps1` **会更新自己** ——
> 本地改完它必须**先 push**，否则下次自更新会被仓库里的旧版覆盖回去（踩过一次，白修）。

### 自举

**新版**（0.5.0 起）的 `update.bat` 里没有 `tools/update-core.ps1` 时会自己
`curl` 下来（jsDelivr → raw.githubusercontent），再交给 PowerShell 干整包更新。
它**只下载 `update-core.ps1`，不下载自己**，所以是安全的。

### ⚠️⚠️ 老版 `update.bat` 会把副本写坏（2026-09-17 实测，务必先看）

**原来这里写「对方只要有一个 `update.bat` 就能完成整个更新」是错的。**
0.3.x / 0.4.0 那份 `update.bat` 走的是另一套逻辑，它会 `call :get update.bat`
**把正在运行的自己覆盖掉** —— 而 cmd.exe 是按**字节偏移**逐行读 `.bat` 的，
文件在脚下被换成长度完全不同的新内容后，偏移就错位了，后面每个
`call :get <名>` 都读到错误的位置，于是**文件内容被写进别的文件名**。

实测（`git archive 518aefb` 还原一份 0.4.0，跑它自带的 `update.bat`）：

| 文件 | 正确的 0.4.0 尺寸 | 跑完后 | 实际装进去的内容 |
|---|---|---|---|
| `server.js` | 102510 | **2703** | 新版 `update.bat` 的正文 |
| `learn.mjs` | 9486 | **118140** | 仓库里 `server.js` 的正文 |
| `package.json` | 320 | **5466** | 另一个文件的正文 |

跑完就是一份彻底报废的副本（`server.js` 只剩 2.7 KB 的 bat 文本，服务根本起不来）。
日志里还会出现 `FAILED boot.js` / `FAILED update.bat` 这种先兆。

**给老副本的正确更新方式（已实测通过，exit=0）**：

**首选：直接把 `fix-update.bat` 发给对方**（QQ / 微信传文件，零网络依赖）。
老副本靠网络自救基本是死路，原因见后。

1. 把仓库根目录的 `fix-update.bat`（约 4.8 KB）单独发给朋友
2. 他把它放进 automods-lite 文件夹，**双击**
   —— 它换个名字，所以运行期间不会被任何东西覆盖，绕开了上面那个自我覆盖的坑
3. 它会拉 `tools/update-core.ps1` 再整包更新；跑完副本就是最新的，
   同时拿到**新的 `update.bat`** 和**页面里的「立即更新」按钮**，以后就正常了

一定要让对方自己下载的话，只有这一个源能用：

```
https://raw.githubusercontent.com/43456-awa/automods-lite/main/fix-update.bat
```

> **⚠️ jsDelivr 对 `.bat` 一律返回 403 Forbidden**（实测 `update.bat`、
> `fix-update.bat` 都是；而 `.ps1` / `.mjs` / `.json` 正常）。
> 所以「从 jsDelivr 下载 update.bat」这条路**根本不通** —— 写文档时踩过。
> 而老版 `update.bat` 的清单里恰恰有 `call :get update.bat`：在 jsDelivr 上必然
> `FAILED update.bat`，退回 raw.githubusercontent 又会自我覆盖把副本写坏。**双重死路。**
> 这也就是日志里 `FAILED boot.js` / `FAILED update.bat` 那条先兆的由来。

**实测结果**：`server.js` 122454 字节且含新修复、`package.json` / `update.json`
都是 `0.5.1`、`public/vendor/` 10 个文件完好、`config.json` 一个字没动、
`app.js` 里能搜到「立即更新」×3（页面按钮回来了）。

**或者更省事**：从 GitHub 下整包 ZIP 解压覆盖整个文件夹
（ZIP 里没有 `config.json` / `workspace/` / `chats/`，所以这些不会被覆盖）。

> 教训：**给非技术用户的自动更新脚本，绝不能让它下载它自己。**
> cmd.exe 按字节偏移解析 `.bat`，自我覆盖 = 偏移错位 = 文件错位写坏。

### ⚠️ 更新链路在国内的死结（2026-09-18 实测，两个真 bug）

朋友那份点完 `fix-update.bat` 再点 `update.bat`，**还是 0.5.0、页面也没有更新按钮**。
查出两处，都在「国内网络」上：

**1. `/api/update` 只试 `raw.githubusercontent.com`** —— 国内直连不通，
8 秒超时后直接返回「拉取远程版本失败」，**弹窗根本不出现**，
自然也就没有「立即更新」按钮。
→ 已改成 raw → jsDelivr → fastly → raw(master) 依次回退：有代理的人先拿到最新，
没代理的人至少能拿到结果（jsDelivr `@main` 有最长 12h 缓存，版本号可能滞后半天）。

**2. `update-core.ps1` 的三个 zip 源全是死路**：
`cdn.jsdelivr.net/.../@main.zip` 实测 **400**（jsDelivr 已下线整包接口），
fastly 同理，只剩 `github.com/archive/...` 而国内常常不通 ——
所以朋友那次更新**一个字节都没更新**，脚本却打了「[完成] 代码已更新」。

→ 新增 `tools/manifest.json`（从 `git -c core.quotepath=false ls-files` 生成，
只列会覆盖的 ASCII 路径代码文件；`config.json` / `workspace/` / `chats/` /
`usage.json` 永不出现）。`update-core.ps1` 现在两条路：

| 路 | 源 | 说明 |
|---|---|---|
| 整包（先试） | `codeload.github.com` → `github.com/archive` | 快，国内常常不通 |
| 逐文件（兜底） | **jsDelivr** → fastly → raw | 国内基本能过，是真正管用的那条 |

`.bat` 的源顺序反过来（raw 优先）：**jsDelivr 对 `.bat` 一律 403**，先试纯属浪费；
拉不到就保留本地那份，不会弄坏文件。收尾会把实际 `package.json` 版本和清单版本
对一下，避免又一次「看起来成功」。

**实测**（`git archive` 还原 0.4.0 + 清空整包源强制走逐文件）：
49 个文件更新、版本 0.5.1、`server.js` 含 `streamClosed`、`app.js` 含「立即更新」×3、
`vendor/` 10 文件完好、`config.json` 未动、exit=0。

**踩过的两个小坑**：
- `git ls-files` 默认把中文名转义成 `\344\272\244` 这种串，拿去当路径会报
  「路径中具有非法字符」，而 `ErrorActionPreference = 'Stop'` 会让整个脚本当场退出
  → 现在路径不匹配 `^[A-Za-z0-9._\-/]+$` 的直接跳过并记一笔
- PS 5.1 的 `Invoke-RestMethod` 对没写 charset 的 JSON 按 ISO-8859-1 解，
  中文全变乱码 → 改成 `Invoke-WebRequest` + `UTF8.GetString(RawContentStream)`

**最稳的交付方式仍然是「直接发整包」**：`git archive --format=zip -o <文件> HEAD`
（61 文件 / 约 313 KB，天然不含 `config.json` / `workspace/` / `chats/`），
微信/QQ 传过去解压覆盖即可，完全不依赖对方的网络。

### ⚠️ CDN 缓存会拿到旧脚本（更新静默失效，2026-09-17 实测）

下载 `tools/update-core.ps1` 时**别只信 `@main`**：jsDelivr 的 `@main`
最长缓存 12 小时，实测拿到的那份 `Age = 15424 秒（约 4.3 小时）`，
是修 `$root` **之前**的旧版。那个旧版只用一层 `Split-Path` 算项目根，
会把整包解进 `tools\`，工程一个字没更新，而脚本照样打印
「[完成] 代码已更新」——**看起来成功，其实什么都没做**。

（第一次实测就中招：`package.json` 仍是 `0.4.0`，`tools/` 里被塞了整个项目。）

两处加固，两个 bat 都加了：

1. 优先用**钉死 commit 的不可变地址**（`@.../<sha>/tools/update-core.ps1`），
   再退回 `@main` → fastly → raw
2. 下载后**校验内容**：0 字节、或不含 `$scriptDir`（旧版特征）就删掉换下一个源
   —— 0 字节那条也是真 bug：curl 失败会留下空文件，`if not exist` 当成成功，
   PowerShell 跑个空脚本报 OK 但什么都没更新

### 更新范围

| 会覆盖 | 绝不碰 |
|---|---|
| `boot.js` / `server.js` / 各 `.mjs` / `package.json` / `update.json` | **`config.json`**（密钥、模型） |
| **`public/`**（含 `vendor/` 全部 CSS、`assets/` 图片） | **`workspace/`**（工程） |
| `content/`（教程）、`tools/`、`start.bat` / `update.bat` / `启动.bat` | **`chats/`**、`usage.json` |

下载源按 **jsDelivr → fastly → raw.githubusercontent** 依次回退
（实测这台机器上前两个都失败，只有 GitHub 直连成功，所以多源回退是必要的）。

`server.js` 被占用时落成 `server.pending.js`，**下次由 `boot.js` 启动时替换** ——
所以更新后要用 `启动.bat` / `node boot.js` 重启，直接 `node server.js` 不会做这步。

### 两个实现细节（都是 bug 修出来的）

- `$root` 必须取**脚本所在目录的上一级**：
  ```powershell
  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  $root      = Split-Path -Parent $scriptDir
  ```
  只取一层会得到 `tools/`，于是所有文件被复制进 `tools/`，还嵌套出 `tools/tools/`。
- 旧的 `update.bat`（0.3 时代）文件清单里是 `public/style.css` 这种**早就不存在的文件**，
  而且**完全缺 `public/vendor/`** —— 跑完会拉到新 `server.js` 但前端样式全丢，页面直接废掉。
  现在的清单改成了「整包 zip 解压覆盖」。

### 怎么验证脚本没坏

沙箱里不能直接调 cmd，写个 `.mjs` 用 `child_process` 跑（去掉 `pause` 的副本），
断言三件事：`exit=0`、**没有「不是内部或外部命令」**、`tools/` 没多出文件。

---

## 3.10 前端实时渲染：一个我修错方向的 bug

**现象**（主人报的）：发完消息，**对话区一片空白**，要切出去再进来才能看到内容。

### 第一次修错了

我先猜是「资产栏收起」+「文件不实时刷新」+「SSE 收尾丢数据」，
修了这三处（`faa0c5c`）—— 它们**确实都是真 bug**，但**不是这个现象的原因**。
修完用户说还是这样。

### 第二次：先复现，再定位

加了调试参数 **`?autosend=<文本>`**（页面加载后自动发一句），
headless 打开、等 60 秒截图 —— 一次就复现了：
用户消息在、顶栏显示「制作中」、**对话区空白**。

根因：

```js
case 'status':
  if (state.work) state.work._now.textContent = event.text;   // ← state.work 为 null 时啥也不做
  break;
```

工作记录卡**只在收到第一个 `think_delta` / `tool` 时才创建**，
而模型开头那几十秒只在憋思考、服务端**只发 `status`** —— 事件全被静默丢弃。
「切出去再进来」能看到，是因为那时 chat 已落库，`renderHistory` 会重放。

### 修法（`00a3ecc`）

1. `runChat` 发请求前**主动 `workCard()`** →「正在制作 · 正在连接模型…」立刻出现
   （主站也是这个行为：一开工就有这张卡）
2. `status` 事件兜底：`state.work` 为空就现场建卡
3. `finishRun` 里若一步都没跑成（一上来就报错），撤掉空卡别留误导

### 教训

用户说「要刷新才能看到」，**不要凭猜改代码**。先做一个能一键复现的入口
（`?autosend=` 就是这个用途），截图对比修前修后，再动刀。

---

## 3.11 调试用 URL 参数

都只影响前端行为，正常访问不会触发：

| 参数 | 作用 |
|---|---|
| `?app=1` | 跳过启动页直接进工作台 |
| `?chat=<id>` | 直接打开某个项目（可收藏 / 分享） |
| `?usage=1` | 打开上下文用量详情弹窗 |
| `?buildenv=1` | 展开构建环境菜单 |
| `?benchid=<物品id>` | 直接摊开预览台里那一格的详情 |
| `?update=1` | 立刻检查更新 |
| `?autosend=<文本>` | 加载后自动发一句（复现实时渲染类问题） |
| `?theme=dark` | 深色主题 |

---

## 3.12 SSE 流从来不关：发送键卡灰（2026-09-17 修）

**现象**（主人报的）：任务跑完（哪怕是报错结束），右下角**发送键一直是灰的**，
鼠标悬停提示「这一轮还在跑」，顶栏一直显示「制作中」+ 停止键，
**必须刷新页面**才能继续发消息。和 3.10 那个「对话区空白」是两个不同的 bug。

### 根因：服务端写了 SSE 响应头，却从来不 `res.end()`

```js
// server.js —— /api/chat 旧写法
const emit = (obj) => { try { sseSend(res, obj); } catch {} };
runAgent(chat, emit).catch((e) => {
  sseSend(res, { k: 'error', text: String(e.message || e) });
  sseSend(res, { k: 'run_end' });
});
return;                       // ← 就撒手了，没人关流
```

`sseOpen()` 写了 `Content-Type: text/event-stream` + `Connection: keep-alive`
之后只 `res.write()`，**全文件 10 处 `res.end()` 没有一处在 `/api/chat` 这条流里**。
而前端 `runChat()` 的读取循环**只在读到 `done` 时跳出**，
`case 'run_end': break;` 是空实现 —— 两端都以为对方会收尾，结果谁都没收。

刷新能好，是因为重载后 `state.running` 默认 false，且服务端 `chat.busy`
已在 `runAgent` 的 finally 里置回 false，所以刷新后能正常发。

### 实测复现（改之前）

`node tools/check-stream.mjs http://127.0.0.1:8787`：

```
[0.1s] run_end 收到
[0.1s] files 收到
[20.3s] 连接已关闭 : false        ← 20 秒都不关
结论：❌ 复现成功
```

用无头 Chrome 走 `?autosend=` 看真实界面，任务报错后 **40 秒**仍是
`runState=制作中, sendDisabled=true`；修好之后同样场景 **2 秒**内变成
`runState=空闲, sendDisabled=false`。

### 修法（两边都补）

1. **server.js**：`runAgent(...)` 后面接 `.finally(() => { streamClosed = true; res.end(); })`，
   并给 `emit` 加关流标记（`res.end()` 之后再 `write` 会抛
   `ERR_STREAM_WRITE_AFTER_END`，而 `runAgent` 的 finally 里还挂着不 await 的
   `autoSummarizeMemory`，它可能比流关得晚）。
2. **public/app.js**：`case 'run_end'` 从空实现改成调 `finishRun()`，
   不再只依赖「流关闭」这一条路；`finishRun()` 加 `state.finished` 幂等保护
   （`run_end` 和流关闭都会触发，只认第一次）。

### 顺手修的

`server.js` 启动日志硬编码着 `automods-lite v0.4`，改版本号也永远显示 v0.4 ——
改成读 `LOCAL_VERSION`。判断版本别信这行日志。

### 新增工具

`tools/check-stream.mjs` —— 回归检查，断言 `run_end` 之后流会关。
退出码 `0` 通过 / `1` 回归 / `2` 没等到 run_end。需要服务已在跑：

```powershell
node tools/check-stream.mjs            # 默认 127.0.0.1:8787
```

### 教训

**SSE 这种「长连接 + 单次任务」的接口，收尾必须显式关流，不能指望连接自己断。**
两端各自以为对方会收尾，就是这种「界面永远转圈、刷新才好」的经典成因。

---

## 4. 关键配置（config.json）

当前本机示例（勿提交到 git）：

**对话**

- `baseUrl`: `https://token.sensenova.cn/v1`
- `model`: `deepseek-v4-pro`
- `reasoningEffort`: **high**（曾用 max，大需求会烧光 token 只思考）
- `apiTimeoutSec`: 180
- `apiRetries`: **6**（长任务会撞 429，4 次不够；429 单独一档退避 5s–60s）
- `contextLength`: **`256k`**（可选 `1m`）—— **这是主导项**，按 token 算容量
- `historyLimit`: 160（**已降级成条数兜底**，不再主导截断；token 预算先起效）
- `maxTokens`: 32768

**编译**

- `gradleCmd`: 空（工程内需 `gradlew`，或设置里填本机 gradle）
- `gradleTimeoutSec`: **1500**（第一次要反编译整个 Minecraft，180 秒必超）

**生图（贴图工坊）**

- `imageBaseUrl` / `imageApiKey`: 空 = 沿用上面的 `baseUrl` / `apiKey`
- `imageModel`: `sensenova-u1.5-lite`（可选 `sensenova-u1-fast`）
- `imageSize`: 见 `GET /api/image/sizes`（U1.5 Lite 6 档 / U1 Fast 11 档）
- `imageScale`: 64（存进工程前缩到多少像素；0 = 原图）
- `imageOutputFormat` / `imageResponseFormat` / `imageWatermark` / `imagePromptExtend`:
  对应官方 `output_format` / `response_format` / `watermark` / `prompt_extend`，
  后两项**只有 U1.5 Lite 支持**（U1 Fast 传了会报错，代码里已按模型屏蔽）

**教训：**

- 推理 **max** + 复杂世界/大型需求 → 模型可思考 8 分钟+ 仍不 `write_file`
- **high** 更稳；先骨架再细节
- `historyLimit` 过大 + 未压缩工具全文 → 请求体膨胀、易 429/慢
- 上下文占用看 `GET /api/context?chatId=`（按字符/2 粗估 token），
  别再用「多少条消息」去理解 —— 那是旧的、看不懂的口径

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
    probe-image.mjs    # 探生图接口
    update-core.ps1    # 客户端更新脚本（带 UTF-8 BOM，勿去）
  server.js            # 主服务
  updater.mjs          # 应用内更新
  boot.js              # 启动入口（应用 pending server.js）
  update.bat           # 客户端更新入口（纯 ASCII，勿加中文）
  .gitattributes       # `*.ps1 -text` / `*.bat -text`，防行尾转换弄坏 BOM
```

测试用工程示例：`workspace/projects/p_f239d44f/`（发光方块，15 文件，已写完未编译）；`workspace/projects/p_15dfe7ca/`（喷火剑，11 文件，已写完未编译）。

---

## 6. 已知限制 / 后续可做

1. **`workspace/`（主人的模组工程）目前仍会上传且可下载** —— 资源共享是刻意的
   （访客才有样例可看），但要是哪天不想给，就把 `workspace/projects/`
   也加进 `publish-prepare.mjs` 的 `PRIVATE` 列表。

   ~~线上落后于仓库~~ → **已解决**：2026-09-17 旧链接下线后重新发布，
   线上已是 0.5.1（`/api/health` 可验）。注意**下线后重新发布会复用同一个沙箱，
   地址不变**，想彻底换地址得换目录名/项目名。
2. 无真正的本地「语义压缩」；靠 tool 回执瘦身 + token 预算截断（contextLength 256K/1M）
3. 编译 jar 依赖本机 Gradle/`gradlew`；**超时要设 1500**（默认值偏小，
   第一次反编译 Minecraft 180 秒必超）
4. ~~贴图 png 无法生成，只能写路径~~ → **已解决**：贴图工坊走 SenseNova
   `/v1/images/generations`（文生图）+ `/v1/images/edits`（图生图），
   出图后用 System.Drawing NearestNeighbor 缩到 16/32/64/128 存进工程
5. 官方 DeepSeek / 中转：长思考仍可能被上游掐；客户端已尽量保留思考并提示
6. **长任务容易撞 429**：一次复杂任务（37 文件 / 52 次 write_file）就会触发。
   已把 429 退避放宽到下限 5s / 上限 60s、重试提到 6 次；根治要靠减少
   单文件往返（引导模型一次多写几个文件），目前没做
7. 应用内更新后若不重启，`server.js` 热更可能走 `server.pending.js`
8. 主站的粒子监视器（`.hx-monitor` / `.hx-bench` 画布动画）本地版只留 DOM 占位，未接 canvas 动效
9. `.bbmodel` 模型用 three.js 渲染缩略图，本地版没下 three.js，只下文件不渲图
10. 主站的「建模 / 模型市场 / 我的资产」三项云端服务本地版只占位；
    「贴图」已本地实现（见 4）

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
- 是否仍在用旧版：`/api/health` 的 `version`（**不是** `update.json` ——
  服务启动时才读版本，改完不重启仍显示旧值）
- 8787 是否被旧进程占用（`netstat -ano | findstr 8787`）
- 前端行为异常时，先 `Ctrl+Shift+R` 强刷（静态文件是 `no-cache`，但浏览器仍可能留旧 JS）
- **发送键变灰 / 一直显示「制作中」**：先跑 `node tools/check-stream.mjs`；
  退出码 1 就是 3.12 那个流没收尾的回归
- 改过 `server.js` 后**必须重启服务**（`启动.bat` / `node boot.js`），
  改过 `public/app.js` 后**必须强刷浏览器**，否则看到的还是旧行为
- **跑完更新脚本后服务起不来 / 文件尺寸明显变小**：多半是老版 `update.bat`
  把副本写坏了（见 3.9），按那里的正确步骤重来一遍

**冒烟一次**

```powershell
node tools/smoke.mjs "加一个会发光的方块"
# 看到 files / run_end 即通过；脚本收到 files 后主动退出
```

**查流收尾有没有回归**（3.12 那个 bug）

```powershell
node tools/check-stream.mjs
# 退出码 0 = 流正常关；1 = 回归（发送键会卡灰）；2 = 服务没在跑
```

**推新版本**

1. 改 `package.json` + `update.json` 的 version/notes  
2. `git add` 相关文件（**不要** add `config.json` `usage.json` `chats/` `workspace/`）  
3. `git commit -F <消息文件>` —— **别用 `-m` 带反引号**，bash 会当命令替换执行
4. `git push origin main`（见下面的代理）

**这台机器的 git 网络（会变，别照抄）**

`127.0.0.1:10808`（clash）实测**是通的**。所以推 GitHub 用：

```bash
git -c http.proxy=http://127.0.0.1:10808 -c https.proxy=http://127.0.0.1:10808 push origin main
```

> 反面经验：曾经记着「10808 不通、要清空代理」，结果清空后走直连 21 秒超时失败。
> **先 `curl -x http://127.0.0.1:10808 -o /dev/null -w "%{http_code}" https://github.com` 探一下**，
> 通了就用它，别凭记忆。
> 推完必须**独立复核**：`git ls-remote origin refs/heads/main` 或 GitHub API
> 对比本地 HEAD —— `git log origin/main..HEAD` 在 remote-tracking 引用丢失时会给出
> 假的「0 个待推送」。

**给别人本地副本更新**

改完 `update.bat` / `tools/update-core.ps1` 后**必须先 push 再让别人跑** ——
否则对方自更新时会被仓库里的旧版覆盖回去。

> **前提是对方那份的 `update.bat` 已经是新版（0.5.0 起）。**
> 对方若还停在 0.3.x / 0.4.0，**先让他把 `update.bat` 换成新的单文件再跑**，
> 否则会按 3.9 那条把副本写坏。

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
| 更新器（应用内） | `updater.mjs` |
| 更新入口（给别人的副本） | `update.bat` → `tools/update-core.ps1` |
| 启动 | `boot.js` / `启动.bat` / `start.bat` |
| 冒烟脚本 | `tools/smoke.mjs` |
| 流收尾回归检查 | `tools/check-stream.mjs` |
| 发布前摘除私有数据 | `tools/publish-prepare.mjs` |
| 发布后还原私有数据 | `tools/publish-restore.mjs` |
| 生图接口探测 | `tools/probe-image.mjs` |
| 远端版本清单 | `update.json` |

**接口速查**

| 接口 | 用途 |
|---|---|
| `GET /api/health` | 版本 / 工作区（判断线上新旧） |
| `GET /api/env` | gradle / JDK 状态（输入栏构建徽章） |
| `GET /api/build/doctor` | 构建环境体检 |
| `POST /api/build/setup` | 一键准备构建环境 |
| `POST /api/build` | 编译（失败返回 400 + 完整日志） |
| `GET /api/bench?project=` | 预览台（资产 / 配方 / 模型） |
| `GET /api/context?chatId=` | 上下文用量（按类拆分） |
| `POST /api/image` | 生图 / 图生图（`mode=generate\|edit`） |
| `GET /api/image/sizes` | 各模型的尺寸与能力元数据 |
| `POST /api/chats/:id/archive` | 归档 / 恢复 |
| `POST /api/chats/:id/rename` | 重命名 |
| `GET /api/usage` | 本机累计用量 |
| `POST /api/update` / `/api/update/apply` | 检查更新 / 应用更新 |