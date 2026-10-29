---
name: harmonyos-rn-multi
description: 审查并修改 React Native for OpenHarmony（RNOH）应用的多设备 UI 布局，包括动态窗口、父约束与滚动、图片/横幅比例来源与宽屏限幅、多设备资源差异化与动态样式（断点字体/间距、设计 token、自定义 rem/scale）、RTL、Transform/布局动画、Modal/Portal、折叠连续性、安全区、官方多设备布局组件，以及通用 Fabric 原生视图 resize。用户提到 RN/RNOH、平板/折叠屏/PC/分屏/自由窗口、图片拉伸/裁切/占屏过大、尺寸或字号不刷新、内容溢出/空白/错位、RNSurface 不同步时使用；纯 ArkUI、纯 H5、相机内容链路、硬件键鼠/手写笔和非 HarmonyOS 的普通 React Native 任务不使用。
---

# HarmonyOS React Native 多设备适配

## 适用范围与所有权

处理现有 RNOH 工程中的 React/TypeScript、RNOH ArkTS 宿主、TurboModule、Fabric Native Component，以及确有必要的 HarmonyOS 原生能力代码。保留项目已有 RN/RNOH 版本、导航、状态管理、设计语言、构建方式、Codegen 和注册机制。本 Skill 独立提供诊断与修法，不编排工程扫描、批次 SPEC 或完整验证报告。

- **RN JS**：当前应用窗口内的 Flexbox、断点、设计 token 与动态样式、页面结构、导航呈现和业务状态。
- **RNOH Host**：把应用窗口变化传播到正确的 RNInstance/RNSurface，管理宿主监听生命周期。
- **TurboModule**：只提供 RN 当前版本无法表达的非可视系统快照、命令或事件。
- **Fabric**：只承载必须嵌入 RN 的通用原生 UI，并消费 RN 布局提交。
- **共享契约**：事件名、字段、单位、序列、首次状态、错误和释放，不复制第二套断点或业务状态。

纯 ArkUI、纯 H5/WebView、相机预览/拍照/录像、硬件键鼠/触控板/手写笔、跨设备数据流转、RN 打开原生页的混合工程搭建，以及与 HarmonyOS 无关的普通 RN 功能不属于本 skill。

原生 ArkTS `Tabs`/`Navigation`/`SideBarContainer` 渲染的 Tab 栏或侧栏本身的断点适配（如 lg 下底部 Tab 迁移侧栏）路由到 harmonyos-ui-multi；本 skill 只处理它对页签内 RNSurface 的影响，见 `responsive-layout.md`「底部 Tab 宽屏迁移：先判 Tab 栏 owner」。

## 强制前置审计 `RN-00`

所有任务先完整读取 `references/capability-boundary.md`，根据实际文件、锁定版本、导入和调用链判定输入模式：

- `RN_ONLY`：只改 JS/TS/TSX；缺必要原生生产者时输出交接项。
- `HOST_ONLY`：只改 RNOH ArkTS 宿主和窗口传播；不虚构 React 消费端。
- `NATIVE_ONLY`：只改已有 TurboModule/Fabric/原生实现；不虚构 JS wrapper 或 Spec。
- `HYBRID`：至少两层源码与调用关系可定位；先固定跨层契约，再联动检查。
- `INSUFFICIENT`：源码、锁文件或调用链不足；只诊断并列出缺失材料。

`RN-00` 不计入主次场景。写代码前记录 `input_mode`、锁定版本证据、可编辑层、首错链路候选和缺失对端；发现新源码后重新判定。

## 核心判断框架

