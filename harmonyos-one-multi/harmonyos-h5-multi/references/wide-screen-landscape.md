# 横屏与短高度适配

宽屏新增空间的四种策略（重复、分栏、挪移、缩进）在 `responsive-layout.md`，DOM/状态连续性规则在 `dynamic-window.md`，两者只在需要结构重排或状态保留时读取。本文件只处理方向、宽而短的窗口和首屏可操作性。

## 目标转换

当需求以具体设备表达时，先转换为可验证的 Web 条件：

| 设备描述 | H5 条件 |
| --- | --- |
| 展开态大屏 | viewport 宽度达到页面结构断点 |
| 方形展开屏 | 宽高接近且宽度足以承载多栏；方向可能随细微尺寸差翻转，不能作为结构开关 |
| 直板机横屏 | 中等宽度、较短高度 |
| 系统分屏 | 任意设备上的实际 viewport/容器尺寸 |

设备名称只允许出现在需求说明和验证矩阵中，不能出现在 CSS 选择器、JS 条件或数据属性里。

## 短高度约束

结构断点只看宽度；宽而短的窗口再叠加高度条件做修正。逐项检查：

- 顶部栏、分类栏和底部导航是否叠加占用过多高度。
- 固定高度 hero、弹窗和表单是否超过可视高度。
- 关键按钮是否只能在无滚动容器之外访问。
- 粘性元素是否把正文压缩成过小区域。

```css
.page { display: grid; grid-template-columns: minmax(0, 1fr); }

@media (min-width: 840px) {
  .page { grid-template-columns: minmax(288px, .9fr) minmax(384px, 1.2fr); }
}

@media (min-width: 840px) and (max-height: 640px) {
  .hero { min-height: min(416px, calc(100vh - 160px)); }
  .secondary-decoration { display: none; }
}

@supports (height: 100dvh) {
  @media (min-width: 840px) and (max-height: 640px) {
    .hero { min-height: min(416px, calc(100dvh - 160px)); }
  }
}
```

示例数值使用运行时 `px`，原因见 `responsive-layout.md` 的“动态 REM 页面的单位规则”；工程有 px 转换插件时，源码要用插件的保留写法。隐藏内容只能针对装饰或重复入口，不能隐藏核心信息和唯一操作。

## 验证矩阵

- 窄屏竖向基线。
- 断点前 1px、断点值、断点后 1px。
- 目标大屏横向窗口，以及宽度达到断点的竖向窗口。
- 同宽度下的短高度窗口。
- 窗口连续跨越断点的过程。
- 文字放大和长标题。
