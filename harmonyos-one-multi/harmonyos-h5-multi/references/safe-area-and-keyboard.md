# 安全区与软键盘

## 容器前提（先查 ArkTS 侧）

ArkWeb 中这两类问题有一半由 Web 容器决定。动手改 CSS 前先确认下面两项；`H5_ONLY` 时拿不到 ArkTS 源码，就把它们列为待确认项或交接项，不要宣告完成。

**安全区**：只有当 Web 组件实际覆盖系统避让区（状态栏、挖孔、导航条）且网页声明 `viewport-fit=cover` 时，`env(safe-area-inset-*)` 才为非零值。容器进入沉浸式的方式有两种：

- 主窗口 `setWindowLayoutFullScreen(true)`；
- Web 组件 `.expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])`。

| 现象 | 常见根因 |
| --- | --- |
| `env()` 恒为 0，但页面没有被遮挡 | 容器非沉浸式；无需 H5 处理 |
| 页面顶部或底部被系统栏遮挡 | 容器已沉浸，但网页缺 `viewport-fit=cover` 或没有消费 `env()` |
| 页面已延伸到状态栏下，但 `env()` 恒为 0 | 当前内核或容器配置不上报安全区；改由原生注入状态栏高度，见“安全区”一节的 `--native-safe-top` |
| 两端都做了避让，出现双倍留白 | ArkUI 父容器 padding 与 H5 safe area 重复消费 |

**软键盘**：由两级配置共同决定。页面级是 `UIContext.setKeyboardAvoidMode()`：设为 Resize 时窗口内容区变矮，ArkUI 重新布局 Web 组件；默认的 Offset（上抬）模式下，ArkUI 可能把包含 Web 组件的整个页面上推来露出焦点。Web 级是组件的 `keyboardAvoidMode`，它决定网页内部怎样避让：

| `WebKeyboardAvoidMode` | 视觉视口 | 布局视口 | H5 可观察到的信号 |
| --- | --- | --- | --- |
| `RESIZE_VISUAL` | 缩小 | 不变 | `visualViewport` 的 `resize`/`scroll`；`innerHeight`、`dvh` 不变 |
| `RESIZE_CONTENT` | 缩小 | 缩小 | `window.resize`，`clientHeight` 与 `dvh` 变小 |
| `OVERLAYS_CONTENT` | 不变 | 不变 | 键盘覆盖内容，页面需自行避让 |

Web 嵌套在 ArkUI 滚动容器中时，官方不推荐使用前两种 RESIZE 模式。Offset 模式下 Web 的 `keyboardAvoidMode` 优先于 W3C `virtualKeyboard.overlaysContent`。具体默认值和可用 API 版本以目标 SDK 文档为准。页面级上推和 Web 内部避让是否会同时生效、叠加后是什么效果，取决于 SDK 版本和页面结构；不要只看配置就下结论，要用下面的判别方法确认。

### 判别：键盘弹出后是谁在移动页面

弹框和整页表单都先做这一步。键盘弹出前后各记录一次：H5 侧的 `scrollY`、`visualViewport.offsetTop/height`、`innerHeight`，屏幕上顶部内容和键盘的实际位置，以及 ArkTS 侧 Web 组件 `onAreaChange` 给出的全局位置。

| H5 观察值 | 屏幕现象 | 判定 | 处理方 |
| --- | --- | --- | --- |
| `scrollY`、`offsetTop` 都为 0，`innerHeight` 和 `visualViewport.height` 都不变 | 顶部内容进入状态栏或移出屏幕；Web 组件的全局位置上移 | **容器上推**：容器把整个 Web 组件往上推，网页无法感知 | 原生：页面级改为 Resize，Web 用 `RESIZE_CONTENT` 或 `RESIZE_VISUAL`。H5 侧的任何补偿都会跟着 Web 一起被推走，`H5_ONLY` 时列为交接项 |
| 视口已缩小（`innerHeight` 或 `visualViewport.height` 变小） | 顶部被推出屏幕，同时键盘上方空出一截 | **双层避让叠加**：页面级上推，同时 Web 内部也做了避让 | 原生：只保留一级避让，推荐页面级 Resize 配合 Web `RESIZE_CONTENT` |
| `scrollY` 或 `offsetTop` 大于 0 | 顶部内容随滚动进入状态栏 | **网页滚动**：浏览器为露出焦点滚动了页面或平移了视觉视口 | H5：按“整页表单键盘避让”或“弹框内输入被键盘遮挡”处理 |
| 两种视口都不变 | 键盘直接盖住内容 | `OVERLAYS_CONTENT` | 容器改用 RESIZE 模式，或经桥接把键盘高度传给 H5 |

