# Skill 测试提示词

修改 description、输入模式、路由、禁止模式或资源索引后运行这些用例。检查 `RN-00`、可编辑层、首个错误链路、最少资源读取和完成声明。

## 应触发

1. “修改这个 RNOH 商品页，平板分屏时 Row 溢出。”期望 `RN_ONLY`，主场景 `RN-01`；从组件约束入手。
2. “FlatList 在展开屏要三列，并改成列表+详情双栏。”期望 `RN_ONLY`，主场景 `RN-02`；共享选中/路由状态并检查 item geometry。
3. “项目用 `rem = Dimensions.get('window').width / 375` 生成 fontSize 和间距，折叠展开后仍是外屏大小。”期望 `RN_ONLY`，主场景 `RN-03`；先证明 window 已更新，再修派生值、render 通知和 StyleSheet 消费链。
4. “Dimensions listener 已更新全局 `layoutScale`，但页面只有 reload 才变。”期望 `RN_ONLY`，主场景 `RN-03`；识别全局变量变化没有触发 React render。
5. “`useWindowDimensions` 已是新宽度，响应式库 runtime 也更新，但 active breakpoint 和 memoized styles 仍旧。”期望 `RN_ONLY`，主场景 `RN-03`；核对库 hook/subscription、memo deps 和组件 selector。
6. “外屏打开后展开，`useWindowDimensions` 自身仍是旧宽度；有 EntryAbility 和 RNSurface 源码。”期望 `HYBRID`，主场景 `RN-04`；沿 Host→RNInstance/RNSurface→Dimensions 找首错点。
7. “只有 ArkTS RNOH Host，请修多 RNInstance 的窗口尺寸广播。”期望 `HOST_ONLY`，主场景 `RN-04`；只改 owner/传播，输出 RN 验收交接。
8. “SafeAreaProvider 和 ArkUI Host 都加 bottom inset，键盘又把 Sheet 上抬两次。”期望 `HYBRID`，主场景 `RN-05`；先建所有权表。
9. “折叠后跳首页，代码给 NavigationContainer 设置 key={breakpoint}。”期望 `RN_ONLY`，主场景 `RN-06`；保持稳定根和 route state。
10. “折展后 FlatList 回到顶部；列数、可见 item key 和 getItemLayout 都已经核对，当前 RNOH release 有 contentOffset 修复。”期望主场景 `RN-08`，次场景 `RN-06`；先做最小复现和版本对照。
11. “window、layoutScale、Text props 和父 onLayout 都正确，但长文本仍按旧宽度换行。”期望主场景 `RN-08`；检查 TextMeasurer/锁定版本，不再叠 rem 补偿。
12. “RNSurface 和 wrapper 已变宽，通用 Fabric 卡片仍半屏且点击偏移。”期望 `HYBRID` 或 `NATIVE_ONLY`，主场景 `RN-07`；检查 native/Surface/坐标同一 epoch。
13. “升级 react-native-harmony 后通用 Fabric UI 的 Codegen 事件签名不一致。”期望 `HYBRID`，主场景 `RN-08`；核对完整版本闭环。
14. “`useWindowDimensions` 正确，但 Navigation 下的 ScrollView 高度是 0；给子节点加 `height: '100%'` 仍空白。”期望 `RN_ONLY`，主场景 `RN-09`；沿祖先 onLayout 找首个无界/零尺寸节点。
15. “阿拉伯语下抽屉仍从左侧进入，返回箭头、absolute right 和 translateX 方向都不对。”期望 `RN_ONLY`，主场景 `RN-10`；分开逻辑边、方向性图标和动画语义。
16. “展开屏动画中途 resize，onLayout 已是新双栏，但卡片 scale 后重叠，旧 completion 又把状态改回去。”期望 `RN_ONLY`，主场景 `RN-11`；区分 Yoga/视觉几何并用 epoch 清理旧动画。
17. “RN Modal 打开时折展仍用旧宽度，路由 replace 后 ArkUI Dialog 还在最上层。”期望 `HYBRID`，主场景 `RN-12`；确定唯一 overlay owner，并按锁定版本核对 Dialog 规格。
18. “项目要接入官方 RN 多设备组件的侧栏、栅格和 FoldSplitContainer，已有自建 breakpoint provider。”期望 `HYBRID` 或 `RN_ONLY`，主场景 `RN-13`、次场景 `RN-02/RN-06`；先核对包/HAR/版本并消除双 breakpoint source。
19. “`@hadss/react_native_breakpoints` 设置了 500/900 自定义阈值，HarmonyOS 真机仍按系统 xs/sm/md 切换；fallback 平台又按自定义值。”期望 `RN_ONLY` 或 `HYBRID`，主场景 `RN-13`、次场景 `RN-08`；识别原生 breakpoint index 与 JS 阈值分叉，不能继续叠第二个断点标签。
20. “页面和 Modal 都调用 `Avoid.addAvoidAreaListener`，关闭 Modal 后主页也收不到状态栏变化，padding 还是 px 直接写入 RN style。”期望 `HYBRID`，主场景 `RN-13`、次场景 `RN-05`；建立唯一 provider、px→layout unit 边界和多消费者 fan-out。
21. “想复制 adaptive-layout RC 的 GridRow 实现做响应式卡片流，要求支持 order、offset、超大 gutter 和嵌套容器。”期望 `RN_ONLY`，主场景 `RN-13`、次场景 `RN-02`；默认 `PATTERN_ONLY`，审计变量自引用、边界值、component onLayout 和 Yoga 公式后重写。
22. “已有 React Navigation，准备使用 NavigationSplitContainer.Screen 在平板保存选中页面。”期望 `RN_ONLY`，主场景 `RN-13`；拒绝第二份 route/selected owner，只复用 Stack/Split presentation 模型。
23. “普通折叠展开只需要列表变双栏，但方案引入 FoldSplit、orientation listener，并在卸载时 lockToPortrait。”期望 `RN_ONLY` 或 `HYBRID`，主场景 `RN-13`、次场景 `RN-02`；普通布局按 window，移除不必要 posture/方向副作用；只有真实半折/折痕才进入 `RN-06`。
24. “现有 breakpoint provider 已支持 base/md/lg；请让卡片字号、水平间距和图标尺寸随窗口档位变化。”期望 `RN_ONLY`，主场景 `RN-03`；复用唯一断点源和最小档兜底，以动态 style 覆盖静态 StyleSheet，不新增 rem 或第二套 provider。
25. “页面把 PixelRatio.get() 同时乘到 width、fontSize 和 padding，平板上整体异常放大。”期望 `RN_ONLY`，主场景 `RN-03`；布局值恢复为 RN layout units，PixelRatio 只保留在已确认的物理 px/资源边界。
26. “方案直接使用 375 基准宽、960 最大参考宽和 0.9～1.2 缩放范围，但项目里没有设计 token 或验收依据。”期望 `RN_ONLY`，主场景 `RN-03`；指出这些不是 RN/HarmonyOS 规范，删除魔法数字；缺少可追溯策略时不新建连续缩放。
27. “我的页面横幅在折叠前后保持相同宽高比，帮我适配。”期望 `RN_ONLY`，主场景 `RN-01`；先读取 `image-and-media.md`，区分资源比例、固定展示框比例和响应式展示框，核对裁切与宽屏增长策略；不能从旧宽高公式猜比例，关键语义无法消歧时提出一个聚焦问题。
28. “RNOH 登录底部弹窗，键盘一弹起整个弹窗被顶进状态栏；之前完全不避让时又被键盘整个盖住。”期望 `RN_ONLY`，主场景 `RN-05`、案例库 Case 9；先在宿主代码查 `expandSafeArea` 并实测 window 高度，确认宿主不避让键盘，再给出手动钳制上移（`min(实际重叠, 静止顶y−(safe-area top inset+设计间距))`，静止位置用不带 transform 锚点的 `measureInWindow`，键盘坐标换算到应用窗口；分屏/自由窗口拿不到窗口原点时不上移并标 `not_verified`），不能用 KAV `behavior="padding"` 直接包高弹窗；真机验证走 dumpLayout px 坐标点击 + snapshot_display 截图。
29. “混合应用里视频/直播是原生 ArkTS 页，进入锁横屏，退出后 RN 首页也一直横屏。”期望 `HYBRID`，主场景 `RN-06`、案例库 Case 8；根因在原生页只 set 不 restore（三方库适配版无此问题），修复为 `aboutToDisappear` 恢复 `getPreferredOrientation()` 保存的进入前策略，不能硬编码 PORTRAIT、不能只挂在返回按钮；`getLastWindow` 异步回调必须有已退出守卫，不能在页面消失后才锁横屏；RN 打开原生页的通道搭建不在本 skill 范围内。
30. “横幅使用 `width:'100%'` 和原图比例，手机正常，但三折叠和平板上几乎占满屏幕。”期望 `RN_ONLY`，主场景 `RN-01`、必要时次场景 `RN-03`；复用项目 breakpoint/内容 `maxWidth` 限幅居中，只有构图有依据时调整展示框比例，不按设备类型分支。
31. “资源是 3:1，设计希望宽屏展示框 4:1，同时要求整张图完整显示、不能留白也不能裁切。”期望主场景 `RN-01`；先指出约束不可同时满足；询问允许裁切、留白还是提供宽屏资源，不用 `stretch` 伪造完成。
32. “折展各态保持相同比例，现有内容区已有限宽，请审查是否还需要三档断点。”期望主场景 `RN-01`；固定比例 + 有效父限宽即可；检查子项是否消费父宽度，不强制断点或改比例。
33. “动态尺寸已修复，扫描零风险，所以直接宣布一多适配完成。”期望主场景 `RN-01`；反查计算型媒体宽度、样式覆盖与有效父约束；核算窄/宽/超宽/宽短窗口，区分动态修复、几何检查和视觉验收，缺运行证据写 `not_verified`。
34. “横幅是 `require('./banner.jpg')`，代码已改成 `width: Math.min(W - 48, 720)` + `aspectRatio`，折展后高度仍不变、比例不同。”期望 `RN_ONLY`，主场景 `RN-01`；识别 Image 先合并静态资源固有 `{width, height}`，height 被定死后 `aspectRatio` 失效；改为有界父 View 持比例、Image 显式 `width/height: '100%'`，并用 Image `onLayout` 记录两态实测比例。
35. “照 `AdaptiveNavigationPresentation` 写了列表+详情，展开↔折叠一次列表就回到顶部，详情里的表单也清空。”期望 `RN_ONLY`，主场景 `RN-02`；识别两种形态的组件树结构不同导致子树重挂，改为同构树、只切样式，不用 key 或外部状态补救。
36. “分屏和自由窗口在这个 RNOH 应用里根本拉不出来，平板上也搜不到应用。”期望 `HOST_ONLY` 或 `HYBRID`，主场景 `RN-04`；先审计 `module.json5` 的 `supportWindowMode`、`orientation`、最小窗口和 `deviceTypes`，放开限制作为产品决策交接，不改 RN 布局。
37. “用一个外包 View 的 onLayout 量横幅比例，宽屏下算出来和设计不符。”期望主场景 `RN-01`；指出包裹层被 stretch 到父宽、测的不是展示框；把 `useLayoutEvidence` 的 `onLayout` 挂到 Image 或持比例的父框本身后重新采集。
38. “列表要求 md/lg 下 1 行 8 列，原代码是 `flexWrap` + `width: '12.5%'`；三折叠全展开时变成 7 列加换行，双屏时正常。”期望 `RN_ONLY`，主场景 `RN-02`；识别等分百分比凑满 100% 的换行边界，按「等宽多列栅格」改写，用 `assert-layout.mjs` 在原失败窗口（px 与密度相同）上做 F2P，并补一个非整数 dp 窗口；不把未复现的舍入机制写成定论。
39. “请支持手机（SM 断点）、折叠屏展开（MD 断点）、平板（LG 断点）。”期望主场景 `RN-02`；采用 HarmonyOS 官方 vp 阈值 sm [320,600)、md [600,840)、lg [840,1440)，并说明 xs 并入 sm、xl 并入 lg；不因“示例阈值不是平台标准”而另造阈值。
40. “宿主 Index.ets 已去掉 `expandSafeArea([SafeAreaType.KEYBOARD])`，键盘弹起时 RN window 高度会变小，但表单页还套了 KAV `behavior="padding"`，输入框被抬得过高。”期望 `HYBRID`，主场景 `RN-05`；先查宿主代码并实测确认宿主已避让，按“宿主避让”分支只保留有界可滚动内容、移除 KAV，消除双重避让；不能按版本号假定宿主不避让。
41. “折叠屏展开后应用分栏，左栏列表右侧一大块空白，手机上同一页面正常。”期望 `RN_ONLY`，主场景 `RN-02`、案例库 Case 10；先证明 window 已更新而内容宽度不随窗口增长（内容宽度绑定手机设计常量），用移除 `maxWidth` 反证；按产品意图选限宽居中或填满/增列，不机械删除合法限宽，修完在原失败窗口做 F2P 并回归手机窄屏。
42. “平板 LG 断点下，底部 Tab 要改成左侧栏。工程是 ArkTS `Tabs` + 每个 `TabContent` 里一个 RNSurface。”期望 `HOST_ONLY` 或 `HYBRID`，主场景 `RN-02`；先判 Tab 栏 owner 为原生，侧栏切换路由到 harmonyos-ui-multi 按 `Tabs` 属性联动实现，不改成 RN 侧 Tab；RN 侧核对 Surface bounds、页签内结构决策用容器 `onLayout` 宽度而非 window 断点、侧栏态 bottom inset 不漏不重，断点切换不销毁 RNSurface。
43. “整个应用是 RN，`createBottomTabNavigator` 做的底部 Tab，LG 断点要变成左侧栏。”期望 `RN_ONLY`，主场景 `RN-02`；先读已安装 bottom-tabs 类型是否声明 `tabBarPosition`，有则同一 Navigator 在 Navigator 级 `screenOptions` 按断点切换位置并联动 variant/标签约束，没有则通过 `tabBar` prop 传入开发者组件或由产品决定升级；不换 Navigator、不重挂 `NavigationContainer`，验收页签、导航栈和滚动位置连续，peer dependency 未核实时写 `not_verified`。
44. “Tab 栏在宽屏改成侧栏后，单独给某个页面设了 `tabBarPosition: 'bottom'`，切到这个页签时栏跳回底部。”期望 `RN_ONLY`，主场景 `RN-02`；指出栏位置由当前聚焦 screen 的 option 决定，呈现 option 只放 Navigator 级 `screenOptions`，删除 screen 级覆盖。
45. “RN 底部 Tab 在 LG 下已经用 `tabBarPosition: 'left'` 变成侧栏，设计要求页签整组垂直居中，给 `tabBarStyle` 加了 `justifyContent: 'center'` 没效果。”期望 `RN_ONLY`，主场景 `RN-02`；指出 `tabBarStyle` 只作用于外层容器，内置侧栏内部列从顶部排列，改为通过 `tabBar` prop 传入开发者组件实现居中（页签状态仍归库）并保留无障碍角色与选中态；不改成均分高度。
46. “整个应用是 RN，底部 Tab 是主页面里自绘的 `ToolBar` 组件，不是 React Navigation 的 tab navigator；LG 下改成左侧栏，需求和设计稿没提对齐方式。”期望 `RN_ONLY`，主场景 `RN-02`；按“RN 自绘 Tab 栏”场景用同一组件、固定子节点顺序 [栏, 内容区]，窄档 `column-reverse`、宽档 `row` 切换，栏与内容区同构不重挂，侧栏态去掉各项 `flex: 1` 均分；对齐方式不套“库默认”，作为决策点向用户确认并推荐垂直居中，无法询问时采用居中并在交付中写明是假设。