1. **先固定需求语义**：把“保持比例”“不裁切”“宽屏别太大”拆成可验证约束；从设计 token、验收、正常基线和资源元数据消歧，仍无法判断时只问一个会改变实现的问题，不从缺陷代码猜产品意图。
2. **沿链找首错点**：`HarmonyOS window → RNOH Host/RNInstance/RNSurface → RN Dimensions → breakpoint/token/custom scale → parent constraints/scroll viewport → StyleSheet/component/list → Yoga/onLayout → transform/animation/portal → native view/Surface`。上一段未修好时不在下一段叠补丁。
3. **先自适应，后响应式**：Flexbox 收缩、增长、换行、滚动、比例或内容最大宽度能解决时不加断点；信息结构、导航位置、列数或媒体构图确实变化时才用断点。“不需要断点”仍须证明宽屏增长受约束。
4. **以应用窗口为准**：布局读 `useWindowDimensions()` 或即时 `Dimensions.get('window')`；离散值复用工程唯一断点源；连续 `rem/scale` 必须由最新 window 派生、限幅并触发重渲染。不按物理屏幕、机型、设备类型、fold posture 或窗口 mode 决定断点。需求明确点名 HarmonyOS sm/md/lg 时采用官方 vp 阈值，见 `responsive-layout.md`「窗口与断点」。
5. **保持稳定身份**：窗口变化不重建 React 根、NavigationContainer、Provider、Store、route、表单或原生组件业务状态。
6. **选择最小实现层**：`RN_JS → HOST → TURBO_MODULE → FABRIC`；当前版本已有能力时不新增桥接。
7. **版本证据优先**：以 lockfile、已安装类型/实现、对应 tag 文档和目标设备实测为准，不从 Android/iOS 或其他 RNOH 版本外推。
8. **四类 scale 分开**：应用窗口比例、自定义设计单位、`fontScale`（用户文字偏好）和 `PixelRatio`（像素密度）不能混用或重复相乘；尺寸、方向、折叠姿态和窗口模式分别建模。

## 禁止模式

只列跨场景的硬规则，场景细则在对应 reference：

- 禁止永久缓存启动时的窗口宽高，或用 `Dimensions.get('screen')`、`Platform.isPad/isTV`、机型、物理 display 尺寸驱动布局；禁止模块顶层求一次 `rem/scale` 后让 `StyleSheet.create` 永久持有，或只改全局变量不触发 render。
- 禁止把 `fontScale` 或 `PixelRatio` 乘到页面宽高、断点和整套间距；禁止为修文字溢出全局关闭 `allowFontScaling`。
- 禁止用 `key={width}`、`key={breakpoint}`、随机 key 或重建 RNInstance/RNSurface 代替 resize。
- 禁止让 ArkTS/Fabric 维护第二份导航、选中项、表单或原生 UI 业务状态。
- 禁止在未读锁定 Spec、Codegen、注册和实现时虚构 RNOH API、prop、事件或生命周期；禁止手改 Codegen 生成物。
- 禁止为普通单双栏、折展或分屏布局新增 posture/window-mode TurboModule。
- 禁止用无界百分比高度、只改 `contentContainerStyle` 或固定屏高掩盖父约束链断裂。
- 图片/横幅：禁止从待修复的旧宽高公式反推比例，禁止混淆资源比例与展示框比例，禁止让横幅在超宽窗口无限放大；静态 `require()` 资源禁止在 Image 自身用 `aspectRatio` 推另一边或只靠 `absoluteFill`。细则只在 `image-and-media.md`。
- 官方多设备组件包：禁止未按 `RN-13` 四级结论评估就引入或整库替换，禁止同时运行多个断点源或多个 inset/fold listener owner，禁止把物理 px 直接写入 RN style。
- 禁止把静态扫描、截图或编译成功当成目标设备行为已验证；缺证据写 `not_verified`。

## 场景路由

完成 `RN-00` 后按首个错误约束选一个主场景；只有存在独立关联根因时才加次场景。只读命中场景的资源。