H5 自己看到的数值正常，屏幕上却被遮挡，这就是判定为“容器上推”的证据。“容器上推”和“双层避让叠加”修好之后，再回到本表确认是否还剩“网页滚动”。

## 安全区

在 viewport 声明中启用 `viewport-fit=cover` 后，使用环境变量为内容留出空间；背景可以延伸，关键内容不能被系统区域遮挡。

```css
:root {
  /* 原生注入了 --native-safe-top 时优先用它，否则用 env() */
  --safe-top: var(--native-safe-top, env(safe-area-inset-top, 0px));
  --safe-right: env(safe-area-inset-right, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
}

.app-shell {
  padding: 0 var(--safe-right) var(--safe-bottom) var(--safe-left);
}

.topbar {
  position: sticky;
  top: 0;
  padding-top: var(--safe-top);
}
```

每条边只确定一个消费点。`position: sticky/fixed` 的元素以视口为参照，父容器的 padding 会随滚动离开，因此粘性顶栏和固定底栏必须自己消费对应边的安全区，父容器不再重复消费这条边。组件库自带的安全区属性（例如底部安全区开关）同样算一个消费点：开启它时，页面在同一条边上不再自己留白，反之亦然。

**原生注入状态栏高度**：容器已经沉浸，`env(safe-area-inset-top)` 却恒为 0 时，由 ArkTS 读取窗口的系统避让区（`getWindowAvoidArea` 的状态栏区域），换算成 CSS px 后写入 `document.documentElement` 的 `--native-safe-top`。在页面加载完成和避让区变化时各写一次，沿用项目已有的桥接或 `runJavaScript` 通道，不要新造事件名。物理 px 和 CSS px 的换算关系以目标设备实测为准：注入后对比状态栏的实际高度。`H5_ONLY` 时，把注入方列为交接项，H5 侧只消费 `--safe-top`。

## 软键盘

优先让页面保持正常滚动，使浏览器能够将焦点元素滚入可视区。需要自定义浮层或固定操作栏时，先用上面的判别表确定避让方，再读取 `visualViewport` 并提供无该 API 的回退。登录、注册这类普通页面上的输入框，见“整页表单键盘避让”；弹框内的输入框，见“弹框内输入被键盘遮挡”。

下面的固定底栏适用于 `RESIZE_VISUAL`：布局视口不变，键盘只缩小并平移视觉视口，所以要同时用 `height` 和 `offsetTop` 计算底栏应抬起的距离。

```typescript
const viewport = window.visualViewport;
let frameId = 0;

function updateKeyboardOffset(): void {
  frameId = 0;
  const layoutHeight = document.documentElement.clientHeight;
  const visibleBottom = viewport
    ? viewport.offsetTop + viewport.height
    : window.innerHeight;
  const offset = Math.max(0, layoutHeight - visibleBottom);
  document.documentElement.style.setProperty('--keyboard-offset', `${offset}px`);
}

function scheduleKeyboardOffset(): void {
  if (frameId) cancelAnimationFrame(frameId);
  frameId = requestAnimationFrame(updateKeyboardOffset);
}

viewport?.addEventListener('resize', scheduleKeyboardOffset);
viewport?.addEventListener('scroll', scheduleKeyboardOffset);
window.addEventListener('resize', scheduleKeyboardOffset);
updateKeyboardOffset();

// 卸载时移除三个监听器并 cancelAnimationFrame(frameId)。
```

```css
.action-bar {
  position: fixed;
  inset-inline: 0;
  bottom: var(--keyboard-offset, 0px);
  padding-bottom: var(--safe-bottom);
}
```

`RESIZE_CONTENT` 下布局视口已经缩小，`bottom: 0` 的固定栏会自然位于键盘之上，不需要这段脚本。`OVERLAYS_CONTENT` 下视口都不变，需要由容器或 H5 自行计算键盘高度；`env(keyboard-inset-*)` 是否可用以目标内核实测为准。

不要用一次性的“窗口高度减少即键盘弹出”判断驱动业务状态；分屏和旋转也会改变高度。

## 弹框内输入被键盘遮挡

### 识别

满足任意一项“弹框”特征，且弹框内有 `input`、`textarea` 或 `contenteditable`，就按本节处理，不套用整页滚动的做法：

