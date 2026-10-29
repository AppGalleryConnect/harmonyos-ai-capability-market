# 相机高频根因索引

## 高频根因

| ID | 症状 | 根因 | 修法 |
|---|---|---|---|
| **camera-01** | 前后置判断永远不成立 | 用 `cameraType` 判断前后置；它表示镜头类型 | 改用 `CameraDevice.cameraPosition` |
| **camera-02** | 预览旋转 90°/180° | 未补偿，或在 `commitConfig()` 前设置预览旋转 | 提交配置后调用预览旋转接口，并在方向变化时重新取值 |
| **camera-03** | 展开后相机唤不起，或前置预览变成后置 | 相机列表变化但未按原 `cameraPosition` 重选设备/重建 Session，或未命中后静默选了 `cameras[0]` | 折展终态用回调的可用集合保持位置意图并完整重建；半折叠过渡态不重复重建 |
| **camera-04** | 折叠屏出图视野被裁 | 未启用可变物理安装角的无损出图 | 完成三步能力判定并提供错误码回退 |
| **camera-05** | XComponent 旋转后错位或黑屏 | SurfaceRect/SurfaceRotation 未随方向更新 | 同时监听窗口和 display 变化，每次旋转更新 Surface |
| **camera-06** | 页面热启动（后台返回）黑屏 | 只在 `aboutToAppear` 初始化，`onPageShow` 未恢复相机 | `onPageShow` 中判 Session 存在则请求统一重建队列；`aboutToDisappear` 通过同一队列释放监听与资源 |
| **camera-07** | 预览花屏堆叠（图像行偏移错位） | ImageReceiver 取帧未处理 stride，把填充字节当像素 | 运行时取 `rowStride` 与 `width` 比对，去除无效像素，见 [预览帧 stride 花屏](camera-frames.md#预览帧-stride-花屏) |
| **camera-08** | 阔折叠外屏选后置崩溃 | 未处理"目标位置相机不存在" | 用户主动切镜且当前相机仍可用时保留原预览并提示不可用；折展导致旧相机失效时保留位置意图并串行释放旧链；仅在首次启动且产品策略明确允许时受控选择其他位置，同时同步业务状态 |
| **camera-09** | 录像方向与持握不一致 | `AVMetadata.videoOrientation` 未按重力角度设置，或预览/录像分辨率宽高比不一致 | 录像开始前取重力角映射 rotation；两条输出流分辨率宽高比保持一致 |
| **camera-10** | 不支持设备上直接崩溃 | 未做 SysCap 能力检测与错误码兜底 | `canIUse` + 能力查询 + 801 错误码降级，见 [能力检测](camera-capabilities.md#能力检测是两套机制不是一套) |
| **camera-11** | 折展后预览拉伸/压扁 | 流 Profile 与 Surface 矩形比例不同源，或重建读了 `windowSizeChange` 缓存的过期断点 | 双端锁同一基准比例并 letterbox 拟合；重建时实时计算基准，见 [折展防拉伸链路](camera-fold.md#折展防拉伸链路) |
| **camera-12** | 折展/展开后画面不旋转、保持横屏（方向冻结） | md/lg 形态把方向策略设成 `UNSPECIFIED`（它不跟随传感器，不是通用恢复值）；或用本地 `lastOrientation` 去重，折展时窗口方向被系统重置后缓存仍命中，后续设置被永久跳过 | sm 锁 `PORTRAIT`、md/lg 用 `AUTO_ROTATION_RESTRICTED`，每次窗口尺寸稳定后重设并以设置结果维护去重缓存；半折叠锁横屏、退出恢复，见 [折展后的窗口方向策略](camera-fold.md#折展后的窗口方向策略) |
| **camera-13** | 折展后拉伸且重算矩形仍拉伸（流与矩形基准失配） | 重建发生在 fold 回调时刻，窗口尺寸/断点还是旧形态的，流按旧基准（如外屏 1:1）创建；窗口稳定后 `windowSizeChange` 只重算 Surface 矩形（新基准 4:3）不重建流 | 流的创建推迟到 `windowSizeChange` 之后，或在 `windowSizeChange` 里比对建流基准兜底重建；**固定时长防抖不是窗口稳定判据**，见 [折展防拉伸链路](camera-fold.md#折展防拉伸链路) 第 6/7 条 |
| **camera-14** | 折展后画面视野变窄（观感"焦距变大"），或画面变窄条、宽度未铺满 | 流按旧形态基准或裁切档创建（外屏 1:1 裁切、或筛不到基准档时 fallback 盲选最高分辨率的 16:9 裁切档），窗口稳定后无基准比对纠正 | 链路第 6/7 条的稳定门槛与兜底重建；fallback 回退 `previewProfiles` 列表首档并按实际比例 letterbox，见 [折展防拉伸链路](camera-fold.md#折展防拉伸链路) 第 2 条 |
| **camera-15** | 平板/折叠屏竖屏锁定应用进相机页被强制横屏（整窗转横屏或变居中竖窗+虚化），或三折叠展开态进相机页窗口转横屏；退出后停留横屏 | 方向行为未以工程声明为准绳：锁定声明的工程被系统在相机激活时强转，或被用 `UNSPECIFIED` 放开成跟随语义（展开态自然方向横屏→直接转横）；退出时相机未完全释放就恢复固定竖屏也会停留横屏 | 按 [处置流程](camera-orientation-window.md#处置流程) 执行：未锁定→不设固定方向+预览旋转链路；锁定→重申声明方向；仍被强转→取证交用户决策，接受临时跟随时相机页 `AUTO_ROTATION_RESTRICTED`（勿用 UNSPECIFIED）+ 退出 `await releaseCamera()` 后恢复；`setXComponentSurfaceRotation({lock:true})` 与此无关 |
| **camera-16** | 相机预览占满屏幕挤出操作区；或预览只占中间一小块；或方向正常但预览在两个方向都只占固定小块 | 预览容器按屏宽固定比例（如 `aspectRatio(3/4)`）高度超屏；或窗口被转横而布局按竖屏设计；或硬编码 `setXComponentSurfaceRect`（固定 px 矩形与组件大小脱节） | 预览区 `layoutWeight(1)` 占剩余空间 + XComponent `100%` + `renderFit(RESIZE_COVER)`（API ≥ 18）铺满；先修窗口方向再修布局；删除硬编码 surfaceRect（Surface 默认与组件重合），见 [预览占满屏幕挤出操作区 / 预览只占中间一小块](camera-preview-ui.md#预览占满屏幕挤出操作区--预览只占中间一小块) |
| **camera-17** | 点击录像按钮无反应：无红点、无计时、不进入录制态，也无报错弹窗 | 只调 `avRecorder.start()` 未先启动 `videoOutput` 视频输出流（`avRecorder.start()` 只启动编码器，不启动视频流），编码器 Surface 无输入帧；catch 静默吞异常且状态不回滚 | 按 `videoOutput.start()` → `avRecorder.start()` 顺序启动，`isRecording`/计时在两个 start 成功后才置位，catch 回滚状态，见 [录像启停完整链路](camera-output.md#录像启停完整链路) 与 cases 场景 10 |

---
