/* NeoForge static code checker — pure client-side pattern rules */
(function () {
  "use strict";

  function makeIssue(level, title, body, fix) {
    return { level: level, title: title, body: body, fix: fix || null, line: null };
  }

  function countLines(text) {
    if (!text) return 0;
    return text.replace(/\r\n/g, "\n").split("\n").length;
  }

  function linesOf(text) {
    return text.replace(/\r\n/g, "\n").split("\n");
  }

  function findLine(lines, re) {
    for (var i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) return i + 1;
    }
    return null;
  }

  function checkJava(code) {
    var issues = [];
    var lines = linesOf(code);
    var hasPackage = /package\s+[\w.]+/.test(code);
    var hasModAnno = /@Mod\s*\(/.test(code);
    var hasModIdField = /MOD_ID\s*=/.test(code);
    var hasDeferred = /DeferredRegister/.test(code);
    var hasRegisterBus = /\.register\s*\(\s*(modEventBus|modBus|eventBus|bus)/.test(code)
      || /ITEMS\.register\s*\(/.test(code) && /modEventBus/.test(code);
    var hasEventSub = /@EventBusSubscriber/.test(code);
    var hasSubscribe = /@SubscribeEvent/.test(code);
    var usesNeoForgeBus = /NeoForge\.EVENT_BUS/.test(code);

    if (!hasPackage && code.trim().length > 40) {
      var n = makeIssue(
        "warn",
        "缺少 package 声明",
        "Java 源文件通常应有 package。MDK 结构下主类和注册类都要在你自己的包里。",
        "package com.example.studymod;"
      );
      n.line = 1;
      issues.push(n);
    }

    if (hasModAnno) {
      if (!hasModIdField && !/@Mod\s*\(\s*"[a-z0-9_]+"/.test(code)) {
        var n2 = makeIssue(
          "error",
          "@Mod 注解缺少稳定 modId",
          "推荐 @Mod(YourClass.MOD_ID) 或至少 @Mod(\"yourmodid\")，且与 neoforge.mods.toml 的 modId 一致。",
          "public static final String MOD_ID = \"studymod\";\n@Mod(MOD_ID)"
        );
        n2.line = findLine(lines, /@Mod/);
        issues.push(n2);
      }
      var mid = code.match(/@Mod\s*\(\s*(?:MOD_ID|\"([a-z0-9_]+)\")\s*\)/);
      if (mid && mid[1] && mid[1] !== mid[1].toLowerCase()) {
        var n3 = makeIssue(
          "error",
          "modId 含大写",
          "modId 必须全小写，资源目录与注册名都要跟它对齐。",
          "modId = studymod"
        );
        issues.push(n3);
      }
      if (!hasDeferred && !/register\(modEventBus\)/.test(code)) {
        var n4 = makeIssue(
          "info",
          "主类未发现注册调用",
          "如果本类是主类，通常要在构造器里 ModItems.ITEMS.register(modEventBus) 之类。",
          "ModItems.ITEMS.register(modEventBus);"
        );
        n4.line = findLine(lines, /public\s+\w+\s*\(/);
        issues.push(n4);
      }
    }

    if (hasDeferred && !hasRegisterBus && !hasModAnno) {
      var n5 = makeIssue(
        "warn",
        "DeferredRegister 未见到接总线",
        "本文件若包含 DeferredRegister，需要在主类构造器里 register(modEventBus)。若 bus 接线在别的文件，可忽略此条。",
        "YOUR_REGISTER.register(modEventBus);"
      );
      issues.push(n5);
    }

    if (hasDeferred) {
      if (/DeferredRegister\.create\s*\(/.test(code) && !/createItems|createBlocks|Registries\./.test(code)) {
        var n6 = makeIssue(
          "info",
          "使用了通用 create(...) ",
          "NeoForge 1.21 推荐 DeferredRegister.createItems / createBlocks 糖方法，更短也更不易写错注册表。",
          "DeferredRegister.Items ITEMS = DeferredRegister.createItems(MOD_ID);"
        );
        issues.push(n6);
      }
    }

    if (/register\s*\(\s*\"[A-Z]/.test(code)) {
      var n7 = makeIssue(
        "error",
        "注册名以大写开头",
        "注册名必须全小写 + 下划线，例如 ruby_dust。",
        'register("ruby_dust", ...)'
      );
      n7.line = findLine(lines, /register\s*\(\s*\"[A-Z]/);
      issues.push(n7);
    }

    if (hasEventSub && !/@EventBusSubscriber\s*\(/.test(code) === false) {
      if (!hasSubscribe && /@EventBusSubscriber/.test(code) && !/static void|static .*void/.test(code)) {
        var n8 = makeIssue(
          "warn",
          "有 @EventBusSubscriber 但未发现 @SubscribeEvent 方法",
          "事件类需要 public static 方法并标 @SubscribeEvent。",
          "@SubscribeEvent\nstatic void onX(SomeEvent event) { ... }"
        );
        issues.push(n8);
      }
    }

    if (hasSubscribe && !hasEventSub && !usesNeoForgeBus) {
      var n9 = makeIssue(
        "warn",
        "@SubscribeEvent 可能未被订阅",
        "方法必须在 @EventBusSubscriber 类中，或通过 NeoForge.EVENT_BUS.addListener(...) 订阅，否则不会触发。",
        "@EventBusSubscriber(modid = MOD_ID)\npublic class ModEvents { ... }"
      );
      issues.push(n9);
    }

    if (/PlayerInteractEvent|PlayerTickEvent|LivingDeathEvent|LivingHurtEvent/.test(code)
      && /@EventBusSubscriber\s*\([^)]*Bus\.MOD/.test(code)) {
      var n10 = makeIssue(
        "error",
        "玩法事件订到了 MOD 总线",
        "玩家交互/tick/受伤属于游戏运行时事件，应使用默认 NeoForge 总线，不是 Bus.MOD。",
        "@EventBusSubscriber(modid = StudyMod.MOD_ID)"
      );
      issues.push(n10);
    }

    if (/Registries\.ITEM|createItems|ITEMS\.register/.test(code)
      && /@EventBusSubscriber\s*\([^)]*NeoForge\.EVENT_BUS/.test(code)
      && /register\s*\(/.test(code)) {
      var n11 = makeIssue(
        "warn",
        "注册类疑似放错总线",
        "物品/方块注册属于 MOD 总线生命周期；请在主类构造器用 modEventBus，而不是 NeoForge.EVENT_BUS。",
        "ModItems.ITEMS.register(modEventBus);"
      );
      issues.push(n11);
    }

    if (/stacksTo\s*\(\s*\d+/.test(code)) {
      var m = code.match(/stacksTo\s*\(\s*(\d+)\s*\)/);
      if (m) {
        var v = parseInt(m[1], 10);
        if (v < 1 || v > 64) {
          var n12 = makeIssue(
            "error",
            "stacksTo 超出 1–64",
            "物品堆叠上限通常是 1–64。",
            "stacksTo(16)"
          );
          issues.push(n12);
        }
      }
    }

    if (/new Item\s*\(\s*\)/.test(code)) {
      var n13 = makeIssue(
        "error",
        "Item 构造器缺少 Properties",
        "1.21 中 new Item() 可能无对应构造；应传入 new Item.Properties()。",
        "new Item(new Item.Properties())"
      );
      issues.push(n13);
    }

    if (/requiresCorrectToolForDrops/.test(code) && /class\s+ModBlocks|BLOCKS\.register/.test(code)) {
      var n14 = makeIssue(
        "info",
        "记得补挖掘标签",
        "requiresCorrectToolForDrops() 之后，还要在 data/<modid>/tags/block/mineable/pickaxe.json 等标签里登记，否则正确工具也不掉。",
        'data/studymod/tags/block/mineable/pickaxe.json'
      );
      issues.push(n14);
    }

    if (/examplemod/i.test(code) && !hasModAnno) {
      var n15 = makeIssue(
        "info",
        "仍出现 examplemod 字样",
        "发布前把 MDK 默认 id 全部替换为你的 modId，避免和教程残留混淆。",
        "全局替换 examplemod → studymod"
      );
      issues.push(n15);
    }

    if (code.indexOf("\t") !== -1 && code.indexOf("    ") !== -1) {
      var n16 = makeIssue(
        "info",
        "Tab 与空格混用",
        "建议统一 4 空格缩进，避免 IDEA/差异对比噪音。",
        null
      );
      issues.push(n16);
    }

    // Positive signals when main class looks solid
    if (hasModAnno && hasModIdField && hasRegisterBus) {
      issues.push(makeIssue(
        "info",
        "主类骨架看起来完整",
        "已看到 @Mod、MOD_ID 与 register(modEventBus)。继续检查包名与 mods.toml 是否一致。",
        null
      ));
    }

    return issues;
  }

  function checkJson(code) {
    var issues = [];
    var text = code.trim();
    if (!text) return [makeIssue("error", "内容为空", "请先粘贴 JSON。", null)];

    var parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      var msg = String(e && e.message ? e.message : e);
      issues.push(makeIssue("error", "JSON 语法错误", msg, "检查逗号、引号、括号是否配对；最后一项后不要多余逗号。"));
      return issues;
    }

    if (parsed && typeof parsed === "object") {
      var isItemModel = parsed.parent && parsed.textures && !parsed.variants;
      var isBlockModel = parsed.parent && /block\//.test(parsed.parent);
      var isBlockstate = parsed.variants != null;
      var isRecipe = parsed.type && (parsed.result || parsed.ingredients || parsed.pattern);
      var isLang = !parsed.parent && !parsed.variants && !parsed.type && !parsed.replace && !parsed.values;

      if (isItemModel || isBlockModel) {
        var tex = parsed.textures || {};
        Object.keys(tex).forEach(function (k) {
          var id = String(tex[k]);
          if (!/^[a-z0-9_.-]+:(item|block)\/[a-z0-9_/.-]+$/.test(id)) {
            issues.push(makeIssue(
              "error",
              "贴图路径格式可疑",
              "期望 modid:item/name 或 modid:block/name（全小写）。当前：" + id,
              '"layer0": "studymod:item/ruby"'
            ));
          }
          if (/[A-Z]/.test(id)) {
            issues.push(makeIssue(
              "error",
              "贴图路径含大写",
              "资源路径必须全小写，Linux 服务器会直接失败。",
              "studymod:item/ruby_dust"
            ));
          }
        });
        if (parsed.parent === "minecraft:item/generated" && !tex.layer0) {
          issues.push(makeIssue(
            "error",
            "generated 物品模型缺少 layer0",
            "普通物品模型需要 textures.layer0。",
            '"textures": { "layer0": "studymod:item/ruby" }'
          ));
        }
      }

      if (isBlockstate) {
        var vars = parsed.variants || {};
        if (!Object.keys(vars).length) {
          issues.push(makeIssue("error", "blockstates.variants 为空", "至少需要一个默认变体。", '"": { "model": "studymod:block/x" }'));
        }
        Object.keys(vars).forEach(function (k) {
          var v = vars[k];
          var model = Array.isArray(v) ? (v[0] && v[0].model) : (v && v.model);
          if (model && /[A-Z]/.test(model)) {
            issues.push(makeIssue("error", "blockstate 模型路径含大写", model, "全小写"));
          }
        });
      }

      if (isRecipe) {
        if (!parsed.result) {
          issues.push(makeIssue("error", "配方缺少 result", "合成/熔炼结果必须存在。", '"result": { "id": "studymod:ruby_block", "count": 1 }'));
        } else {
          var rid = parsed.result.id || parsed.result.item;
          if (!rid) {
            issues.push(makeIssue(
              "error",
              "result 未写 id/item",
              "1.21.1 常见形态是 {\"id\": \"modid:name\", \"count\": n}，以你版本日志为准。",
              '"result": { "id": "studymod:ruby", "count": 1 }'
            ));
          }
          if (rid && /[A-Z]/.test(String(rid))) {
            issues.push(makeIssue("error", "结果物品 id 含大写", String(rid), "modid 和 name 都必须小写"));
          }
        }
        if (parsed.type === "minecraft:crafting_shaped") {
          if (!parsed.pattern || !parsed.pattern.length) {
            issues.push(makeIssue("error", "shaped 配方缺少 pattern", "pattern 是字符串数组，例如 [\"RRR\",\"RRR\",\"RRR\"]。", null));
          }
          if (!parsed.key) {
            issues.push(makeIssue("error", "shaped 配方缺少 key", "pattern 里的每个字母都要在 key 中定义。", '"key": { "R": { "item": "studymod:ruby" } }'));
          }
        }
        if (parsed.type === "minecraft:crafting_shapeless" && !parsed.ingredients) {
          issues.push(makeIssue("error", "shapeless 配方缺少 ingredients", null, '"ingredients": [{ "item": "studymod:ruby" }]'));
        }
      }

      if (isLang) {
        Object.keys(parsed).forEach(function (k) {
          if (/[A-Z]/.test(k) && !/^\s*$/.test(k)) {
            // translation keys are usually lowercase; allow %s etc
            if (/^[a-z]/.test(k) || /item\.|block\.|effect\.|itemGroup\./.test(k)) {
              issues.push(makeIssue(
                "warn",
                "翻译键含大写",
                "惯例上翻译键全小写。键：" + k,
                null
              ));
            }
          }
        });
        var keys = Object.keys(parsed);
        var missingHint = keys.filter(function (k) { return /^item\.|^block\.|^effect\./.test(k); });
        if (keys.length && !missingHint.length) {
          issues.push(makeIssue(
            "info",
            "未识别到 item./block./effect. 前缀键",
            "若这是模组语言文件，物品键应为 item.<modid>.<name>。",
            '"item.studymod.ruby": "红宝石"'
          ));
        }
      }
    }

    if (!issues.length) {
      issues.push(makeIssue("info", "JSON 可解析", "语法正确。若路径与 modId 仍显示紫黑，请核对文件放置目录。", null));
    }

    return issues;
  }

  function checkToml(code) {
    var issues = [];
    var text = code;
    if (!text.trim()) return [makeIssue("error", "内容为空", "请粘贴 neoforge.mods.toml。", null)];

    var modIdMatch = text.match(/modId\s*=\s*"([^"]+)"/);
    var hasLoader = /modLoader\s*=\s*"javafml"/.test(text);
    var hasNeoforgeDep = /\[\[dependencies\.[^\]]+\]\][\s\S]*modId\s*=\s*"neoforge"/.test(text);
    var hasMinecraftDep = /modId\s*=\s*"minecraft"/.test(text);
    var hasVersionRange = /versionRange\s*=\s*"\[[^"]+\]"/.test(text);

    if (!hasLoader) {
      issues.push(makeIssue(
        "error",
        "modLoader 不是 javafml",
        "NeoForge 模组通常 modLoader = \"javafml\"。",
        'modLoader = "javafml"'
      ));
    }

    if (!modIdMatch) {
      issues.push(makeIssue("error", "未找到 modId", "必须有 modId = \"yourmod\"。", 'modId = "studymod"'));
    } else if (modIdMatch[1] !== modIdMatch[1].toLowerCase()) {
      issues.push(makeIssue("error", "modId 含大写", "modId：" + modIdMatch[1], "只允许 [a-z0-9_]"));
    }

    if (!/\[\[mods\]\]/.test(text)) {
      issues.push(makeIssue("error", "缺少 [[mods]] 段", "至少要有一个 [[mods]] 定义。", null));
    }

    if (!hasNeoforgeDep) {
      issues.push(makeIssue(
        "error",
        "缺少 neoforge 依赖",
        "应声明对 neoforge 的 required 依赖。",
        '[[dependencies.yourmod]]\nmodId = "neoforge"\ntype = "required"\nversionRange = "[21.1,)"\nordering = "NONE"\nside = "BOTH"'
      ));
    }

    if (!hasMinecraftDep) {
      issues.push(makeIssue(
        "warn",
        "缺少 minecraft 依赖",
        "建议声明 minecraft 版本范围，避免被装进错误版本。",
        'versionRange = "[1.21.1,1.22)"'
      ));
    }

    if (!hasVersionRange) {
      issues.push(makeIssue("warn", "未看到 versionRange", "依赖需要 versionRange。", 'versionRange = "[21.1,)"'));
    }

    if (!/license\s*=/.test(text)) {
      issues.push(makeIssue("warn", "缺少 license 字段", "发布前写清许可证。", 'license = "MIT"'));
    }

    if (/mods\.toml/i.test(text) === false && /modId\s*=\s*"examplemod"/.test(text)) {
      issues.push(makeIssue(
        "info",
        "仍是 examplemod",
        "把示例 id 换成你的，并与 Java MOD_ID、assets/ 目录一致。",
        null
      ));
    }

    if (!issues.length) {
      issues.push(makeIssue("info", "清单看起来完整", "已看到 javafml、mods 段与 neoforge 依赖。", null));
    }

    return issues;
  }

  function runCheck(lang, code) {
    var issues;
    if (lang === "json") issues = checkJson(code);
    else if (lang === "toml") issues = checkToml(code);
    else issues = checkJava(code);

    var errors = issues.filter(function (i) { return i.level === "error"; }).length;
    var warns = issues.filter(function (i) { return i.level === "warn"; }).length;
    var infos = issues.filter(function (i) { return i.level === "info"; }).length;

    return {
      lang: lang,
      lines: countLines(code),
      issues: issues,
      errors: errors,
      warns: warns,
      infos: infos
    };
  }

  window.NFChecker = { runCheck: runCheck };
})();