- 结构：`role="dialog"`、`aria-modal="true"`、`<dialog>`；类名含 `modal`、`dialog`、`popup`、`sheet`、`drawer`、`mask`、`overlay`；组件库弹层（如 `van-popup`、`van-dialog`、`el-dialog`、`ant-modal`、antd-mobile `Popup`）。
- 定位：`position: fixed`（或挂到 `body` 的 teleport/portal），带遮罩，打开时锁定背景滚动。
- 现象：聚焦后底部按钮或输入框被键盘盖住；弹框顶部被推出可见区；整个弹框一起滚动，标题和底部按钮滚走；居中弹框键盘弹出后位置不变、下半截在键盘下。

再按内容高度选方案。邮件撰写、评论、多字段表单这类内容可能超过“键盘弹出后的可见高度”的弹框，用方案 A。确认框、单输入框、验证码这类在最小目标设备横屏、键盘弹出时仍能完整放下的弹框，用方案 B。不确定时用方案 A：内容放得下时中间区不会出现滚动条，效果与方案 B 相同。

两种方案都必须满足：弹框整体始终位于可见区域内，键盘不遮挡弹框任何部分，沉浸式容器中弹框也不进入状态栏和底部导航条区域。容器上推或双层避让叠加时，下面的方案都会失效，要先交给原生修复。

### 可见区域

先按本文开头确认避让模式，再决定“可见区域”从哪里来：

| 避让模式 | 可见区域来源 | 需要脚本 |
| --- | --- | --- |
| 窗口 Resize 或 `RESIZE_CONTENT` | 布局视口已缩小，`position: fixed; inset: 0` 就是可见区 | 否 |
| `RESIZE_VISUAL` | `visualViewport.offsetTop` 与 `visualViewport.height` | 是 |
| `OVERLAYS_CONTENT` | 两种视口都不变，H5 拿不到键盘高度 | 交接项：容器改用 RESIZE 模式，或经桥接传键盘高度后写同一组变量 |

`RESIZE_VISUAL` 下把可见区域写成 CSS 变量，弹框遮罩跟随它定位：

```typescript
const viewport = window.visualViewport;
let frameId = 0;

function syncVisibleRect(): void {
  frameId = 0;
  const top = viewport ? viewport.offsetTop : 0;
  const height = viewport ? viewport.height : window.innerHeight;
  const root = document.documentElement.style;
  root.setProperty('--vv-top', `${top}px`);
  root.setProperty('--vv-height', `${height}px`);
  revealFocusedField();
}

function scheduleSync(): void {
  if (frameId) cancelAnimationFrame(frameId);
  frameId = requestAnimationFrame(syncVisibleRect);
}

viewport?.addEventListener('resize', scheduleSync);
viewport?.addEventListener('scroll', scheduleSync);
window.addEventListener('resize', scheduleSync);
syncVisibleRect();

// 弹框关闭或组件卸载时移除三个监听器并 cancelAnimationFrame(frameId)。
```

`--vv-top` 不能省：`RESIZE_VISUAL` 下浏览器可能平移视觉视口来露出输入框，只用高度会让弹框顶部跑到可见区之外。

### 方案 A：头尾固定，中间滚动

```css
.dialog-mask {
  position: fixed;
  inset-inline: 0;
  top: var(--vv-top, 0px);
  height: var(--vv-height, 100%);
  display: flex;
  align-items: center;          /* 底部弹层用 flex-end */
  justify-content: center;
  /* 沉浸式容器中遮罩从屏幕顶端算起，内边距至少要让开安全区，否则较高的弹框头部会进入状态栏 */
  padding:
    max(16px, var(--safe-top, 0px))
    max(16px, var(--safe-right, 0px))
    max(16px, var(--safe-bottom, 0px))
    max(16px, var(--safe-left, 0px));
  box-sizing: border-box;
}

.dialog {
  display: flex;
  flex-direction: column;
  inline-size: min(560px, 100%);
  max-block-size: 100%;
}

.dialog__header,
.dialog__footer {
  flex: none;
}

.dialog__body {
  flex: 1 1 auto;
  min-block-size: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
```

