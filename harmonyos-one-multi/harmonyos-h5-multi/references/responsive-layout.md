# H5 页面响应式布局

命中 `H5-02` 时完整读取：单双栏、导航迁移、列表增列、宽屏留白，以及新增结构尺寸在动态 REM 工程中被转换。组件内部溢出见 `component-adaptive.md`；分屏、旋转后不更新见 `dynamic-window.md`；重排后读屏顺序和图标名称见 `a11y-reflow.md`。

## 基线

组件级基线（`box-sizing`、媒体收缩、长文本换行）见 `component-adaptive.md`。页面入口使用：

```html
<meta
	name="viewport"
	content="width=device-width, initial-scale=1, viewport-fit=cover"
/>
```

不要禁用用户缩放。出现图片模糊、资源过大、不同窗口需要不同构图、视频裁切或 `srcset/sizes` 问题时，转读 `responsive-media.md`，不要把资源选择塞进普通布局断点。

## 断点策略

从内容断裂位置选择断点，不把设备名称写入 CSS。项目已有断点时先复用；没有时先使用少量语义状态，再用实测调整。下文示例的 `600px/840px` 取自 HarmonyOS 断点（sm/md/lg 的 vp 分界；ArkWeb 默认 CSS px 约等于 vp），只作为无项目断点时的起点。

如果项目使用动态 REM，先在 `rem-responsive.md` 确认缩放上限。宽度超过上限后，新增空间应通过下文的宽屏策略利用；不要继续提高根字号来放大整个移动页面。

### 动态 REM 页面的单位规则

先确认工程有没有 px 转换插件（`postcss-pxtorem`、`postcss-px2rem`、`postcss-px-to-viewport` 等，见 `rem-responsive.md` 的“px 转换插件”）。flexible.js 配合这类插件时，源码里写的 `px` 会在构建时变成 `rem` 或 `vw`，同样随窗口缩放；**源码写 `px` 不等于运行时是 `px`**，判断以生成 CSS 为准。

运行时的 `rem` 跟随被缩放的根字号，在不同语法位置的含义也不同：

| 位置 | `rem` 的实际基准 | 后果 |
| --- | --- | --- |
| 普通属性（栏宽、`max-width`、gap） | 动态根字号 | 栏宽和内容上限随移动设计坐标一起放大 |
| `@container` 条件 | 根元素字号 | 根字号 37.5px 时 `32rem` = 1200px，组件几乎不会切换 |
| `@media` 条件、`<img sizes>` | 浏览器初始字号（通常 16px） | 不跟随动态根字号，与实际 slot 脱节 |

因此在动态 REM 页面中：

- 页面结构断点、container query 阈值、栏宽、内容最大宽度和 `sizes` 在**生成 CSS 中**必须是 `px`。有转换插件时，按插件实际行为选择保留写法（大写 `PX`、`/*no*/`、`selectorBlackList`、`exclude` 或不参与转换的独立样式文件），并检查生成 CSS 确认未被转换。
- 媒体查询条件只有在插件开启 `mediaQuery: true` 时才会被转换；转换后的 `rem` 按 16px 解析，断点会严重偏移，见 `rem-responsive.md`。
- 只有确实属于移动设计坐标的尺寸（设计稿上的间距、圆角、组件内部尺寸）才交给插件转换或使用设计 REM。
- 下文示例中的 `px` 指运行时 `px`。工程有转换插件时，源码要用对应的保留写法；浏览器默认根字号且没有转换插件的新页面，可以把结构尺寸改成 `rem`。

```css
.page {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
}

@media (min-width: 600px) {
	.cards {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (min-width: 840px) {
	.page {
		grid-template-columns: 256px minmax(0, 1fr);
	}
}
```


### 整页限宽后的参照基准

存量移动页面在宽屏下常用整页限宽居中（根容器 `max-width` 加 `margin-inline: auto`）。限宽后，以视口为参照的写法不再跟随容器。

**优先在构建层统一实现。**先看工程能否用构建期方案统一处理整页限宽。flexible 一类脚本的最大宽度只能封顶根字号；`postcss-mobile-forever` 一类插件在设定最大显示宽度后，可以把 `vw` 转成带上限的值，并处理 fixed 元素的居中。具体选项以插件文档和生成 CSS 为准。构建期方案覆盖不到模板内联样式、JS 写入的尺寸、`<img sizes>` 和第三方组件的挂载位置，这些按下表逐项核对。已经启用构建期限宽的工程，不要再为同一类写法手工改单位，避免两套规则并存。

没有构建期方案，或者需要核对插件覆盖不到的写法时，按下表检索全部同类写法逐项判断，不要只修已经报出问题的元素。