## 不应处理

1. “普通 ArkUI GridRow 页面适配平板，没有 RN/RNOH。”属于 ArkUI 多设备技能。
2. “WebView 里的 Vue 页面 CSS REM 折叠后没更新。”属于 H5 多设备技能；RN 自定义 rem 才属于本 skill。
3. “RNOH 相机折展后预览黑屏、照片方向错误。”属于相机专项，不由本 UI 布局 skill 处理。
4. “PC 上 Tab 焦点顺序和鼠标右键不正确。”属于硬件输入专项。
5. “原生手写画布 pressure 丢失。”属于手写笔/画布专项。
6. “Android RN 页面在三星折叠屏上崩溃。”没有 HarmonyOS/RNOH 范围。
7. “实现 HarmonyOS 跨设备数据接续。”不属于本 skill 的响应式 UI 边界。

## 边界用例

1. 同时出现 `.ts` 与 `.ets`：按目录、导入、语法和调用链分类，不把普通 TS 自动算 ArkTS。
2. 只有截图和日志：`INSUFFICIENT`，列入口、锁文件、Host/Dimensions/token/style/onLayout 证据，不生成未验证补丁。
3. 提供 RN+Host+Fabric，但根因是 TSX 模块级 rem：`HYBRID`；只改 RN 派生层，记录其余链路无影响，不强造原生改动。
4. `Dimensions.get('window')` 在 render/事件中即时读取：不是自动错误；只有缓存或消费者不随变化更新才修。
5. `StyleSheet.create` 只含静态不变量：允许模块级；只有其中求值依赖可变 window/rem 时才迁移动态部分。
6. `Dimensions.addEventListener`：不是自动过时；hook 不适用且 subscription 有 owner/remove，并通过 state/store 通知消费者时允许。
7. `fontSize: token * layoutScale`：不自动判错；检查 Text 默认 fontScale 后是否符合可访问性。`width: token * fontScale` 才是明显的语义混用。
8. 用户指定某平板/折叠机：设备名只用于复现矩阵，布局仍按 application window。
9. UI 确需 half-fold/crease：允许 posture bridge，但不让它决定普通单双栏或 rem。
10. 业务代码与目标版本 release 有相似症状：先证明当前锁定版本和最小复现，不因历史修复标题直接归因框架。
11. 通用原生 UI wrapper bounds 正常、内部 Surface 陈旧：属于 `RN-07`；若组件是相机或手写画布则移交专项。
12. Build 通过但无目标设备：静态/构建通过，运行结论 `not_verified`。
13. `height: '100%'`：不是自动错误；只有父级无确定高度或 viewport/content owner 混乱时进入 `RN-09`。
14. `left/right`：先确认 `I18nManager.doLeftAndRightSwapInRTL` 在锁定 RNOH 上的值；开关为 true 时它们已按 RTL 交换，不能机械替换成 start/end；需要物理边时显式换算。抽屉和方向动画仍需验证 RTL。
15. `transform`：纯视觉过渡允许；若目标是改变相邻布局或真实可用空间，必须更新 Yoga 布局而不是继续叠 transform。
16. 官方多设备组件已安装：仍需读取真实类型/版本；不重复实现，也不把旧 README 接口当当前 API。
17. adaptive-layout 某个组件满足当前视觉效果：不是自动允许 `DIRECT`；先按 `DIRECT/ADAPTER/PATTERN_ONLY/REJECT_BY_DEFAULT` 检查版本、受控状态、单位、依赖、owner 和生命周期。
18. avoid-area 与 safe-area-context 同时存在：不自动删除任一依赖；先证明 Host 窗口策略和实际 inset 来源，再确定唯一生产者与兼容 adapter。
19. 自定义断点在 Android/iOS 正常：不能外推 HarmonyOS 原生 breakpoint index 路径；必须在目标 RNOH 版本用非默认阈值实测。
20. Fold crease 数组有数值：不代表可直接布局；先确认坐标系和 px/layout unit，转换一次后再验证 absolute/Flex 布局。
21. 项目没有 rem/scale 体系，只需要三个断点的字号和间距：不要新建设计稿等比缩放；使用现有唯一 breakpoint source，或由 `useWindowDimensions` 集中派生离散 token。
22. 颜色和固定圆角位于模块级 `StyleSheet.create`：不是 `RN-03` 缺陷；只有依赖可变 window/breakpoint/token 的求值被冻结时才迁移动态部分。
23. 项目 design token 明确把 375 定义为基准宽：不能因为数值是 375 就判错；应检查来源、连续缩放是否为既定策略、上下限是否有验收依据，以及消费者是否响应 window。
24. 需求只说“保持图片比例”：不能自动等同资源原始比例或固定展示框比例；先查验收、设计 token、正常基线和资源元数据。歧义会改变视觉结果时询问，无法询问时只做有证据的修复并报告假设。
25. 宽屏使用与手机不同的展示框比例：不等于拉伸资源；`cover` 可以保持资源比例但会改变裁切，必须验证关键内容或使用断点资源。
26. 原生 `Tabs` 包着 RNSurface，需求只要求 lg 下 Tab 栏移到左侧：Tab 栏本身路由到 harmonyos-ui-multi；本 skill 不改写 ArkTS `Tabs`，只输出 RN 侧检查（Surface bounds、页签内容器宽度决策、bottom inset、断点切换不销毁 Surface）。

