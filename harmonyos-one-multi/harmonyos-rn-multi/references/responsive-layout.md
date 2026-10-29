# RN 自适应与响应式布局

## 先判组件约束还是页面结构

命中 `RN-01` 时先修首个不可收缩、不可增长、固定或比例错误的组件约束。只有信息结构、导航位置、列数或同时可见区域确实变化时才进入 `RN-02`。

| 现象 | 优先机制 | 何时使用断点 |
| --- | --- | --- |
| Row 文本/操作溢出 | `flexGrow/flexShrink`、可增长高度、必要换行 | 操作区需要迁移到另一行/区域 |
| 内容过宽 | 外层占满、内层 `maxWidth` 居中 | 宽屏需要新增侧栏/详情 |
| 图片/视频变形或宽屏占屏过大 | 有界父 View 持有受约束宽度、可追溯 `aspectRatio` 和 `maxWidth/maxHeight`，Image 显式 100%/100%，语义化 `resizeMode` | 不同窗口需要不同展示框比例、构图或结构 |
| 卡片稀疏 | 连续伸缩或列表增列 | 列数变化能显著改善信息密度 |
| 导航拥挤 | 同一 route registry 下重排 | 底部 Tab 迁移侧栏 |

## 窗口与断点

函数组件直接消费当前应用窗口：

```tsx
type Breakpoint = 'compact' | 'medium' | 'expanded';

function resolveBreakpoint(width: number): Breakpoint {
  if (width >= 840) return 'expanded';
  if (width >= 600) return 'medium';
  return 'compact';
}

function useBreakpoint(): Breakpoint {
  const { width } = useWindowDimensions();
  return useMemo(() => resolveBreakpoint(width), [width]);
}
```

阈值来源按以下顺序：

1. 需求或验收**明确点名** HarmonyOS 断点（如“sm/md/lg 断点”）时，直接采用官方横向断点（单位 vp）：xs [0,320)、sm [320,600)、md [600,840)、lg [840,1440)、xl [1440,+∞)。需求只列出部分档位时写明映射（如只提 sm/md/lg：xs 并入 sm、xl 并入 lg），并按锁定 RNOH 版本确认 RN layout unit 与 vp 1:1。
2. 否则优先复用工程 design tokens。
3. 都没有时，连续改变目标窗口，根据内容首次拥挤、浪费或信息结构失效的位置选择阈值。

上例中的 600/840 只是示意。没有被需求点名时，不要因为“ArkUI 也这么分”就照搬断点枚举，也不要按设备类型映射断点。宽而短的横屏/自由窗口还要检查高度、宽高比和核心操作是否可达，不能只套 `minWidth` 大屏规则。

`Dimensions.get('window')` 可用于命令式即时读取；hook 不适用时才订阅 `Dimensions.addEventListener('change', ...)`，保存 subscription 并在 owner 卸载时 `remove()`。不要把启动值放进模块常量或静态 StyleSheet 后永久使用。项目使用 rem/rpx/normalize 或响应式样式库时继续读取 `dynamic-scaling-and-styles.md`，不能只确认原始 width 更新。

## Flexbox 约束

RN 默认 `flexDirection: 'column'`。候选 style 属性必须经过当前 RN/RNOH 类型和运行行为确认，不能照搬 Web CSS。

```tsx
const styles = StyleSheet.create({
  viewport: { flex: 1, alignItems: 'center' },
  content: { width: '100%', maxWidth: 960 },
  row: { flexDirection: 'row', alignItems: 'center' },
  body: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  action: { flexShrink: 0 },
});
```

`minWidth: 0`、`gap` 等行为按锁定版本和最小复现确认，不机械添加。启用 `flexWrap` 后移除只容纳一行的固定高度。大字体下关键文本、表单错误和操作说明不能靠默认 `numberOfLines` 隐藏。

**等宽多列栅格**：固定列数的等宽栅格不要用 `flexWrap` 加一组和恰好为 100% 的百分比宽度（`25%×4`、`12.5%×8`、`` `${100 / 3}%` ``×3；`33.33%×3` 之和为 99.99%，不在边界上）。它处在换行判断的边界上，浮点或像素对齐误差可能把每行末列挤到下一行，而且只在部分窗口尺寸出现（实测：三折叠全展开 3184px/2.875≈1107.5dp 时 8 列变成 7 列加换行，712dp 时正常）。具体机制未经最小复现，不要写成确定根因。两种稳定写法：

