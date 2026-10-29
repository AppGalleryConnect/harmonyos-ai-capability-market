# ArkTS 与 H5 联动适配

## 何时进入联动场景

出现以下任一条件时命中 `H5-08`：

- 同时提供 ArkTS Web 容器/桥接代码与 H5 消费代码。
- ArkTS 已把窗口、旋转或折叠变化传给 H5。
- 只提供一端，但修复需要另一端生产或消费事件。
- 页面加载、监听注册或 reload 导致首次状态和后续状态不一致。
- H5 视频全屏或页面请求横屏后，退出全屏或离开页面时方向没有恢复。

## 契约先于代码

复用项目已有桥接机制，并先记录：

| 项目 | 必须明确 |
| --- | --- |
| 生产者 | 哪个 ArkTS 生命周期或系统事件产生信号 |
| 传输 | 现有 JSBridge、注册对象、消息通道或脚本调用 |
| 消费者 | 哪个 H5 模块注册，何时注册和卸载 |
| 名称 | 事件/API 名是否两端完全一致 |
| 载荷 | 字段、类型、单位、可选性、版本或序号 |
| 时序 | 首次状态、变化状态、H5 未就绪、页面重载/恢复 |
| 结果 | H5 如何重新测量，而非直接套用原生尺寸 |

不要在不知道现有桥接 API 的情况下写具体 ArkTS 调用。先搜索项目中相邻事件的生产、注册和消费模式，再按同一方式实现。

## 推荐职责链

先独立检查 ArkTS 父布局到 Web 组件的外部尺寸链。若 Web 组件本身没有获得正确可用区域，直接修复 ArkTS 容器约束；只有外部尺寸正确但 H5 未响应，才继续检查事件链。

### 外部尺寸链检查表

下列属性会直接改变 H5 看到的 layout viewport、字号或可视区域。属性名和默认值落地前按目标 API 版本的 ArkWeb 文档核对；修改沿用项目已有写法。

| 症状 | 优先检查 | 验证方式 |
| --- | --- | --- |
| 折叠、旋转或分屏后 `clientWidth` 不变 | Web 组件或父容器写死 `.width()/.height()`、`constraintSize`、未使用 `layoutWeight` 或百分比 | 在 ArkTS 侧记录 Web 组件 `onAreaChange` 尺寸，与 H5 `clientWidth` 对照 |
| `100vh`/`dvh`、`position: fixed` 异常，页面像被拉成一整张长图 | `layoutMode(WebLayoutMode.FIT_CONTENT)`：Web 高度随内容撑开，视口高度不再是可视区域 | 对比 `innerHeight` 与屏幕上 Web 组件的实际高度 |
| Web 嵌在 `Scroll`/`List` 中时滚动冲突或键盘遮挡 | `nestedScroll` 配置；键盘避让模式（见 `safe-area-and-keyboard.md`） | 分别测试 Web 内滚动到底、到顶和键盘弹出 |
| 页面整体缩小或放大，`initial-scale` 不生效 | `metaViewport`、`overviewModeAccess`、`initialScale`、`zoomAccess` | 对比 `document.documentElement.clientWidth` 与 Web 组件宽度（vp） |
| 文字比预期大或小，与 CSS 无关 | `textZoomRatio` 及系统字号跟随配置 | 对比 computed `font-size` 与 CSS 声明值 |
| 顶部或底部被系统栏遮挡，或 `env()` 恒为 0 | 窗口沉浸方式、`expandSafeArea` | 见 `safe-area-and-keyboard.md` |

修完外部尺寸链后，仍需验证 H5 在新尺寸下的内部布局。

```text
HarmonyOS 窗口/折叠事件
  → ArkTS 归一化为语义信号
  → 现有桥接传输
  → H5 收到后合并到下一动画帧
  → H5 重新读取 documentElement.clientWidth
  → 更新根字号或布局状态
```

ArkTS 传来的原生窗口或屏幕宽高（vp/px，字段名以项目现有协议为准）可以保留作日志或业务元数据，但 CSS/REM 的最终输入优先来自 H5 当前 layout viewport。原生事件可能早于 Web viewport 稳定，H5 收到事件后应调度测量，而不是立即把原生数值当 CSS px。

## H5 消费端模式

把原生事件和 Web 标准事件汇聚到同一个幂等调度器；沿用项目原 REM 公式：

```typescript
let frameId = 0;

function refreshResponsiveState(): void {
  frameId = 0;
  const width = document.documentElement.clientWidth || window.innerWidth;
  if (!Number.isFinite(width) || width <= 0) return;
  // 调用项目现有 REM/布局同步函数，不能在这里发明第二套公式。
}

function scheduleResponsiveRefresh(): void {
  if (frameId) cancelAnimationFrame(frameId);
  frameId = requestAnimationFrame(refreshResponsiveState);
}

window.addEventListener('resize', scheduleResponsiveRefresh, { passive: true });
// 现有桥接回调中同样调用 scheduleResponsiveRefresh。
```

本 skill 中所有 rAF 调度器统一用“取消后重排”：已有待执行帧时先 `cancelAnimationFrame`，再排入新帧，保证最终执行时读到的是最后一次信号后的状态。合并原生事件与 Web 事件时沿用这一种写法，不要混用“已排队就跳过”。

如果原生载荷包含序号，只处理比上次更新的序号；如果项目没有序号，不为简单幂等刷新强制扩充协议。

## ArkTS 生产端规则

