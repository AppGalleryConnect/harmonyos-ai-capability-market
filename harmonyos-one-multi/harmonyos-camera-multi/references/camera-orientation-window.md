# 相机页窗口方向与强制横屏

## 适用症状

- 应用在 `module.json5` 锁定 `"orientation": "portrait"`，平板竖屏进入相机页后整个显示被强制转成横屏，应用变成"居中竖屏小窗 + 虚化背景"或横屏铺满布局，观感是导航栏、快门"全都横了"。
- 折叠屏/三折叠展开态进入相机页后窗口转成横屏。
- 预览只占屏幕中间一小块——**先查窗口是否已被旋转成横屏**（竖屏设计的布局在横屏宽窗口下必然变成居中小块），修完方向再修布局，不要先调布局。
- 退出相机页后停留横屏，首页没有恢复竖屏。
- 常见误判：怀疑 `setXComponentSurfaceRotation({ lock: true })`、预览 Profile 比例或 `deviceTypes` 缺 `tablet`——三者都不是根因（见排除项）。

这是系统级行为而非应用布局问题，具体机制未公开、随系统版本可能变化：不要在结论中断言内部实现，以症状识别 + 修复模式为准。真机验证基线：MatePad 平板（LAP-AL10）、API 26；三折叠 Mate XT 2 展开态（外部会话证据）。

## 方向准绳：以工程声明为准

相机页的方向行为由工程的**方向声明**唯一决定（用户原则："代码锁定了方向，那就按照锁定方向来。代码没有锁定方向，那就不需要锁方向，任意方向都可以拍照"）：

- **锁定声明**：`module.json5` 的 `orientation` 是固定方向（`portrait` / `landscape` 等），或运行时已显式 `setPreferredOrientation` 固定方向 → 相机页保持该锁定方向。
- **未锁定声明**：`orientation` 为 `unspecified` / `auto_rotation*` 系（缺省即 unspecified）→ 相机页不额外锁方向，任意方向可拍。

判定只读工程声明，不要拿"产品想要什么"覆盖声明；把锁定工程放开成跟随、或给跟随工程加锁，都属于修错方向。**相机页临时放开（方案二）已是用户确认的默认决策（2026-10-12）**：检测到强转冲突时直接采用并在回复中告知取舍，无需弹窗询问；仅当用户明确反对临时跟随时维持方案一。

## 处置流程

1. 读工程声明（manifest `orientation` / 运行时显式设置）。
2. **未锁定**：相机页不调用固定方向的 `setPreferredOrientation`；配套预览旋转链路（`commitConfig()` 后 `getPreviewRotation`/`setPreviewRotation` + display 监听，见 camera-output.md）。退出无需恢复。完成。
3. **锁定**：按方案一实现"重申声明方向"，真机复测。
4. 复测仍被强转横屏（判据：进相机页 `snapshot_display` 宽 > 高；hilog 出现 `EnterCompatibleModeView`）→ 声明与系统行为冲突，应用侧无开关。**默认直接采用方案二**（用户已确认的默认决策，2026-10-12），在返回内容中说明冲突与取舍即可，不弹窗询问；仅当用户明确表示不接受相机页临时跟随时，退回方案一并告知"相机激活期间横屏"的后果。

## 方案一：锁定重申（设备无强转行为时有效）

```typescript
aboutToAppear(): void {
  this.mContext = this.getUIContext().getHostContext() as common.UIAbilityContext
  this.setPageOrientation(window.Orientation.PORTRAIT)   // 声明值
  this.requestCameraPermission()
}
// 退出：await releaseCamera() 后 setPreferredOrientation(声明值)，见"退出恢复的时序"
```

预览按锁定方向布局：竖屏声明 → 全屏铺满 `.width('100%').height('100%').renderFit(RenderFit.RESIZE_COVER)`（API ≥ 18）。

**已知限制（LAP-AL10 实测，2026-10-12）**：此类设备上"固定竖屏 + 相机激活"必然触发系统强转——进页、session 就绪、延迟 2 秒三个时机重申 `PORTRAIT` 全部被覆盖（相机状态广播到达系统时统一改写；激活后同值重申不生效，且可能被客户端去重不发送）。命中此限制进入流程第 4 步。

## 方案二：相机页临时跟随（冲突设备的默认解，用户已确认）

完整实现（LAP-AL10 全链路验证）：manifest 保持锁定不动，相机页两端处理：

```typescript
aboutToAppear(): void {
  this.mContext = this.getUIContext().getHostContext() as common.UIAbilityContext
  // 冲突设备：锁定竖屏 + 相机激活会被系统强转横屏，相机页临时改为跟随传感器
  this.setPageOrientation(window.Orientation.AUTO_ROTATION_RESTRICTED)
  this.requestCameraPermission()
}

aboutToDisappear(): void {
  this.releaseCameraAndRestoreOrientation()
  // ... 其余监听注销
}

private async releaseCameraAndRestoreOrientation(): Promise<void> {
  await this.releaseCamera()   // 必须完全释放后恢复，见"退出恢复的时序"
  this.setPageOrientation(window.Orientation.PORTRAIT)   // 恢复声明值
}

private setPageOrientation(orientation: window.Orientation): void {
  const ctx = this.mContext
  if (!ctx) { return }
  window.getLastWindow(ctx).then((win: window.Window): Promise<void> => {
    return win.setPreferredOrientation(orientation)
  }).catch((err: BusinessError): void => {
    console.error(`${TAG} setPreferredOrientation failed: ${err.code}, ${err.message}`)
  })
}
```