| 写法 | 参照物 | 限宽后的现象 | 改法 |
| --- | --- | --- | --- |
| `vw/vh/vmin/vmax`（含 `100vw`） | 视口 | 尺寸超出或偏离容器 | 改 `%`；或在限宽容器上声明 `container-type: inline-size` 后改用 `cqi` |
| `position: fixed` | 视口 | 顶栏、底栏、遮罩通栏或偏移 | 给 fixed 元素同样的上限并居中（`inset-inline: 0; inline-size: min(100%, 上限); margin-inline: auto`），或改用 `sticky` |
| `@media` 宽度条件 | 视口 | 视口已达宽屏断点而容器仍窄，窄盒子里套用宽屏布局 | 限宽容器内的组件改用 `@container` |
| `<img sizes>` 中的 `vw` | 视口 | 下载远超容器宽度的资源 | 写成 `(min-width: 上限) 上限px, 100vw` 的形式 |
| JS 读取 `innerWidth`、`clientWidth`、`matchMedia` | 视口 | 布局计算拿到的是视口宽 | 读容器 `getBoundingClientRect().width`，或用 `ResizeObserver` 观察容器 |
| `width: 90%`、`padding: 5cqi`、`grid-template-columns: 1fr 1fr`、`flex: 1` | 容器（`%` 按包含块计算，`cqi` 按最近的 `container-type` 祖先计算） | 随限宽变化 | 一般无需处理。例外：元素自身或祖先是未限宽的 `position: fixed` 时，包含块是视口，`%` 仍按视口计算，要先按上面 fixed 一行处理；`cqi` 需要较新内核，按最低目标 ArkWeb 版本核对，不支持时用 `%` |

## 宽屏策略

页面结构断点只按可用宽度判断；方向和高度只用于短屏修正（见 `wide-screen-landscape.md`），不要把 `orientation: landscape` 当作双栏的前提，否则宽度足够的竖屏平板会停在单栏。

宽屏新增空间按信息架构选择一种主策略：

1. **重复布局**：卡片、商品、图片或列表项增加列数。
2. **分栏布局**：导航/目录、主内容、详情形成左右两栏或三栏。
3. **挪移布局**：底部导航移到侧边，操作栏从底部移到右侧。
4. **缩进布局**：正文、表单等不宜拉长的内容保持合理行长，两侧留出有意义的边距或背景延伸。

不要同时放大字号、卡片、间距和图片来“填满”宽屏。宽屏价值通常来自更多信息或更短操作路径，而非整体缩放。

**先判断页面意图。**整页限宽或改为通栏之前，先区分两类页面：以阅读和操作为主的页面跟随容器；以整幅视觉为主、需要铺满窗口的页面可以突破限宽。后者在限宽容器居中时可用 `margin-inline: calc(50% - 50vw)` 通栏，也可以把它放在限宽层之外；`100vw` 在 2in1 窗口中包含滚动条，要同时检查横向滚动。页面属于哪一类由业务确认；无法确认时保留原有视觉，在结论中列为待确认项，不要默认改成跟随容器。

### 重复布局的 Grid 写法

列数随容器宽度变化时，剩余空间不能全部留在行尾。先判断网格项属于哪一类，再选写法；两类的目标不同，不能用同一条规则。

#### 第一步：识别网格项类型

| 类型 | 典型内容 | 识别信号（满足多条即可判定） | 宽屏时的目标 |
| --- | --- | --- | --- |
| **A. 固定尺寸小元素** | 头像、图标、表情、色块/主题色选择、宫格功能入口图标、标签按钮 | 设计稿给出固定宽高（常见 32–96px）；宽高相等或 `aspect-ratio: 1`；`border-radius: 50%`；图片资源是固定小尺寸；类名或组件名含 avatar、icon、emoji、swatch、sticker；内容不含会换行的正文 | **元素尺寸不变**，增加每行个数，剩余空间分到间距或两侧 |
| **B. 弹性卡片/容器** | 商品卡、新闻卡、图文卡、视频封面、信息面板 | 含标题、正文、价格等长度不定的文字；宽度在设计稿中按栏宽或百分比给出；内部有图片区 + 文字区；高度随内容变化 | **列宽可伸缩**，增加列数并把剩余空间分给列宽，同时限制单卡最大宽度 |

判定不了时（例如带名称的大图标入口），按“放大后是否影响观感或辨识”判断：放大会显得失真或幼稚的归 A，放大能展示更多信息的归 B；仍不确定时按 A 处理并在结论中说明。

#### A. 固定尺寸小元素

轨道可以伸缩，但元素本身保持设计尺寸，在轨道内居中：

```css
.avatar-grid {
	--item: 56px;
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(var(--item), 1fr));
	justify-items: center;
	gap: 12px;
}
.avatar-grid > * {
	inline-size: var(--item);
	aspect-ratio: 1;
}
```