- 保留单个 wrap 容器，列宽 = `Math.floor((容器 onLayout 宽度 - 列间距总和) / 列数 * PixelRatio.get()) / PixelRatio.get()`，按物理像素向下取整，使列宽之和严格不超过容器宽（不要用 `PixelRatio.roundToNearestPixel`，它是四舍五入，可能向上取整）；树结构不变，断点切换不重挂格子。
- 按列数把数据分行，每行 `flexDirection: 'row'`、每格 `flex: 1`，末行不足时补等宽空占位（不带业务 testID）。断点切换会让格子换到另一个行容器而重挂，只用于无状态格子。

验收用 `scripts/assert-layout.mjs` 断言每行列数、等宽（差 ≤1 物理 px）、满行放不下再多一列、列间距一致，不靠人眼读坐标；只核对列宽相等会漏掉掉行。

若子项变成 0、百分比高度失效、ScrollView 空白/不能滚动或宽短窗口操作不可达，转 `RN-09` 读取 `layout-constraints-and-scroll.md`，逐层证明父约束和 viewport；不要继续在叶子叠 `flex: 1`。

## 列表、主从栏与导航

- FlatList 列数变化前检查当前版本行为；若必须重挂，只给列表呈现层使用由列数派生的 key，并把数据、筛选、选中、路由和业务锚点放在列表外。
- 列数或派生 item 尺寸变化时同步检查 item 宽高、间距、`renderItem/useCallback` 闭包、`extraData`、`getItemLayout`、`removeClippedSubviews`、骨架、空态和尾部加载；不要只改 `numColumns`。
- 记录 visible item key/index 与局部 offset。布局变化后绝对 pixel offset 不一定对应同一内容；如果业务链正确但折展后 offset 仍跳变，按 `RN-08` 检查锁定 RNOH 版本。
- 主从详情共享一个 `selectedId`/route state；紧凑模式显示其一，展开模式同时显示，不创建两份选中状态。
- 分栏或宽窗口下单侧栏内容右侧留白：先证明 window 已更新而内容宽度不随窗口增长（内容宽度绑定手机设计常量），反证移除 `maxWidth` 后留白消失；再按产品意图选限宽居中或填满/增列。定位与修法见 `rnoh-layout-casebook.md` Case 10。
- Tab 与侧栏可以切换视觉容器，但共享 route registry 与 active route；NavigationContainer 不进入断点互斥分支。底部 Tab 在宽屏迁移到侧栏时先判 Tab 栏 owner，见下节。
- Modal/Sheet 受当前窗口和安全区约束，内容可滚动，actions 参与正常布局；含输入框时只选一个键盘避让 owner。
- 路由后弹窗残留、Portal/Dialog 层级冲突或弹窗打开期间不随窗口更新时，转 `RN-12`；需要评估官方分栏、栅格、Fold 容器或避让组件时才增加 `RN-13`。

### 底部 Tab 宽屏迁移：先判 Tab 栏 owner

底部 Tab 在宽窗口（如需求点名的 lg）迁移为侧栏时，改动位置取决于用户实际看到的 Tab 栏由哪一层渲染。先搜代码定 owner，再选场景：

| 证据 | owner | 场景 |
| --- | --- | --- |
| ArkTS 宿主有 `Tabs`/`TabContent`（或 `Navigation`/`SideBarContainer`），每个页签内挂 RNSurface/RNApp | 原生 | 原生 Tabs 包 RN |
| JS 用 `@react-navigation/bottom-tabs` 的 `createBottomTabNavigator` 管理页签（栏可以是库内置栏，也可以是通过 `tabBar` prop 传入的开发者组件），宿主只挂一个 RN 根 | RN（导航库） | RN 导航库 Tab 栏 |
| 开发者自己写的 Tab 栏组件（如工程里的 `ToolBar`/`TabBar`），由页面自己维护选中页或调用 navigate，没有挂在 `createBottomTabNavigator` 上 | RN（自绘） | RN 自绘 Tab 栏 |
| 多层都有 | 先确认运行时可见的是哪一层，其余多半是遗留或嵌套 | 按可见层走对应场景；不能多层同时改成侧栏 |

区分导航库与自绘只看页签状态归谁：开发者组件作为 `tabBar` prop 交给 `createBottomTabNavigator` 时，选中页和路由仍由库管理，属于导航库场景；组件独立渲染、自己管选中页时，才属于自绘场景。

**原生 Tabs 包 RN（`HOST_ONLY`/`HYBRID`）**

