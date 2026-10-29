# 多设备 Recipe 索引

这些文件是复制后按项目架构改造的资产，不是必须采用的框架。先读取对应场景 reference，确认项目没有更合适的现有封装，再选择最小 recipe。

| Recipe | 场景 | 用途 | 接入前确认 |
| --- | --- | --- | --- |
| `BreakpointProvider.tsx` | RN-02/RN-03 | 唯一纯 RN breakpoint source；`responsive-shell/useBreakpoint.ts` 也读取它 | 阈值为必填参数，来自项目 token；不得与现有 Manager 并行 |
| `FoldGeometryProvider.tsx` | RN-06/RN-13 | 注入式唯一 Fold listener、枚举和单位归一 | 实现锁定版本 FoldPort |
| `AvoidAreaProvider.tsx` | RN-05/RN-13 | 注入式唯一 Avoid listener 和多消费者 fan-out | 明确原始单位、坐标空间和 Host inset |
| `ResponsiveImage.tsx` | RN-01/RN-08 | 父容器持有可追溯比例并限制宽屏最大宽度/可选最大高度（按比例换算成宽度上限，保持比例）；Image 显式 100%/100%，兼容静态资源固有尺寸 | 调用方从既有 token/验收提供比例、maxWidth、maxHeight 和 contain/cover 语义 |
| `ResponsiveFlatList.tsx` | RN-02/RN-08 | 列数变化只重挂呈现层，按可见项 id 恢复锚点，列宽固定不拉伸末行 | 业务状态、筛选外提；gutter 放 renderItem 内；按锁定版本核验 numColumns 下 scrollToIndex 的行索引语义 |
| `BoundedScrollPage.tsx` | RN-09 | 有界 viewport 和自然增长内容 | 与实际导航 scene 约束对账 |
| `WindowEvidenceProbe.tsx` | RN-01/RN-03/RN-04/RN-07 | `useLayoutEvidence()`：把 `onLayout` 挂在被测节点本身，记录同轮次 window 与 layout/比例 | 不插入包裹 View；目标设备上的记录可作运行时证据，探针代码不算验证，交付前删除 |
| `AdaptiveNavigationPresentation.tsx` | RN-02/RN-13 | 单栏/双栏只切 presentation，两栏在各断点保持同一树位置，不重挂 | route/selectedId 保持唯一 owner；`navigationWidth`、返回文案由项目提供；核验锁定版本 `display: 'none'` |
| `AdaptiveTabBarOptions.ts` | RN-02 | RN 导航库 Tab 栏（`createBottomTabNavigator`）宽档迁侧栏：同一 Navigator 只切呈现 option；内置侧栏顶部排列 | 先按 `responsive-layout.md`「底部 Tab 宽屏迁移：先判 Tab 栏 owner」确认是 RN 导航库 Tab 栏；对齐方式已按「RN 侧栏呈现」确定为顶部，确定居中时通过 `tabBar` prop 传入开发者组件；已安装类型声明 `tabBarPosition`；option 只放 Navigator 级；peer dependency 在锁定 RNOH 有适配版本；原生 Tabs 包 RN 与 RN 自绘 Tab 栏场景不用本 recipe |
| `SafeAreaOwnedPage.tsx` | RN-05 | 背景延伸与内容 inset 分层，含横屏左右 inset（按 RTL 映射到 start/end） | 根部已有 SafeAreaProvider；与 Host 是否已裁剪 Surface 对账 |
| `KeyboardAwareForm.tsx` | RN-05 | 有界滚动表单和单一键盘策略 | `behavior` 必填：先实测宿主是否为键盘缩小 window（已观察到的版本见 `compatibility-matrix.md`「已核实结论登记」），缩小时传 `'none'`，不缩小时按实测选 `padding/height`；offset 由项目实测提供 |

## 使用规则

1. 不整目录覆盖项目现有实现。
2. Provider 类 recipe 在应用稳定层只挂载一次；传入的 `port` 必须引用稳定。
3. `FoldPort`/`AvoidAreaPort` 必须由实际安装包或已有原生 wrapper 实现，禁止根据 recipe 虚构 API。
4. 示例阈值、比例、最大尺寸、宽度和 offset 都是调用方参数，不是平台标准；不得从缺陷代码反推。
5. 完成后运行项目 TypeScript、bundle、HAR/Hvigor 和目标设备路径；缺运行证据写 `not_verified`。