- 遮罩的内边距使用“安全区”一节定义的 `--safe-*` 变量。非沉浸式容器中这些变量为 0，内边距回退为 16px。`RESIZE_VISUAL` 下 `--vv-top` 已经跟随视觉视口，状态栏始终覆盖可见区的最上方，所以顶部内边距在各种避让模式下都成立。键盘弹出时，底部导航条通常被键盘盖住；如果键盘上方多出一段留白，可以只在键盘弹出时把底部内边距改回 16px。
- 弹框必须拆成头部、中间、底部三个兄弟节点，只有中间设 `overflow-y: auto`。整个 `.dialog` 不设 `overflow: auto`，否则标题和按钮会一起滚走。
- `.dialog__body` 必须有 `min-block-size: 0`；缺了它，Flex 子项不会收缩，中间区不出现滚动条，弹框会撑出可见区。
- 窗口 Resize 和 `RESIZE_CONTENT` 下不需要脚本：`position: fixed` 的百分比高度以布局视口为参照，回退值 `0px` 和 `100%` 就等于缩小后的可见区，也不依赖 `dvh` 支持。前提是遮罩没有 `transform`、`filter`、`contain` 等会改变 fixed 参照物的祖先，所以遮罩要挂在 `body` 下。不要把回退写成 `var(--vv-height, 100dvh)` 再在前面补一条旧写法：含 `var()` 的声明在解析期总是合法，到计算期才失效，前面的回退声明早已被覆盖，不会生效。
- 聚焦字段只在中间区内滚动，不滚 window：

```typescript
function revealFocusedField(): void {
  const field = document.activeElement as HTMLElement | null;
  const body = field?.closest<HTMLElement>('.dialog__body');
  if (!field || !body) return;
  const area = body.getBoundingClientRect();
  const box = field.getBoundingClientRect();
  const gap = 8;
  if (box.bottom > area.bottom - gap) body.scrollTop += box.bottom - area.bottom + gap;
  else if (box.top < area.top + gap) body.scrollTop -= area.top - box.top + gap;
}

let focusFrameId = 0;

function handleFocusIn(): void {
  if (focusFrameId) cancelAnimationFrame(focusFrameId);
  focusFrameId = requestAnimationFrame(() => {
    focusFrameId = 0;
    revealFocusedField();
  });
}

document.addEventListener('focusin', handleFocusIn);

// 弹框关闭或组件卸载时：
// document.removeEventListener('focusin', handleFocusIn);
// cancelAnimationFrame(focusFrameId);
```

- 邮件正文这类自增高的 `textarea` 放在中间区内，不设上限也可以，光标所在行由中间区滚动露出；不要让 `textarea` 撑高头部或底部。
- 背景锁定只给 `html`/`body` 加 `overflow: hidden`，不要在聚焦时调用 `window.scrollTo` 或把 `body` 改成 `position: fixed` 来“抵消”浏览器的自动滚动。

### 方案 B：不滚动，用 visualViewport 定位

内容确定放得下时，弹框不出现内部滚动，只把整个弹框放进可见区：沿用上面的 `syncVisibleRect` 和 `.dialog-mask`，`.dialog` 保持自然高度，`align-items: center` 让弹框在键盘上方的可见区内居中，底部弹层用 `align-items: flex-end` 贴在键盘上沿。

- 不要用 `top: 50%; transform: translateY(-50%)` 相对整屏居中，也不要只把弹框整体上移键盘高度：前者在 `RESIZE_VISUAL` 下下半截仍在键盘下，后者在弹框较高时会把顶部推出屏幕。
- 保留 `.dialog { max-block-size: 100% }` 和中间区的 `overflow-y: auto` 作为兜底：横屏、分屏或字体放大后放不下时，自动退化为方案 A，而不是被键盘盖住。

### 组件库弹层

组件库的弹层通常自带 `top: 50%` 加 `transform` 的居中样式，且挂在 `body` 下。修复时把遮罩定位和三段式布局写到它的根节点和内容节点上，样式放在全局样式表中（scoped 样式或 CSS Modules 选不到 teleport 出去的节点）。如果组件库提供了自定义容器或内容插槽，优先把头部、中间、底部放进插槽，再套用本节规则。

### 验证

- 弹框在首个输入框、中间输入框、最后一个输入框和正文 `textarea` 分别聚焦：标题和底部按钮始终可见，焦点字段在中间区内可见，键盘不覆盖弹框任何部分。
- 在 `textarea` 中连续换行直到超过可见高度：中间区滚动，弹框整体高度不再增加。
- 字段之间切换焦点、收起键盘、再次弹出：`--vv-top` 和 `--vv-height` 回到无键盘值，弹框位置不累计偏移。
- 方案 B 的弹框在最小目标设备横屏、键盘弹出时仍完整可见；放不下时确认已退化为中间滚动。
- 沉浸式容器中让弹框内容超过可见高度：弹框头部位于状态栏下方，底部按钮不进入导航条区域。
- 记录容器避让模式和判别结果；`OVERLAYS_CONTENT`、容器上推或双层避让叠加时，如果只交付 H5 部分，在报告中列出交接项，不宣告完成。