- 侧栏切换写在 ArkTS 宿主，路由到 harmonyos-ui-multi，按它的导航挪移规则实现（`Tabs` 按断点联动 `barPosition`、`vertical`、`barWidth`、`barHeight`、`barMode`）；本 skill 不另写 ArkTS Tab 方案，只负责下面的 RN 侧检查。
- 断点切换只改 `Tabs` 属性，不用 `if/else` 在两套 `Tabs` 或两套页签容器间切换，否则 TabContent 内的 RNSurface 被销毁重建，RN 页面状态丢失。
- 栏移到侧边后，每个页签内 Surface 的宽度减去栏宽、高度增加。逐个可见页签核对 Surface bounds 已更新、内部触控对齐；异常转 `RN-04`/`RN-07`。
- RN 侧的 window 宽度通常是应用窗口，不扣除原生侧栏占去的宽度（按锁定版本实测确认）。页签内 RN 页面的列数、主从切换等结构决策以内容容器 `onLayout` 宽度为准，不直接用 window 断点，否则侧栏态会按整窗宽度多排一列。
- 底部安全区：底部栏态通常由栏吸收 bottom inset；侧栏态栏不再覆盖底边，页签内 RN 页面的底部内容要自行处理 bottom inset。与宿主是否裁剪 Surface 对账，证明无双 inset、无漏 inset（`RN-05`）。

**RN 导航库 Tab 栏（`RN_ONLY`）**

- 保持同一个 `Tab.Navigator` 与同一套 screen，只按断点改呈现 option；不在断点分支间换 Navigator、换 screen 列表或重挂 `NavigationContainer`。
- 先读已安装的 `@react-navigation/bottom-tabs` 类型声明：
  - 声明了 `tabBarPosition`：用 `assets/recipes/AdaptiveTabBarOptions.ts` 在宽档返回 `tabBarPosition: 'left'`，窄档返回 `'bottom'`，并联动该版本对侧栏的 variant/标签位置约束（以类型和源码中的断言为准）。
  - 没有声明：不硬塞未知 prop。可选做法是由产品决定升级到声明该 prop 且与锁定 RNOH 兼容的版本，或者通过 `tabBar` prop 传入开发者组件，在宽档以绝对定位渲染侧栏，同时给场景容器样式让出栏宽（prop 名按已安装版本）；后者须核对 `useBottomTabBarHeight` 在侧栏态的返回值，避免页面仍按底栏高度留白。
- 呈现 option 只放在 Navigator 级 `screenOptions`。部分版本按当前聚焦 screen 的 option 决定栏位置，单个 screen 覆盖这些 key 会导致切换页签时栏位置跳变。
- 依赖：接入前确认该 bottom-tabs 版本的 peer dependency（`react-native-screens`、`react-native-safe-area-context` 等）在锁定 RNOH 环境有对应适配版本；未确认时标记 `not_verified`，不只凭 npm 版本号下结论。

**RN 自绘 Tab 栏（`RN_ONLY`）**

- 同一个 Tab 栏组件、同一份页签数据和选中状态，只按断点切换外层方向和栏样式。子节点顺序固定为 [栏, 内容区]，窄档根容器用 `column-reverse`（栏在下），宽档用 `row`（栏在 start 侧，RTL 下自动到右侧），两种形态下栏与内容区保持同一树位置（同构原则同 `AdaptiveNavigationPresentation.tsx`）；内容区 `flex: 1, minWidth: 0`。不要用固定顺序 [内容区, 栏] 配 `row`，那样栏会落到内容右侧；也不要用全局 `row-reverse` 补救。树顺序决定读屏和键盘焦点顺序，按目标设备验证。不在断点分支间渲染两套栏或两套内容容器，否则页签内容重挂、状态丢失。
- 栏内部 `flexDirection` 同步从 `row` 切到 `column`；窄档底栏常用的各项 `flex: 1` 均分写法在侧栏态必须去掉，改为下面「RN 侧栏呈现」的紧凑排列。
- 没有“库默认”可沿用：对齐方式按下面的决策顺序确定，不由实现者自行选定。

**RN 侧栏呈现（导航库与自绘共用）**

- 侧栏宽度、图标与标签排列来自项目 token；不要把示例宽度当平台规范。
- 页签排布：整组紧凑排列，图标在上、标签在下，项间距来自 token；不让各项均分侧栏高度（3–5 个页签在平板高度下间隙过大）；页签过多时可滚动。
- 整组对齐（顶部或垂直居中）是会改变视觉结果的设计决策，按顺序确定：
  1. 需求、设计稿或验收已给出：照做。
  2. 同一应用已有原生侧栏（或原生 Tabs 包 RN 场景里的宿主 `Tabs`）：与它的实测呈现一致。
  3. 以上都没有：按核心判断框架第 1 条，把对齐方式作为一个决策点向用户确认，推荐垂直居中以贴近 HarmonyOS 原生侧边页签的常见呈现（这是推荐，不是平台文档规定；有原生参照时以目标设备上的实测为准）。导航库场景询问时一并说明：库内置侧栏只能顶部排列，居中需要通过 `tabBar` prop 换成开发者组件。无法询问时采用垂直居中并在交付中写明这是假设。不要以导航库的默认排列代替这一步。