| 场景 | 命中条件 | 必读资源 |
| --- | --- | --- |
| `RN-01` 组件自适应 | Row/Flex 溢出、文本截断、图片/视频拉伸、裁切、占屏过大、固定尺寸 | `responsive-layout.md`；图片另读 `image-and-media.md` |
| `RN-02` 页面响应式 | 列表增列、主从栏、RN 渲染的 Tab/侧栏切换、宽屏留白 | `responsive-layout.md` |
| `RN-03` 资源差异化与动态样式 | 断点字体/间距/图标/尺寸、自定义 rem/rpx/scale、折展后 StyleSheet/动画端点不更新 | `dynamic-scaling-and-styles.md`；媒体另读 `image-and-media.md` |
| `RN-04` 动态窗口与宿主 | `useWindowDimensions` 本身不更新、RNSurface 半屏、多实例 owner、分屏/自由窗入口不出现或最小窗口受限 | `window-and-continuity.md` |
| `RN-05` 安全区与键盘 | 系统区域遮挡、双 inset、输入框被键盘遮挡/双重上抬、底部弹窗被顶进状态栏 | `safe-area-and-keyboard.md` |
| `RN-06` 折叠、方向与连续性 | 开合跳首页、列表位置丢失、快速折展竞态、半折/折痕、方向请求、原生页退出后方向未恢复 | `window-and-continuity.md` |
| `RN-07` 原生 UI 与桥接 | 通用 Fabric view/Surface resize、触控坐标错位、TurboModule/Fabric 选型、Codegen/注册 | `native-bridge-and-resize.md` |
| `RN-08` 版本与已知行为 | RN/RNOH/HAR/CLI/UI 库不一致，或业务链正确后 Image/Text/Scroll/List/SafeArea/Modal/Transform 仍异常 | `compatibility-matrix.md` + `known-rnoh-layout-issues.md` |
| `RN-09` 父约束与滚动视口 | `flex`/百分比子项为 0、ScrollView 空白/不能滚动、宽短窗口操作不可达 | `layout-constraints-and-scroll.md` |
| `RN-10` RTL 与逻辑布局 | RTL 下左右错位、抽屉/绝对定位/箭头/动画方向错误 | `rtl-and-logical-layout.md` |
| `RN-11` Transform 与布局动画 | transform 后重叠、onLayout 与视觉不一致、resize 中动画跳变、Native Driver 布局属性无效 | `transform-and-layout-animation.md` |
| `RN-12` Modal、Portal 与覆盖层 | 路由后弹窗残留、弹窗按旧窗口、重复安全区、RN Modal/Portal/ArkUI Dialog 冲突 | `modal-and-portal.md` |
| `RN-13` RNOH 官方多设备组件 | 工程已使用或明确评估断点、显隐、侧栏、分栏、栅格、Fold 容器、避让区域组件 | `rnoh-adaptive-components.md`，再按候选能力读 `adaptive-components/` 下对应文件 |

资源都在 `references/` 下。按问题补充读取，不作为固定前置：

- 基础流程无法形成可证伪根因：`troubleshoot.md`。
- 需要真机、动态窗口、裁剪或跨层几何证据：`device-evidence-toolchain.md`。
- 症状命中 Image、FlatList、ScrollView、Fold、折痕、Avoid、键盘、方向恢复或分栏留白案例：`rnoh-layout-casebook.md`。
- 不接受新增依赖，或 RN-13 结论不是 `DIRECT`：`rn-built-in-fallbacks.md`。
- 需要复制最小实现骨架：`recipe-index.md`，只选与主场景匹配的 asset。

## 工作流程

1. **建立源码与版本地图**：RN 入口、导航、页面、样式、宿主、RNInstance/RNSurface、原生扩展、Spec/Codegen/注册和锁定版本。
2. **固定需求契约**：硬约束与视觉偏好分开；图片任务按 `image-and-media.md` 建 `image_intent`。
3. **记录基线**：手机结构、路由、状态 owner、滚动/焦点、窗口与 wrapper bounds。
4. **找首错点**：比较正常/异常状态同一轮次的 window、派生 scale/token、关键 style/onLayout、列表锚点和 bounds，找到“上一段正确、下一段错误”的边界；原始 width 已更新而 rem/style 未更新属于 RN 派生层，不归因 Host。
5. **最小反证**：隔离一个约束、监听、memo/key、桥接字段或状态入口，确认它能稳定开启/关闭现象。
6. **最小修复**：先修上游约束；跨层变化同步检查 Spec、Codegen、注册、首次状态、序列、错误、单位和清理。使用 asset 时只复制所需文件，替换示例阈值、比例、尺寸和 owner。
7. **验证并清理**：按下方完成门槛分层验证，删除临时诊断代码。

