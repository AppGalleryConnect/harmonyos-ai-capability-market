# 图片与媒体的一多适配

处理 `Image`、横幅、卡片封面和普通视频占位的布局语义。相机预览、拍照/录像方向和专用播放器 Surface 不在本文件范围内。

## 先固定图片需求契约

“保持比例”“不裁切”“宽屏别太大”都不是完整的实现约束。修改前从需求、设计 token、正常基线、资源元数据和现有调用链建立最小契约：

```yaml
image_intent:
  ratio_owner: source | display_frame | responsive | unknown
  ratio_evidence: design_token | acceptance | verified_baseline | asset_metadata | unknown
  crop_policy: forbid | allow | unknown
  width_behavior: fixed | fluid | capped | unknown
  wide_window_behavior: unchanged | capped | responsive_ratio | unknown
  evidence_refs: "比例、裁切、限幅各自的文件/字段、验收原文或基线记录；无证据写 unknown"
```

- `source`：展示框跟随图片资源原始比例。
- `display_frame`：产品定义固定展示框比例，图片可在框内 `cover` 裁切。
- `responsive`：展示框比例、最大尺寸或构图随项目断点变化，图片资源比例仍不被拉伸。
- `unknown`：材料不足，不能把任意常量写成已确认需求。

把“不变形、不越界、不使用陈旧窗口、业务状态连续”视为硬约束；把横幅多宽、多扁、允许裁掉什么、左右留白多少视为产品策略。只有后者有证据时才固化。

## 需求歧义守门

按以下优先级确定比例、最大尺寸和断点：

```text
产品/设计 token
→ 明确验收条件
→ 已确认正常的目标窗口基线
→ 图片资源元数据
→ 现有稳定内容区约束
→ 旧代码仅作为待验证线索
```

不要从正在修复的尺寸旧公式直接推导图片或展示框比例。旧代码可能正是缺陷来源。

`verified_baseline` 必须有独立于旧公式的确认：例如用户明确认可的窗口与画面、设计稿或已有验收记录。仅凭“旧公式是唯一来源”“缓存才是缺陷”“原作者显然这样设计”，不能升级为已确认基线。保留旧公式作为临时兼容行为时，明确它是未确认假设，不把它写成产品比例证据。资源元数据只证明资源比例，不能单独证明展示框比例、最大尺寸或允许裁切。

用户明确要求各态展示框比例相同时，先用限宽/居中满足增长约束；切换更扁比例需要新的产品依据。“折展前后保持相同宽高比”默认解读为：展示框 `width/height` 在各态相等（可用 `onLayout` 测量），且资源不被拉伸；它不自动规定比例取值，取值仍按上面的优先级找依据。

展示框的可用宽度取同列内容的统一内容区（与卡片、列表等兄弟元素相同的水平 inset），不单独给横幅另算一套边距；几何反证表中注明横幅与兄弟元素左右边距是否一致。用户要求不裁切时，不能因为沿用旧 `cover` 就认定允许裁切。

若以下选择会改变可见结果且证据不足，提出一个聚焦问题再修改：

- 保持资源原始比例，还是保持产品展示框比例；
- `contain` 完整展示并允许留白，还是 `cover` 铺满并允许裁切；
- 宽屏继续按比例增长、保持比例并限宽，还是调整展示框构图；
- 裁切是否可以影响人物、文字、二维码或其他关键区域。

无法获得答复时，只实施有证据的修复：使用当前 window、修复陈旧派生值、保证不拉伸/不越界、复用已有内容 `maxWidth` 和断点、保持已确认手机基线，并把未确定的裁切或宽屏构图标为假设/`not_verified`。不要发明示例比例、阈值或最大尺寸后宣称需求完成。

## 分开资源比例与展示框比例

```text
sourceAspectRatio = 资源 intrinsicWidth / intrinsicHeight
frameAspectRatio  = 当前断点下展示框 width / height
```

两者相同不代表所有窗口都应无限放大。两者不同时：

- `contain` 保持资源完整，可能出现留白；
- `cover` 保持资源比例并填满展示框，必然可能裁切；
- `stretch` 会改变资源比例，普通照片/横幅默认拒绝；
- 不要用“图片没有被拉伸”证明“图片内容没有被裁切”。

如果宽屏需要更扁的 `frameAspectRatio`，必须同时确认 `cover` 的裁切区域仍可接受，或提供断点资源/构图方案。核心内容不可裁切时优先 `contain`、更合适的资源，或调整展示结构。

## 来源与几何

- 静态 `require()` 资源携带固有尺寸；先读取真实资源元数据，不把旧容器比例冒充资源比例。读取方式（任选其一，注意 `@2x/@3x` 档位按 scale 换算回 layout 单位）：

  ```bash
  file assets/banner.jpg                                   # 多数格式直接给出像素宽高
  sips -g pixelWidth -g pixelHeight assets/banner.jpg      # macOS
  python3 -c "from PIL import Image; print(Image.open('assets/banner.jpg').size)"
  ```

