/* Java for NeoForge — builtin track */
window.NF_JAVA_CHAPTERS = [
  {
    id: "j-vars",
    title: "变量、类型与流程",
    short: "变量与流程",
    lead: "写模组前先把 Java 基础语法过一遍：变量、条件、循环。能看懂注册代码里的每一行就够了。",
    tags: ["int", "String", "if", "for"],
    body: `
<h2>为什么先学这些</h2>
<p>NeoForge 代码几乎全是 Java。你不需要成为 Java 专家，但要能读懂 <span class="inline-code">DeferredRegister</span>、<span class="inline-code">Item.Properties</span> 这类链式调用。</p>

<h2>1. 变量与类型</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-kw">int</span> count = <span class="tok-num">3</span>;
<span class="tok-kw">double</span> speed = <span class="tok-num">1.25</span>;
<span class="tok-kw">boolean</span> open = <span class="tok-kw">true</span>;
String name = <span class="tok-str">"ruby"</span>;          <span class="tok-cm">// 引用类型，首字母大写</span>
<span class="tok-kw">final</span> String MOD_ID = <span class="tok-str">"mymod"</span>; <span class="tok-cm">// 常量习惯全大写</span></code></pre>
</div>

<p>模组里常见：<span class="inline-code">float</span> 表硬度/伤害，<span class="inline-code">int</span> 表 tick（20 tick = 1 秒）。</p>

<h2>2. 条件与循环</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-kw">if</span> (stack.isEmpty()) {
    <span class="tok-kw">return</span>;
}

<span class="tok-kw">for</span> (<span class="tok-kw">int</span> i = <span class="tok-num">0</span>; i &lt; <span class="tok-num">3</span>; i++) {
    LOGGER.info(<span class="tok-str">"i="</span> + i);
}

<span class="tok-kw">for</span> (Item item : list) {
    <span class="tok-cm">// 增强 for</span>
}</code></pre>
</div>

<h2>3. 字符串</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>String id = <span class="tok-str">"ruby"</span>;
<span class="tok-kw">boolean</span> same = id.equals(<span class="tok-str">"ruby"</span>);  <span class="tok-cm">// 用 equals，不要 ==</span>
String path = <span class="tok-str">"item/"</span> + id;
<span class="tok-kw">boolean</span> hasRuby = path.contains(<span class="tok-str">"ruby"</span>);</code></pre>
</div>

<div class="note warn">
  <div class="note-title">== 和 equals</div>
  <p>比字符串内容必须用 <span class="inline-code">equals</span>。<span class="inline-code">==</span> 比的是是否同一个对象。</p>
</div>

<div class="exercise">
  <p class="exercise-label">练习</p>
  <h3>数物品</h3>
  <p>写一个方法：给定 <span class="inline-code">int count</span>，若大于 64 输出「一组多」，否则输出实际数量。用 if/else。</p>
</div>
`
  },
  {
    id: "j-class",
    title: "类、对象与构造器",
    short: "类与对象",
    lead: "Item、Block 都是类。搞懂 class、字段、方法、new，注册代码就不会像天书。",
    tags: ["class", "new", "this", "extends"],
    body: `
<h2>类是模板，对象是实例</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-kw">public class</span> <span class="tok-type">Gem</span> {
    <span class="tok-kw">private final</span> String name;
    <span class="tok-kw">private final</span> <span class="tok-kw">int</span> tier;

    <span class="tok-kw">public</span> <span class="tok-type">Gem</span>(String name, <span class="tok-kw">int</span> tier) {
        <span class="tok-kw">this</span>.name = name;
        <span class="tok-kw">this</span>.tier = tier;
    }

    <span class="tok-kw">public</span> String <span class="tok-type">displayName</span>() {
        <span class="tok-kw">return</span> name + <span class="tok-str">" T"</span> + tier;
    }
}

Gem ruby = <span class="tok-kw">new</span> Gem(<span class="tok-str">"Ruby"</span>, <span class="tok-num">2</span>);</code></pre>
</div>

<h2>模组里的样子</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-cm">// Item 是类；new Item(...) 是造一个物品对象</span>
<span class="tok-kw">new</span> Item(<span class="tok-kw">new</span> Item.Properties().stacksTo(<span class="tok-num">16</span>));

<span class="tok-cm">// 你自己的物品行为：继承 Item</span>
<span class="tok-kw">public class</span> <span class="tok-type">FireWandItem</span> <span class="tok-kw">extends</span> <span class="tok-type">Item</span> {
    <span class="tok-kw">public</span> <span class="tok-type">FireWandItem</span>(Properties props) {
        <span class="tok-kw">super</span>(props);
    }
}</code></pre>
</div>

<h2>可见性</h2>
<ul>
  <li><span class="inline-code">private</span> — 只有本类能用（字段常用）</li>
  <li><span class="inline-code">public</span> — 谁都能用（方法/注册字段）</li>
  <li>不写 — 包内可见</li>
</ul>

<h2>static</h2>
<p><span class="inline-code">static</span> 字段/方法属于类本身，不用 new。注册表几乎是 static 的：</p>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-kw">public static final</span> DeferredItem&lt;Item&gt; RUBY = ITEMS.register(...);</code></pre>
</div>

<div class="exercise">
  <p class="exercise-label">练习</p>
  <h3>迷你物品类</h3>
  <p>写一个 <span class="inline-code">MagicDust</span> 类：有 name、color 字段和构造器，提供 <span class="inline-code">toString()</span> 返回「name(color)」。</p>
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
<h2>泛型：类型参数</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>DeferredItem&lt;Item&gt; RUBY;      <span class="tok-cm">// 这个 Holder 装的是 Item</span>
List&lt;String&gt; names = <span class="tok-kw">new</span> ArrayList&lt;&gt;();
Map&lt;String, Integer&gt; count = <span class="tok-kw">new</span> HashMap&lt;&gt;();</code></pre>
</div>

<h2>List</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>List&lt;String&gt; names = <span class="tok-kw">new</span> ArrayList&lt;&gt;();
names.add(<span class="tok-str">"ruby"</span>);
names.add(<span class="tok-str">"sapphire"</span>);
<span class="tok-kw">int</span> n = names.size();
<span class="tok-kw">boolean</span> has = names.contains(<span class="tok-str">"ruby"</span>);
String first = names.get(<span class="tok-num">0</span>);</code></pre>
</div>

<h2>Map</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>Map&lt;String, Integer&gt; price = <span class="tok-kw">new</span> HashMap&lt;&gt;();
price.put(<span class="tok-str">"ruby"</span>, <span class="tok-num">100</span>);
<span class="tok-kw">int</span> p = price.getOrDefault(<span class="tok-str">"ruby"</span>, <span class="tok-num">0</span>);</code></pre>
</div>

<h2>模组中的直觉</h2>
<ul>
  <li><span class="inline-code">ItemStack</span> — 一组物品（带数量）</li>
  <li><span class="inline-code">List&lt;ItemStack&gt;</span> — 掉落列表、输出列表</li>
  <li><span class="inline-code">ResourceLocation</span> — id，如 <span class="inline-code">mymod:ruby</span></li>
</ul>

<div class="exercise">
  <p class="exercise-label">练习</p>
  <h3>登记表</h3>
  <p>用 <span class="inline-code">Map&lt;String, Integer&gt;</span> 存 3 种矿石硬度，并遍历打印。</p>
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
<h2>null 是什么</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>Item item = <span class="tok-kw">null</span>;
<span class="tok-cm">// item.getName();  // NullPointerException 崩溃</span>

<span class="tok-kw">if</span> (item != <span class="tok-kw">null</span>) {
    <span class="tok-cm">// 安全</span>
}

<span class="tok-kw">if</span> (stack != <span class="tok-kw">null</span> &amp;&amp; !stack.isEmpty()) {
    <span class="tok-cm">// 模组里判断物品的常见写法</span>
}</code></pre>
</div>

<h2>Optional（尽量避免直接摸可能为 null 的）</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>Optional&lt;Item&gt; maybe = registry.getOptional(key);
<span class="tok-kw">if</span> (maybe.isPresent()) {
    Item it = maybe.get();
}</code></pre>
</div>

<h2>try / catch</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-kw">try</span> {
    Files.readString(path);
} <span class="tok-kw">catch</span> (IOException e) {
    LOGGER.error(<span class="tok-str">"读文件失败"</span>, e);
}</code></pre>
</div>

<div class="note danger">
  <div class="note-title">游戏里别乱吞异常</div>
  <p>吞掉异常会让 bug 难查。至少打日志。客户端崩了先看 <span class="inline-code">logs/latest.log</span> 最下面的 Caused by。</p>
</div>

<h2>常见崩溃读法</h2>
<div class="tree">
<div>java.lang.NullPointerException</div>
<div>  at com.example.mymod.item.FireWand.use(FireWand.java:24)</div>
<div class="cm">// → 第 24 行有个东西是 null</div>
</div>

<div class="exercise">
  <p class="exercise-label">练习</p>
  <h3>安全取名字</h3>
  <p>写方法：参数可能是 null 的 String，返回它本身或「未知」。禁止 NPE。</p>
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
<h2>接口：约定能做什么</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-kw">public interface</span> <span class="tok-type">Damageable</span> {
    <span class="tok-kw">void</span> hurt(<span class="tok-kw">float</span> amount);
}

<span class="tok-kw">public class</span> <span class="tok-type">Wand</span> <span class="tok-kw">implements</span> <span class="tok-type">Damageable</span> {
    <span class="tok-kw">public void</span> hurt(<span class="tok-kw">float</span> amount) { <span class="tok-cm">/* ... */</span> }
}</code></pre>
</div>

<h2>Lambda：匿名小函数</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-cm">// Supplier：无参，给一个值。注册里最常见</span>
ITEMS.register(<span class="tok-str">"ruby"</span>, () -&gt; <span class="tok-kw">new</span> Item(props));

<span class="tok-cm">// 普通写法等价于</span>
ITEMS.register(<span class="tok-str">"ruby"</span>, <span class="tok-kw">new</span> Supplier&lt;Item&gt;() {
    <span class="tok-kw">public</span> Item get() { <span class="tok-kw">return new</span> Item(props); }
});

<span class="tok-cm">// Consumer：吃一个参数，不返回</span>
list.forEach(s -&gt; LOGGER.info(s));</code></pre>
</div>

<h2>读注册代码的套路</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code>ITEMS.register(<span class="tok-str">"ruby"</span>, () -&gt; <span class="tok-kw">new</span> Item(
    <span class="tok-kw">new</span> Item.Properties().stacksTo(<span class="tok-num">16</span>)
));
<span class="tok-cm">// 读作：名叫 ruby，需要对象时现造一个 Item</span></code></pre>
</div>

<h2>事件方法为什么能被调用</h2>
<div class="codeblock" data-lang="java">
  <div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div>
  <pre><code><span class="tok-ann">@SubscribeEvent</span>
<span class="tok-kw">static void</span> onRightClick(PlayerInteractEvent.RightClickItem e) {
    <span class="tok-cm">// 框架通过反射找到带注解的方法并调用</span>
}</code></pre>
</div>

<div class="exercise">
  <p class="exercise-label">练习</p>
  <h3>翻译 lambda</h3>
  <p>把 <span class="inline-code">names.forEach(n -&gt; System.out.println(n));</span> 改写成匿名内部类，理解参数从哪来。</p>
</div>
`
  }
];
