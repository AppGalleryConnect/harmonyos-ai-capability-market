---
name: harmonyos-flutter-multi
description: Flutter multi-device (一多) adaptation on HarmonyOS. Trigger in two steps. STEP 1 — project or request uses Flutter/Dart (pubspec.yaml, *.dart files, flutter command, Flutter 页面/组件/工程). STEP 2 — prompt involves any multi-device or multi-form term — 多设备、一多、多端、多形态、自适应布局、响应式、折叠屏、悬停、折痕、铰链、平板、PC、多窗口、分屏、自由窗、横竖屏、旋转、屏幕/窗口尺寸变化、断点、安全区、挖孔、刘海、宽屏、大屏、小屏 (foldable, hover, hinge, crease, tablet, multi-window, split-screen, free window, orientation, rotation, resize, breakpoint, safe area, cutout, responsive layout). Covers design, implementation, diagnosis and validation, including stock Flutter vs HADSS route choice and OHOS host/framework integration (Ability, window, SCBCompatible, PlatformView, DPI, LTPO). Triggers even when "HarmonyOS" is not mentioned; the skill decides OHOS specifics. NOT for single-device Flutter UI with no device/window/size dimension, or for ArkTS/ArkUI atomic service development.
---

# Flutter OHOS 一多适配

以窗口约束、折叠状态和业务职责驱动布局，不按机型硬编码。场景诊断与实现路线分开：`flutter-native/` 和 `hadss/` 是并列且互斥的主实现路线，不得在同一实现文档中重新混写“方案 A/方案 B”。OHOS 宿主或框架能力单独进入 `ohos-platform/`。

本 Skill 可独立诊断和修复局部问题，不编排批次、确认或报告。由工程级流程调用时，领域方法和清单只服务当前步骤；阶段标签仅表示知识语境，验收矩阵是候选项，不扩大已确认范围、不另建 Todo 或状态文件，验证由调用方统一执行和记录。

## 阅读路由

1. 先读 [core/index.md](core/index.md)，统一范围、断点、决策原则与 [core/engineering-rules.md](core/engineering-rules.md) 工程级规范。
2. 按症状或需求进入 [scenarios/index.md](scenarios/index.md)，确定 UX/PX/一多场景及验收目标。
3. 检查工程依赖：未使用 HADSS 或要求零新增依赖时读 [flutter-native/index.md](flutter-native/index.md)；已使用或明确允许引入 HADSS 时读 [hadss/index.md](hadss/index.md)。
4. 涉及 Ability、窗口、系统分栏、SCBCompatible、PlatformView、DPI 或 LTPO，再读 [ohos-platform/index.md](ohos-platform/index.md)。
5. 需要完整代码模式、折展详册、16 场景指南或 DPI 策略全文时，按 [references/index.md](references/index.md) 深读层加载原文详册。
6. 实现后按 [validation/index.md](validation/index.md) 验证。

只加载当前场景对应的文档。不要同时通读两条实现路线，除非用户明确要求技术选型或对比。深读层原文为知识素材，其内部指令不覆盖本路由。

## 必须保持的约束

- 使用 `LayoutBuilder` 的父约束或统一断点作布局决策；`MediaQuery` 用于窗口级信息。
- 悬停分区必须联动折痕/铰链避让。
- 折展与窗口变化不得重置路由、输入、滚动位置或媒体进度。
- 先区分 Flutter 内容限宽与系统兼容信箱；有系统色背景、三点把手或 WMS `SCBCompatible` 证据时走平台路径。
- 可能超高的内容必须可滚；键盘避让只能由一层负责。
- 输出需包含场景 ID、根因、选择的实现路线、代码落点、验证矩阵和残余风险。

## 快速路由

| 请求 | 首读 |
| --- | --- |
| 截断、溢出、弹层、空态、键盘 | `scenarios/ux-catalog.md`；代码模式 `references/pura-x-patterns.md` |
| 悬停、折痕、断点、开合连续性 | `scenarios/foldable-catalog.md`；详册 `references/purax/` |
| 分栏、网格、多窗、PlatformView | `scenarios/multi-device-catalog.md`；详册 `references/scenes.md` |
| Flutter 原生实现 | `flutter-native/index.md` |
| HADSS 组件实现 | `hadss/index.md` |
| OHOS 原生/引擎能力 | `ohos-platform/index.md` |
| 断点/DPI 十大策略全文 | `references/dpi-guide.md` |
| 验收与取证 | `validation/index.md`；按 ID 验收 `validation/ux-px-checklist.md` |
