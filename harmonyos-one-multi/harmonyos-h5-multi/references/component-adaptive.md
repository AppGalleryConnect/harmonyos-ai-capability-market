# H5 组件自适应

命中 `H5-01` 时完整读取：组件在可用空间内溢出、截断、拉伸或出现横向滚动，以及 container query 不切换。页面骨架、导航位置或列数变化属于 `H5-02`（`responsive-layout.md`）。

## 基线

```html
<meta
	name="viewport"
	content="width=device-width, initial-scale=1, viewport-fit=cover"
/>
```

不要禁用用户缩放。全局使用 `box-sizing: border-box`，为图片、视频和长文本设置可收缩约束。

```css
*,
*::before,
*::after {
	box-sizing: border-box;
}
img,
video {
	max-inline-size: 100%;
	block-size: auto;
}
.text {
	min-inline-size: 0;
	overflow-wrap: anywhere;
}
```

这只能解决媒体溢出。出现图片模糊、资源过大、不同窗口需要不同构图、视频裁切或 `srcset/sizes` 问题时，转读 `responsive-media.md`，不要把资源选择塞进普通布局断点。

## 定位首个溢出容器

1. 找到 `scrollWidth > clientWidth` 的第一个容器，而不是先隐藏 body overflow。
2. 检查固定宽度、`min-width`、`white-space: nowrap`、绝对定位和负 margin。
3. 检查 Flex/Grid 子项是否缺少 `min-width: 0` 或 `minmax(0, 1fr)`。
4. 检查图片、video、canvas、table、代码块和 iframe 的固有宽度。

修根约束，而不是给 `body` 加 `overflow-x: hidden`：Flex 子项加 `min-inline-size: 0`，Grid 轨道用 `minmax(0, 1fr)`，长文本用 `overflow-wrap: anywhere`，表格和代码块放进自身可横向滚动的容器。

## 组件级响应


```css
.panel {
	container-type: inline-size;
}
.card {
	display: grid;
	gap: 16px;
}

@container (min-width: 512px) {
	.card {
		grid-template-columns: 160px minmax(0, 1fr);
	}
}
```

若最低内核不支持 container query，先保留单栏基线，再用 `@supports (container-type: inline-size)` 包裹增强规则。

动态 REM 或 px 转换插件工程中，`@container` 条件里的 `rem` 按动态根字号解析：根字号 37.5px 时 `32rem` = 1200px，组件几乎不会切换。阈值在生成 CSS 中必须是 `px`。工程有转换插件时，保留写法见 `responsive-layout.md` 的“动态 REM 页面的单位规则”（仅在工程有动态 REM 或转换插件时读取）；postcss-px2rem 解析 `@container` 会直接构建失败，含容器查询的样式要放进不经过它的文件。

## 验证

- 最小支持宽度、组件所在容器的各个阈值及其 ±1px。
- 组件放进侧栏、分屏或多栏时，按容器宽度而不是 viewport 切换。
- 长标题、长数字、无空格字符串和文字放大（ArkWeb 中的构造方式见 `troubleshoot.md`）下无溢出、无重叠。
- 页面不再出现意外横向滚动；`scrollWidth` 不大于 `clientWidth`。