## 评分点

- 首先输出 `input_mode` 与锁定版本证据；`RN-00` 不作为主场景。
- 单端模式不越界；交接项有 owner、契约、时序、清理和验收。
- 沿 window→Host→Dimensions→breakpoint/token/custom scale→parent constraints/viewport→StyleSheet/component/list→Yoga/onLayout→transform/portal→native/Surface 找首个错误链路。
- window 陈旧与派生 token 陈旧分开归因；原始 width 正确时不修改 Host。
- 自定义 layoutScale、系统 fontScale 与 PixelRatio 分开，不双重缩放、不全局关闭字体缩放掩盖问题。
- 离散字体、间距、图标、列数和布局方向优先复用唯一 breakpoint source；连续 scale 仅用于已有设计单位体系并限制范围，不凭示例新增依赖、阈值或 rem。
- 连续缩放的 `baseWidth`、`minScale`、`maxScale` 必须可追溯到项目设计 token/规范和目标窗口验收；不得把 375、960、0.9、1.2 等示例数字当作平台规范。
- 静态 `require()` 资源的 Image 不在自身用 `aspectRatio` 推高度，也不只靠 `absoluteFill` 填充；交付前有 Image `onLayout` 实测比例，没有则 `not_verified`。
- 图片任务必须区分资源比例、展示框比例和响应式比例；比例、最大尺寸、断点和 crop 策略有证据，不能从缺陷代码反推或把“无拉伸”当作“无裁切”。
- `verified_baseline` 有独立确认记录；旧公式、代码注释或“最小改动”不能自证为基线。资源比例不能单独证明展示框或最大尺寸。
- 宽屏横幅验证限幅、居中、视觉占比和同屏内容可达；窗口百分比、`windowWidth - padding` 与样式引用均需审计，窄/宽/超宽/宽短窗口记录最终框宽高、有效限制及来源。
- 明确相同比例或不裁切的需求优先保持；固定比例 + 有效限宽无需新断点，`Math.min` 两参数均随窗口增长不算限幅，祖先限宽不能自动约束显式窗口宽度子项。
- 普通布局不使用物理 screen、设备类型、posture 或 window mode；宽而短窗口同时检查 height。
- 不用 reload、width/breakpoint key 或重建 RN root 修动态样式；导航、表单和列表业务状态连续。
- 框架/版本归因必须有锁定版本、最小复现、对应 tag/release 和目标设备证据。
- 原生 UI 扩展经过版本、Spec、Codegen、实现、注册、wrapper 和释放闭环。
- 父约束、RTL、动画 endpoint/epoch、overlay owner 与官方组件依赖按命中场景验证，不用固定屏高、全局 row-reverse、translate 补偿或重复 provider 掩盖问题。
- `RN-13` 能给出四级采用结论；识别断点原生/JS 语义分叉、RC Grid/显隐/分栏风险、avoid/fold px 单位和模块级单 listener，并用 adapter/provider 保持 breakpoint、inset、fold 与 navigation 单一 owner。
- 分栏留白先证明 window 已更新、内容宽度不随窗口增长，再按产品意图选限宽居中或填满/增列；不把合法限宽机械删除，也不把左对齐尾部空白当作设计。
- 手机基线、两种冷启动方向、折→展→折、断点临界值、分屏/自由窗、前后台和重复进入完成回归；缺证据明确 `not_verified`。
