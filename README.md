# automods-lite

本地自用：**分章学习 + 章内提问 + AI 自定义章节 + 代码体检 + 对话写模组文件**。

仓库：https://github.com/43456-awa/automods-lite （Public）

## 首次安装（给朋友）

1. 打开 https://github.com/43456-awa/automods-lite → **Code → Download ZIP**
2. 解压到例如 `D:\automods-lite`
3. 双击文件夹里的 **`启动.bat`**（会自动打开浏览器）
4. 网页左下角 **设置** → 填 API Key → 保存

需要已安装 [Node.js LTS](https://nodejs.org/)。若没有 `config.json`，启动时会自动从模板生成。

命令行用户也可以：

```powershell
cd 路径\automods-lite
npm start
```

## 以后更新（不用敲 git）

1. 打开应用 → 顶栏 **检查更新**
2. 有新版 → **确定一键更新**（自动下 GitHub 压缩包并覆盖源码）
3. **关闭页面**，再 `npm start` 或双击启动方式重开

会保留：`config.json`、`chats/`、`workspace/`、`chapters/`（你的对话、工程、自定义章节）。

## 学习

| 轨道 | 内容 |
|------|------|
| NeoForge 模组 | 10 章 |
| Java 基础 | 5 章 |
| 自定义章节 | AI 按主题生成，如「自定义群系」 |

- 章内提问、代码体检（Java / JSON / TOML）

## 工作台

- 流式对话写文件、停止、独立工程、可选 Gradle、清历史

## 目录

```
boot.js            # 启动入口（应用挂起更新）
server.js
learn.mjs
updater.mjs        # GitHub zip 一键更新
content/ public/
workspace/ chats/ chapters/   # 本地数据，不进 git
config.json
update.json        # 远程版本号（发版时改这个）
```

发新版本时：改 `package.json` 与 `update.json` 的 `version`，`git push` 即可。