- **推荐统一写法**：需要固定比例时，由有界父 View 持有可追溯 `aspectRatio` 与限幅，Image 写 `width: '100%', height: '100%'`（可与 absoluteFill 同时使用）。这条对静态 `require()` 资源是**必须**（原因见下条）；对网络图、data URI 或无 source 是**推荐**：它们的 source 不带宽高，Image 自身 `width + aspectRatio` 能正常工作，但统一写法让 source 从网络换成本地资源时不会悄悄失效。审查网络图时不要把 Image 上的 `aspectRatio` 当成比例错误的根因。
- **原因：静态资源固有尺寸会压过 `aspectRatio`**。RN 的 Image 对单个非数组 source 先合并资源自身的 `{width, height}`（来自 `resolveAssetSource`），再合并 `props.style`，即 `flattenStyle([{width, height}, styles.base, props.style])`。这来自 RN 上游 Image（Android/iOS 实现中同样存在），不是 RNOH 特有；RNOH 沿用了它，已在 RNOH 0.72.53 核实，其他版本按下方命令复核。因此：
  - Image 只写 `width + aspectRatio` 时，资源高度仍留在样式里；宽高都确定后 Yoga 忽略 `aspectRatio`，表现为高度固定、宽度随窗口变化，折展两态比例不同。宽度是否限幅都无关。
  - 对称情形同样失效：只写 `height + aspectRatio` 时资源宽度留在样式里，宽度被定死；两者都不写时按资源尺寸渲染。
  - Image 只写 `StyleSheet.absoluteFill` 时，资源宽高优先于 `left/right/top/bottom`，图片按资源尺寸渲染而不是填满父框。
  - 升级 RN/RNOH 后复核该合并是否仍存在（包名随兼容线不同，见 `compatibility-matrix.md`）：`grep -rnF "flattenStyle([{width, height}" node_modules/@react-native-oh/react-native-harmony/Libraries/Components/Image/ node_modules/react-native-harmony/Libraries/Components/Image/ 2>/dev/null`。
- 网络图片、data URI、沙箱和部分原生资源没有可依赖的同步固有尺寸；加载前就提供展示框几何。比例优先来自接口元数据或产品契约，避免加载完成后页面跳动。
- Harmony rawfile、沙箱 bundle 和远程 URL 的路径/缓存问题与 Yoga 几何分开诊断；图片未显示不自动归因响应式布局。
- 骨架、失败态和真实图片使用相同展示框几何，避免列表测量和断点在加载后改变。

## 宽屏增长策略

横幅不等于“窗口越宽就按手机比例无限放大”。按项目现有 breakpoint/token 派生：

```text
availableWidth = 当前内容区宽度 - 已有水平 inset
frameWidth     = min(availableWidth, 当前断点的 bannerMaxWidth)
frameRatio     = 当前断点的 bannerFrameRatio
frameHeight    = frameWidth / frameRatio
```

- `bannerMaxWidth`、`bannerFrameRatio`、断点和可选 `maxHeight` 必须来自项目设计系统、验收条件或经确认的基线，不采用本 skill 示例数字。
- 窄屏可接近铺满内容区；宽屏优先限宽、居中和保留留白，再判断是否需要响应式比例或结构变化。
- 固定比例 + 有效内容区限宽是完整的候选策略，不必新增三档断点或改变比例。父容器限宽时，子项应消费该容器的可用宽度。
- `maxHeight` 与比例同时存在时，最终宽高仍要满足同一展示框比例；不要单独截断高度导致布局盒与设计比例冲突。
- 不按手机、双折叠、三折叠、平板名称分支；设备名只用于复现矩阵，布局由 application window 和内容约束决定。
- 宽而短窗口单独检查，避免只因 width 很大就生成过高横幅并挤压核心操作。

## 实现边界

优先复用项目唯一 breakpoint provider 和媒体 token。一个可接受的调用关系是：

```tsx
const breakpoint = useBreakpoint();
const media = tokens.banner[breakpoint];

<ResponsiveImage
  source={source}
  aspectRatio={media.frameAspectRatio}
  maxWidth={media.maxWidth}
  resizeMode={media.cropAllowed ? 'cover' : 'contain'}
/>
```

这里的 token 只是调用关系示意，不代表必须新增 provider，也不提供平台标准比例或阈值。项目只有单一比例且已有内容区限宽时，保持简单，不为了“响应式”新建第二套断点。

## RNOH 版本分流

先证明以下链路正确：

```text
application window
→ content/container bounds
→ React frame style
→ Image onLayout
→ native Image bounds
→ decoded resource / crop result
```

- frame style 或父约束错误：留在 `RN-01/RN-09`。
- window、frame style、onLayout 正确，但 native Image bounds、缓存显示、资源前缀或像素密度资源选择异常：进入 `RN-08`，记录锁定 RN/RNOH/HAR，建立最小复现并对照兼容版本。
- RN wrapper 正确但自定义 Surface/buffer 或触控坐标错误：进入 `RN-07`。

