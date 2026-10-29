# 安全区与软键盘避让

## 安全区所有权

先建立每个方向的所有权表：

| 方向 | 系统 inset | ArkUI Host 已应用 | RN provider 值 | RN 页面应用 | 最终 owner |
| --- | ---: | ---: | ---: | ---: | --- |
| top |  |  |  |  |  |
| right |  |  |  |  |  |
| bottom |  |  |  |  |  |
| left |  |  |  |  |  |

如果 Host 已把 RNSurface 限制在安全区，RN 通常不再对同方向应用系统 inset；如果 Surface 全屏延伸，则由 RN provider/页面或 Host 内层中的一个 owner 消费。背景可以铺满窗口，关键内容与交互不能被系统区域遮挡。

- SafeAreaProvider 覆盖需要 inset 的导航与 Portal 根。
- `initialWindowMetrics` 只改善首帧，不能替代后续动态更新。
- 多 RN root/RNSurface 分别确认 metrics 来源和更新 owner。
- 底部栏、Sheet、Modal 和页面不能重复消费同一 bottom inset。
- 安全区库的 Harmony 实现、Autolinking 与更新行为以锁定版本为准。

## 键盘策略

**先确认宿主是否为键盘避让窗口，再选策略。** 这是所有键盘策略的前提，不能默认“窗口会 resize”：

- 在宿主代码中搜索 `expandSafeArea`，确认 `RNApp`/RNSurface 是否扩展到 `SafeAreaType.KEYBOARD`；工程未显式设置时，读锁定 RNOH 版本的宿主组件实现确认默认值。
- 再实测：键盘弹起时 RN `window.height` 与根节点 `onLayout` 是否变小。代码和实测不一致时以实测为准。
- 观察到 window 变小：宿主在避让，RN 侧只需有界可滚动内容，不要再叠 KAV。
- window 不变（宿主不避让；已观察到的版本见 `compatibility-matrix.md`「已核实结论登记」）：宿主不避让，RN 侧必须由**一个** owner 处理键盘，不能只靠 ScrollView。

每个页面只选一个主策略：

| 页面 | 宿主避让（window 变小） | 宿主不避让（window 不变） | 关键验收 |
| --- | --- | --- | --- |
| 普通表单 | 有界可滚动内容 | KeyboardAvoidingView（显式 `behavior`，按实测选）+ 可滚动内容 | 当前输入框和提交区可达 |
| 底部 Sheet | Sheet 内部可滚动 | Sheet 自己响应键盘（下文钳制模式） | 页面背景不再二次上抬，Sheet 不越过顶部安全区 |
| 聊天页 | 消息区收缩 + composer 跟随 | 消息区与 composer 共同 owner 监听键盘 | 列表锚点稳定 |
| 全屏编辑 | 有界可滚动内容 | KeyboardAvoidingView 或手动 listener 之一 | header/offset 动态正确 |

不要固定所有页面使用同一个 `behavior`。观测 keyboard show/hide、window height、TextInput bounds、键盘顶部以及页面 transform/padding；页面位移大于“键盘与内容的实际重叠量”时，通常存在重复避让。

## RNOH 键盘避让宿主机制与钳制模式

**宿主机制**：RNOH 宿主组件（`RNApp`/RNSurface）若设置了 `expandSafeArea([SafeAreaType.KEYBOARD])`，RN 内容会延伸到键盘区域，ArkUI 窗口不再为 RN 避让软键盘：键盘直接覆盖 RN 页面，RN `window.height` 不变，键盘避让只能由 RN 侧自己做。是否如此由宿主代码和组件默认值决定，按上一节查代码并实测，不按版本号推断。依据：RNOH 官方文档《常见开发场景》中“如何控制页面是否避让键盘的行为”一节；已观察到的默认值见 `compatibility-matrix.md`「已核实结论登记」。

**KeyboardAvoidingView 的边界**：`keyboardDidShow/keyboardDidHide` 在 RNOH 上有派发，`behavior="padding"` 能生效。KAV 按重叠量整体抬升、没有上界钳制，这是 RN 上游 KAV 的设计，不是 RNOH 特有缺陷，不要因此转 `RN-08`。在宿主不避让时，较高的底部 Sheet 会被整抬一个键盘高度、顶部越过状态栏，可能顶到 y=0。KAV 只适合顶部有充足余量的页面，不适合高弹窗。

**钳制上移模式**（单一 owner：键盘 listener + 静止锚点 + translateY）：

