# 重排后的阅读顺序、焦点与图标名称

只在断点重排、分栏、增列或导航挪移引起读屏/焦点顺序错乱，或图标化导航缺少可读名称时读取（`H5-02` 的无障碍子问题）。任何窗口下都存在的普通无障碍缺陷不属于本 skill。

## 排查

1. 在出问题的断点，用 DevTools Accessibility 面板或读屏走一遍，记录读出顺序，与 DOM 顺序、视觉顺序对照。
2. 搜索 `order`、`grid-area`、`grid-template-areas`、显式 `grid-row/grid-column`、`row-reverse`、`column-reverse`、`wrap-reverse`、正数 `tabindex`，确认哪条规则只在该断点生效。
3. 检查条件渲染是否把同一模块放到 DOM 的不同位置，或在断点切换时销毁了焦点所在元素。
4. 图标控件检查计算名称：iconfont 伪元素、只有 `title`、SVG 没有 `aria-hidden`、重复的“删除”没有上下文。

## 阅读与焦点顺序

读屏和 Tab 键按 **DOM 顺序** 遍历，不按视觉位置。分栏、挪移或增列后出现“读屏顺序乱”，先在出问题的断点检查以下写法；它们只改视觉位置，不改 DOM 顺序：

| 写法 | 典型场景 |
| --- | --- |
| `order` | 宽屏把侧栏或操作区提前 |
| `grid-area`、`grid-template-areas`、`grid-row/grid-column` 的显式放置 | 宽屏把详情放到左栏、把操作栏放到顶部 |
| `flex-direction: row-reverse / column-reverse`、`flex-wrap: wrap-reverse` | 右对齐操作组、倒序列表 |
| `position: absolute/fixed` 把后出现的元素放到视觉前面 | 悬浮操作栏、角标按钮 |
| 条件渲染时把同一模块渲染到 DOM 的不同位置 | 窄屏底部导航、宽屏侧边导航 |

修复规则：

1. **DOM 顺序 = 逻辑顺序**。先按“窄屏阅读顺序”确定 DOM 顺序；宽屏只用 Grid/Flex 改变位置，且视觉顺序与 DOM 顺序在阅读方向上保持一致。做不到时，调整 DOM 结构，而不是只改 CSS。
2. `order`、`*-reverse` 和显式放置只用于不改变阅读含义的场景（例如纯装饰、同级且顺序无关的项）；会改变“先看什么、先操作什么”时不要使用。
3. 不要用正数 `tabindex`、`aria-flowto` 或 `aria-owns` 修补顺序：前者会打乱整页 Tab 顺序，后两者读屏支持不一致。
4. 导航挪移（底部 ↔ 侧边）时，保持导航在 DOM 中的同一位置，用 CSS 改变它的视觉位置；必须条件渲染时，同一时刻只保留一份，且保持相同的 `<nav aria-label>`、链接名称和 `aria-current`。
5. 断点切换后，焦点所在元素若被移除或隐藏，把焦点移到逻辑上最近的可见元素（例如对应的列表项或区域标题），不要留在 `<body>`。
6. 被 `display: none` 隐藏的装饰或重复入口会同时从读屏中移除；只是视觉隐藏但需要读屏可达的文字，用 visually-hidden 类，不要用 `display: none` 或 `visibility: hidden`。
7. CSS `reading-flow` / `reading-order` 是较新的能力，目前不能作为 ArkWeb 的基线方案；只有在目标内核实测支持时才作为增强。

## 图标与控件名称

窄屏把文字导航收成仅图标的底栏，或宽屏把侧栏收成图标导航轨道时，最容易出现“图标没有可读名称”。每个可操作控件都需要可访问名称，装饰图标不能被读出。

```html
<!-- 仅图标按钮：名称写在按钮上，图标对读屏隐藏 -->
<button type="button" aria-label="搜索">
  <svg aria-hidden="true" focusable="false"><use href="#icon-search"></use></svg>
</button>

<!-- 图标 + 可见文字：文字即名称，图标隐藏 -->
<a href="/orders"><i class="iconfont icon-order" aria-hidden="true"></i>订单</a>

<!-- 窄屏只显示图标、宽屏显示文字：保留文字，只在视觉上隐藏 -->
<a href="/orders">
  <i class="iconfont icon-order" aria-hidden="true"></i>
  <span class="nav-label">订单</span>
</a>

<!-- 状态切换按钮：名称不变，状态用属性表达 -->
<button type="button" aria-label="收藏" aria-pressed="false">…</button>
```

```css
.visually-hidden {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (max-width: 599px) {
  /* 窄屏只显示图标；与 .visually-hidden 相同的声明，文字仍留在 DOM 中供读屏使用 */
  .nav-label { position: absolute; inline-size: 1px; block-size: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
}
```

规则：

- 名称描述操作或目的（“搜索”“返回上一页”），不描述图形（“放大镜”“左箭头”）。
- iconfont 通过 `::before` 输出的私有区字符会被读屏读成乱码或空白，图标元素必须加 `aria-hidden="true"`。
- 装饰性 `<img>` 使用 `alt=""`；承载含义的图片图标给出有意义的 `alt`。
- 列表中重复的图标按钮（每行一个“删除”）要带上下文，例如 `aria-label="删除 订单 123"`，或用 `aria-labelledby` 关联行标题。
- 展开/收起、选中、开关类按钮用 `aria-expanded`、`aria-pressed`、`aria-selected` 表达状态，不要把状态拼进名称后不更新。
- `title` 不能作为唯一名称；它在触屏上不可见，读屏支持也不一致。
- 优先使用原生 `<button>`、`<a href>`；用 `<div>` 加点击事件时，还需要 `role`、`tabindex="0"` 和键盘处理，通常不如直接换成原生元素。

## 读屏验证

- 每个结构断点分别检查：用 Tab 键走一遍焦点顺序，再用读屏走一遍阅读顺序，与视觉顺序对照。
- 在 Chrome DevTools 的 Accessibility 面板（ArkWeb 通过 DevTools 调试连接，见 `troubleshoot.md`）检查每个图标控件的计算名称（Computed Name）和角色。
- HarmonyOS 屏幕朗读对 ArkWeb 页面的实际朗读顺序和名称，必须在真机开启屏幕朗读后验证；无法真机验证时，结论写明“代码已修正，屏幕朗读未验证”。