- 窗口变宽时每行个数增加，多出的空间变成元素之间的间距，元素不会被拉大。
- 不要对这类元素用 `inline-size: 100%` 填满 `1fr` 轨道：轨道最多可伸到接近两倍最小宽度，头像、图标会忽大忽小。
- 宽屏下一行过长时，给网格设最大宽度并居中（缩进布局），例如 `max-inline-size: 720px; margin-inline: auto`，而不是放大元素。
- 产品要求“只出现整行”（例如 18 个头像不要排成 14 + 4）时，在断点内显式指定列数（如 `repeat(9, …)`），不要靠 `auto-fill`。
- 触控目标不小于设计规范要求；元素本身小于触控目标时，用内边距扩大可点击区域，而不是放大图形。

#### B. 弹性卡片/容器

列宽随容器伸缩，剩余空间平均分给各列：

```css
.cards {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(min(200px, 100%), 1fr));
	gap: 16px;
}
```

- `minmax(最小宽度, 1fr)`：列数由最小宽度决定，多出的空间平均分给各列。`min(200px, 100%)` 防止容器比最小宽度还窄时横向溢出。
- `auto-fill` 与 `auto-fit` 只在“项目数少于能放下的列数”时有区别：`auto-fill` 保留空列，项目保持单列宽度，右侧出现空白；`auto-fit` 折叠空列，已有项目拉伸占满整行。卡片数量不固定且希望列宽一致时用 `auto-fill`；希望少量项目撑满一行时用 `auto-fit`，并给卡片设置 `max-inline-size` 防止过宽。
- 卡片内的图片用 `aspect-ratio` 固定比例，`sizes` 按实际列宽维护（见 `responsive-media.md`）。

两类都适用：动态 REM 或 px 转换插件工程中，最小列宽和元素尺寸在生成 CSS 中必须是 `px`（见上文单位规则），否则列数和元素大小会随根字号漂移。

#### 导致“窗口变宽后右侧留白”的常见写法

| 写法 | 现象 | 改法 |
| --- | --- | --- |
| `repeat(auto-fill, 200px)`、`repeat(auto-fit, 56px)` 等固定轨道宽度 | 列数会变，但不足一列的剩余空间全部留在行尾 | A 类：轨道改 `minmax(尺寸, 1fr)` 加 `justify-items: center`；B 类：改 `minmax(…, 1fr)` |
| `repeat(6, 56px)`、`repeat(3, 300px)` 等写死列数 | 列数和总宽都不变 | 改为 `auto-fill` 加 `minmax`；需要整行时在断点内改列数 |
| 网格容器或网格项上写死 `width` | 轨道被撑开或压住，与容器宽度脱节 | 删除容器固定宽度；A 类保留元素尺寸、去掉轨道写死，B 类交给轨道尺寸 |
| `justify-content: start` 加固定宽度轨道 | 内容整体靠左 | 改用 `fr` 轨道；确需固定宽度时用 `center` 或给网格设上限并居中 |
| JS 首次加载时计算列数或列宽并写入内联 style | 旋转、折叠展开、分屏后不更新 | 改由 CSS 计算；确需 JS 时用 `ResizeObserver` 观察网格容器并重算 |

## 视口高度

移动端地址栏、输入法和沉浸式区域可能改变可视高度。优先使用动态视口单位，并为旧内核保留回退：

```css
.app-shell {
	min-block-size: 100vh;
}
@supports (min-height: 100dvh) {
	.app-shell {
		min-block-size: 100dvh;
	}
}
```

不要默认使用固定 `height: 100vh` 包住全部内容；内容增长时应允许滚动。键盘弹出时 `dvh` 是否变化取决于 ArkWeb 的键盘避让模式，见 `safe-area-and-keyboard.md`。

## 2in1 / PC 窗口

- 经典滚动条会占用宽度：`100vw` 包含滚动条，容易产生横向溢出；全宽元素用 `100%`。动态 REM 的 `vw` 写法与 `clientWidth` 写法在此相差一个滚动条宽度。
- 鼠标与触控并存时，悬停增强放进 `@media (hover: hover) and (pointer: fine)`，不要让核心操作依赖悬停。

## 验证

- 在最小支持宽度、每个断点值及其 ±1px、宽屏视口测试。
- 连续拖动窗口，而不是只刷新几个固定尺寸。
- 检查横向滚动、滚动位置、长文本和文字放大（ArkWeb 中的构造方式见 `troubleshoot.md`）。
- 改动了 DOM 顺序、视觉位置、导航形态或图标控件时，按 `a11y-reflow.md` 逐断点检查 Tab 顺序、读屏顺序和图标名称。
- 在分屏中使用实际 Web 组件宽度，不以物理屏幕截图推断。
