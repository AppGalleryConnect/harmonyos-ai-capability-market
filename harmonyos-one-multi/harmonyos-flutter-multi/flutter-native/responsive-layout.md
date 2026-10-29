# 原生 Flutter 响应式布局

- 重复布局：`GridView`、`SliverGridDelegateWithMaxCrossAxisExtent` 或按断点改变列数。
- 多卡轮播（重复布局变体）：`PageController(viewportFraction: 1/同屏数)` + `PageView(padEnds: false, itemCount: 卡数)`；吸附页数 = 卡数 − 同屏数 + 1（仅用于指示器圆点与自动播放取模），`viewportFraction` 随断点变化须重建控制器并保留 `initialPage`；默认 `padEnds: true` 或 `itemCount` 误用吸附页数都会导致静置态留白（见工程规范 16）。
- 挪移布局：`Flex(direction:)` 在 Column/Row 间切换。
- 导航：md 及更窄保留 `NavigationBar`，达到 lg（≥840）才迁 `NavigationRail` 或自定义侧栏；迁移后默认垂直居中、高度占可用高度 80%、页签均分排列，背景色保持默认（跟随主题，勿随意设色）。
- 缩进布局：只对阅读/表单正文使用有业务依据的 `maxWidth`，不要限制地图、网格和主容器。
- 网格卡片按实际单元格宽度动态计算 `childAspectRatio`，正文高度按字号、行高、行数和 padding 估算。

布局分支尽量复用同一 State 与 Controller；不要让两个完全不同的页面树分别持有业务状态。
