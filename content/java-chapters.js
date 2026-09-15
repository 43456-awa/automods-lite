/* Java for NeoForge — 面向初学者 */
window.NF_JAVA_CHAPTERS = [
  {
    id: "j-vars",
    title: "变量、类型与流程",
    short: "变量与流程",
    lead: "写模组前先把最常用的 Java 语法过一遍。目标不是考高分，是能看懂注册代码里每一行在干嘛。",
    tags: ["int", "String", "if", "for"],
    body: `
<h2>先建立直觉</h2>
<p>把变量想成「贴了标签的盒子」：标签是名字，盒子里是值。类型就是盒子的形状——整数盒、小数盒、开关盒、文字盒。</p>

<h2>1. 四种最常用的</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-kw">int</span> count = <span class="tok-num">3</span>;            <span class="tok-cm">// 整数：数量、tick、等级</span>
<span class="tok-kw">double</span> speed = <span class="tok-num">1.25</span>;      <span class="tok-cm">// 小数：速度、倍率</span>
<span class="tok-kw">boolean</span> open = <span class="tok-kw">true</span>;      <span class="tok-cm">// 开关：true / false</span>
String name = <span class="tok-str">"ruby"</span>;      <span class="tok-cm">// 文字：注意 S 大写，是类不是基本类型</span></code></pre>
</div>

<p>模组里：<span class="inline-code">float</span> 也常用来表示硬度、伤害；<span class="inline-code">20 tick = 1 秒</span>。</p>

<div class="note">
  <div class="note-title">final 是什么？</div>
  <p>加上 <span class="inline-code">final</span> 表示「以后不能改」。模组 ID 这类常量会写成 <span class="inline-code">public static final String MOD_ID = "mymod";</span></p>
</div>

<h2>2. 条件：如果…就…</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-kw">if</span> (stack.isEmpty()) {
    <span class="tok-kw">return</span>;   <span class="tok-cm">// 手上没东西，后面不做了</span>
}

<span class="tok-kw">if</span> (count &gt; <span class="tok-num">64</span>) {
    LOGGER.info(<span class="tok-str">"超过一组"</span>);
} <span class="tok-kw">else</span> {
    LOGGER.info(<span class="tok-str">"还行"</span>);
}</code></pre>
</div>

<h2>3. 循环：重复做</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-kw">for</span> (<span class="tok-kw">int</span> i = <span class="tok-num">0</span>; i &lt; <span class="tok-num">3</span>; i++) {
    <span class="tok-cm">// i 依次是 0、1、2</span>
}

<span class="tok-cm">// 遍历列表时更爱写这种：</span>
<span class="tok-kw">for</span> (Item item : list) {
    <span class="tok-cm">// 对 list 里每一个 item 做事</span>
}</code></pre>
</div>

<h2>4. 字符串必会三招</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>String id = <span class="tok-str">"ruby"</span>;
<span class="tok-kw">boolean</span> same = id.equals(<span class="tok-str">"ruby"</span>);  <span class="tok-cm">// 比内容用 equals！</span>
String path = <span class="tok-str">"item/"</span> + id;       <span class="tok-cm">// 拼接</span>
<span class="tok-kw">boolean</span> has = path.contains(<span class="tok-str">"ruby"</span>); <span class="tok-cm">// 包含？</span></code></pre>
</div>

<div class="note warn">
  <div class="note-title">新手最容易踩的坑</div>
  <p>比字符串<strong>不要</strong>用 <span class="inline-code">==</span>。<span class="inline-code">==</span> 比的是「是不是同一个对象」；要比内容用 <span class="inline-code">equals</span>。</p>
</div>

<div class="exercise">
  <p class="exercise-label">练习</p>
  <h3>数物品</h3>
  <p>写一个方法：参数是 <span class="inline-code">int count</span>。若大于 64 打印「一组多」，否则打印实际数量。用 if/else 即可。</p>
</div>
`
  },
  {
    id: "j-class",
    title: "类、对象与构造器",
    short: "类与对象",
    lead: "Item、Block 都是「类」。搞懂 class、字段、方法、new，注册代码就不会像天书。",
    tags: ["class", "new", "this", "extends"],
    body: `
<h2>类是图纸，对象是按图纸做出来的东西</h2>
<p>「Item」本身是图纸；<span class="inline-code">new Item(...)</span> 才是做出一把具体的物品。你背包里的每一把剑，都是 Item 图纸的一个对象。</p>

<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-kw">public class</span> <span class="tok-type">Gem</span> {
    <span class="tok-cm">// 字段：这块宝石有什么数据</span>
    <span class="tok-kw">private final</span> String name;
    <span class="tok-kw">private final</span> <span class="tok-kw">int</span> tier;

    <span class="tok-cm">// 构造器：new 的时候执行，用来填字段</span>
    <span class="tok-kw">public</span> <span class="tok-type">Gem</span>(String name, <span class="tok-kw">int</span> tier) {
        <span class="tok-kw">this</span>.name = name;   <span class="tok-cm">// this = 我这块宝石</span>
        <span class="tok-kw">this</span>.tier = tier;
    }

    <span class="tok-cm">// 方法：这块宝石能干什么 / 能回答什么</span>
    <span class="tok-kw">public</span> String <span class="tok-type">displayName</span>() {
        <span class="tok-kw">return</span> name + <span class="tok-str">" T"</span> + tier;
    }
}

Gem ruby = <span class="tok-kw">new</span> Gem(<span class="tok-str">"Ruby"</span>, <span class="tok-num">2</span>);
<span class="tok-cm">// ruby.displayName() → "Ruby T2"</span></code></pre>
</div>

<h2>模组代码里长什么样</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-cm">// 造一个普通物品对象</span>
<span class="tok-kw">new</span> Item(<span class="tok-kw">new</span> Item.Properties().stacksTo(<span class="tok-num">16</span>));

<span class="tok-cm">// 要有自己的行为时：继承 Item，再加逻辑</span>
<span class="tok-kw">public class</span> <span class="tok-type">FireWandItem</span> <span class="tok-kw">extends</span> <span class="tok-type">Item</span> {
    <span class="tok-kw">public</span> <span class="tok-type">FireWandItem</span>(Properties props) {
        <span class="tok-kw">super</span>(props);  <span class="tok-cm">// 先按 Item 的规矩初始化</span>
    }
}</code></pre>
</div>

<p><span class="inline-code">extends</span> = 「基于它再扩展」。FireWandItem 仍然是一个 Item，但可以多做火球逻辑。</p>

<h2>可见性（谁能用）</h2>
<ul>
  <li><span class="inline-code">private</span> — 只有本类能用（字段常用）</li>
  <li><span class="inline-code">public</span> — 谁都能用（注册字段、对外方法）</li>
  <li>不写 — 同一包里能用</li>
</ul>

<h2>static：属于「类本身」</h2>
<p>注册表几乎都是 static 的：不用 new，直接类名就能拿到。</p>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-cm">// 读作：ModItems 这个类里的 RUBY 常量</span>
<span class="tok-kw">public static final</span> DeferredItem&lt;Item&gt; RUBY = ITEMS.register(...);</code></pre>
</div>

<div class="exercise">
  <p class="exercise-label">练习</p>
  <h3>迷你物品类</h3>
  <p>写 <span class="inline-code">MagicDust</span>：有 name、color 字段和构造器，提供 <span class="inline-code">toString()</span> 返回「name(color)」。</p>
</div>
`
  },
  {
    id: "j-generics",
    title: "泛型与集合",
    short: "泛型集合",
    lead: "DeferredItem&lt;Item&gt;、List&lt;String&gt; 这些尖括号是什么？本章一次讲清。",
    tags: ["List", "Map", "泛型", "ArrayList"],
    body: `
<h2>尖括号：盒子里装的是哪一类</h2>
<p><span class="inline-code">List&lt;String&gt;</span> 读作「装 String 的列表」。<span class="inline-code">DeferredItem&lt;Item&gt;</span> 读作「装 Item 的延迟引用」。尖括号只是在说<strong>里面是什么类型</strong>，运行时不会多占性能。</p>

<h2>List：一串东西，有顺序</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>List&lt;String&gt; names = <span class="tok-kw">new</span> ArrayList&lt;&gt;();
names.add(<span class="tok-str">"ruby"</span>);
names.add(<span class="tok-str">"sapphire"</span>);

<span class="tok-kw">int</span> n = names.size();                 <span class="tok-cm">// 2</span>
<span class="tok-kw">boolean</span> has = names.contains(<span class="tok-str">"ruby"</span>); <span class="tok-cm">// true</span>
String first = names.get(<span class="tok-num">0</span>);          <span class="tok-cm">// "ruby"（从 0 开始）</span></code></pre>
</div>

<h2>Map：按键查值</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>Map&lt;String, Integer&gt; price = <span class="tok-kw">new</span> HashMap&lt;&gt;();
price.put(<span class="tok-str">"ruby"</span>, <span class="tok-num">100</span>);
<span class="tok-kw">int</span> p = price.getOrDefault(<span class="tok-str">"ruby"</span>, <span class="tok-num">0</span>);</code></pre>
</div>

<p>想成字典：词条是 key，解释是 value。getOrDefault 是「查不到就给默认值」，比裸 get 更安全。</p>

<h2>模组里你会遇到</h2>
<ul>
  <li><span class="inline-code">ItemStack</span> — 一组物品（带数量）</li>
  <li><span class="inline-code">List&lt;ItemStack&gt;</span> — 掉落表、输出列表</li>
  <li><span class="inline-code">ResourceLocation</span> — id，如 <span class="inline-code">mymod:ruby</span></li>
</ul>

<div class="exercise">
  <p class="exercise-label">练习</p>
  <h3>登记表</h3>
  <p>用 <span class="inline-code">Map&lt;String, Integer&gt;</span> 存 3 种矿石的硬度，再遍历打印「名字=硬度」。</p>
</div>
`
  },
  {
    id: "j-null",
    title: "空值、Optional 与异常",
    short: "空与异常",
    lead: "模组崩溃一大半和 null 有关。学会判断空、看懂 NPE，比背 API 更重要。",
    tags: ["null", "Optional", "try-catch", "NPE"],
    body: `
<h2>null 是「这个盒子是空的」</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>Item item = <span class="tok-kw">null</span>;
<span class="tok-cm">// item.getName();  ← 对空盒子做事 → NullPointerException 崩溃</span>

<span class="tok-kw">if</span> (item != <span class="tok-kw">null</span>) {
    <span class="tok-cm">// 确认有东西再用</span>
}

<span class="tok-kw">if</span> (stack != <span class="tok-kw">null</span> &amp;&amp; !stack.isEmpty()) {
    <span class="tok-cm">// 模组里判断「手上有东西」的常见写法</span>
}</code></pre>
</div>

<h2>Optional：官方推荐的「可能没有」</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>Optional&lt;Item&gt; maybe = registry.getOptional(key);
<span class="tok-kw">if</span> (maybe.isPresent()) {
    Item it = maybe.get();
}</code></pre>
</div>
<p>把「可能空」写进类型里，强迫你处理，少踩空指针。</p>

<h2>try / catch：出错也别直接崩</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-kw">try</span> {
    Files.readString(path);
} <span class="tok-kw">catch</span> (IOException e) {
    LOGGER.error(<span class="tok-str">"读文件失败"</span>, e);  <span class="tok-cm">// 至少打日志</span>
}</code></pre>
</div>

<div class="note danger">
  <div class="note-title">游戏里别乱吞异常</div>
  <p>吞掉异常会让 bug 难查。至少 LOGGER.error。客户端崩了先看 <span class="inline-code">logs/latest.log</span> 最下面的 Caused by。</p>
</div>

<h2>怎么读崩溃</h2>
<div class="tree">
<div>java.lang.NullPointerException</div>
<div>  at com.example.mymod.item.FireWand.use(FireWand.java:24)</div>
<div class="cm">// → 去看 FireWand.java 第 24 行，那里有个东西是 null</div>
</div>

<div class="exercise">
  <p class="exercise-label">练习</p>
  <h3>安全取名字</h3>
  <p>写方法：参数可能是 null 的 String，返回它本身；若是 null 则返回「未知」。禁止 NPE。</p>
</div>
`
  },
  {
    id: "j-lambda",
    title: "Lambda、方法引用与接口",
    short: "Lambda 接口",
    lead: "注册里的 () -&gt; new Item(...)、事件里的 @SubscribeEvent，背后都是函数式那一套。",
    tags: ["lambda", "interface", "Consumer", "Supplier"],
    body: `
<h2>接口：约定「能做什么」</h2>
<p>接口像一份合同：谁签了，谁就必须实现里面的方法。</p>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-kw">public interface</span> <span class="tok-type">Damageable</span> {
    <span class="tok-kw">void</span> hurt(<span class="tok-kw">float</span> amount);
}

<span class="tok-kw">public class</span> <span class="tok-type">Wand</span> <span class="tok-kw">implements</span> <span class="tok-type">Damageable</span> {
    <span class="tok-kw">public void</span> hurt(<span class="tok-kw">float</span> amount) { <span class="tok-cm">/* 真正受伤逻辑 */</span> }
}</code></pre>
</div>

<h2>Lambda：一段「待会儿再执行」的小函数</h2>
<p>注册代码最常见：</p>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>ITEMS.register(<span class="tok-str">"ruby"</span>, () -&gt; <span class="tok-kw">new</span> Item(props));

<span class="tok-cm">// 读作：名叫 ruby；真正需要对象时，再执行箭头右边，造一个 Item</span>
<span class="tok-cm">// Supplier：无参、给一个值。注册里几乎都是它。</span></code></pre>
</div>

<p>另一种常见：</p>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>list.forEach(s -&gt; LOGGER.info(s));
<span class="tok-cm">// Consumer：吃一个参数，不返回。forEach 把每个元素喂给箭头左边的 s</span></code></pre>
</div>

<h2>事件为什么能「自动被调用」</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-ann">@SubscribeEvent</span>
<span class="tok-kw">static void</span> onRightClick(PlayerInteractEvent.RightClickItem e) {
    <span class="tok-cm">// 框架通过反射找到带注解的方法，在右键时调用它</span>
    <span class="tok-cm">// 你不用自己写「什么时候调用」</span>
}</code></pre>
</div>

<div class="note">
  <div class="note-title">读注册代码的口诀</div>
  <p>看到 <span class="inline-code">register("名字", () -&gt; ...)</span>：左边是 id，右边是「要对象时现做」。</p>
</div>

<div class="exercise">
  <p class="exercise-label">练习</p>
  <h3>翻译 lambda</h3>
  <p>把 <span class="inline-code">names.forEach(n -&gt; System.out.println(n));</span> 改写成匿名内部类，搞清参数 n 从哪来。</p>
</div>
`
  }
];
