# 动态窗口：分屏、旋转与 resize

命中 `H5-05` 时完整读取：分屏、旋转、折叠展开或连续 resize 后布局未更新，或业务状态丢失。动态 REM 根字号未更新改选 `H5-07`（`rem-responsive.md`）。

## 排查

1. 搜索加载阶段缓存的 `innerWidth`、`screen.width` 和一次性 class。
2. 搜索动态 REM 根字号写入；若存在，读取 `rem-responsive.md` 检查初始化公式、监听器注册和宽高守卫。
3. 纯视觉变化改回 CSS；业务状态使用与 CSS 一致的 media query。
4. 组件受局部容器约束时使用 container query 或 ResizeObserver，不监听整个 window。
5. 检查 SPA 重挂后的重复监听、旧闭包和未取消的动画帧。

## 动态窗口

纯视觉变化交给 CSS。业务逻辑确实依赖布局状态时才监听。项目已有 JS 动态 REM 时，根字号重算属于渲染基础设施而非业务状态，命中该场景应改读 `rem-responsive.md`。

```typescript
const expanded = window.matchMedia("(min-width: 840px)");

function syncMode(event: MediaQueryList | MediaQueryListEvent): void {
	document.documentElement.dataset.layout = event.matches
		? "expanded"
		: "compact";
}

syncMode(expanded);
expanded.addEventListener("change", syncMode);

// SPA 卸载时执行：expanded.removeEventListener('change', syncMode)
```

组件响应使用 `ResizeObserver`，回调中只读取必要尺寸，合并写操作，避免读写交错造成 layout thrashing。

## DOM 与状态连续性

- 优先用同一 DOM 改变 Grid/Flex 区域，保持阅读顺序和焦点顺序。
- 条件渲染多栏时，把业务状态提升到不会随布局分支销毁的位置。
- 布局变化不得重置路由、表单输入、媒体进度、选中项或滚动上下文。
- 导航挪移后保持相同可访问名称和激活状态。

## 验证

- 分屏进入、连续拖动和退出；折叠展开、旋转；相同最终 viewport 得到相同布局。
- 路由、表单输入、媒体进度、选中项和滚动位置在切换后保留，无需 reload。
- 快速连续 resize、BFCache 返回和 SPA 重挂后监听不重复；卸载时 `MediaQueryList`、`ResizeObserver` 和动画帧全部释放。
- 条件渲染改变了导航或模块在 DOM 中的位置时，按 `a11y-reflow.md` 检查焦点与读屏顺序。
