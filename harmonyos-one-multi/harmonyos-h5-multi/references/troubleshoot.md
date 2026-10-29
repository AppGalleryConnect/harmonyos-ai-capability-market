# H5 响应式问题排查

## ArkWeb 调试入口

真机证据通过 DevTools 获取：应用侧调用 `webview.WebviewController.setWebDebuggingAccess(true)`（只在调试构建开启），用 `hdc fport` 把设备上的 `webview_devtools_remote_<pid>` 转发到本机端口，然后在桌面 Chrome 的 `chrome://inspect` 中连接。具体命令以当前 HarmonyOS「使用 DevTools 调试前端页面」指南为准。拿不到 DevTools 时，在 H5 内临时输出下文数据，修复后删除。

文字放大：ArkWeb 的文字缩放由 Web 组件 `textZoomRatio` 等容器配置决定，是否跟随系统字号以目标 API 文档和真机为准。验证“文字放大”时先确认容器配置，再用相应方式构造 200% 状态；无法构造时在结论中写明未验证。

## 先收集可比较数据

在正常与异常窗口分别记录：`innerWidth/innerHeight`、`visualViewport`、目标元素 `getBoundingClientRect()`、父容器宽度、`scrollWidth/clientWidth`、命中的 media/container query 和关键 computed style。

## 横向滚动或截断

按 `component-adaptive.md` 的“定位首个溢出容器”排查。

## 宽屏留白或内容过度拉伸

1. 区分正文行长、列表信息密度与页面结构，不把所有区域统一拉满。
2. 检查整页 `max-width` 是否错误限制了需要扩展的列表或分栏区域。
3. 正文保留舒适行长，重复内容增加列数，导航/详情按信息层级分栏。
4. 检查断点规则是否被后续同等或更高 specificity 选择器覆盖。
5. Grid 列表右侧留白时，在 DevTools 中查看网格容器 computed `grid-template-columns` 的实际轨道宽度之和是否小于容器宽度。常见原因：固定宽度轨道（`repeat(auto-fill, 200px)`）、项目少时 `auto-fill` 保留空列、写死列数或 `width`、`justify-content: start`、JS 只在首次加载时写入列宽。修复前先判断网格项是固定尺寸小元素（头像、图标）还是弹性卡片：前者保持元素尺寸、把剩余空间分给间距，后者让列宽伸缩。改法见 `responsive-layout.md` 的“重复布局的 Grid 写法”。
6. 如果网格容器本身的宽度在窗口变化后没变，先查外层 `max-width` 和 ArkTS Web 组件的外部尺寸链（`arkts-h5-coordination.md`），而不是改 Grid。

## 横屏短高度内容不可操作

1. 统计固定顶部、底部和粘性区域的总高度。
2. 检查 `height: 100vh` + `overflow: hidden`、固定 hero 或弹窗高度。
3. 为横屏短高度减少装饰和间距，让核心区域自然滚动。
4. 不要把 `orientation: landscape` 等同于“大屏”；同时验证实际宽度。

## resize、旋转或分屏后不更新

按 `dynamic-window.md` 的“排查”一节检查；存在动态 REM 根字号写入时改读 `rem-responsive.md`。

## 退出全屏或横屏页后方向仍被锁住

1. 列出所有设置窗口方向的调用方（ArkTS `setPreferredOrientation`、H5 `screen.orientation.lock`、桥接方向请求）。
2. 逐个确认加锁点有对应释放点，并覆盖全屏中直接返回、切后台和 SPA 路由离开。
3. 检查恢复目标是否写死为某个方向，以及多个调用方是否互相覆盖。
4. 契约和检查清单见 `arkts-h5-coordination.md` 的“方向锁定与全屏”；方向管理器实现属于原生侧。

## 重排后读屏顺序或名称异常

按 `a11y-reflow.md` 的“排查”一节检查；屏幕朗读的最终结论以真机为准。

## 弹框内输入被键盘遮挡

1. 确认是弹框场景：`role="dialog"`、fixed 遮罩、组件库弹层，且弹框内有输入框；整页表单按下一节处理。
2. 按 `safe-area-and-keyboard.md` 的“判别”表确认不属于容器上推或双层避让叠加。记录容器避让模式，键盘弹出前后对比 `visualViewport.offsetTop/height`、`innerHeight` 和遮罩的 `getBoundingClientRect()`，判断遮罩是否跟随可见区域。
3. 检查弹框是否拆成头部、中间、底部三段，`overflow` 是否只在中间区，中间区是否有 `min-height: 0`。
4. 检查居中方式是否为相对整屏的 `top: 50%` + `transform`，以及聚焦时是否有 `window.scrollTo` 或 `body` 改 fixed 的锁定代码。
5. 沉浸式容器中检查遮罩的内边距是否消费了 `--safe-*`，弹框头部是否进入状态栏。
6. 修复规则和方案 A/B 的选择见 `safe-area-and-keyboard.md` 的“弹框内输入被键盘遮挡”。

## 整页表单被键盘挡住或顶部进入状态栏

1. 键盘弹出前后对比 `scrollY`、`visualViewport.offsetTop/height`、`innerHeight`、标题和主按钮的 `getBoundingClientRect()`，以及 ArkTS 侧 Web 组件 `onAreaChange` 的全局位置。按 `safe-area-and-keyboard.md` 的“判别”表归为容器上推、双层避让叠加或网页滚动。
2. 容器上推或双层避让叠加：H5 看到的数值正常，屏幕上却被遮挡，或者顶部被推出、键盘上方空出一截。这时修改容器的避让配置，H5 不做补偿。
3. 网页滚动：检查根容器是否用 `height: 100vh` 加 `overflow: hidden` 锁死高度、表单是否整页垂直居中、按钮是否 fixed 在底部，以及聚焦时是否有固定延时的 `scrollIntoView` 或 `scrollTo`。
4. 检查顶部安全区来源：沉浸式下 `env(safe-area-inset-top)` 为 0 时，是否有原生注入 `--native-safe-top`。
5. 修复规则见 `safe-area-and-keyboard.md` 的“整页表单键盘避让”。

## 根因确认标准

只有当单一约束或规则能稳定开启/关闭现象，并能解释为何只在特定宽高出现，才列为根因。静态搜索命中、设备名称和问题发生时间只能作为线索。

## 修复证据

提交前保留：根因、修改文件、断点依据、窄屏对照、临界值结果、目标窗口结果、动态 resize 结果、构建/测试结果和残余风险。