## 完成门槛

按执行环境分三层，每层单独报告；做不到的层整层标 `not_verified`，不要逐项复制套话。

**静态（必做）**

- 修改未越过输入模式允许层级；缺失对端有可执行交接项（owner、契约、首次状态、清理、验收）。
- 布局只依赖当前 window 和内容约束；同一最终 window 推导出相同的 breakpoint、token、设计单位和关键布局值；`fontScale` 与 PixelRatio 不作页面缩放输入。
- 状态 owner 不随断点变化：无 width/breakpoint key，NavigationContainer/Store 在稳定层。
- 新增 listener、subscription、Surface 和异步任务有 owner，卸载/invalidate 时幂等释放；异步回调有失效守卫。
- 媒体任务完成 `image-and-media.md` 的几何反证（窄、目标宽屏、超宽、宽短）；ScrollView/List 有可解释的有界 viewport。
- 涉及原生时，Spec、Codegen、实现、注册和 JS wrapper 来自同一锁定兼容线；工程脚本的 TypeScript/bundle/HAR 构建结果单独报告。

**有目标设备时（必做）**

- 在**原失败参数**（同一窗口 px、密度、折展态）上改前失败、改后通过；换了窗口参数只能写“未在原失败窗口复验”。
- 手机基线无退化；目标窗口、断点临界值、折→展→折、窄→宽→窄后业务状态连续，无需重建 React 根。
- 多列布局附 `scripts/assert-layout.mjs` 的逐行断言结果；比例类任务附被测节点本身的 `onLayout` 实测比例。
- 键盘、安全区、覆盖层改动在全屏、分屏和自由窗口各验证一次。

**发布前（按需）**

- 至少一个 `窗口 px / 密度` 非整数的窗口、前后台、重复进入、RTL 冷启动、大字体。
- 接入官方社区包时：非默认断点在原生/JS 路径一致，px→layout unit 只转换一次，两个并发消费者任一卸载不影响另一方。

## 交付内容

最终答复简洁说明：

1. `input_mode`、锁定版本和文件/调用链证据。
2. 主场景、首个错误链路和修改文件。
3. 实施内容，以及完成门槛三层各自的结果；媒体任务另按 `image-and-media.md`「交付字段与完成判定」列出字段。
4. 必要的对端交接、`not_verified` 和残余风险；没有则省略。

不输出空字段堆砌的内部账本，不把“流程完成”写成“目标设备验证通过”。无目标窗口运行证据时写“实现已更新，视觉验收 `not_verified`”，不笼统宣称“一多适配已完成”。

## 支持资源

- `references/`：`capability-boundary.md` 每次必读，其余按路由表和补充读取规则读取。`test-prompts.md` 是人读版用例说明，修改 description、路由、禁止模式或资源索引后运行 `python3 evals/run_evals.py` 做结构与用例回归。
- `assets/responsive-shell/`：新建普通响应式页面且项目没有更合适封装时复制改造；断点读取 `recipes/BreakpointProvider.tsx`（唯一断点源，不自带阈值），`maxContentWidth` 和 `useDesignUnits` 的缩放策略为必填参数，必须来自项目设计系统。
- `assets/recipes/`：10 个按场景选择的 TSX recipe，索引见 `recipe-index.md`；阈值、宽度和文案都是调用方参数，Fold/Avoid 通过注入式 port 隔离包版本，不得据此虚构原生 API。
- `scripts/assert-layout.mjs`：对 `uitest dumpLayout` / `devecocli ui layout` 导出的 JSON 按 testID（支持 `前缀*`）断言等宽栅格每行列数、等宽、占满和列间距；用法见 `device-evidence-toolchain.md`。