- 复用已有窗口/折叠监听和桥接，不并行创建第二条同义通道。
- 仅在有效变化时发送；高频窗口变化做必要合并，但不能丢最终状态。
- H5 未就绪时保留最新状态，或在 H5 ready 后响应一次主动拉取。
- 页面销毁时移除窗口监听、桥接对象和待执行任务。
- 不在 ArkTS 中复制 H5 的断点表或 REM 公式。
- 除非页面不可修改且业务接受状态丢失，否则不要以 reload 代替事件消费。

## 方向锁定与全屏

窗口方向是**窗口级**状态：ArkTS 侧 `@ohos.window` 的 Window 实例方法 `windowClass.setPreferredOrientation()`（不是 H5 的 DOM `window`）作用于整个窗口，同一窗口内的其他 ArkTS 页面和 Web 内的其他 H5 页面共享它。H5 触发的临时方向（视频全屏横屏、某些页面默认横屏）只要有一次没有释放，后续页面就会一直被锁住。

本 skill 只负责 H5 与 ArkTS 之间的契约和检查；方向管理器本身（记录原始方向、多请求栈、统一恢复）是窗口级原生能力，按项目现有实现修改，没有时作为交接项交给原生侧，不在本 skill 中重新设计。

### 契约

| 项目 | 要求 |
| --- | --- |
| 权威持有者 | 方向只由 ArkTS 侧一个管理器设置；H5 不直接决定窗口方向，只发“请求”和“释放” |
| 请求与释放 | 每次请求有可配对的标识（token 或请求来源），释放只撤销自己的请求，不直接写回某个固定方向 |
| 恢复目标 | 全部请求释放后恢复到第一次加锁前的方向；不要写死 `PORTRAIT`，否则平板、折叠屏原本的自动旋转会丢失 |
| 全屏入口 | Web 组件 `onFullScreenEnter` 发起请求，`onFullScreenExit` 释放 |
| 页面生命周期 | 页面隐藏或销毁（`onPageHide`、`aboutToDisappear`）时释放该页面持有的全部请求；重新显示时按仍有效的请求恢复 |
| H5 释放点 | SPA 路由离开、`pagehide`、退出全屏（`fullscreenchange`）都要发释放；重复释放必须幂等 |

`screen.orientation.lock()` 在 ArkWeb 中是否可用、退出全屏是否自动解锁，需要在目标设备上验证；不要把它当作唯一机制，也不要让它和 ArkTS 管理器同时争夺方向。

### 检查清单

1. 搜索 `setPreferredOrientation`、`screen.orientation.lock/unlock`、`onFullScreenEnter/Exit`、桥接里的方向请求，列出所有设置方向的调用方。多个调用方各自设置、各自恢复，是“后恢复的一方覆盖另一方”的常见根因。
2. 确认每个加锁点都有对应的释放点，且释放点覆盖“全屏中直接返回或侧滑退出”“全屏中切到后台”这两条 `onFullScreenExit` 可能不触发的路径。
3. 确认恢复目标是加锁前的方向，而不是固定值。
4. `H5_ONLY` 时只修 H5 侧的请求与释放配对，把 ArkTS 管理器和生命周期挂载列为交接项；`ARKTS_ONLY` 时只修原生侧，并输出 H5 必须在哪些时机发释放。

### 验证

- 全屏中按返回或侧滑退出页面；全屏中切到后台再回来。
- 默认横屏页返回上一页；连续进入、退出多个横屏页。
- 视频全屏与页面横屏两个来源交替请求和释放。
- 平板、折叠屏退出后恢复为原来的自动旋转，而不是被锁成竖屏。

## 单端交接模板

### 只有 H5

```yaml
handoff_required:
  - owner: arkts
    need: "复用现有桥接发送窗口变化语义信号"
    contract: "事件名与字段以项目现有注册为准；H5 已提供幂等调度入口"
    acceptance: "外屏↔内屏和旋转时，H5 消费入口各收到最终状态"
```

### 只有 ArkTS

```yaml
handoff_required:
  - owner: h5
    need: "在现有事件消费者中调用统一响应式调度器"
    contract: "事件仅作重测量信号；用 clientWidth 计算 REM"
    acceptance: "相同最终 viewport 得到相同 computed root font-size"
```

## 联动验证矩阵

| 路径 | ArkTS 检查 | H5 检查 |
| --- | --- | --- |
| H5 首次加载 | Web 组件尺寸正确；ready 前状态不永久丢失 | 注册后获得或主动读取首次状态 |
| 外屏 → 内屏 | 发送最终变化且字段合法 | 下一帧读取新 viewport，REM/布局更新 |
| 内屏 → 外屏 | 不残留旧状态 | 相同最终宽度得到相同结果 |
| 内屏旋转 | 不重复注册监听 | 高频事件合并，最终方向正确 |
| 分屏连续调整 | 不把物理屏幕当窗口 | resize 持续生效且业务状态保留 |
| 页面重载/返回 | 桥接恢复且无重复监听 | 初始化与后续事件结果一致 |
| 全屏或横屏页退出 | 所有请求释放后恢复原始方向 | 路由离开、`pagehide`、退出全屏都发释放 |
| H5 消费异常 | 记录/容错符合现有机制 | 无监听泄漏或无限重试 |

`HYBRID` 的完成条件是双方的静态检查或构建通过、上述目标路径有证据、契约一致，并且直板机基线无退化。单端模式只能宣告本端完成和对端交接就绪。
