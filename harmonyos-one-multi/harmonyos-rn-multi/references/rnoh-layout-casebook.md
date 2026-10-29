# RNOH 多设备布局案例库

在已知症状与下列案例高度相似时读取。案例是定位起点，不是永久平台事实；先核对 lockfile、实际安装实现和目标设备，再决定修复。

## 使用方法

每个案例按以下顺序执行：

1. 证明上游 window/约束是否正确。
2. 收集案例要求的最小运行证据。
3. 用一个改动稳定开启或关闭现象。
4. 只修首个错误链路。
5. 执行 F2P（Fail-to-Pass：在原失败的窗口 px、密度和折展态上，改前失败、改后通过）和手机基线 P2P（Pass-to-Pass：原本正常的状态仍正常）。换了窗口参数的复验不算 F2P。

## Case 1：Image 比例、裁切或宽屏尺寸异常

**症状**：折展、分屏或宽短窗口中，图片被裁成窄条、横向超出、加载后突然改变页面几何，或在三折叠/平板等超宽窗口按手机比例无限放大并挤压页面内容。

**先排除**：Image 是否为静态 `require()`/import 资源且自身只给 `width + aspectRatio`、`height + aspectRatio`（或只靠 `absoluteFill`）——资源固有 `{width, height}` 会先合并，导致 `aspectRatio`/四边约束失效，见 `image-and-media.md`「来源与几何」；需求是否区分资源比例和展示框比例；比例是否有设计 token、验收、正常基线或资源元数据依据；父容器是否无界；是否同时硬编码宽高；网络图片是否没有加载前几何；`cover/contain` 和宽屏最大尺寸是否错误或缺失。

**证据**：记录需求契约、比例来源、资源实际尺寸、当前 window/breakpoint、内容区/容器/Image 的 `origBounds/bounds`、React style、加载前后尺寸、crop 结果和锁定 RNOH 版本。如果图片完整宽度由已确定高度乘 `aspectRatio` 得出并远大于容器，且 JS 约束已正确，才进入 RNOH 行为分流。

**候选修复**：

- 让有界父 View 持有有证据的展示框 `aspectRatio`，Image 显式 `width/height: '100%'` 填满容器；
- 宽屏使用项目已有内容 `maxWidth/maxHeight`、居中留白，确有构图要求时使用断点展示比例或资源；
- 不把 `height: null` 等历史规避写成所有版本的通用要求。

**验收**：加载前后几何稳定；窄/宽/超宽/宽短窗口无拉伸、意外裁切或无限放大；关键内容和同屏操作可见；同一最终 window 结果一致。

## Case 2：FlatList 列数改变但布局错乱

**症状**：`numColumns` 已更新，已有 item 仍按旧列数排列、被裁剪或滚动位置跳变。

**先排除**：item width、gutter、`extraData`、`renderItem` 闭包、`getItemLayout`、裁剪配置和数据 key 未同步。

**证据**：记录 window、列数、item geometry、visible item key/index、局部 offset、contentSize 和 render 次数。

**候选修复**：若锁定版本确实需要重挂，只给 FlatList 呈现层使用由列数派生的 key；数据、筛选、选中项、route 和业务锚点留在稳定祖先。重挂后按业务 key 恢复可见锚点，不盲目恢复绝对 pixel offset。

**验收**：窄→宽→窄后列数和 item 宽度正确；选中项、分页、筛选和 route 不丢失；手机基线无额外重挂。

## Case 3：ScrollView 空白、不能滚动或底部不可达

**症状**：内容高度超过窗口但无法滚动；`height:'100%'` 或给叶子加 `flex:1` 后仍为空白。

**根因候选**：Navigation scene、page root 或 viewport 没有有界高度；`flex:1` 误放在 content container；固定高度/absolute footer 裁剪内容。

**证据**：沿 `window → RNSurface → RN root → navigation scene → page → viewport → content` 逐层记录 `onLayout`，找到第一处 0、旧值、无限增长或固定裁剪。

**修复方向**：建立有界 viewport；区分 ScrollView `style` 与 `contentContainerStyle`；需要内容至少填满时使用与当前结构匹配的 `flexGrow`，不要固化设备屏高。