- 用 `AUTO_ROTATION_RESTRICTED`，**勿用 `UNSPECIFIED`**：RESTRICTED 跟随传感器、受控制中心旋转开关控制、平放时保持当前方向；UNSPECIFIED 在折叠/三折叠展开态平放时会回落自然方向（横屏）。
- 语义：竖屏持机进入保持竖屏；物理旋转设备才转横；退出相机页恢复应用声明竖屏。
- 预览布局必须响应式（跟随期间可能旋转）：预览容器 `layoutWeight(1)` 只占导航栏与操作区之间剩余空间 + XComponent `.width('100%').height('100%').renderFit(RenderFit.RESIZE_COVER)`（API ≥ 18），保证操作区始终可见且两个方向布局不破。
- **配套必做：预览旋转修正链路**。方案二允许窗口在相机使用期间旋转，官方要求两个时机做角度修正：会话配置时（`commitConfig()` 之后）一次 + 窗口旋转时（display 监听）重新修正。缺这条链路的症状就是"横竖切换后预览画面保持旧方向"（横↔竖其中一向看起来对只是建流方向恰好匹配，不代表链路正确）：

```typescript
// ① 成员：保存回调引用（display.off 不传引用会清掉该事件所有监听）
private onDisplayChange = (): void => {
  this.applyPreviewRotation()
}

// ② session 配置块内，commitConfig() 之后：
this.applyPreviewRotation()
try { display.off('change', this.onDisplayChange) } catch (e) { /* 首次注册前可忽略 */ }
display.on('change', this.onDisplayChange)

// ③ 修正方法（回调内实时读 rotation，防注册时快照的 stale closure）
private applyPreviewRotation(): void {
  const previewOutput = this.mPreviewOutput
  if (!previewOutput) { return }
  try {
    const displayRotation: number = display.getDefaultDisplaySync().rotation * 90
    const rotation: camera.ImageRotation = previewOutput.getPreviewRotation(displayRotation)
    // isDisplayLocked 与 setXComponentSurfaceRotation 的 lock 保持一致（官方要求）：
    // lock:true → true；工程未调用 surface 旋转锁定（默认 false）→ false
    previewOutput.setPreviewRotation(rotation, true)
  } catch (error) {
    const err = error as BusinessError
    console.error(`${TAG} applyPreviewRotation failed: ${err.code}`)
  }
}

// ④ releaseCamera() 末尾（session release 后、引用置空前）：
try { display.off('change', this.onDisplayChange) } catch (e) { /* log */ }
```

约束：`getPreviewRotation`/`setPreviewRotation` 必须在 `commitConfig()` 之后调用（提前调用抛错）；180° 旋转 `windowSizeChange` 不触发，`display.on('change')` 能覆盖；重建相机（切镜/折展）时先 off 再 on 防重复注册。完整原理见 [预览旋转与拍照旋转是两回事](camera-output.md#预览旋转与拍照旋转是两回事)。

验证判据（真机）：

- 进相机页：`snapshot_display` 宽 < 高（竖屏）；hilog `OnSetPreferredOrientation ... orientation=8`；全文无 `EnterCompatibleModeView`；操作区在屏内。
- 物理旋转设备（横↔竖各一次）：窗口随之旋转，**预览画面内容两个方向都正立**。
- 退出相机页：`snapshot_display` 恢复竖屏。

## 退出恢复的时序

**先恢复方向再释放相机是错误顺序**：相机 Session 尚未注销时设置固定竖屏，系统会再次介入窗口方向，退出后应用停留在"横屏显示 + 居中竖窗"且系统不回滚。必须 `await releaseCamera()`（session stop → 输出流释放 → input close → session release 全链完成）之后再恢复方向；释放失败时方向恢复也应执行，避免应用卡在跟随状态。

## 排除项

- `setXComponentSurfaceRotation({ lock: true })` 常被误当成"锁定方向"的开关。官方语义：仅在**屏幕旋转过程中**生效，旋转完成后不再锁定；仅在屏幕旋转 90°（横竖屏切换）时生效；锁定旋转后的 Buffer 宽高需保持不变，否则拉伸。它只影响旋转过渡瞬间的行为：对照实验注释掉后强制横屏仍复现。相机页保留它的价值是旋转过渡不闪转，与本文问题无关。
- `deviceTypes` 是否含 `tablet` 不影响该行为：phone-only 与 phone+tablet 两种声明实测都复现。

## 关联

- 预览区尺寸与操作区布局：[预览占满屏幕挤出操作区 / 预览只占中间一小块](camera-preview-ui.md#预览占满屏幕挤出操作区--预览只占中间一小块)
- 旋转后的预览角度修正：[预览旋转与拍照旋转是两回事](camera-output.md#预览旋转与拍照旋转是两回事)
- 折叠形态的窗口方向策略：camera-fold.md 折展后的窗口方向策略
