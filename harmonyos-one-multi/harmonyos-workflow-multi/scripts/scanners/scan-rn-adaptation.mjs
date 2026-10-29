#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const target = path.resolve(process.argv[2] ?? '.');
const scannerPath = path.resolve(process.argv[1]);
const scannerTestPath = path.resolve(path.dirname(scannerPath), '../../evals/test-scan-rules.mjs');
const ignored = new Set([
  '.git', '.hg', '.idea', '.hvigor', 'node_modules', 'oh_modules',
  'dist', 'build', 'out', 'coverage', '.rnohmulti', '.onemulti', '.preview',
  // Bundled JS and packaged resources are build products, not sources.
  'rawfile'
]);
const buildProductName = /(?:^bundle\.harmony\.js$|\.bundle(?:\.js)?$|\.jsbundle$|\.hbc$)/i;
const sourceExtensions = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.ets',
  '.h', '.hpp', '.c', '.cc', '.cpp'
]);
// Harmony module config is scanned only for window-capability declarations.
const moduleConfigName = /^module\.json5$/i;
const generatedPath = /(?:^|[\\/])(?:generated|codegen)(?:[\\/]|$)/i;

const rnSignals = [
  /from\s+["']react-native["']/,
  /require\(\s*["']react-native["']\s*\)/,
  /from\s+["'][^"']*(?:react_native_(?:adaptive_layout|breakpoints|avoid_area)|react-native-orientation)[^"']*["']/i,
  /\b(?:useWindowDimensions|Dimensions|StyleSheet|NavigationContainer|FlatList)\b/
];
const hostSignals = [
  /\b(?:RNApp|RNInstance|RNSurface|RNInstancesCoordinator|RNOHCoreContext|RNOHContext)\b/,
  /\bonWindowSizeChange\b/,
  /from\s+["'][^"']*(?:rnoh|react-native-harmony)[^"']*["']/i
];
// Native-layer signals count only in Harmony sources (.ets/C/C++ or Harmony
// module paths). Words like Surface/NativeModules/Fabric are common in plain RN
// JS (e.g. react-native-paper <Surface>) and must not turn RN_ONLY into HYBRID.
const nativeSignals = [
  /\b(?:TurboModule|TurboModulesFactory|RNOHPackage|BaseView|ComponentJSIBinder|Fabric)\b/,
  /\b(?:Surface|XComponent|PointerEvent)\b/
];
// In JS/TS, only a codegen Spec defines a native contract.
const jsNativeSpecSignals = [
  /\bcodegenNativeComponent\s*[<(]/,
  /\bTurboModuleRegistry\.(?:get|getEnforcing)\s*[<(]/
];
const harmonyPath = /(^|[\\/])(?:entry|features?|har|harmony)[\\/].*?[\\/]src[\\/]main[\\/]/i;

const rules = [
  {
    id: 'physical-screen-layout',
    severity: 'high',
    layers: ['rn'],
    pattern: /Dimensions\.get\(\s*["']screen["']\s*\)/,
    message: '物理 screen 不能表达分屏/自由窗的应用窗口；普通布局应读取当前 window。'
  },
  {
    id: 'module-window-cache',
    severity: 'high',
    layers: ['rn'],
    pattern: /^(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*Dimensions\.get\(\s*["']window["']\s*\)(?:\.(?:width|height|scale|fontScale))?\s*;?\s*$/m,
    message: '发现模块级窗口值（任意变量名）；模块只执行一次，它会永久保存启动窗口，依赖它的 StyleSheet/派生值在折展、分屏后都不会更新。'
  },
  {
    id: 'module-window-destructure',
    severity: 'high',
    layers: ['rn'],
    pattern: /^(?:export\s+)?(?:const|let|var)\s*\{[^}\n]*\b(?:width|height|fontScale|scale)\b[^}\n]*\}\s*=\s*Dimensions\.get\(\s*["']window["']\s*\)/m,
    message: '发现模块级解构 window metrics；折展后依赖值和静态 StyleSheet 不会自动重新求值。'
  },
  {
    id: 'module-derived-metrics',
    severity: 'high',
    layers: ['rn'],
    pattern: /^(?:export\s+)?(?:const|let|var)\s+(?:rem|rpx|layoutScale|screenScale|screenWidth|windowWidth|deviceWidth|[A-Za-z_$][\w$]*(?:Rem|REM|Rpx|Scale|Ratio|Unit))\s*=\s*(?!Dimensions\.get\(\s*["']window["']\s*\)(?:\.\w+)?\s*[;\n])[^;\n]{0,180}(?:Dimensions\.get|screenWidth|windowWidth|deviceWidth)[^;\n]*/m,
    message: '发现模块级 rem/scale/设计单位派生；应由最新 application window 响应式计算并触发消费者 render。'
  },
  {
    id: 'static-responsive-styles',
    severity: 'medium',
    layers: ['rn'],
    pattern: /StyleSheet\.create\(\s*\{[\s\S]{0,2600}\b(?:rem|rpx|normalize|wp|hp|moderateScale|responsive(?:Screen)?(?:Width|Height|FontSize))\s*\(/i,
    message: '静态 StyleSheet 中发现响应式尺寸函数；核对该函数是否会随折展重算，非 hook 求值通常会固化启动尺寸。'
  },
  {
    id: 'static-stylesheet-window',
    severity: 'high',
    layers: ['rn'],
    pattern: /StyleSheet\.create\(\s*\{[\s\S]{0,2600}Dimensions\.get\(\s*["'](?:window|screen)["']\s*\)/i,
    message: '静态 StyleSheet 直接读取 Dimensions；窗口变化不会重新执行模块初始化，应把动态几何移到响应式 render/memo。'
  },
  {
    id: 'image-percent-aspect-ratio',
    severity: 'medium',
    layers: ['rn'],
    pattern: /<Image\b[^>]{0,600}\bstyle\s*=\s*\{\s*\{(?=[^}]{0,500}\bwidth\s*:\s*["']100%["'])(?=[^}]{0,500}\baspectRatio\s*:)[^}]*\}\s*\}/i,
    message: 'Image 自身同时依赖百分比宽度与 aspectRatio；先核对比例来源、父约束和锁定版本，必要时由有 maxWidth 的外层展示框持有可追溯比例、Image 填满容器。'
  },
  {
    id: 'image-unbounded-full-width-frame',
    severity: 'medium',
    layers: ['rn'],
    pattern: /<View\b[^>]{0,800}\bstyle\s*=\s*\{\s*\{(?=[^}]{0,650}\bwidth\s*:\s*["']100%["'])(?=[^}]{0,650}\baspectRatio\s*:)[^}]*\}\s*\}>[\s\S]{0,1000}<Image\b/i,
    requiresMissing: /\bmax(?:Width|Height)\s*:/i,
    missingScope: 'opening-tag',
    message: '全宽比例媒体框未见 maxWidth/maxHeight；手机比例可能在三折叠、平板或超宽窗口无限放大。复用项目内容区/token 限幅并居中，比例和阈值不得从缺陷代码或示例猜测。'
  },
  {
    id: 'flatlist-dynamic-columns-without-key',
    severity: 'medium',
    layers: ['rn'],
    pattern: /<FlatList\b[\s\S]{0,1800}\bnumColumns\s*=\s*\{\s*(?!\d+\s*\})[^}]+\}/i,
    requiresMissing: /<FlatList\b[\s\S]{0,1800}\bkey\s*=\s*\{[^}]+\}/i,
    message: 'FlatList 的 numColumns 是动态值但未见列表层 key；在锁定 RNOH 版本验证是否需要仅重挂列表呈现层，并保持业务锚点/状态在外部。'
  },
  {
    id: 'list-window-geometry-audit',
    severity: 'medium',
    layers: ['rn'],
    pattern: /(?:getItemLayout|snapToInterval|initialScrollIndex)[\s\S]{0,700}Dimensions\.get\(\s*["'](?:window|screen)["']\s*\)|Dimensions\.get\(\s*["'](?:window|screen)["']\s*\)[\s\S]{0,700}(?:getItemLayout|snapToInterval|initialScrollIndex)/i,
    message: '列表测量/滚动几何与 Dimensions 读取耦合；确认它随当前 window/columns 重算而非缓存启动值，并同步更新可见锚点。'
  },
  {
    id: 'scrollview-fixed-viewport-height',
    severity: 'medium',
    layers: ['rn'],
    pattern: /<ScrollView\b[^>]{0,700}\b(?:style|contentContainerStyle)\s*=\s*\{\s*\{[^}]{0,500}(?:height\s*:\s*(?:[4-9]\d{2}|[1-9]\d{3,})\b|Dimensions\.get\(\s*["']screen["']\s*\)\.height)/i,
    message: 'ScrollView 附近发现固定大高度或物理屏高；应由有界父链提供 viewport，并区分 style 与 contentContainerStyle。'
  },
  {
    id: 'empty-memo-responsive-capture',
    severity: 'medium',
    layers: ['rn'],
    pattern: /use(?:Memo|Callback)\(\s*[\s\S]{0,800}(?:StyleSheet\.create|\brem\s*\(|\brpx\s*\(|\bnormalize\s*\(|\b(?:width|height|breakpoint|layoutScale)\b)[\s\S]{0,240},\s*\[\s*\]\s*\)/i,
    message: '空依赖 memo/callback 可能捕获启动时 width、breakpoint 或 rem；核对依赖与列表 renderItem/getItemLayout。'
  },
  {
    id: 'global-scale-mutation',
    severity: 'medium',
    layers: ['rn'],
    pattern: /Dimensions\.addEventListener\(\s*["']change["'][\s\S]{0,1000}\b(?:rem|rpx|layoutScale|screenScale)\s*=/i,
    message: 'Dimensions 回调只修改全局 scale/rem 不会自动触发 React render；需要 state、hook 或可订阅 Context。'
  },
  {
    id: 'fontscale-drives-layout',
    severity: 'high',
    layers: ['rn'],
    // Case-sensitive keys with word boundaries: lineHeight scaling with fontScale is
    // legitimate text sizing and must not match `height`.
    pattern: /\b(?:width|height|minWidth|maxWidth|minHeight|maxHeight|margin\w*|padding\w*|gap|rowGap|columnGap|flexBasis|top|bottom|left|right|start|end|borderRadius)\s*:\s*[^,;}\n]{0,120}\bfontScale\b/,
    message: 'fontScale 正在驱动非文字布局；它表示用户文字偏好，不是页面 rem 或窗口比例。'
  },
  {
    id: 'double-font-scaling',
    severity: 'medium',
    layers: ['rn'],
    pattern: /fontSize\s*:\s*[^,;}\n]{0,120}\bfontScale\b/i,
    message: 'fontSize 显式乘 fontScale 可能与 Text 默认系统缩放叠加；检查是否发生双重缩放。'
  },
  {
    id: 'global-disable-font-scaling',
    severity: 'medium',
    layers: ['rn'],
    pattern: /(?:Text|TextInput)\.defaultProps[\s\S]{0,300}allowFontScaling\s*=\s*false/i,
    message: '发现全局关闭字体缩放；不要用它掩盖容器、派生单位或版本型文本测量问题。'
  },
  {
    id: 'module-animation-dimension',
    severity: 'high',
    layers: ['rn'],
    pattern: /^(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*new\s+Animated\.Value\([^;\n]{0,240}Dimensions\.get\(\s*["'](?:window|screen)["']/m,
    message: '发现模块级 Animated.Value 使用启动窗口；折展或自由窗变化后动画端点可能陈旧。'
  },
  {
    id: 'native-driver-layout-property',
    severity: 'medium',
    layers: ['rn'],
    pattern: /(?:width|height|top|right|bottom|left|flexBasis)\s*:\s*[A-Za-z_$][\w$.]*[\s\S]{0,1200}useNativeDriver\s*:\s*true/i,
    message: '同一区域发现动画布局属性与 Native Driver；Native Driver 不支持宽高/Flexbox/position，需核对实际 animated style。'
  },
  {
    id: 'absolute-physical-horizontal-edge',
    severity: 'medium',
    layers: ['rn'],
    pattern: /(?:position\s*:\s*["']absolute["'][\s\S]{0,320}\b(?:left|right)\s*:|\b(?:left|right)\s*:[\s\S]{0,320}position\s*:\s*["']absolute["'])/i,
    message: '绝对定位使用 left/right；RN 默认在 RTL 下交换左右（I18nManager.doLeftAndRightSwapInRTL，RNOH 需按锁定版本核验）。先确认开关，再判断它是逻辑边还是必须贴物理边，并审计 resize 和动画方向。'
  },
  {
    id: 'builtin-safe-area-view',
    severity: 'medium',
    layers: ['rn'],
    pattern: /import\s*\{[^}]*\bSafeAreaView\b[^}]*\}\s*from\s*["']react-native["']/,
    message: '使用 RN 内置 SafeAreaView：它在 RN 0.72 等兼容线上只对 iOS 生效，较新上游版本已废弃；RNOH 项目按锁定版本核对 safe-area-context 或现有平台方案。'
  },
  {
    id: 'device-type-layout',
    severity: 'medium',
    layers: ['rn'],
    pattern: /\bPlatform\.(?:isPad|isTV)\b/,
    message: '设备类型不能替代当前应用窗口；仅允许用于经验证的能力或资源默认值。'
  },
  {
    id: 'pixel-ratio-layout',
    severity: 'medium',
    layers: ['rn'],
    pattern: /\b(?:width|height|minWidth|maxWidth|minHeight|maxHeight|fontSize|lineHeight|margin\w*|padding\w*|gap|rowGap|columnGap|flexBasis|borderRadius)\s*:\s*[^,;}\n]{0,80}PixelRatio\.(?:get|getPixelSizeForLayoutSize)\s*\(/,
    message: 'PixelRatio 可能正在缩放布局盒或字体；确认它只用于资源像素或明确的单位转换。'
  },
  {
    id: 'root-remount-on-size',
    severity: 'high',
    layers: ['rn'],
    pattern: /<(?:NavigationContainer|Provider|[A-Za-z_$][\w$]*(?:Root|App))\b[^>]*\bkey\s*=\s*\{[^}]*(?:width|height|breakpoint|orientation|posture)[^}]*\}/i,
    message: '发现根/导航/Provider 随尺寸 key 重挂；这会丢失 route、表单和业务状态。'
  },
  {
    id: 'native-remount-on-size',
    severity: 'high',
    layers: ['rn'],
    pattern: /<[A-Za-z_$][\w$.]*(?:Video|Map|Surface|Native)[\w$.]*\b[^>]*\bkey\s*=\s*\{[^}]*(?:width|height|breakpoint|orientation|posture)[^}]*\}/i,
    message: '原生组件似乎随窗口 key 重建；优先消费布局提交并保持业务状态。'
  },
  {
    id: 'dimensions-listener-without-remove',
    severity: 'medium',
    layers: ['rn'],
    pattern: /Dimensions\.addEventListener\(\s*["']change["']/,
    // Only the subscription returned by addEventListener counts; an unrelated
    // `.remove()` elsewhere in the file must not suppress this audit.
    requiresMissing: /(?:const|let|var)\s+([\w$]+)\s*=\s*Dimensions\.addEventListener\([\s\S]*?\b\1\s*(?:\?\.|\.)\s*remove\s*\(|\b([\w$]+)\.current\s*=\s*Dimensions\.addEventListener\([\s\S]*?\b\2\.current\s*(?:\?\.|\.)\s*remove\s*\(|Dimensions\.removeEventListener\s*\(/,
    message: '发现 Dimensions 订阅但同文件未见 remove；确认 subscription owner 与卸载清理。'
  },
  {
    id: 'rnoh-adaptive-deep-import',
    severity: 'medium',
    layers: ['rn'],
    pattern: /(?:from\s*|require\(\s*)["']@hadss\/react_native_(?:adaptive_layout|breakpoints|avoid_area)\/src(?:\/[^"']*)?["']/,
    message: '发现官方社区多设备包的 src 深路径 import；按 RN-13 核对实际 public exports、锁定版本和迁移风险，不从旧 README 固化内部路径。'
  },
  {
    id: 'avoid-area-page-listener',
    severity: 'medium',
    layers: ['rn'],
    pattern: /\bAvoid\.addAvoidAreaListener\s*\(/,
    message: '发现页面直接注册 avoid-area listener；审计版本为模块级单 subscription，应由应用级唯一 provider 持有、换算单位并向多消费者分发。'
  },
  {
    id: 'avoid-listener-without-remove',
    severity: 'high',
    layers: ['rn'],
    pattern: /\bAvoid\.addAvoidAreaListener\s*\(/,
    requiresMissing: /\bAvoid\.removeAvoidAreaListener\s*\(/,
    message: '发现 Avoid 订阅但同文件未见 remove；确认唯一 owner 在卸载时幂等清理，并保留注册时的回调/订阅引用。'
  },
  {
    id: 'avoid-area-without-unit-boundary',
    severity: 'medium',
    layers: ['rn'],
    pattern: /\bAvoid\.getWindowAvoidArea\s*\(/,
    requiresMissing: /\b(?:PixelRatio\.get|pxToVp|px2vp|convertPixelToVp|toLayoutUnit)\s*\(/i,
    message: '读取 Avoid 区域但未见单位转换边界；返回单位随包/版本核验，进入 RN style 前只转换一次并记录证据。'
  },
  {
    id: 'duplicate-keyboard-avoidance-owner',
    severity: 'high',
    layers: ['rn'],
    pattern: /(?:KeyboardAvoidingView[\s\S]{0,2400}(?:AvoidAreaType\.)?TYPE_KEYBOARD|(?:AvoidAreaType\.)?TYPE_KEYBOARD[\s\S]{0,2400}KeyboardAvoidingView)/i,
    message: '同文件同时出现 KeyboardAvoidingView 与 Avoid TYPE_KEYBOARD；核对 Host resize、Sheet 和输入页，仅保留一个键盘避让 owner。'
  },
  {
    id: 'fold-page-listener',
    severity: 'medium',
    layers: ['rn'],
    pattern: /\bFold\.(?:addFoldListener|removeFoldListener)\s*\(/,
    message: '发现页面直接管理 Fold listener；确认是否确需半折/折痕，并验证多消费者、同引用释放、方向副作用和 px→RN layout unit。'
  },
  {
    id: 'fold-listener-without-initial-snapshot',
    severity: 'high',
    layers: ['rn'],
    pattern: /\bFold\.addFoldListener\s*\(/,
    requiresMissing: /\bFold\.getFoldStatus\s*\(/,
    message: 'Fold 只订阅变化但未读取初始快照；冷启动可能停留在默认姿态，应按锁定 API 先订阅再取快照并处理时序。'
  },
  {
    id: 'fold-listener-without-remove',
    severity: 'high',
    layers: ['rn'],
    pattern: /\bFold\.addFoldListener\s*\(/,
    requiresMissing: /\bFold\.removeFoldListener\s*\(/,
    message: '发现 Fold 订阅但同文件未见 remove；确认唯一 provider 持有相同 callback/subscription，并在最后消费者释放时清理。'
  },
  {
    id: 'fold-status-numeric-comparison',
    severity: 'high',
    layers: ['rn'],
    pattern: /(?:foldStatus|foldState|posture)\s*={2,3}\s*\d+|\d+\s*={2,3}\s*(?:foldStatus|foldState|posture)/i,
    message: '折叠状态正在与裸数字比较；实际 enum 形态依赖锁定包版本，应使用导出 enum/适配器归一化，禁止字符串与数字跨类型直比。'
  },
  {
    id: 'orientation-listener-without-remove',
    severity: 'high',
    layers: ['rn'],
    pattern: /\bOrientation\.add(?:Orientation|DeviceOrientation)Listener\s*\(/,
    requiresMissing: /\bOrientation\.remove(?:Orientation|DeviceOrientation)Listener\s*\(/,
    message: '发现方向订阅但同文件未见成对 remove；保留同一 handler 引用并在 owner 卸载时清理。'
  },
  {
    id: 'orientation-lock-without-restore',
    severity: 'medium',
    layers: ['rn'],
    pattern: /\b(?:Orientation\.(?:lockToPortrait|lockToLandscape)|setPreferredOrientation)\s*\(/,
    requiresMissing: /\b(?:Orientation\.unlockAllOrientations|restorePreferredOrientation|setPreferredOrientation\s*\([^)]*(?:UNSPECIFIED|AUTO|FOLLOW|USER_ROTATION))/i,
    message: '发现运行时方向锁定但同文件未见恢复路径；页面退出/模式变化时恢复先前策略，不能把 lockToPortrait 当通用 cleanup。'
  },
  {
    id: 'fixed-large-dimension',
    severity: 'medium',
    layers: ['rn'],
    pattern: /\b(?:width|minWidth|height|minHeight)\s*:\s*(?:[4-9]\d{2}|[1-9]\d{3,})\b/,
    message: '发现较大固定尺寸；检查最窄窗口、大字体和滚动路径。'
  },
  {
    id: 'display-size-to-host',
    severity: 'high',
    layers: ['host', 'native'],
    pattern: /(?:getDefaultDisplaySync|getAllDisplays|getDefaultDisplay)\s*\([^)]*\)[\s\S]{0,500}(?:RNInstance|RNSurface|Coordinator|onWindowSizeChange)/i,
    message: '疑似把物理 display 尺寸传给 RNOH；应确认使用 owning application window。'
  },
  {
    id: 'flexwrap-equal-percent-columns',
    severity: 'medium',
    layers: ['rn'],
    // Equal percentage column widths whose N shares reach 100% sit on the wrap
    // boundary; 33.33% x 3 = 99.99% does not and is left alone. Only width and
    // flexBasis count, so left/top: '50%' and the like are not flagged.
    pattern: /\b(?:width|flexBasis)\s*:[^,;}\n]*?(?:["'`](\d+(?:\.\d+)?)%["'`]|\$\{\s*100\s*\/\s*[\w$.]+\s*\}%)/,
    when: (match, code) => {
      if (!/\bflexWrap\s*:\s*["']wrap["']/.test(code)) return false;
      if (match[1] === undefined) return true;
      const value = Number(match[1]);
      for (let n = 2; n <= 12; n += 1) {
        if (Math.abs(value - 100 / n) <= 0.01 && value * n >= 99.995) return true;
      }
      return false;
    },
    message: 'flexWrap 容器中出现 N 等分且之和恰好 100% 的百分比列宽；它处在换行边界上，部分窗口（常见于非整数 dp）会让末列掉到下一行。按 harmonyos-rn-multi 的 references/responsive-layout.md「等宽多列栅格」改写，并用 harmonyos-rn-multi 的 scripts/assert-layout.mjs 验收。'
  },
  {
    id: 'module-window-mode-restricted',
    severity: 'medium',
    layers: ['config'],
    pattern: /["']?supportWindowMode["']?\s*:\s*\[([^\]]*)\]/,
    when: (match) => !/["']split["']/.test(match[1]) || !/["']floating["']/.test(match[1]),
    message: 'Ability 显式限制了 supportWindowMode，缺少 split 或 floating；分屏/自由窗口不会出现，相关验证矩阵无法执行。是否放开是产品决策，见 harmonyos-rn-multi 的 references/window-and-continuity.md「窗口能力声明」。'
  },
  {
    id: 'module-orientation-locked',
    severity: 'medium',
    layers: ['config'],
    pattern: /["']?orientation["']?\s*:\s*["'](?:portrait|landscape|portrait_inverted|landscape_inverted)["']/,
    message: 'Ability 固定了方向；旋转和部分大屏/折叠布局不会出现。确认这是产品决策，并在验证矩阵中注明。'
  },
  {
    id: 'module-device-types-without-large-screen',
    severity: 'medium',
    layers: ['config'],
    pattern: /["']?deviceTypes["']?\s*:\s*\[([^\]]*)\]/,
    when: (match) => !/["'](?:tablet|2in1)["']/.test(match[1]),
    message: 'deviceTypes 未声明 tablet 或 2in1；应用不会安装到这些形态。确认目标设备范围，再决定是否需要大屏适配验证。'
  },
  {
    id: 'manual-generated-edit-risk',
    severity: 'medium',
    layers: ['native'],
    pathPattern: generatedPath,
    pattern: /./,
    firstOnly: true,
    // Reported once per generated directory, not once per generated file.
    perGeneratedRoot: true,
    message: '扫描到生成目录源码；不要把适配修改落在 Codegen 生成物。'
  }
];

const warnings = [];

function collectFiles(entry, files = []) {
  if ([scannerPath, scannerTestPath].includes(path.resolve(entry))) return files;
  let stat;
  try {
    stat = fs.lstatSync(entry);
  } catch (error) {
    warnings.push(`无法读取 ${entry}: ${error.message}`);
    return files;
  }

  if (stat.isSymbolicLink()) return files;
  if (stat.isFile()) {
    if (buildProductName.test(path.basename(entry))) return files;
    if (sourceExtensions.has(path.extname(entry).toLowerCase()) || moduleConfigName.test(path.basename(entry))) {
      files.push(entry);
    }
    return files;
  }
  if (!stat.isDirectory()) return files;

  let names;
  try {
    names = fs.readdirSync(entry);
  } catch (error) {
    warnings.push(`无法遍历 ${entry}: ${error.message}`);
    return files;
  }
  for (const name of names) {
    if (!ignored.has(name)) collectFiles(path.join(entry, name), files);
  }
  return files;
}

const cExtensions = ['.h', '.hpp', '.c', '.cc', '.cpp'];
const jsExtensions = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'];

function classify(file, source) {
  const extension = path.extname(file).toLowerCase();
  const layers = new Set();
  if (moduleConfigName.test(path.basename(file))) return new Set(['config']);
  const harmonySource = extension === '.ets' || cExtensions.includes(extension) || harmonyPath.test(file);
  if (jsExtensions.includes(extension) && rnSignals.some((pattern) => pattern.test(source))) layers.add('rn');
  if (harmonySource && hostSignals.some((pattern) => pattern.test(source))) layers.add('host');
  if (harmonySource && nativeSignals.some((pattern) => pattern.test(source))) layers.add('native');
  if (jsExtensions.includes(extension) && jsNativeSpecSignals.some((pattern) => pattern.test(source))) layers.add('native');
  if (cExtensions.includes(extension)) layers.add('native');
  return layers;
}

function readRecord(file) {
  try {
    const source = fs.readFileSync(file, 'utf8');
    const code = withoutComments(source);
    return { file, source, code, layers: classify(file, code), generated: generatedPath.test(file) };
  } catch (error) {
    warnings.push(`无法读取 ${file}: ${error.message}`);
    return null;
  }
}

function lineAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

function matches(source, pattern) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  return [...source.matchAll(new RegExp(pattern.source, flags))];
}

// A small same-file audit, not a TS parser or a Yoga constraint solver. Keep
// window-derived findings at MEDIUM: imported styles/custom hooks and scope
// shadowing need review. Static-source findings are HIGH: RN 0.72 / RNOH
// 0.72.53 Image.harmony.js merges the asset's {width, height} before props.style.
function quotedEnd(source, start) {
  const quote = source[start];
  for (let i = start + 1; i < source.length; i += 1) {
    if (source[i] === '\\') { i += 1; continue; }
    if (source[i] === quote) return i;
  }
  return source.length - 1;
}

function withoutComments(source) {
  const chars = source.split('');
  for (let i = 0; i < source.length; i += 1) {
    if ('"\'`'.includes(source[i])) { i = quotedEnd(source, i); continue; }
    if (source.slice(i, i + 2) === '//') {
      while (i < source.length && source[i] !== '\n') chars[i++] = ' ';
    } else if (source.slice(i, i + 2) === '/*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end < 0 ? source.length : end + 2;
      while (i < stop) { if (source[i] !== '\n') chars[i] = ' '; i += 1; }
      i -= 1;
    }
  }
  return chars.join('');
}

function expressionEnd(source, start, separators) {
  const stack = [];
  const closing = { '(': ')', '[': ']', '{': '}' };
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if ('"\'`'.includes(char)) { i = quotedEnd(source, i); continue; }
    if (!stack.length && separators.includes(char)) return i;
    if (closing[char]) stack.push(closing[char]);
    else if (char === stack.at(-1)) stack.pop();
  }
  return source.length;
}

function parts(source) {
  const result = [];
  for (let start = 0; start < source.length;) {
    const end = expressionEnd(source, start, ',');
    result.push(source.slice(start, end).trim());
    start = end + 1;
  }
  return result;
}

function objectFields(expression) {
  const text = expression.trim();
  if (!text.startsWith('{')) return new Map();
  const end = expressionEnd(text, 1, '}');
  return new Map(parts(text.slice(1, end)).flatMap((part) => {
    const field = part.match(/^([\w$]+)\s*:\s*([\s\S]+)$/);
    return field ? [[field[1], field[2]]] : [];
  }));
}

function computedMediaFindings(rawSource) {
  const source = withoutComments(rawSource);
  const definitions = new Map();
  for (const match of matches(source, /\b(?:const|let|var)\s+([\w$]+)(?:\s*:\s*[^=;\n]+)?\s*=\s*/g)) {
    const start = match.index + match[0].length;
    definitions.set(match[1], source.slice(start, expressionEnd(source, start, ';\n')));
  }
  // ES default imports of image files are static assets, same as require().
  for (const match of matches(source, /\bimport\s+([\w$]+)\s+from\s*(['"])([^'"]+\.(?:png|jpe?g|webp|gif|bmp))\2/gi)) {
    definitions.set(match[1], `require('${match[3]}')`);
  }
  // Window destructuring, including aliases, is a dependency root.
  for (const match of matches(source, /\b(?:const|let|var)\s*\{([^}]+)\}\s*=\s*(useWindowDimensions\s*\(\s*\)|Dimensions\.get\(\s*['"]window['"]\s*\))/g)) {
    for (const field of parts(match[1])) {
      const alias = field.match(/^(width|height)\s*(?::\s*([\w$]+))?$/);
      if (alias) definitions.set(alias[2] ?? alias[1], match[2]);
    }
  }
  for (const [name, expression] of [...definitions]) {
    if (!/^StyleSheet\.create\s*\(/.test(expression)) continue;
    const start = expression.indexOf('{');
    for (const [field, value] of objectFields(expression.slice(start))) {
      definitions.set(`${name}.${field}`, value);
    }
  }
  function expanded(expression, seen = new Set()) {
    return expression.replace(/\b[\w$]+(?:\.[\w$]+)?\b/g, (name) => {
      const root = name.split('.')[0];
      if (!definitions.has(name) && name.includes('.') && definitions.has(root) && !seen.has(root) && seen.size <= 16) {
        return `(${expanded(definitions.get(root), new Set([...seen, root]))})${name.slice(root.length)}`;
      }
      if (seen.has(name) || !definitions.has(name) || seen.size > 16) return name;
      return `(${expanded(definitions.get(name), new Set([...seen, name]))})`;
    });
  }
  function windowDerived(expression) {
    return /\b(?:useWindowDimensions|useAppSize|getAppSize)\s*\(|Dimensions\.get\(\s*['"]window['"]/.test(expanded(expression));
  }
  function cappedWidth(expression, seen = new Set()) {
    const text = expression.trim();
    if (definitions.has(text) && !seen.has(text)) {
      return cappedWidth(definitions.get(text), new Set([...seen, text]));
    }
    // Only a min with at least one non-window argument is a cap candidate.
    // Math.min(width, width * .8) is still unbounded.
    const call = text.match(/^Math\.min\s*\(/);
    if (!call) return false;
    const end = expressionEnd(text, call[0].length, ')');
    return parts(text.slice(call[0].length, end)).some((arg) =>
      !windowDerived(arg) && !/^(?:0|-\d|Infinity|NaN|null|undefined)\b/.test(arg));
  }
  function styleFields(expression, seen = new Set()) {
    const text = expression.trim();
    if (text.startsWith('[')) {
      const end = expressionEnd(text, 1, ']');
      return new Map(parts(text.slice(1, end)).flatMap((part) => [...styleFields(part, seen)]));
    }
    if (definitions.has(text) && !seen.has(text)) {
      return styleFields(definitions.get(text), new Set([...seen, text]));
    }
    return objectFields(text);
  }
  // A single static asset (not an array of sources) carries intrinsic size.
  function staticSource(tag) {
    const attr = tag.match(/\bsource\s*=\s*\{/);
    if (!attr) return false;
    const start = attr.index + attr[0].length;
    let text = tag.slice(start, expressionEnd(tag, start, '}')).trim();
    for (let depth = 0; depth < 8; depth += 1) {
      const member = text.match(/^([\w$]+)\.([\w$]+)$/);
      if (definitions.has(text)) text = definitions.get(text).trim();
      else if (member && definitions.has(member[1])) text = objectFields(definitions.get(member[1])).get(member[2])?.trim() ?? '';
      else break;
    }
    return /^require\s*\(/.test(text);
  }
  const result = [];
  for (const match of matches(source, /<(Image|View)\b/g)) {
    const end = expressionEnd(source, match.index + match[0].length, '>');
    const tag = source.slice(match.index, end);
    if (match[1] === 'View' && !/<Image\b/.test(source.slice(end, end + 1500))) continue;
    const style = tag.match(/\bstyle\s*=\s*\{/);
    if (!style) continue;
    const start = style.index + style[0].length;
    const styleText = tag.slice(start, expressionEnd(tag, start, '}'));
    const fields = styleFields(styleText);
    if (match[1] === 'Image' && staticSource(tag)) {
      // RN/RNOH Image merges the asset's {width, height} before props.style.
      // Unless the style sets both, the asset keeps the other side fixed and
      // Yoga ignores aspectRatio (width-only and height-only both fail).
      if (fields.has('aspectRatio') && !(fields.has('width') && fields.has('height'))) {
        result.push({ index: match.index, kind: 'static-aspect-ratio' });
      } else if (/\babsoluteFill(?:Object)?\b/.test(expanded(styleText)) && (!fields.has('width') || !fields.has('height'))) {
        result.push({ index: match.index, kind: 'static-absolute-fill' });
      }
    } else if (match[1] === 'Image' && fields.has('aspectRatio') && !(fields.has('width') && fields.has('height'))) {
      // Network and multi-source arrays carry no intrinsic size, so aspectRatio
      // works here; flag it only as the recommended uniform style (MEDIUM).
      result.push({ index: match.index, kind: 'image-aspect-ratio' });
    }
    const width = fields.get('width');
    if (!width || !windowDerived(width) || (!fields.has('aspectRatio') && !fields.has('height'))) continue;
    const maxWidth = fields.get('maxWidth');
    const finiteCap = maxWidth && !windowDerived(maxWidth) && !/^(?:undefined|null|Infinity|NaN|0)$/.test(maxWidth.trim());
    if (finiteCap || cappedWidth(width)) continue;
    result.push({ index: match.index, kind: 'window-derived' });
  }
  return result;
}

// Exit codes: 0 = no HIGH finding, 1 = HIGH finding, 2 = scanner failure.
process.on('uncaughtException', (error) => {
  console.error(`Scanner failed: ${error.stack ?? error}`);
  process.exit(2);
});

if (!fs.existsSync(target)) {
  console.error(`Target does not exist: ${target}`);
  process.exit(2);
}

const records = collectFiles(target).map(readRecord).filter(Boolean);
const counts = { rn: 0, host: 0, native: 0 };
for (const record of records) {
  // Codegen output and module config do not decide which layers the project provides.
  if (record.generated) continue;
  for (const layer of record.layers) {
    if (layer in counts) counts[layer] += 1;
  }
}
const activeLayers = Object.entries(counts).filter(([, count]) => count > 0).map(([layer]) => layer);
const inputMode = activeLayers.length > 1
  ? 'HYBRID'
  : activeLayers[0] === 'rn'
    ? 'RN_ONLY'
    : activeLayers[0] === 'host'
      ? 'HOST_ONLY'
      : activeLayers[0] === 'native'
        ? 'NATIVE_ONLY'
        : 'INSUFFICIENT';

console.log(`Input mode candidate: ${inputMode} (RN: ${counts.rn}, Host: ${counts.host}, Native: ${counts.native})`);
console.log('Confirm this candidate with lockfiles, project structure, imports, registration, and the actual call chain.');

const mediaFindingKinds = {
  'window-derived': {
    id: 'image-window-derived-size-audit',
    severity: 'medium',
    message: '媒体宽度由当前 window 经同文件变量/样式派生，未见自身有效限宽候选；核对父内容区、样式覆盖和超宽/宽短窗口几何。固定比例+有效限幅可保持，无需强制断点；未命中也不等于视觉验收通过。',
  },
  'static-aspect-ratio': {
    id: 'image-static-source-aspect-ratio',
    severity: 'high',
    message: '静态 require()/import 资源的 Image 用 aspectRatio 推导另一边（未同时给 width 和 height）：Image 会先合并资源固有 {width, height}，未覆盖的一边被定死后 Yoga 忽略 aspectRatio，各窗口比例不同。由有界父 View 持有比例，Image 显式 width/height: \'100%\'。',
  },
  'image-aspect-ratio': {
    id: 'image-aspect-ratio-without-size',
    severity: 'medium',
    message: '非静态资源（网络 uri、多分辨率数组等）的 Image 自身用 aspectRatio 推导另一边。这类 source 不合并固有尺寸，aspectRatio 本身生效，不是比例错误根因；推荐统一写法为有界父 View 持有比例、Image 显式 width/height: \'100%\'，便于与静态资源一致。若比例异常，先查父容器约束和样式覆盖。',
  },
  'static-absolute-fill': {
    id: 'image-static-source-absolute-fill',
    severity: 'high',
    message: '静态 require() 资源的 Image 只靠 absoluteFill 填充：资源固有 width/height 优先于 left/right/top/bottom，图片按资源尺寸渲染而不是填满容器。补上显式 width/height: \'100%\'。',
  },
};
const findings = [];
const findingKeys = new Set();
for (const record of records) {
  if (record.layers.has('rn')) {
    for (const match of computedMediaFindings(record.source)) {
      findings.push({
        ...mediaFindingKinds[match.kind],
        file: path.relative(process.cwd(), record.file),
        line: lineAt(record.source, match.index),
      });
    }
  }
  for (const rule of rules) {
    if (rule.perGeneratedRoot) {
      if (!record.generated) continue;
    } else if (!rule.layers.some((layer) => record.layers.has(layer))) {
      continue;
    }
    if (rule.pathPattern && !rule.pathPattern.test(record.file)) continue;
    // Comments are blanked with spaces, so indexes and line numbers are unchanged.
    const code = record.code;
    if (!rule.missingScope && rule.requiresMissing?.test(code)) continue;
    const ruleMatches = matches(code, rule.pattern);
    for (const match of rule.firstOnly ? ruleMatches.slice(0, 1) : ruleMatches) {
      if (rule.when && !rule.when(match, code)) continue;
      if (rule.missingScope === 'opening-tag') {
        const end = expressionEnd(code, match.index, '>');
        if (rule.requiresMissing.test(code.slice(match.index, end))) continue;
      }
      const line = lineAt(record.source, match.index);
      const generatedRoot = rule.perGeneratedRoot
        ? record.file.match(/^(.*?[\\/](?:generated|codegen))(?:[\\/]|$)/i)?.[1] ?? record.file
        : null;
      const key = generatedRoot ? `${rule.id}:${generatedRoot}` : `${rule.id}:${record.file}:${line}`;
      if (findingKeys.has(key)) continue;
      findingKeys.add(key);
      findings.push({
        id: rule.id,
        severity: rule.severity,
        message: rule.message,
        file: path.relative(process.cwd(), record.file),
        line
      });
    }
  }
}

for (const finding of findings) {
  console.log(`${finding.severity.toUpperCase()} ${finding.id} ${finding.file}:${finding.line}`);
  console.log(`  ${finding.message}`);
}
for (const warning of warnings) console.warn(`WARN ${warning}`);

console.log(`Scanned ${records.length} relevant file(s); found ${findings.length} RNOH adaptation risk(s).`);
process.exit(findings.some(({ severity }) => severity === 'high') ? 1 : 0);
