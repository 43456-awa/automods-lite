# automods-lite

本地自用：**分章学习 + 章内提问 + AI 自定义章节 + 代码体检 + 对话写模组文件**（v0.3）。

## 启动

```powershell
cd automods-lite
node server.js
```

打开 <http://127.0.0.1:8787>，左上角切换 **学习 / 工作台**。

## 学习

| 轨道 | 内容 |
|------|------|
| NeoForge 模组 | 10 章：环境 → 注册 → 资源 → 事件 → 效果 → 配方 → 发布 |
| Java 基础 | 5 章：变量流程 / 类对象 / 泛型集合 / 空与异常 / Lambda |
| 自定义章节 | 点「＋ AI 生成章节」，例如「怎么生成自定义群系」 |

- 每章底部 **本章提问**（带上章节内容回答）
- 侧栏 **代码体检**（Java / JSON / TOML 规则检查）
- 自定义章可删除；存在 `chapters/*.json`

## 工作台

- 流式对话、停止、工具写盘
- 每对话独立工程 `workspace/projects/p_xxxxxxxx/`
- 可选 Gradle：工程内 `gradlew` 或设置里 `gradleCmd`
- 清历史（保留最近 N 轮，文件不动）

## 配置

设置里填 OpenAI 兼容 API（Base URL / Key / 模型）与 modId、MC 版本。

## 目录

```
automods-lite/
  server.js          # API + Agent
  learn.mjs          # 课程 / 提问 / 生成章节
  content/           # 内置章节源
  chapters/          # 自定义章节 JSON
  public/            # 前端
  workspace/projects/
  chats/
  config.json
```

仅监听 `127.0.0.1`。不包含 AutoMods 品牌与积分逻辑。