## 整页表单键盘避让

### 识别

输入框直接位于普通文档流页面中，例如登录、注册、搜索、资料编辑页，不在弹框里。常见现象有：聚焦后登录按钮被键盘挡住；键盘弹出后标题、副标题进入状态栏，甚至被推出屏幕；键盘收起后页面没有复位。

先用“判别”表确定是谁在移动页面。“容器上推”和“双层避让叠加”交给原生处理，本节规则只适用于“网页滚动”。推荐的容器配置是页面级 Resize 加 Web `RESIZE_CONTENT`：布局视口变矮，浏览器的自动滚动和下面的脚本都以它为准。`RESIZE_VISUAL` 的差异写在本节末尾。

### 布局与提交

- 根容器用 `min-height`，不要用 `height: 100vh` 加 `overflow: hidden` 锁死高度；不要把整个表单垂直居中。表单顶部对齐，放在屏幕上半部分。
- 主按钮紧跟最后一个输入框。协议、其他登录方式等次要内容放在按钮之后，并且仍在文档流里，不要用 `position: fixed; bottom: 0`。
- 用 `<form>` 加 `type="submit"`，并配合 `enterkeyhint`、`autocomplete`、`inputmode`。这样即使按钮被挡住，用户也能用回车提交。

```css
.login {
  min-height: 100%;               /* 父级是 html/body 的 100% 高度；不锁死、不加 overflow: hidden */
  display: flex;
  flex-direction: column;
  padding: calc(var(--safe-top) + 48px) 24px var(--safe-bottom);
  box-sizing: border-box;
}

.login__footer { margin-top: auto; } /* 次要内容沉底，但仍在文档流里 */

/* 键盘弹出时压缩顶部，尽量不需要滚动 */
.login.is-typing { padding-top: calc(var(--safe-top) + 12px); }
.login.is-typing .login__subtitle { display: none; }
.login.is-typing .login__title { font-size: 20px; }

.statusbar-mask {
  position: fixed;
  inset-inline: 0;
  top: var(--vv-top, 0px);
  height: var(--safe-top);
  background: var(--page-bg);
  z-index: 100;
  pointer-events: none;
}
```

- 压缩状态按焦点切换：可编辑元素收到 `focusin` 时加上 `is-typing`，`focusout` 后焦点不在可编辑元素上时移除。不要用“窗口高度减少了多少”来判断键盘，原因见“软键盘”一节。如果压缩时出现明显跳动，可以在 `pointerdown` 时提前加上这个类。压缩样式不要加过渡动画；如果一定要加，下面的滚动校准应在 `transitionend` 之后执行。
- 状态栏遮罩只在沉浸式容器中有高度，非沉浸式时 `--safe-top` 为 0。遮罩不能代替上面的“压缩顶部”：它只是空间不够时的兜底。

### 最小必要滚动与上限

浏览器的自动滚动只保证焦点输入框可见，不管按钮和标题。等视口稳定后再校准一次，按优先级处理：焦点输入框必须可见，其次是主按钮，最后才是标题不进入状态栏。空间够用时，滚动量不越过上限；不够时，标题从遮罩下方经过。校准基于当前的几何状态计算，重复执行结果相同，浏览器先滚过头时也会被拉回来。

```typescript
const GAP = 8;
let settleFrameId = 0;

function settleScroll(): void {
  settleFrameId = 0;
  const field = document.activeElement as HTMLElement | null;
  const title = document.querySelector<HTMLElement>('.login__title');
  const submit = document.querySelector<HTMLElement>('.login__submit');
  const mask = document.querySelector<HTMLElement>('.statusbar-mask');
  if (!field || !title || !submit || !field.matches('input, textarea, [contenteditable="true"]')) return;

  const vv = window.visualViewport;
  const visibleTop = vv ? vv.offsetTop : 0;
  const visibleBottom = visibleTop + (vv ? vv.height : window.innerHeight);
  const statusBar = mask ? mask.getBoundingClientRect().height : 0;

  const fieldNeed = field.getBoundingClientRect().bottom - (visibleBottom - GAP);
  const submitNeed = submit.getBoundingClientRect().bottom - (visibleBottom - GAP);
  const lower = Math.max(fieldNeed, submitNeed);                                           // 至少要滚这么多，焦点和按钮才露出来
  const upper = title.getBoundingClientRect().top - (visibleTop + statusBar + GAP);        // 最多滚这么多，标题才不进状态栏

  // 区间有解时取离 0 最近的值（即最小滚动量）；区间无解时优先露出焦点和按钮
  const delta = lower <= upper ? Math.min(Math.max(0, lower), upper) : lower;
  if (Math.abs(delta) >= 1) window.scrollBy(0, delta);
}

function scheduleSettle(): void {
  if (settleFrameId) cancelAnimationFrame(settleFrameId);
  settleFrameId = requestAnimationFrame(settleScroll);
}

document.addEventListener('focusin', scheduleSettle);
window.addEventListener('resize', scheduleSettle);                 // RESIZE_CONTENT：布局视口变矮之后
window.visualViewport?.addEventListener('resize', scheduleSettle);

// 页面卸载时移除三个监听器并 cancelAnimationFrame(settleFrameId)。
```

