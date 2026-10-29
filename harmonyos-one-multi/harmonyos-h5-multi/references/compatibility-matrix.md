# Web 特性兼容与回退矩阵

不要把浏览器能力写成永久事实。先读取项目的 browserslist 或最低浏览器目标，再查 MDN、W3C/WHATWG 规范和目标浏览器官方资料；在结论中记录验证日期。

## ArkWeb 内核

MDN 兼容数据不包含 ArkWeb。先从目标设备 UA 中的 `ArkWeb/x.y.z` 读取内核版本，对照 HarmonyOS 官方发布说明确认其 Chromium 基线，再查 MDN 对应的 Chrome 版本。最低目标是 HarmonyOS API 版本时，要换算成该版本搭载的 ArkWeb 内核，而不是按“最新 Chrome”判断。结论仍需在最低目标设备或模拟器上做最小复现。

## 项目级矩阵模板

| 能力 | 可用基线 | 渐进增强 | 特性检测 | 不支持时回退 | 已验证环境 |
| --- | --- | --- | --- | --- | --- |
| 页面断点 | media query | range syntax | `matchMedia()` | 传统 `min-width/max-width` | 待填 |
| 组件响应 | Flex/Grid | container query | `CSS.supports('container-type: inline-size')` | viewport 断点或单栏 | 待填 |
| 动态高度 | `100vh` + 正常滚动 | `100dvh` | `CSS.supports('height: 100dvh')` | `min-height: 100vh` | 待填 |
| 安全区 | 常规 padding | `env(safe-area-inset-*)` | fallback 参数 | `0px` | 待填 |
| 组件尺寸监听 | CSS 自适应 | `ResizeObserver` | `'ResizeObserver' in window` | window resize 或静态基线 | 待填 |
| 键盘可视区 | 正常文档流 | `visualViewport` | `'visualViewport' in window` | `innerHeight` | 待填 |
| 响应式内容图 | `<img src>` | `srcset`、`sizes`、`<picture>` | DOM 属性存在 + 目标环境实测 | `src` 和可用构图 | 待填 |
| 响应式背景图 | 普通 `background-image` | `image-set()` + `type()` | `CSS.supports('background-image', 'image-set(url("a.png") type("image/png") 1x)')` | 单一背景资源 | 待填 |

“已验证环境”填写 ArkWeb 内核版本与设备形态，例如 `ArkWeb 5.x / 折叠屏内屏`。

## 规则

1. 优先使用 CSS fallback + `@supports`，不要先解析 UA。
2. 一个 `@supports` 只检测同一回退单元；不要让无关可选能力共同失败。
3. 新语法必须保留旧语法可解析的基线，声明顺序从基线到增强。
4. polyfill 只用于业务必须且无法优雅降级的能力；布局增强通常应直接回退。
5. 最低支持环境和当前环境都要验证；只在最新浏览器通过不等于适配完成。

## 证据优先级

1. 项目实际 browserslist/运行环境约束。
2. 最低目标 ArkWeb 内核上的真机或模拟器最小复现；与文档冲突时以复现为准。
3. HarmonyOS/ArkWeb 官方文档与 release note。
4. W3C、WHATWG 或 CSSWG 规范。
5. MDN compatibility data（按 ArkWeb 对应的 Chromium 版本查）。

博客、论坛和 UA 推断只能提供线索，不能单独支持兼容结论。