- React Navigation 内置侧栏从顶部排列，`tabBarStyle` 只作用于外层容器，改不到内部列的对齐；确定居中时通过 `tabBar` prop 传入开发者组件（页签状态仍由库管理，组件只负责渲染），保留 `tablist`/`tab` 无障碍角色和选中态。
- 底部安全区：底部栏态由栏吸收 bottom inset，页面不再重复加；侧栏态页面底部内容自行处理 bottom inset，左侧（RTL 为右侧）inset 由侧栏处理。

**三种场景共同的验收**

- 窄→宽→窄、折→展→折、跨断点临界值来回拖动：当前页签、各页签内的导航栈、滚动位置和表单输入保持。
- 宽档侧栏不遮挡内容，内容区宽度等于窗口宽减栏宽；窄档底栏不与系统手势条或底部安全区重叠。
- 侧栏态在最小和最大目标高度下核对页签组的对齐与间距符合已确定的决策，页签过多时可滚动而不是被裁掉；交付中写明对齐方式的来源（设计稿、已有原生侧栏、用户确认或假设）。
- 冷启动直接在宽窗口进入时栏已在侧边，不出现先底栏再跳侧栏的闪动。
- 缺目标窗口的运行证据时，写 `not_verified`。

## 文本、图标与媒体

- 从 `useWindowDimensions()` 读取 `fontScale`；若 `width/height/fontScale` 本身陈旧，先路由 `RN-04` 检查 Host 传播；原始值正确而派生 fontSize/样式陈旧则路由 `RN-03`。
- 固定高度 + 固定 lineHeight + 多行文本是高风险组合；优先让容器增长/换行。
- `fontScale` 是用户文字偏好，不是页面 rem；不要把它乘到非文字布局，也不要与 Text 默认缩放重复相乘。
- 图标视觉尺寸和点击热区分开验证；不要用 PixelRatio 放大布局盒。
- Image/Video 任务完整读取 `image-and-media.md`。先区分资源比例与展示框比例，明确完整展示还是允许裁切，再选 `contain`/`cover`；比例和最大尺寸必须有设计 token、验收、正常基线或资源元数据依据。
- 横幅在宽屏下审计 `maxWidth/maxHeight`、居中留白和必要的断点展示比例；不要把手机布局按 window 无限等比放大，也不要从缺陷代码反推比例。
- 固定展示框比例配合有效父内容区限宽不需要断点；显式由 window 计算的子项宽度仍要证明受父约束。媒体交付前按 `image-and-media.md` 核算代表窗口，不能用“尺寸会更新”或“比例不变”替代宽屏增长验收。
- PixelRatio 只用于资源像素、发丝线和明确的布局单位↔物理像素边界；布局宽高和断点保持 RN layout units。
- RN wrapper 已收到新 bounds、内部 Surface/触控仍旧时，转 `RN-07`，不要继续改外层 style。
- React props、父约束和 onLayout 都正确但 Text 测量/换行仍异常时，读取 `known-rnoh-layout-issues.md` 做版本分流，不用更多 rem 补偿。
- 出现 RTL 绝对定位/方向性图标/动画错向时转 `RN-10`；transform 造成重叠或 resize 动画终点陈旧时转 `RN-11`。

## 状态连续性

NavigationContainer、Provider、Store、数据缓存和业务 controller 位于不随 breakpoint 变化的稳定层。断点只改变 presentation；逐个审计依赖 width/height/breakpoint 的 effect，允许重算布局，不允许无条件清空数据、导航或长生命周期资源。

## 验证矩阵

- 手机窄屏基线；断点前/中/后；目标大屏；同宽短高度窗口。
- 至少一个 `窗口 px / 密度` 不是整数的窗口（如三折叠全展开）；整数 dp 窗口会掩盖累计误差类问题。
- 冷启动折态→展态→折态、冷启动展态→折态→展态，以及旋转、分屏和自由窗口拖拽。
- 默认/大字体、长文本、空态/加载/错误态、键盘与安全区组合。
- 列表位置、选中项、表单、route、焦点、媒体进度和原生组件状态保持连续。

完成条件：没有由固定约束造成的溢出/截断；页面结构只在内容需要处切换；相同最终窗口得到相同呈现；手机基线和业务状态无退化。