**验收**：短内容、长内容、宽短窗口、大字体、键盘显示/隐藏均可达；底部操作不被覆盖。

## Case 4：Fold 状态不更新或半折判断错误

**症状**：folded/expanded/half-folded 切换后布局不变，或只有某一方向进入错误分支。

**先检查**：是否真的需要 posture；普通单双栏应只消费 application window。确需 Fold 时，检查初始快照、事件名、枚举类型、sequence 和 listener owner。

**高风险模式**：

- 字符串状态与数字常量直接比较；
- 只订阅事件、不读取初始快照；
- 多页面直接注册模块级单 callback；
- 一个页面卸载时关闭全局监听；
- 旧异步状态覆盖新 epoch。

**修复方向**：在唯一 adapter 中把原生状态规范化为稳定的业务枚举；订阅建立后补读快照或按单调 sequence 合并；向多个消费者 fan-out；未知值映射 `unknown`。

**验收**：冷启动 folded/expanded、快速 fold→half→expanded、前后台和两个并发消费者；卸载一个消费者不影响另一个。

## Case 5：折痕位置偏移或内容跨折痕

**症状**：分界线不在折痕处，避让距离按密度倍数放大，分屏/自由窗口下偏移。

**根因候选**：原始 rect 单位或坐标空间未声明；display 坐标直接用于 application window；页面重复 PixelRatio 转换。

**证据**：从实际包/HAR 确认 API 返回字段和单位；记录原始 rect、PixelRatio、窗口原点、adapter 输出和最终 onLayout。不同 Fold/Avoid API 不得仅凭名称假定单位一致。

**修复方向**：在唯一 adapter 边界转换为 RN layout units，并把 rect 映射到 owning application window；页面只消费已规范化值。

**验收**：横竖方向、分屏、自由窗口、folded/half/expanded 和快速切换；同一 rect 只转换一次。

## Case 6：安全区重复或 Avoid 更新丢失

**症状**：顶部/底部出现双倍空白；Modal 关闭后主页不再更新；折展后 inset 仍是旧值。

**根因候选**：Host、SafeAreaProvider、avoid-area provider 和页面 padding 同时消费；模块级单 listener 被页面覆盖或移除；原始 px 直接进入 style。

**证据**：为 top/right/bottom/left 建 owner 表，记录 Host 是否裁剪 RNSurface、provider 输出、页面 padding、原始和转换单位、listener 数量。

**修复方向**：保留一个系统 inset 生产者和一个明确消费策略；若使用 avoid-area 包，由应用级唯一 provider 持有初始快照、事件、单位转换和幂等释放。

**验收**：两个并发消费者、Modal 打开/关闭、沉浸/非沉浸、旋转、折展和前后台；listener 数回到基线。

## Case 7：键盘遮挡或页面被双重上抬

**症状**：输入框被键盘盖住，或页面位移显著大于窗口高度变化；键盘关闭后仍残留 padding/transform。

**根因候选**：Host resize、TextInput 自动避让、KeyboardAvoidingView、Sheet 和 Avoid `TYPE_KEYBOARD` 同时生效。

**证据**：记录 keyboard show/hide、window height、输入框 bounds、键盘顶部、Sheet/页面 transform 和 bottom padding。先识别当前 RNOH/Host 的真实窗口策略。

**修复方向**：先按 `safe-area-and-keyboard.md`「键盘策略」实测确认宿主是否避让键盘（键盘弹起时 window 高度是否变小；已观察到的版本见 `compatibility-matrix.md`「已核实结论登记」），再为每个页面选择一个主键盘 owner：宿主避让时普通表单只需有界可滚动内容；宿主不避让时普通表单需要显式 `behavior` 的 KAV 或手动 listener，Sheet 由 Sheet 自己处理，聊天页由消息区和 composer 的共同 owner 处理。若症状是“Sheet 整体抬一个键盘高度、顶部越进状态栏”，转 Case 9。

**验收**：顶部/中部/底部输入框、连续切换焦点、键盘显示/隐藏、旋转、折展、Modal/Sheet 和前后台；不累计位移。

## Case 8：方向请求退出后未恢复

