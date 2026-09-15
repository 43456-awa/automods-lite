/* Chapter content — NeoForge 1.21.1 tutorial */
window.NF_CHAPTERS = [
  {
    id: "env",
    title: "环境与版本",
    short: "环境与版本",
    lead: "先把工具链钉死：JDK 21、IntelliJ IDEA、NeoForge 1.21.1 MDK。版本不对，后面全是玄学错误。",
    tags: ["JDK 21", "IDEA", "NeoForge 1.21.1", "PCL2"],
    body: `
<h2>你将得到什么</h2>
<p>本教程按 <strong>NeoForge 1.21.1</strong> 写。它是目前最稳、文档最全的线之一；你后面若升 1.21.4+，大体概念仍通用，但 API 细节会变，别混着抄。</p>

<div class="tag-row">
  <span class="tag ok">Minecraft 1.21.1</span>
  <span class="tag ok">NeoForge 21.1.x</span>
  <span class="tag diamond">Java / JDK 21</span>
  <span class="tag">Gradle 8.8+</span>
</div>

<h2>1. 安装 JDK 21</h2>
<p>Minecraft 1.20.5 起官方要求 Java 21。用 17 或 8 会直接启动失败或编译报「class file has wrong version」。</p>

<ol class="steps">
  <li>
    <strong>下载 JDK 21</strong>
    <p>推荐 <span class="inline-code">Temurin 21</span>（Adoptium）或 Oracle OpenJDK 21。Windows 选 x64 .msi 安装包。</p>
  </li>
  <li>
    <strong>验证安装</strong>
    <p>PowerShell 里执行：</p>
  </li>
</ol>

<div class="codeblock" data-lang="powershell">
  <div class="codeblock-head"><span class="codeblock-lang">powershell</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>java -version
# 期望输出类似：openjdk version "21.0.x"</code></pre>
</div>

<div class="note warn">
  <div class="note-title">常见坑</div>
  <p>机器上同时有 8 / 17 / 21 时，<span class="inline-code">JAVA_HOME</span> 必须指向 21。Gradle 用的是 <span class="inline-code">JAVA_HOME</span>，不是你在 IDEA 里随手选的那个运行时。</p>
</div>

<h2>2. 安装 IntelliJ IDEA</h2>
<p>社区版（Community）足够写模组。Ultimate 不是必需的。</p>
<ul>
  <li>官网下载 IDEA Community</li>
  <li>装好后先不要急着建工程，下一步直接导入 MDK</li>
</ul>

<h2>3. 拿到 NeoForge MDK</h2>
<p>MDK = Mod Development Kit，官方给的「能直接编译的空模组骨架」。</p>
<ol class="steps">
  <li>
    <strong>打开 NeoForge 版本页</strong>
    <p>在 NeoForge 官方文件站选 <strong>Minecraft 1.21.1</strong>，下载 MDK（zip）。</p>
  </li>
  <li>
    <strong>解压到纯英文路径</strong>
    <p>例如 <span class="inline-code">D:\\mods\\myfirstmod</span>。路径里有中文或空格，Gradle 偶发抽风。</p>
  </li>
  <li>
    <strong>用 IDEA 打开</strong>
    <p>File → Open → 选中刚解压的目录（含 <span class="inline-code">build.gradle</span> 的那一层）。等右下角 Gradle 同步跑完。</p>
  </li>
  <li>
    <strong>第一次同步会很久</strong>
    <p>要下 NeoForge、映射、依赖，几分钟到十几分钟正常。失败先看是不是代理/防火墙拦了。</p>
  </li>
</ol>

<h2>4. 用 PCL2 起客户端（可选但推荐）</h2>
<p>调试时不一定每次都要 IDEA 跑完整客户端。常见流程：</p>
<ul>
  <li>在 IDEA 里执行 <span class="inline-code">./gradlew build</span>，产物在 <span class="inline-code">build/libs/</span></li>
  <li>把 <span class="inline-code">xxx-1.0.0.jar</span> 丢进 PCL2 对应版本的 <span class="inline-code">mods</span> 文件夹</li>
  <li>PCL2 选 NeoForge 1.21.1 启动，看日志和游戏内效果</li>
</ul>

<div class="note">
  <div class="note-title">IDE 内一键运行</div>
  <p>Gradle 任务里找 <span class="inline-code">runClient</span> / <span class="inline-code">runServer</span>，双击即可开官方开发客户端。第一次会生成 <span class="inline-code">run/</span> 目录。</p>
</div>

<h2>5. 本章自检清单</h2>
<ul>
  <li><span class="inline-code">java -version</span> 显示 21</li>
  <li>IDEA 能打开 MDK 且 Gradle 同步成功（无红色依赖）</li>
  <li><span class="inline-code">./gradlew build</span> 能跑通（允许首次下载慢）</li>
  <li>知道 jar 在 <span class="inline-code">build/libs/</span></li>
</ul>

<div class="exercise">
  <p class="exercise-label">练习</p>
  <h3>确认你的工具链</h3>
  <p>把下面这段当「环境报告」记下来，后面章节出问题先对版本：</p>
  <p>MC 版本：______ · NeoForge：______ · JDK：______ · IDEA：______ · 安装路径（英文？）：是 / 否</p>
</div>
`
  },
  {
    id: "skeleton",
    title: "项目骨架",
    short: "项目骨架",
    lead: "看懂 mods.toml、主类、注册总线怎么接在一起。这一章不写新功能，先把「模组从哪进入游戏」搞清楚。",
    tags: ["neoforge.mods.toml", "@Mod", "IEventBus", "包结构"],
    body: `
<h2>目录长什么样</h2>
<p>MDK 解压后核心结构如下（已略去 gradle 包装器等）：</p>

<div class="tree">
<div class="dir">myfirstmod/</div>
<div>├── <span class="dir">src/main/java/</span></div>
<div>│   └── <span class="hi">com/example/myfirstmod/MyFirstMod.java</span>  <span class="cm">// 主类</span></div>
<div>├── <span class="dir">src/main/resources/</span></div>
<div>│   ├── <span class="hi">META-INF/neoforge.mods.toml</span>  <span class="cm">// 模组清单（不是 mods.toml 了）</span></div>
<div>│   ├── <span class="dir">assets/&lt;modid&gt;/</span>  <span class="cm">// 贴图、模型、语言</span></div>
<div>│   ├── <span class="dir">data/&lt;modid&gt;/</span>  <span class="cm">// 配方、战利品、标签</span></div>
<div>│   └── pack.mcmeta</div>
<div>├── build.gradle</div>
<div>└── settings.gradle</div>
</div>

<h2>1. neoforge.mods.toml</h2>
<p>NeoForge 已把清单文件改名为 <span class="inline-code">neoforge.mods.toml</span>。旧教程里的 <span class="inline-code">META-INF/mods.toml</span> 是 Forge 的，别照抄。</p>

<div class="codeblock" data-lang="toml">
  <div class="codeblock-head"><span class="codeblock-lang">toml</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>modLoader = "javafml"
loaderVersion = "[4,)"
license = "MIT"

[[mods]]
modId = "myfirstmod"
version = "1.0.0"
displayName = "My First Mod"
description = '''学习用的示例模组'''

[[dependencies.myfirstmod]]
modId = "neoforge"
type = "required"
versionRange = "[21.1,)"
ordering = "NONE"
side = "BOTH"

[[dependencies.myfirstmod]]
modId = "minecraft"
type = "required"
versionRange = "[1.21.1,1.22)"
ordering = "NONE"
side = "BOTH"</code></pre>
</div>

<div class="note danger">
  <div class="note-title">modId 必须全小写</div>
  <p>只能是 <span class="inline-code">[a-z0-9_]</span>，不能以数字开头偏好，不能有大写或空格。资源目录名、注册名都要跟它一致。</p>
</div>

<h2>2. 主类（@Mod 入口）</h2>
<p>游戏加载模组时扫描带 <span class="inline-code">@Mod</span> 注解的类，并调用其构造器。构造器里是做「注册」的地方。</p>

<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-kw">package</span> com.example.myfirstmod;

<span class="tok-kw">import</span> net.neoforged.bus.api.IEventBus;
<span class="tok-kw">import</span> net.neoforged.fml.common.Mod;
<span class="tok-kw">import</span> org.slf4j.Logger;
<span class="tok-kw">import</span> org.slf4j.LoggerFactory;

<span class="tok-ann">@Mod</span>(MyFirstMod.MOD_ID)
<span class="tok-kw">public class</span> <span class="tok-type">MyFirstMod</span> {
    <span class="tok-kw">public static final</span> String MOD_ID = <span class="tok-str">"myfirstmod"</span>;
    <span class="tok-kw">public static final</span> Logger LOGGER = LoggerFactory.getLogger(MyFirstMod.<span class="tok-kw">class</span>);

    <span class="tok-kw">public</span> <span class="tok-type">MyFirstMod</span>(IEventBus modEventBus) {
        <span class="tok-cm">// 后续章节在这里 addListener / register</span>
        LOGGER.info(<span class="tok-str">"MyFirstMod 加载中"</span>);
    }
}</code></pre>
</div>

<h2>3. 两条事件总线，别搞混</h2>
<div class="table-wrap">
  <table>
    <thead>
      <tr><th>总线</th><th>用途</th><th>你怎么拿到</th></tr>
    </thead>
    <tbody>
      <tr>
        <td><code>modEventBus</code></code></td>
        <td>模组生命周期：注册物品/方块、模型事件、公共设置</td>
        <td>主类构造器参数 <code>IEventBus</code></td>
      </tr>
      <tr>
        <td><code>NeoForge.EVENT_BUS</code></td>
        <td>游戏运行时：玩家交互、tick、伤害、命令</td>
        <td><code>NeoForge.EVENT_BUS.addListener(...)</code></td>
      </tr>
    </tbody>
  </table>
</div>

<div class="note warn">
  <div class="note-title">最常见错误</div>
  <p>把物品注册到游戏总线，或把 <span class="inline-code">PlayerInteractEvent</span> 注册到 mod 总线——结果就是「代码看起来对，游戏里没东西 / 事件不触发」。</p>
</div>

<h2>4. 建议包结构</h2>
<div class="tree">
<div class="hi">com.example.myfirstmod/</div>
<div>├── MyFirstMod.java</div>
<div>├── <span class="dir">registry/</span></div>
<div>│   ├── ModItems.java</div>
<div>│   ├── ModBlocks.java</div>
<div>│   └── ModEffects.java</div>
<div>├── <span class="dir">item/</span>          <span class="cm">// 自定义 Item 子类</span></div>
<div>├── <span class="dir">block/</span></div>
<div>├── <span class="dir">event/</span></div>
<div>└── <span class="dir">util/</span></div>
</div>

<p>物品多起来之后，所有注册都堆在主类里会失控。从第二章养成 <span class="inline-code">registry/</span> 分文件习惯。</p>

<h2>5. 本章自检</h2>
<ul>
  <li><span class="inline-code">neoforge.mods.toml</span> 的 <span class="inline-code">modId</span> 与 Java 里 <span class="inline-code">MOD_ID</span> 字符串一致</li>
  <li>主类有 <span class="inline-code">@Mod(MOD_ID)</span></li>
  <li>知道注册要用 <span class="inline-code">modEventBus</span></li>
  <li>包名全小写，符合 Java 规范</li>
</ul>

<div class="exercise">
  <p class="exercise-label">练习</p>
  <h3>改掉模组 ID</h3>
  <p>把 MDK 默认的 <span class="inline-code">examplemod</span> 全部改成你自己的 id（比如 <span class="inline-code">studymod</span>），同步后 <span class="inline-code">runClient</span> 确认 mods 列表里显示你的名字。改完可把主类粘到「代码体检」。</p>
</div>
`
  },
  {
    id: "items",
    title: "物品注册",
    short: "物品注册",
    lead: "用 DeferredRegister 注册一个能进背包、能进创造栏的物品。这是写内容的第一课，后面方块/效果全是同一套模式。",
    tags: ["DeferredRegister", "Item", "CreativeModeTab", "Properties"],
    body: `
<h2>注册三件套</h2>
<p>NeoForge / 现代 Forge 的标准套路永远是：</p>
<ol>
  <li>建 <span class="inline-code">DeferredRegister</span></li>
  <li>在上面 <span class="inline-code">register(...)</span> 具体对象</li>
  <li>把 register <span class="inline-code">register(modEventBus)</span> 接到主类总线</li>
</ol>

<h2>1. ModItems</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-kw">package</span> com.example.studymod.registry;

<span class="tok-kw">import</span> com.example.studymod.StudyMod;
<span class="tok-kw">import</span> net.minecraft.core.registries.Registries;
<span class="tok-kw">import</span> net.minecraft.world.item.Item;
<span class="tok-kw">import</span> net.neoforged.neoforge.registries.DeferredItem;
<span class="tok-kw">import</span> net.neoforged.neoforge.registries.DeferredRegister;

<span class="tok-kw">public final class</span> <span class="tok-type">ModItems</span> {
    <span class="tok-kw">public static final</span> DeferredRegister.Items ITEMS =
            DeferredRegister.createItems(StudyMod.MOD_ID);

    <span class="tok-cm">// 简单物品：无特殊行为</span>
    <span class="tok-kw">public static final</span> DeferredItem&lt;Item&gt; RUBY =
            ITEMS.register(<span class="tok-str">"ruby"</span>, () -&gt; <span class="tok-kw">new</span> Item(<span class="tok-kw">new</span> Item.Properties()));

    <span class="tok-cm">// 可堆叠到 16 的材料</span>
    <span class="tok-kw">public static final</span> DeferredItem&lt;Item&gt; RUBY_DUST =
            ITEMS.register(<span class="tok-str">"ruby_dust"</span>, () -&gt; <span class="tok-kw">new</span> Item(
                    <span class="tok-kw">new</span> Item.Properties().stacksTo(<span class="tok-num">16</span>)));

    <span class="tok-kw">private</span> <span class="tok-type">ModItems</span>() {}
}</code></pre>
</div>

<h2>2. 接到主类</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-kw">public</span> <span class="tok-type">StudyMod</span>(IEventBus modEventBus) {
    ModItems.ITEMS.register(modEventBus);
    <span class="tok-cm">// ModBlocks.BLOCKS.register(modEventBus);  // 下一章</span>
}</code></pre>
</div>

<p>只有 <span class="inline-code">register(bus)</span> 了，物品才会真的写进注册表。漏这步是新手第一杀手。</p>

<h2>3. 放进创造模式标签页</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-kw">public static final</span> DeferredRegister&lt;CreativeModeTab&gt; CREATIVE_MODE_TABS =
        DeferredRegister.create(Registries.CREATIVE_MODE_TAB, StudyMod.MOD_ID);

<span class="tok-kw">public static final</span> DeferredHolder&lt;CreativeModeTab, CreativeModeTab&gt; STUDY_TAB =
        CREATIVE_MODE_TABS.register(<span class="tok-str">"study_tab"</span>, () -&gt; CreativeModeTab.builder()
                .title(Component.translatable(<span class="tok-str">"itemGroup.studymod"</span>))
                .icon(() -&gt; <span class="tok-kw">new</span> ItemStack(ModItems.RUBY.get()))
                .displayItems((params, output) -&gt; {
                    output.accept(ModItems.RUBY.get());
                    output.accept(ModItems.RUBY_DUST.get());
                })
                .build());</code></pre>
</div>

<p>主类里同样 <span class="inline-code">CREATIVE_MODE_TABS.register(modEventBus);</span>。</p>

<h2>4. Properties 常用方法</h2>
<div class="table-wrap">
  <table>
    <thead><tr><th>方法</th><th>作用</th><th>默认</th></tr></thead>
    <tbody>
      <tr><td><code>stacksTo(n)</code></td><td>最大堆叠</td><td>64</td></tr>
      <tr><td><code>durability(n)</code></td><td>耐久（不可堆叠）</td><td>无</td></tr>
      <tr><td><code>rarity(Rarity)</code></td><td>名称颜色</td><td>COMMON</td></tr>
      <tr><td><code>fireResistant()</code></td><td>岩浆不毁</td><td>false</td></tr>
      <tr><td><code>food(FoodProperties)</code></td><td>食物</td><td>无</td></tr>
    </tbody>
  </table>
</div>

<h2>5. 注册名规则</h2>
<ul>
  <li><strong>全小写</strong> + 下划线：<span class="inline-code">ruby_dust</span> ✓</li>
  <li>不要空格、不要大写、不要 <span class="inline-code">-</span></li>
  <li>这个字符串会变成：物品 id、翻译键、模型/贴图文件名的一部分</li>
</ul>

<div class="codeblock" data-lang="text">
  <div class="codeblock-head"><span class="codeblock-lang">id 链</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>注册名 "ruby"
  → 物品 id   studymod:ruby
  → 翻译键    item.studymod.ruby
  → 模型      assets/studymod/models/item/ruby.json
  → 贴图      assets/studymod/textures/item/ruby.png
  → 物品栏模型 assets/studymod/models/item/ruby.json</code></pre>
</div>

<div class="exercise">
  <p class="exercise-label">练习</p>
  <h3>注册三件套</h3>
  <p>注册物品 <span class="inline-code">copper_nugget_x</span>（堆叠 32）和 <span class="inline-code">glow_rod</span>，都放进你的创造栏。把 <span class="inline-code">ModItems.java</span> 粘到代码体检检查。</p>
</div>

<div class="note">
  <div class="note-title">没有贴图会怎样</div>
  <p>物品能注册成功，但创造栏里是紫黑块或缺失模型。贴图在第 5 章补。</p>
</div>
`
  },
  {
    id: "blocks",
    title: "方块与 BlockItem",
    short: "方块与 BlockItem",
    lead: "方块要注册两次：世界里的 Block，以及背包里的 BlockItem。少任何一个，要么放不下去，要么拿不到。",
    tags: ["Block", "BlockItem", "mapColor", "soundType"],
    body: `
<h2>为什么注册两次</h2>
<ul>
  <li><span class="inline-code">Block</span> —— 游戏世界里的方块实体定义</li>
  <li><span class="inline-code">BlockItem</span> —— 玩家背包里那「一个物品」，右键放置时才会变成 Block</li>
</ul>
<p>原版几乎所有放置型方块都是这样配对的。</p>

<h2>1. ModBlocks</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-kw">package</span> com.example.studymod.registry;

<span class="tok-kw">import</span> com.example.studymod.StudyMod;
<span class="tok-kw">import</span> net.minecraft.world.level.block.Block;
<span class="tok-kw">import</span> net.minecraft.world.level.block.SoundType;
<span class="tok-kw">import</span> net.minecraft.world.level.block.state.BlockBehaviour;
<span class="tok-kw">import</span> net.minecraft.world.level.material.MapColor;
<span class="tok-kw">import</span> net.neoforged.neoforge.registries.DeferredBlock;
<span class="tok-kw">import</span> net.neoforged.neoforge.registries.DeferredRegister;

<span class="tok-kw">public final class</span> <span class="tok-type">ModBlocks</span> {
    <span class="tok-kw">public static final</span> DeferredRegister.Blocks BLOCKS =
            DeferredRegister.createBlocks(StudyMod.MOD_ID);

    <span class="tok-kw">public static final</span> DeferredBlock&lt;Block&gt; RUBY_ORE =
            BLOCKS.register(<span class="tok-str">"ruby_ore"</span>, () -&gt; <span class="tok-kw">new</span> Block(BlockBehaviour.Properties.of()
                    .mapColor(MapColor.COLOR_RED)
                    .strength(<span class="tok-num">3.0F</span>, <span class="tok-num">3.0F</span>)
                    .requiresCorrectToolForDrops()
                    .sound(SoundType.STONE)));

    <span class="tok-kw">public static final</span> DeferredBlock&lt;Block&gt; RUBY_BLOCK =
            BLOCKS.register(<span class="tok-str">"ruby_block"</span>, () -&gt; <span class="tok-kw">new</span> Block(BlockBehaviour.Properties.of()
                    .mapColor(MapColor.COLOR_RED)
                    .strength(<span class="tok-num">5.0F</span>, <span class="tok-num">6.0F</span>)
                    .requiresCorrectToolForDrops()
                    .sound(SoundType.METAL)));

    <span class="tok-kw">private</span> <span class="tok-type">ModBlocks</span>() {}
}</code></pre>
</div>

<h2>2. 自动生成 BlockItem</h2>
<p>1.21 的 <span class="inline-code">DeferredRegister.Blocks</span> 可以直接 <span class="inline-code">registerSimpleBlockItem</span>，省得手写配对：</p>

<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-kw">public static final</span> DeferredBlock&lt;Block&gt; RUBY_ORE =
        BLOCKS.registerSimpleBlock(<span class="tok-str">"ruby_ore"</span>, BlockBehaviour.Properties.of()
                .mapColor(MapColor.COLOR_RED)
                .strength(<span class="tok-num">3.0F</span>));

<span class="tok-cm">// 若使用 register，可手动配 BlockItem：</span>
<span class="tok-kw">public static final</span> DeferredItem&lt;BlockItem&gt; RUBY_ORE_ITEM =
        ModItems.ITEMS.registerSimpleBlockItem(<span class="tok-str">"ruby_ore"</span>, RUBY_ORE);</code></pre>
</div>

<p>二选一即可。项目里保持一种风格，别混。</p>

<h2>3. 主类注册</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-kw">public</span> <span class="tok-type">StudyMod</span>(IEventBus modEventBus) {
    ModBlocks.BLOCKS.register(modEventBus);
    ModItems.ITEMS.register(modEventBus);
    ModCreativeTabs.CREATIVE_MODE_TABS.register(modEventBus);
}</code></pre>
</div>

<div class="note warn">
  <div class="note-title">顺序建议</div>
  <p>若 BlockItem 引用了 Block 的 DeferredHolder，确保 Block 先注册或至少先声明。同一类里 static 字段按声明顺序初始化即可；跨文件引用 DeferredHolder 本身没问题（延迟解析）。</p>
</div>

<h2>4. Properties 关键参数</h2>
<div class="table-wrap">
  <table>
    <thead><tr><th>参数</th><th>含义</th><th>石头参考值</th></tr></thead>
    <tbody>
      <tr><td><code>strength(hardness, resistance)</code></td><td>挖掘时间 / 爆炸抗性</td><td>1.5, 6</td></tr>
      <tr><td><code>requiresCorrectToolForDrops()</code></td><td>没镐不掉物品</td><td>矿物要开</td></tr>
      <tr><td><code>sound(SoundType.X)</code></td><td>脚步/破坏音效</td><td>STONE</td></tr>
      <tr><td><code>mapColor(MapColor.X)</code></td><td>地图颜色</td><td>按主题选</td></tr>
      <tr><td><code>lightLevel(s -> n)</code></td><td>发光 0-15</td><td>萤石 15</td></tr>
    </tbody>
  </table>
</div>

<h2>5. 挖掘标签（可掉落后）</h2>
<p>只有 <span class="inline-code">requiresCorrectToolForDrops()</span> 还不够，还要在数据包里声明工具标签，否则正确镐也不掉。</p>

<div class="codeblock" data-lang="json">
  <div class="codeblock-head"><span class="codeblock-lang">data/studymod/tags/block/mineable/pickaxe.json</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>{
  "replace": false,
  "values": [
    "studymod:ruby_ore",
    "studymod:ruby_block"
  ]
}</code></pre>
</div>

<p>若还要指定只能用铁镐以上：</p>
<div class="codeblock" data-lang="json">
  <div class="codeblock-head"><span class="codeblock-lang">data/minecraft/tags/block/needs_iron_tool.json</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>{
  "replace": false,
  "values": ["studymod:ruby_ore"]
}</code></pre>
</div>

<div class="exercise">
  <p class="exercise-label">练习</p>
  <h3>一对「矿 + 块」</h3>
  <p>用你的材料名（例如 <span class="inline-code">moonstone_ore</span> / <span class="inline-code">moonstone_block</span>）写完注册、创造栏入口、镐子标签。把 ModBlocks.java 粘去体检。</p>
</div>
`
  },
  {
    id: "assets",
    title: "模型、状态与贴图",
    short: "模型与贴图",
    lead: "资源路径写对，游戏里才有图标和方块外形。本章只覆盖最常用的：物品模型、方块模型、blockstates、16×16 贴图。",
    tags: ["models", "blockstates", "textures", "assets/"],
    body: `
<h2>资源根目录</h2>
<div class="tree">
<div>assets/&lt;modid&gt;/</div>
<div>├── <span class="dir">textures/item/</span>     ruby.png</div>
<div>├── <span class="dir">textures/block/</span>    ruby_ore.png, ruby_block.png</div>
<div>├── <span class="dir">models/item/</span>       ruby.json</div>
<div>├── <span class="dir">models/block/</span>      ruby_ore.json, ruby_block.json</div>
<div>├── <span class="dir">blockstates/</span>       ruby_ore.json, ruby_block.json</div>
<div>└── <span class="dir">lang/</span>              zh_cn.json, en_us.json</div>
</div>

<p>路径大小写敏感；<span class="inline-code">Item</span> 大写目录在 Linux 服务器会直接找不到资源。</p>

<h2>1. 普通物品模型</h2>
<div class="codeblock" data-lang="json">
  <div class="codeblock-head"><span class="codeblock-lang">models/item/ruby.json</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>{
  "parent": "minecraft:item/generated",
  "textures": {
    "layer0": "studymod:item/ruby"
  }
}</code></pre>
</div>

<p><span class="inline-code">layer0</span> 指到 <span class="inline-code">assets/studymod/textures/item/ruby.png</span>。工具/剑类把 parent 换成 <span class="inline-code">minecraft:item/handheld</span>。</p>

<h2>2. 方块模型</h2>
<div class="codeblock" data-lang="json">
  <div class="codeblock-head"><span class="codeblock-lang">models/block/ruby_block.json</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>{
  "parent": "minecraft:block/cube_all",
  "textures": {
    "all": "studymod:block/ruby_block"
  }
}</code></pre>
</div>

<p>六个面同一贴图用 <span class="inline-code">cube_all</span>；上下不同的用 <span class="inline-code">cube_bottom_top</span>。</p>

<h2>3. 方块物品模型</h2>
<p>物品形态直接继承方块模型，省一张图：</p>
<div class="codeblock" data-lang="json">
  <div class="codeblock-head"><span class="codeblock-lang">models/item/ruby_block.json</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>{
  "parent": "studymod:block/ruby_block"
}</code></pre>
</div>

<h2>4. blockstates（无状态方块）</h2>
<div class="codeblock" data-lang="json">
  <div class="codeblock-head"><span class="codeblock-lang">blockstates/ruby_block.json</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>{
  "variants": {
    "": { "model": "studymod:block/ruby_block" }
  }
}</code></pre>
</div>

<h2>5. 贴图规格</h2>
<ul>
  <li>分辨率必须是 <strong>16 的整数倍</strong>（16、32、64…）</li>
  <li>格式 PNG，不要带奇怪的 CMYK 配置</li>
  <li>透明底物品不要忘记 Alpha 通道</li>
  <li>文件名全小写 + 下划线，与注册名一致</li>
</ul>

<div class="note">
  <div class="note-title">BlockBench</div>
  <p>复杂模型用 BlockBench 做，导出为 Java Block/Item 模型 JSON。简单方块和物品用现成 parent + PS/Aseprite 画 16×16 即可。</p>
</div>

<h2>6. 路径对照速查</h2>
<div class="table-wrap">
  <table>
    <thead><tr><th>你要的</th><th>必须放的位置</th></tr></thead>
    <tbody>
      <tr><td>物品图标</td><td><code>textures/item/&lt;name&gt;.png</code> + <code>models/item/&lt;name&gt;.json</code></td></tr>
      <tr><td>方块世界外形</td><td><code>blockstates/</code> + <code>models/block/</code> + <code>textures/block/</code></td></tr>
      <tr><td>方块在物品栏</td><td><code>models/item/&lt;name&gt;.json</code> parent 指向 block 模型</td></tr>
      <tr><td>中文名</td><td><code>lang/zh_cn.json</code></td></tr>
    </tbody>
  </table>
</div>

<div class="exercise">
  <p class="exercise-label">练习</p>
  <h3>补齐资源四件套</h3>
  <p>给你上一章的物品和方块各补：贴图、物品模型、方块模型、blockstates。启动客户端确认不再是紫黑块。可把 json 粘到「JSON 资源」检查页。</p>
</div>
`
  },
  {
    id: "lang",
    title: "语言文件",
    short: "语言文件",
    lead: "没有 zh_cn.json，创造栏和物品会显示原始翻译键。资源包式路径，内容是扁平 JSON。",
    tags: ["zh_cn.json", "en_us.json", "translatable"],
    body: `
<h2>位置</h2>
<div class="tree">
<div>assets/&lt;modid&gt;/lang/</div>
<div>├── <span class="hi">en_us.json</span>  <span class="cm">// 建议必有，缺了英文环境显示 key</span></div>
<div>└── <span class="hi">zh_cn.json</span>  <span class="cm">// 你的中文名</span></div>
</div>

<h2>1. 物品与方块</h2>
<div class="codeblock" data-lang="json">
  <div class="codeblock-head"><span class="codeblock-lang">lang/zh_cn.json</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>{
  "item.studymod.ruby": "红宝石",
  "item.studymod.ruby_dust": "红宝石粉",
  "block.studymod.ruby_ore": "红宝石矿石",
  "block.studymod.ruby_block": "红宝石块",
  "itemGroup.studymod": "学习模组",
  "effect.studymod.haste_aura": "疾步气场"
}</code></pre>
</div>

<h2>2. 键名规则</h2>
<div class="table-wrap">
  <table>
    <thead><tr><th>对象</th><th>翻译键格式</th></tr></thead>
    <tbody>
      <tr><td>物品 Item</td><td><code>item.&lt;modid&gt;.&lt;name&gt;</code></td></tr>
      <tr><td>方块 Block</td><td><code>block.&lt;modid&gt;.&lt;name&gt;</code></td></tr>
      <tr><td>创造栏</td><td>你在 builder 里自己写的，如 <code>itemGroup.&lt;modid&gt;</code></td></tr>
      <tr><td>MobEffect</td><td><code>effect.&lt;modid&gt;.&lt;name&gt;</code></td></tr>
      <tr><td>实体</td><td><code>entity.&lt;modid&gt;.&lt;name&gt;</code></td></tr>
    </tbody>
  </table>
</div>

<h2>3. 主类里引用翻译</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-cm">// 带变量的翻译</span>
<span class="tok-kw">public static final</span> Component TITLE =
        Component.translatable(<span class="tok-str">"itemGroup.studymod"</span>);

<span class="tok-cm">// zh_cn.json</span>
<span class="tok-cm">// "itemGroup.studymod": "学习模组 %s"  // 若需要占位</span>
<span class="tok-cm">// Component.translatable("itemGroup.studymod", "v2")</span></code></pre>
</div>

<h2>4. 检查技巧</h2>
<ul>
  <li>JSON 必须是合法对象，最后一项后面 <strong>不要</strong> 多逗号</li>
  <li>文件保存为 UTF-8（无 BOM）</li>
  <li>游戏内 F3+T 或重启客户端可重载语言；有时要切一次语言才生效</li>
  <li>键写错不会崩溃，只会显示 <span class="inline-code">item.studymod.ruby</span> 这种原文</li>
</ul>

<div class="note">
  <div class="note-title">和 resource pack 的关系</div>
  <p>模组自带资源会被当内置包加载。玩家资源包优先级更高，可覆盖你的翻译和贴图。</p>
</div>

<div class="exercise">
  <p class="exercise-label">练习</p>
  <h3>中英对照</h3>
  <p>把前面所有物品/方块/创造栏写进 en_us + zh_cn。启动后把语言切成英文再切回中文，确认两边都不丢键。</p>
</div>
`
  },
  {
    id: "events",
    title: "事件与生命周期",
    short: "事件与生命周期",
    lead: "注册靠 mod 总线，玩法逻辑靠 NeoForge 总线。本章用「右键物品回血」串起事件订阅。",
    tags: ["NeoForge.EVENT_BUS", "@EventBusSubscriber", "PlayerInteractEvent"],
    body: `
<h2>两种订阅写法</h2>

<h3>写法 A：主类里手动 addListener</h3>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-kw">public</span> <span class="tok-type">StudyMod</span>(IEventBus modEventBus) {
    ModItems.ITEMS.register(modEventBus);
    NeoForge.EVENT_BUS.addListener(<span class="tok-kw">this</span>::onRightClickItem);
}

<span class="tok-kw">private void</span> <span class="tok-type">onRightClickItem</span>(PlayerInteractEvent.RightClickItem event) {
    <span class="tok-cm">// ...</span>
}</code></pre>
</div>

<h3>写法 B：静态方法 + @EventBusSubscriber（更常用）</h3>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-kw">package</span> com.example.studymod.event;

<span class="tok-kw">import</span> net.neoforged.bus.api.SubscribeEvent;
<span class="tok-kw">import</span> net.neoforged.fml.common.EventBusSubscriber;
<span class="tok-kw">import</span> net.neoforged.neoforge.event.entity.player.PlayerInteractEvent;
<span class="tok-kw">import</span> net.minecraft.world.InteractionResult;

<span class="tok-ann">@EventBusSubscriber</span>(modid = StudyMod.MOD_ID) <span class="tok-cm">// 默认 NeoForge 总线</span>
<span class="tok-kw">public final class</span> <span class="tok-type">ModEvents</span> {

    <span class="tok-ann">@SubscribeEvent</span>
    <span class="tok-kw">static void</span> <span class="tok-type">onRightClick</span>(PlayerInteractEvent.RightClickItem event) {
        <span class="tok-kw">if</span> (event.getEntity().isCrouching()) <span class="tok-kw">return</span>;
        <span class="tok-kw">if</span> (!event.getItemStack().is(ModItems.RUBY.get())) <span class="tok-kw">return</span>;

        event.getEntity().heal(<span class="tok-num">2.0F</span>);
        event.setCancellationResult(InteractionResult.SUCCESS);
        event.setCanceled(<span class="tok-kw">true</span>);
    }

    <span class="tok-kw">private</span> <span class="tok-type">ModEvents</span>() {}
}</code></pre>
</div>

<div class="note danger">
  <div class="note-title">bus 要写对</div>
  <p>注册物品/方块、<span class="inline-code">ModelEvent</span>、<span class="inline-code">RegisterEvent</span> → <span class="inline-code">bus = EventBusSubscriber.Bus.MOD</span>（NeoForge 21 可写 <span class="inline-code">modBus = ...</span> 形式，按你版本文档）。玩家交互、tick、攻击 → 默认游戏总线。</p>
</div>

<h2>常用事件速查</h2>
<div class="table-wrap">
  <table>
    <thead><tr><th>事件</th><th>用途</th></tr></thead>
    <tbody>
      <tr><td><code>PlayerInteractEvent.RightClickItem</code></td><td>手持物品右键</td></tr>
      <tr><td><code>PlayerInteractEvent.RightClickBlock</code></td><td>对方块右键</td></tr>
      <tr><td><code>LivingDeathEvent</code></td><td>实体死亡</td></tr>
      <tr><td><code>LivingHurtEvent</code></td><td>受伤结算（可改伤害）</td></tr>
      <tr><td><code>EntityJoinLevelEvent</code></td><td>实体进入世界</td></tr>
      <tr><td><code>PlayerTickEvent.Post</code></td><td>玩家 tick</td></tr>
      <tr><td><code>RegisterEvent</code>（MOD 总线）</td><td>自定义注册时机</td></tr>
      <tr><td><code>ModelEvent.RegisterAdditional</code></td><td>额外模型</td></tr>
    </tbody>
  </table>
</div>

<h2>事件处理原则</h2>
<ul>
  <li>方法必须是 <span class="inline-code">public static</span>（Subscriber 静态写法）或实例方法（手动 addListener）</li>
  <li>参数类型就是具体事件类，不能写 <span class="inline-code">Object</span></li>
  <li>需要取消就 <span class="inline-code">event.setCanceled(true)</span>，且事件类型本身要 <span class="inline-code">@Cancelable</span></li>
  <li>不要在事件里做重活（全图扫描、同步 IO）；要活就丢线程或限流</li>
</ul>

<div class="exercise">
  <p class="exercise-label">练习</p>
  <h3>Shift 右键扔粒子</h3>
  <p>写一个事件类：潜行状态下右键你的 glow_rod，播放 <span class="inline-code">END_ROD</span> 粒子并扣 1 点耐久。注意客户端/服务端都要处理时用 <span class="inline-code">event.getLevel().isClientSide</span> 分支。</p>
</div>
`
  },
  {
    id: "effects",
    title: "MobEffect 效果",
    short: "自定义效果",
    lead: "药水效果与药水物品分开注册。先做一个简单的「挖掘加速」效果，再考虑药水配方。",
    tags: ["MobEffect", "MobEffectCategory", "AttributeModifier"],
    body: `
<h2>1. 注册效果</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-kw">package</span> com.example.studymod.registry;

<span class="tok-kw">import</span> com.example.studymod.StudyMod;
<span class="tok-kw">import</span> net.minecraft.core.registries.Registries;
<span class="tok-kw">import</span> net.minecraft.world.effect.MobEffect;
<span class="tok-kw">import</span> net.minecraft.world.effect.MobEffectCategory;
<span class="tok-kw">import</span> net.neoforged.neoforge.registries.DeferredHolder;
<span class="tok-kw">import</span> net.neoforged.neoforge.registries.DeferredRegister;

<span class="tok-kw">public final class</span> <span class="tok-type">ModEffects</span> {
    <span class="tok-kw">public static final</span> DeferredRegister&lt;MobEffect&gt; MOB_EFFECTS =
            DeferredRegister.create(Registries.MOB_EFFECT, StudyMod.MOD_ID);

    <span class="tok-kw">public static final</span> DeferredHolder&lt;MobEffect, MobEffect&gt; HASTE_AURA =
            MOB_EFFECTS.register(<span class="tok-str">"haste_aura"</span>, () -&gt;
                    <span class="tok-kw">new</span> HasteAuraEffect(MobEffectCategory.BENEFICIAL, <span class="tok-num">0xFFAA00</span>));

    <span class="tok-kw">private</span> <span class="tok-type">ModEffects</span>() {}
}</code></pre>
</div>

<p>主类： <span class="inline-code">ModEffects.MOB_EFFECTS.register(modEventBus);</span></p>

<h2>2. 自定义 MobEffect 子类</h2>
<p>原版无参构造的 <span class="inline-code">MobEffect</span> 只能上色，要挂属性就得自己子类化：</p>

<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-kw">package</span> com.example.studymod.effect;

<span class="tok-kw">import</span> net.minecraft.world.effect.MobEffect;
<span class="tok-kw">import</span> net.minecraft.world.effect.MobEffectCategory;
<span class="tok-kw">import</span> net.minecraft.world.entity.ai.attributes.AttributeModifier;
<span class="tok-kw">import</span> net.minecraft.world.entity.ai.attributes.Attributes;

<span class="tok-kw">public class</span> <span class="tok-type">HasteAuraEffect</span> <span class="tok-kw">extends</span> <span class="tok-type">MobEffect</span> {
    <span class="tok-kw">public</span> <span class="tok-type">HasteAuraEffect</span>(MobEffectCategory category, <span class="tok-kw">int</span> color) {
        <span class="tok-kw">super</span>(category, color);
    }

    <span class="tok-ann">@Override</span>
    <span class="tok-kw">public boolean</span> <span class="tok-type">shouldApplyEffectTickThisTick</span>(<span class="tok-kw">int</span> duration, <span class="tok-kw">int</span> amplifier) {
        <span class="tok-kw">return true</span>;
    }

    <span class="tok-cm">// 若用属性修改，可在 applyEffectTick 里手动 logic；</span>
    <span class="tok-cm">// 更干净的做法是用 MobEffect 的 attribute map（视 NeoForge/映射版本 API 调整）。</span>
}</code></pre>
</div>

<div class="note warn">
  <div class="note-title">映射与 API 漂移</div>
  <p>1.21 各小版本里 MobEffect 构造与属性挂载方式有差异。以你所用 NeoForge 的 javadoc / 源码为准，不要死抄 1.19 的写法。</p>
</div>

<h2>3. 给实体上效果</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>player.addEffect(<span class="tok-kw">new</span> MobEffectInstance(
        ModEffects.HASTE_AURA.get(),
        <span class="tok-num">200</span>, <span class="tok-cm">// 10 秒</span>
        <span class="tok-num">0</span>,    <span class="tok-cm">// amplifier</span>
        <span class="tok-kw">true</span>,  <span class="tok-cm">// ambient</span>
        <span class="tok-kw">true</span>   <span class="tok-cm">// visible 粒子</span>
));</code></pre>
</div>

<h2>4. 药水物品（进阶）</h2>
<p>有自定义效果后，常见接法：</p>
<ul>
  <li>注册 <span class="inline-code">Potion</span>（内容物定义：效果列表 + 时长）</li>
  <li>注册 <span class="inline-code">Item</span> 用 <span class="inline-code">PotionItem</span> 或药水/喷溅/滞留变体</li>
  <li>数据包配方：<span class="inline-code">data/&lt;modid&gt;/recipe/xxx.json</span>，类型 <span class="inline-code">minecraft:brewing</span> 相关或自定义</li>
</ul>
<p>建议先做出「右键物品直接加效果」验证效果类本身，再上药水链路。</p>

<h2>5. 翻译键</h2>
<div class="codeblock" data-lang="json">
  <div class="codeblock-head"><span class="codeblock-lang">lang/zh_cn.json</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>{
  "effect.studymod.haste_aura": "疾步气场"
}</code></pre>
</div>

<div class="exercise">
  <p class="exercise-label">练习</p>
  <h3>发光 30 秒</h3>
  <p>注册效果 <span class="inline-code">glow_skin</span>，右键你的物品给玩家上 30 秒。验证：实体发光、创造栏/字幕有中文名、能被牛奶消去。</p>
</div>
`
  },
  {
    id: "recipes",
    title: "合成配方",
    short: "合成配方",
    lead: "配方是数据驱动的 JSON，放在 data/&lt;modid&gt;/recipe/ 下（注意 1.21 目录名是 recipe 不是 recipes）。",
    tags: ["data/", "shaped", "shapeless", "smelting"],
    body: `
<h2>1.21 目录名变化</h2>
<p>旧版本是 <span class="inline-code">data/&lt;modid&gt;/recipes/</span>。1.21 起官方资源布局改为 <strong>单数</strong>：</p>
<div class="tree">
<div class="hi">data/&lt;modid&gt;/recipe/ruby.json</div>
<div class="hi">data/&lt;modid&gt;/loot_table/blocks/ruby_ore.json</div>
<div class="hi">data/&lt;modid&gt;/tags/block/mineable/pickaxe.json</div>
</div>

<h2>1. 有序合成 Shaped</h2>
<div class="codeblock" data-lang="json">
  <div class="codeblock-head"><span class="codeblock-lang">data/studymod/recipe/ruby_block.json</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>{
  "type": "minecraft:crafting_shaped",
  "category": "building",
  "pattern": [
    "RRR",
    "RRR",
    "RRR"
  ],
  "key": {
    "R": {
      "item": "studymod:ruby"
    }
  },
  "result": {
    "id": "studymod:ruby_block",
    "count": 1
  }
}</code></pre>
</div>

<h2>2. 无序合成 Shapeless</h2>
<div class="codeblock" data-lang="json">
  <div class="codeblock-head"><span class="codeblock-lang">data/studymod/recipe/ruby_from_block.json</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>{
  "type": "minecraft:crafting_shapeless",
  "category": "misc",
  "ingredients": [
    { "item": "studymod:ruby_block" }
  ],
  "result": {
    "id": "studymod:ruby",
    "count": 9
  }
}</code></pre>
</div>

<h2>3. 熔炉</h2>
<div class="codeblock" data-lang="json">
  <div class="codeblock-head"><span class="codeblock-lang">data/studymod/recipe/ruby_from_ore_smelting.json</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>{
  "type": "minecraft:smelting",
  "category": "misc",
  "ingredient": {
    "item": "studymod:ruby_ore"
  },
  "result": {
    "id": "studymod:ruby"
  },
  "experience": 0.7,
  "cookingtime": 200
}</code></pre>
</div>

<p>烟熏 <span class="inline-code">minecraft:smoking</span>、高炉 <span class="inline-code">minecraft:blasting</span> 结构类似。</p>

<h2>4. 允许用标签当原料</h2>
<div class="codeblock" data-lang="json">
  <div class="codeblock-head"><span class="codeblock-lang">key 用 tag</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>"key": {
  "R": {
    "tag": "c:ingots/copper"
  }
}</code></pre>
</div>

<p>NeoForge 生态常用 <span class="inline-code">c:</span> 公共标签（以前的 forge:）。</p>

<h2>5. 调试配方</h2>
<ul>
  <li>JSON 语法错：加载时 log 会报 recipe 解析失败</li>
  <li>结果物品 id 打错：配方不出现或报缺失</li>
  <li>装 JEI / EMI 可在游戏内搜索验证</li>
  <li>改完配方重启或用 <span class="inline-code">/reload</span></li>
</ul>

<div class="note">
  <div class="note-title">result 字段形态</div>
  <p>1.21.1 常见为 <span class="inline-code">{"id": "...", "count": n}</span>。若你的精确版本要求 <span class="inline-code">item</span> 字段，以游戏日志或原版同类型配方为准，不要混用两种格式。</p>
</div>

<div class="exercise">
  <p class="exercise-label">练习</p>
  <h3>三件套配方</h3>
  <p>为你的材料写：块↔锭分解、矿石熔炼、工具台里 1 个锭 + 2 根木棍做简易工具（物品若还没做就先跳过工具）。用 JEI 核对。</p>
</div>
`
  },
  {
    id: "debug",
    title: "调试与发布清单",
    short: "调试与发布",
    lead: "从 runClient 日志到最终 jar 发布：怎么定位「不显示 / 不注册 / 崩溃」，以及发布前该删什么。",
    tags: ["logs", "runClient", "build", "发布"],
    body: `
<h2>1. 日志在哪</h2>
<div class="tree">
<div>run/logs/latest.log</div>
<div>build/libs/studymod-1.0.0.jar</div>
<div>build/libs/studymod-1.0.0-sources.jar  <span class="cm">// 可删</span></div>
</div>

<p>崩溃看 <span class="inline-code">crash-reports/</span> 下最新报告。关键字：</p>
<ul>
  <li><span class="inline-code">Missing</span> / <span class="inline-code">Unknown registry</span> → 注册名或路径错</li>
  <li><span class="inline-code">Failed to load model</span> → JSON 模型错</li>
  <li><span class="inline-code">Mod file ... has errors</span> → neoforge.mods.toml 或依赖版本</li>
  <li><span class="inline-code">java.lang.ClassNotFoundException</span> → 主类包名/类名不一致</li>
</ul>

<h2>2. 三类「静默失败」</h2>
<div class="table-wrap">
  <table>
    <thead><tr><th>症状</th><th>多半原因</th></tr></thead>
    <tbody>
      <tr>
        <td>创造栏看不到物品</td>
        <td>没 register(bus)；没加进 tab；modId 不一致</td>
      </tr>
      <tr>
        <td>能看到但紫黑方块</td>
        <td>缺 blockstates/model/texture，或路径大小写错</td>
      </tr>
      <tr>
        <td>事件完全不触发</td>
        <td>订阅到了错误总线；方法非 static；事件类写错</td>
      </tr>
      <tr>
        <td>方块能放但不掉</td>
        <td>缺 mineable/pickaxe 标签或 needs_* 标签</td>
      </tr>
    </tbody>
  </table>
</div>

<h2>3. 建议的开发循环</h2>
<ol class="steps">
  <li><strong>小步改</strong><p>一次只加一个物品或一个方块，马上 runClient。</p></li>
  <li><strong>先逻辑后皮肤</strong><p>紫黑块也比完全不出现好；先确认注册，再画贴图。</p></li>
  <li><strong>用代码体检</strong><p>粘贴 Java/JSON/TOML，先扫掉低级错误再进游戏。</p></li>
  <li><strong>日志加 LOGGER</strong><p>注册成功时打一行 info，方便确认 init 有没有跑到。</p></li>
</ol>

<h2>4. 发布前清单</h2>
<ul>
  <li>版本号与 <span class="inline-code">neoforge.mods.toml</span>、jar 名一致</li>
  <li>删掉调试 LOGGER 或降为 debug</li>
  <li>不要把 <span class="inline-code">run/</span>、<span class="inline-code">.gradle/</span>、本地 <span class="inline-code">gradle.properties</span> 密钥打进 jar</li>
  <li>中英语言文件齐全</li>
  <li>在干净客户端（仅 NeoForge + 你的 mod）验证一次</li>
  <li>写清依赖：Minecraft 版本、NeoForge 版本范围</li>
  <li>许可证在 mods.toml 里写真实值（MIT / ARR 等）</li>
</ul>

<h2>5. 打包命令</h2>
<div class="codeblock" data-lang="powershell">
  <div class="codeblock-head"><span class="codeblock-lang">powershell</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>.\gradlew build
# 产物：build/libs/&lt;modid&gt;-&lt;version&gt;.jar

.\gradlew runClient   # 开发客户端
.\gradlew runServer   # 开发服务端</code></pre>
</div>

<h2>6. 下一步学什么</h2>
<ul>
  <li>BlockEntity：箱子类方块、自定义 GUI</li>
  <li>实体与 AI：自定义生物</li>
  <li>网络包：客户端/服务端同步</li>
  <li>数据生成（datagen）：用代码生成 JSON</li>
  <li>世界生成：矿石分布</li>
</ul>

<div class="exercise">
  <p class="exercise-label">结课练习</p>
  <h3>打一个可分享的 jar</h3>
  <p>整理本教程做过的物品 + 方块 + 效果 + 配方 + 语言，<span class="inline-code">gradlew build</span>，在 PCL2 干净 1.21.1 NeoForge 实例里跑通。把 neoforge.mods.toml 粘去体检确认依赖写法。</p>
</div>
`
  }
];