- 不要在 `focus` 后用固定延时调用 `scrollIntoView({ block: 'end' })` 或 `window.scrollTo`：它们不知道状态栏在哪里，也不等视口稳定。
- 页面底部不要为了“制造滚动空间”而补一段和键盘等高的占位。`RESIZE_CONTENT` 下布局视口已经变矮，真实内容足够滚动；多出来的占位会让用户拖进一片空白。
- 键盘收起后，`is-typing` 被移除，页面恢复原有布局；没有被挡住的内容不需要额外的 `scrollTo` 复位。

### `RESIZE_VISUAL` 的差异

布局视口不变，浏览器靠平移视觉视口来露出焦点，`window.scrollBy` 可能和这种平移互相竞争。所以这种模式下不跑 `settleScroll`，只保留“压缩顶部”和状态栏遮罩。遮罩靠“弹框内输入被键盘遮挡”一节的 `syncVisibleRect` 更新 `--vv-top`（整页表单不需要其中的 `revealFocusedField` 调用）；固定顶栏同样使用 `top: var(--vv-top, 0px)`。键盘弹出后按钮仍然被挡时，优先建议容器改用 `RESIZE_CONTENT`。

### 验证

- 在最小目标屏和常规屏上，分别聚焦第一个和最后一个输入框：焦点输入框和主按钮都在键盘上方。放得下时页面不滚动，或只滚动最小距离，标题始终在状态栏下方；放不下时，标题从遮罩下方经过，状态栏区域不露出底下的内容。
- 页面不能被拖进键盘高度的空白区；输入框之间切换焦点不来回跳动；键盘收起后布局复原。
- 回车可以从第一个输入框跳到下一个，在最后一个输入框按回车直接提交。
- 旋转、进入分屏后再次聚焦，结果与首次一致。
- 记录判别结论；属于容器上推或双层避让叠加时，如果只交付 H5 部分，列出交接项，不宣告完成。

## 常见根因

- 容器没有沉浸却期待 `env()` 生效，或容器已沉浸但网页没有消费。
- 根容器固定 `height: 100vh` 且 `overflow: hidden`。
- 固定底栏没有计入安全区或键盘偏移，或使用的偏移算法与当前避让模式不匹配。
- 聚焦后立即按固定值滚动（例如延时后把按钮 `scrollIntoView` 到底部），不等视口稳定、也不设上限，结果与浏览器的自动滚动竞争，或者把顶部内容推进状态栏。
- 问题属于容器上推或双层避让叠加，却在 H5 侧补偿。
- 弹框整体 `overflow: auto` 导致标题和按钮滚走，或中间区缺 `min-height: 0` 无法收缩；居中弹框只按整屏居中，没有跟随可见区域。
- 页面级容器和嵌套组件重复消费同一组 safe area，导致 padding 叠加。
- 使用物理屏幕高度计算 Web 页面可用高度。

## 验证

- 记录容器沉浸方式、`setKeyboardAvoidMode` 和 Web `keyboardAvoidMode` 的取值，以及判别表的结论（容器上推 / 双层避让叠加 / 网页滚动）。
- 键盘弹出时，顶部标题、固定顶栏和弹框头部仍位于状态栏下方；放不下时，标题从状态栏遮罩下方经过，状态栏区域不露出底下的内容。
- 顶部、底部和四方向特殊区域均不遮挡关键内容；滚动后粘性顶栏仍在状态栏下方。
- 首屏、页面底部和弹窗中的输入框分别测试键盘弹出。
- 连续切换焦点、收起键盘、旋转和进入分屏，页面不累计偏移。
- 直板机无安全区时 padding 回退为 0。