**症状**：视频/阅读页面退出后仍保持横屏；快速进出页面时旧页面覆盖新页面方向策略；180° 变化没有业务更新。混合架构典型形态：视频/直播为**原生 ArkTS 页**，进入时 `window.getLastWindow(ctx).setPreferredOrientation(LANDSCAPE)`，退出未恢复 → 其余 RN 页面全部被锁横屏。RN 生态三方库（react-native-video/orientation 鸿蒙适配版）自带正确生命周期，不会出现该问题；问题出在**业务自建原生页**。

**先区分**：页面请求策略、当前窗口方向和硬件/display rotation 是三个字段。普通布局不能依赖方向锁定替代响应式适配。

**根因候选**：原生页只 set 不 save/restore；恢复挂在按钮 onClick 而非 `aboutToDisappear`（返回键退出漏恢复）；恢复时硬编码 PORTRAIT 而非进入前策略（破坏用户自动旋转偏好）；子页 `onBackPress` 只有 `@Entry` 生效、把恢复放在不可达的生命周期里。

**修复方向**：由唯一方向 owner 保存进入前策略并使用 owner token/epoch 恢复；订阅用相同引用清理；只有业务真正依赖 180° 语义时才接入锁定版本提供的 rotation 事件。具体到原生页：

```typescript
// 原生页（ArkTS）
private win?: window.Window
private saved?: window.Orientation
private disposed: boolean = false

aboutToAppear(): void {
  window.getLastWindow(this.abilityCtx).then((w: window.Window) => {
    if (this.disposed) {
      return                                           // 页面已退出：不再应用临时策略
    }
    this.win = w
    this.saved = w.getPreferredOrientation()           // 先保存进入前策略
    w.setPreferredOrientation(window.Orientation.LANDSCAPE) // 再应用临时策略
  })
}

aboutToDisappear(): void {
  this.disposed = true                                 // 先失效，挡住尚未 resolve 的 then
  if (this.win !== undefined && this.saved !== undefined) {
    this.win.setPreferredOrientation(this.saved)       // 返回键/按钮退出都经过这里
  }
}
```

- `getLastWindow` 是异步的。快速进入再退出时，`aboutToDisappear` 可能先于 `then` 执行；没有 `disposed` 守卫，`then` 会在页面消失后才锁横屏，正好重现本案例。
- 恢复必须放 `aboutToDisappear`（任意退出路径都触发），不能只放返回按钮 onClick。
- `getPreferredOrientation()` 的可用 API 版本以锁定 SDK 的 `@ohos.window` 类型为准；不可用时由唯一方向 owner 在设置前自行记录上一次策略。
- `abilityCtx` 由宿主传入（如 `rnohCoreContext.uiAbilityContext`）。
- RN 首页可留救援入口恢复方向，但救援只是止血，根因仍是退出未恢复。RN 如何打开原生页、自建 TurboModule 通道属于混合工程搭建，不在本 skill 范围内。

**真机验证方法**：dumpLayout 取场景卡片中心 → `uiInput click` 进原生页 → 截图确认横屏 → `uiInput keyEvent Back` → 截图确认首页横/竖（问题页=仍横屏，对照页=恢复竖屏）→ 救援按钮 → 截图确认恢复竖屏。

**验收**：正常退出、路由 replace、快速进入退出、嵌套路由、分屏/自由窗口和 180°；旧 callback 不提交最终策略；视频页（问题复现）与直播页（对照恢复）行为可稳定区分。

## Case 9：键盘弹起时底部 Sheet 被整体顶进状态栏

**症状**：底部登录/表单弹窗在键盘弹起时被整抬一个键盘高度，Sheet 顶部与状态栏重合或越顶；键盘收起后可回落。与 Case 7 的“被遮挡/双重上抬”相反，这是**过度上抬无钳制**。

**根因候选**：宿主 `RNApp`/RNSurface 设置了 `expandSafeArea([SafeAreaType.KEYBOARD])`（显式或组件默认），窗口不避让键盘，页面用了 `KeyboardAvoidingView behavior="padding"` 直接包高弹窗。KAV 按重叠量整体抬升、没有上界钳制，这是 RN 上游 KAV 的设计，不是 RNOH 缺陷；Sheet 越高越容易触顶。

**证据**：`uitest dumpLayout` 记录 Sheet/TextInput 静止 bounds 与键盘弹起后的新 bounds；`snapshot_display` 截图确认 Sheet 顶边与状态栏重合；确认工程未叠加第二套避让（Host resize/自动避让/手动 listener）。