「有界父 View 持有比例 + Image 显式 `width/height: '100%'`」是所有 Image 的默认写法，不是版本规避；它在没有固有尺寸合并的版本上同样成立。`height:null/undefined`、关闭缓存和强制 remount 才是历史规避，不要固化成所有 RNOH 版本的要求。

## 清晰度与性能

- 显示盒使用 RN layout units；PixelRatio 只用于选择/请求足够清晰的资源像素。
- 远程图片请求尺寸可按最终 frame layout size × PixelRatio 计算，并按项目策略分桶/缓存，避免窗口拖拽时每个像素变化都重新请求。
- 不用远超展示尺寸的原图持续填充大量列表项；同时避免低密度资源在宽屏被放大后模糊。
- 资源请求优化不能改变已确认的展示框几何或成为布局断点来源。

## 验证矩阵

### 交付前的几何反证

对随窗口增长的媒体，必须用最终实现（含样式数组覆盖、实际父内容区、padding/inset 和限幅）核算以下窗口：窄屏、目标宽屏、超宽、宽而短；没有断点也要覆盖这些代表窗口，有断点时再检查临界值。优先用实际目标尺寸，暂缺时可用测试尺寸并注明它们不是产品阈值。

用紧凑表或等价记录保留：`window W×H`、可用内容宽度、最终 `frameWidth/frameHeight`、展示框比例、有效限制及其依据。宽短窗口同时核对媒体下方核心内容与操作是否可达；按产品验收核对高度或面积占比，不自定通用“合理占比”。

- 反查增长：`W - round(0.06W)` 配 `aspectRatio = 0.94/0.26`，在 W 为 400/800/1200/1600 时得到 376×104、752×208、1128×312、1504×416。它证明持续增长，不能证明宽屏可接受；这些数字只用于反证。
- 验证约束是否有效：沿媒体到内容区追踪限制，不接受无关组件的 `maxWidth`，也不接受“代码出现了 Math.min”作为有界证明（两个参数都随 W 增长仍可能无界）。
- 若最终仍是窗口近似线性宽度 + 单一比例，且无有效限幅或有依据的宽屏增长策略，不能判定宽屏适配完成。用户明确接受全宽媒体的验收可作为策略依据，但仍检查宽短窗口与内容可达性。
- 若策略/尺寸来源未知，只交付有证据的动态修复，列出待确认项；不能用“最小改动”取消验收条件。

几何计算能发现无界增长、比例冲突或越界风险；不能代替目标窗口的裁切、文字/人物关键区域和视觉验收。

至少覆盖：

- 手机窄屏基线、断点前后、目标大屏、超宽窗口和宽而短窗口；
- 冷启动各窗口、窄→宽→窄、宽→窄→宽和连续拖拽；
- 加载前、成功、失败、缓存命中，以及静态/网络来源；
- `frameWidth/frameHeight/frameAspectRatio`、Image `onLayout`、容器与 native `origBounds/bounds`；
- `cover` 的关键内容裁切、`contain` 的留白、圆角/overflow 和点击区域；
- 横幅没有拉伸、越界或无限放大，且不会挤压同屏核心内容；
- 同一最终 window 从不同到达路径得到相同框尺寸、比例、crop 语义和资源档位。

### 运行时比例证据

几何反证只核算 React style，看不到 Image 内部合并的资源固有尺寸。比例类验收（“各态相同宽高比”）必须附运行时数据：把 `assets/recipes/WindowEvidenceProbe.tsx` 的 `useLayoutEvidence()` 返回的 `onLayout` 直接挂在 Image（或持比例的父框）本身，不要外包一层 View 再测（包裹层会被 stretch 到父宽，测到的不是展示框），在折态、展态和一次往返后各记录 `window W×H`、`layout width×height` 和 `width/height`，与 `image_intent` 中的展示框比例对比，误差只允许像素取整级别。目标设备上采集的这组记录就是运行时证据；探针代码本身不算验证，交付前删除。没有这组数据时，比例结论写 `not_verified`。

只有截图或代码公式时，不得证明资源比例、裁切内容或视觉占比已经符合产品要求；没有目标窗口运行证据时标记 `not_verified`。

## 交付字段与完成判定

媒体任务的最终答复额外列出：

- `image_intent`（`ratio_owner`、`ratio_evidence`、`crop_policy`、`width_behavior`、`wide_window_behavior`）及各自证据；
- 资源实际像素尺寸；
- 代表窗口（窄、目标宽屏、超宽、宽短）的最终框尺寸和有效限制来源；
- 有设备时各态 Image 或持比例父框的 `onLayout` 实测比例。

`ratio_evidence` 为 `unknown` 时不得写“比例已满足需求”。只有窗口会更新或比例恒定，不能判定宽屏适配完成；样式里写了 `aspectRatio` 不等于渲染比例恒定。