```tsx
const anchorRef = useRef<View>(null);
const lift = useRef(new Animated.Value(0)).current;
const rest = useRef({y: 0, height: 0}); // Sheet 静止时在应用窗口坐标中的位置
const insets = useSafeAreaInsets();       // 与页面相同的唯一 inset owner
const topGuard = insets.top + sheetTopGap; // sheetTopGap 来自设计 token，不写魔法数

// 锚点不做 transform，measureInWindow 得到的始终是静止位置，与当前上移量无关。
const measureRest = useCallback(() => {
  anchorRef.current?.measureInWindow((_x, y, _w, height) => {
    rest.current = {y, height};
  });
}, []);

useEffect(() => {
  const show = Keyboard.addListener('keyboardDidShow', e => {
    const keyboardTop = keyboardTopInWindow(e.endCoordinates); // 见下方坐标规则
    if (keyboardTop === null) return; // 坐标无法换算：不上移，退回 Sheet 内部滚动
    const {y, height} = rest.current;
    const overlap = y + height - keyboardTop;   // 与键盘的实际重叠
    const maxLift = Math.max(y - topGuard, 0);  // 顶部安全下限
    const up = Math.max(Math.min(overlap, maxLift), 0);
    Animated.timing(lift, {toValue: -up, duration: 200, useNativeDriver: false}).start();
  });
  const hide = Keyboard.addListener('keyboardDidHide', () =>
    Animated.timing(lift, {toValue: 0, duration: 200, useNativeDriver: false}).start());
  return () => { show.remove(); hide.remove(); };
}, [lift, topGuard]);

// <View ref={anchorRef} collapsable={false} onLayout={measureRest} style={sheetPositionStyle}>
//   <Animated.View style={[sheetBodyStyle, {transform: [{translateY: lift}]}]}>…</Animated.View>
// </View>
```

坐标规则：

- `onLayout` 的 `y` 相对**父节点**，不能直接和键盘坐标比较；静止位置用不带 transform 的锚点 `measureInWindow` 取**应用窗口**坐标。`collapsable={false}` 防止锚点被视图拍平后无法测量。
- `endCoordinates.screenY` 名义上是**屏幕**坐标。`keyboardTopInWindow` 是唯一换算点：全屏窗口下窗口原点即屏幕原点，可直接返回 `screenY`；分屏/自由窗口下必须减去应用窗口在屏幕上的 top（由 Host 从 `window.getWindowProperties().windowRect` 取得，物理 px 经唯一 adapter 换算为 layout unit）。先在锁定版本实测 `screenY` 到底是屏幕还是窗口坐标，再决定是否相减。
- 拿不到窗口原点时，`keyboardTopInWindow` 在非全屏窗口返回 `null`，不上移、退回 Sheet 内部 ScrollView，并把分屏/自由窗口的键盘验收标 `not_verified`；不要用全屏假设硬算。

行为规则：

- 上移用 transform，不改 margin/padding：transform 不触发 onLayout，也不会改变锚点的静止位置。
- 上移量 = `min(与键盘实际重叠, 静止顶 y − 顶部安全下限)`。被钳制后 Sheet 底部少量进入键盘区属预期，核心输入区必须完整可见；要求全部可达时给 Sheet 内容加内部 ScrollView。
- 顶部安全下限取同一个 safe-area owner 的 top inset 加设计间距；自由窗口没有状态栏遮挡时 inset 为 0，钳制自然放宽。
- 遮罩/背景层不随 Sheet 上移，保持全屏压暗；同一页面禁止 KAV 与手动 listener 叠加。

**验收**：全屏、分屏、自由窗口各做一遍：键盘弹起后 Sheet 顶部与顶部安全区留有间距、输入框/主按钮完整可见；收起键盘回落原位且不残留位移；连续切换两个输入框、Back 收键盘、折展/旋转后重复以上检查。

## 焦点与身份

- 保持 TextInput React identity；断点只重排容器，不给输入框或祖先使用 width/breakpoint key。
- 让内容可滚动，避免焦点进入不可滚动的固定高度区域。
- 自定义滚动不要与系统自动滚入可视区竞争；先证明默认路径不足。
- 键盘关闭、切换焦点、旋转和分屏后不累计 padding/transform。
- 某些 RNOH 版本可能存在 KeyboardAvoidingView 与 TextInput 自动避让叠加；从锁定版本 release/FAQ/实现和真机确认，不把历史问题永久化。
- 所有权、window 和页面 padding 已正确但 SafeArea/KAV 仍异常时，读取 `known-rnoh-layout-issues.md` 做版本分流；历史修复只能作为检索入口，不能代替当前版本最小复现。

## 验证

- 有/无系统 inset、四个方向特殊区域、沉浸背景与关键操作。
- 页面顶部/中部/底部、Modal/Sheet、长表单中的输入框。
- 键盘显示/隐藏、连续切换焦点、旋转、折展、分屏、前后台。
- RN Surface bounds、provider inset、页面 padding 和键盘位移能解释最终位置。
- 手机基线无多余 padding；没有真实键盘与目标窗口证据时标记 `not_verified`。