**修复方向**：改手动钳制上移：`Keyboard.addListener('keyboardDidShow')`，用不带 transform 的锚点 `measureInWindow` 取 Sheet 静止位置（应用窗口坐标），键盘顶部经唯一换算点转成窗口坐标，`translateY = -min(与键盘实际重叠, 静止顶 y − (safe-area top inset + 设计间距))`，`keyboardDidHide` 归零。分屏/自由窗口拿不到窗口原点时不上移、退回 Sheet 内部滚动并标 `not_verified`。完整模式与代码骨架见 `safe-area-and-keyboard.md` 的「RNOH 键盘避让宿主机制与钳制模式」。

**真机验证方法**：`uitest dumpLayout` 取 TextInput 中心（bounds 为物理 px，勿用截图比例换算）→ `uitest uiInput click x y` 拉起键盘 → `snapshot_display` 截图核对 Sheet 顶部与状态栏间距、输入框可见性 → `uitest uiInput keyEvent Back` 收键盘核对回落。

**验收**：全屏、分屏、自由窗口分别验证。键盘开：Sheet 顶部留出顶部安全区间距、输入框/主按钮完整可见；键盘关：回落原位不残留；连续焦点切换、Back 收键盘、折展/旋转后不累计位移。

## Case 10：分栏或宽窗口下单侧栏内容右侧留白

**症状**：折叠屏展开、平板、分屏等宽窗口下，分栏的主栏（通常左栏）内容只占栏宽一部分，内容右缘到分栏线之间是空白；同一页面手机窄屏正常，右栏或对照区域铺满。

**先排除**：`useWindowDimensions()` 是否随折展更新（window 陈旧属 `RN-04`，本案例前提是 window 正确）；留白是否为有意限宽——内容区防过宽是合法设计，但其留白应**居中**且阈值有设计 token/验收依据；左对齐、无人认领的尾部空白才是缺陷。

**根因候选**（共同特征：内容宽度的来源是设计期手机常量，不是当前窗口）：

- 栏内容器或卡片写死 `width`/`maxWidth` 为手机设计稿宽（360/375/390 一类），栏是弹性的（比例或 flex），内容被常量封顶；
- 宫格/列表 item 固定列宽 + `flexWrap`，窗口变宽后列数不变、只是右侧空出；
- Row 默认 `justifyContent: 'flex-start'`，子项全为固定宽度时剩余空间全部堆在行尾；
- rem/rpx/normalize 按手机屏宽标定，换算结果在大窗口不再匹配（先转 `RN-03` 修派生单位）。

**证据**：同轮次记录 window width、栏容器 onLayout 宽、内容列/首个卡片 onLayout 宽。判别式：**窗口在变、内容宽不变 ⇒ 内容宽度绑定常量**；顺 onLayout 链向上找到持有该常量的层。反证：临时移除 `maxWidth` 或改 `flex: 1`，留白应稳定消失。

**修复方向**（按产品意图分流，不机械删除限宽）：

- 有意限宽（阅读/表单防过宽）：保留 `maxWidth`，留白改为居中（父容器 `alignItems: 'center'` 或内容 `alignSelf: 'center'`），阈值来自设计 token；
- 未适配：内容列 `flex: 1` 填满栏宽；宫格/列表改为随窗口的响应列数，见 `responsive-layout.md`「列表、主从栏与导航」；
- 分栏容器宽度由窗口派生（比例或断点），`selectedId`/route 留在稳定层，不因修留白重建组件树。

**验收**：F2P 在原失败窗口（相同 px/密度/折展态）上改前留白、改后消除；手机窄屏 P2P 无回归；折→展→折内容宽度跟随窗口变化，选中项与滚动位置连续。

## 案例结论边界

- 配置级问题可以用源码和局部运行证据闭环，不强制全量 dump。
- Yoga/父约束/裁剪问题需要 bounds 或 onLayout 证据。
- Host/Fabric 问题需要跨层同 epoch 证据。
- 框架版本问题需要最小复现和锁定版本对照。
- 只有截图、扫描告警或相似历史案例时，不得声明根因或已修复。
