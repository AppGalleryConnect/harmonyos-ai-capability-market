#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname: pathname percent-encodes spaces and non-ASCII paths.
const scanner = fileURLToPath(new URL('../scripts/scanners/scan-rn-adaptation.mjs', import.meta.url));
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rnoh-scan-rules-'));
const safeFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rnoh-scan-safe-'));

const cases = {
  'image.tsx': `
    import { Image } from 'react-native';
    export const BadImage = () => (
      <Image source={{ uri: 'x' }} style={{ width: '100%', aspectRatio: 1.5 }} />
    );
  `,
  'image-wide-unbounded.tsx': `
    import { Image, View } from 'react-native';
    export const UnboundedBanner = ({ source }) => (
      <View style={{ width: '100%', aspectRatio: 3 }}>
        <Image source={source} style={{ width: '100%', height: '100%' }} />
      </View>
    );
  `,
  'image-computed-width.tsx': `
    import { Image, useWindowDimensions } from 'react-native';
    export function Banner({ source }) {
      const { width } = useWindowDimensions();
      const hPadding = Math.round(width * 0.06);
      const bannerWidth = width - hPadding;
      return <Image source={source} style={{ width: bannerWidth, aspectRatio: 0.94 / 0.26 }} />;
    }
  `,
  'flat-list.tsx': `
    import { FlatList } from 'react-native';
    export const BadList = ({ columns, data }) => (
      <FlatList data={data} numColumns={columns} renderItem={() => null} />
    );
  `,
  'list-geometry.tsx': `
    import { Dimensions, FlatList } from 'react-native';
    const itemWidth = Dimensions.get('window').width / 2;
    const getItemLayout = (_, index) => ({ length: itemWidth, offset: itemWidth * index, index });
    export const BadGeometry = ({ data }) => <FlatList data={data} getItemLayout={getItemLayout} />;
  `,
  'scroll.tsx': `
    import { ScrollView } from 'react-native';
    export const BadScroll = () => <ScrollView style={{ height: 800 }} />;
  `,
  'avoid.tsx': `
    import { KeyboardAvoidingView } from 'react-native';
    import { Avoid, AvoidAreaType } from '@hadss/react_native_avoid_area';
    Avoid.addAvoidAreaListener(() => {});
    const area = Avoid.getWindowAvoidArea(AvoidAreaType.TYPE_KEYBOARD);
    export const BadAvoid = () => <KeyboardAvoidingView>{area.bottomRect.height}</KeyboardAvoidingView>;
  `,
  'fold.tsx': `
    import { Fold } from '@hadss/react_native_adaptive_layout';
    let foldStatus = 0;
    Fold.addFoldListener((next) => { foldStatus = next; });
    export const halfFolded = foldStatus === 3;
  `,
  'orientation.tsx': `
    import Orientation from 'react-native-orientation';
    Orientation.addOrientationListener(() => {});
    Orientation.lockToLandscape();
  `,
};

try {
  for (const [name, source] of Object.entries(cases)) {
    fs.writeFileSync(path.join(fixtureRoot, name), source);
  }

  const result = spawnSync(process.execPath, [scanner, fixtureRoot], {
    encoding: 'utf8',
  });
  const output = `${result.stdout}\n${result.stderr}`;
  const expectedRuleIds = [
    'image-percent-aspect-ratio',
    'image-unbounded-full-width-frame',
    'image-window-derived-size-audit',
    'flatlist-dynamic-columns-without-key',
    'list-window-geometry-audit',
    'scrollview-fixed-viewport-height',
    'avoid-listener-without-remove',
    'avoid-area-without-unit-boundary',
    'duplicate-keyboard-avoidance-owner',
    'fold-listener-without-initial-snapshot',
    'fold-listener-without-remove',
    'fold-status-numeric-comparison',
    'orientation-listener-without-remove',
    'orientation-lock-without-restore',
  ];

  for (const ruleId of expectedRuleIds) {
    assert.match(output, new RegExp(`\\b${ruleId}\\b`), `missing ${ruleId}\n${output}`);
  }

  fs.writeFileSync(path.join(safeFixtureRoot, 'safe.tsx'), `
    import { FlatList, Image, ScrollView, View, useWindowDimensions } from 'react-native';
    import Orientation from 'react-native-orientation';
    import { Fold } from '@hadss/react_native_adaptive_layout';
    import { Avoid, AvoidAreaType } from '@hadss/react_native_avoid_area';

    const onFold = () => {};
    const onOrientation = () => {};
    const toLayoutUnit = (area) => area;
    const foldStatus = Fold.getFoldStatus();
    Fold.addFoldListener(onFold);
    Fold.removeFoldListener(onFold);
    Orientation.addOrientationListener(onOrientation);
    Orientation.removeOrientationListener(onOrientation);
    Orientation.lockToLandscape();
    Orientation.unlockAllOrientations();
    Avoid.addAvoidAreaListener(() => {});
    Avoid.removeAvoidAreaListener();
    const area = toLayoutUnit(Avoid.getWindowAvoidArea(AvoidAreaType.TYPE_SYSTEM));

    export const Safe = ({ columns, data, source }) => {
      const { width } = useWindowDimensions();
      const itemWidth = width / columns;
      return (
        <View style={{ width: '100%', maxWidth: 720, aspectRatio: 1.5, alignSelf: 'center' }}>
          <Image source={source} style={{ width: '100%', height: '100%' }} />
          <FlatList
            key={\`columns-\${columns}\`}
            data={data}
            numColumns={columns}
            extraData={{ columns, itemWidth }}
          />
          <ScrollView style={{ flex: 1 }} />
          {foldStatus === 'half-folded' ? area.top : null}
        </View>
      );
    };
  `);

  // Workflow-generated directories must not be scanned.
  for (const ignoredDirectory of ['.onemulti', '.preview']) {
    const directory = path.join(safeFixtureRoot, ignoredDirectory);
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, 'generated-risk.tsx'), cases['fold.tsx']);
  }

  const safeResult = spawnSync(process.execPath, [scanner, safeFixtureRoot], {
    encoding: 'utf8',
  });
  const safeOutput = `${safeResult.stdout}\n${safeResult.stderr}`;
  assert.equal(safeResult.status, 0, `no high-risk findings must exit 0\n${safeOutput}`);
  assert.match(safeOutput, /Scanned 1 relevant file\(s\)/, `generated directories must be ignored\n${safeOutput}`);
  for (const ruleId of expectedRuleIds) {
    assert.doesNotMatch(
      safeOutput,
      new RegExp(`\\b${ruleId}\\b`),
      `false positive ${ruleId}\n${safeOutput}`,
    );
  }

  const missingResult = spawnSync(process.execPath, [scanner, path.join(fixtureRoot, 'missing')], {
    encoding: 'utf8',
  });
  assert.equal(missingResult.status, 2, 'a missing target must exit 2, not the high-risk status');
  assert.match(missingResult.stderr, /Target does not exist:/);

  const mediaCases = [
    ['window alias and style array', true, `
      const { width: windowWidth } = useWindowDimensions();
      const bannerWidth = windowWidth * .94;
      const styles = StyleSheet.create({ banner: { aspectRatio: 3 } });
      return <Image style={[styles.banner, { width: bannerWidth }]} />;
    `],
    ['object metrics and hook wrapper', true, `
      const appSize = useAppSize();
      const padding = Math.round(appSize.width * .06);
      const bannerWidth = appSize.width - padding;
      return <Image style={{ width: bannerWidth, aspectRatio: 3 }} />;
    `],
    ['imperative window and explicit height', true, `
      const metrics = Dimensions.get('window');
      return <Image style={{ width: metrics.width * .94, height: metrics.width * .26 }} />;
    `],
    ['unrelated maxWidth cannot suppress audit', true, `
      const { width } = useWindowDimensions();
      const styles = StyleSheet.create({ sidebar: { maxWidth: 720 }, banner: { width: width * .94, aspectRatio: 3 } });
      return <Image style={styles.banner} />;
    `],
    ['parent cap with explicit window child', true, `
      const { width } = useWindowDimensions();
      return <View style={{ maxWidth: 720 }}><Image style={{ width: width * .94, aspectRatio: 3 }} /></View>;
    `],
    ['min of two window expressions is unbounded', true, `
      const { width } = useWindowDimensions();
      const bannerWidth = Math.min(width, width * .94);
      return <Image style={{ width: bannerWidth, aspectRatio: 3 }} />;
    `],
    ['array removes own cap', true, `
      const { width } = useWindowDimensions();
      const styles = StyleSheet.create({ banner: { width: width * .94, aspectRatio: 3, maxWidth: 720 } });
      return <Image style={[styles.banner, { maxWidth: undefined }]} />;
    `],
    ['fixed ratio and min with finite token', false, `
      const { width } = useWindowDimensions();
      const bannerWidth = Math.min(width - 48, tokens.banner.maxWidth);
      return <Image style={{ width: bannerWidth, aspectRatio: 3 }} />;
    `],
    ['style array provides own cap', false, `
      const { width } = useWindowDimensions();
      const styles = StyleSheet.create({ banner: { width: width * .94, aspectRatio: 3 }, cap: { maxWidth: 720 } });
      return <Image style={[styles.banner, styles.cap]} />;
    `],
    ['ratio on capped parent with percent child', false, `
      return <View style={{ width: '100%', maxWidth: 720, aspectRatio: 3, alignSelf: 'center' }}>
        <Image style={{ width: '100%', height: '100%' }} />
      </View>;
    `],
    ['fixed size', false, `return <Image style={{ width: 320, aspectRatio: 3 }} />;`],
    ['commented media is not executable', false, `
      const { width } = useWindowDimensions();
      // 示例 😀 <Image style={{ width: width * .94, aspectRatio: 3 }} />
      return <Image style={{ width: 320, aspectRatio: 3 }} />;
    `],
  ];
  for (const [name, shouldReport, body] of mediaCases) {
    const fixture = path.join(fixtureRoot, 'media-case.tsx');
    fs.writeFileSync(fixture, `import { Image, View, Dimensions, StyleSheet, useWindowDimensions } from 'react-native';\nexport function Banner() { ${body} }`);
    const check = spawnSync(process.execPath, [scanner, fixture], { encoding: 'utf8' });
    assert.equal(check.error, undefined, `${name}: ${check.error}`);
    // These fixtures put aspectRatio on a non-static Image; both that style
    // finding and the window audit are MEDIUM and must not fail the scanner.
    assert.equal(check.status, 0, `${name}: medium audit must not fail scanner\n${check.stderr}`);
    assert.equal(check.stdout.includes('image-window-derived-size-audit'), shouldReport, `${name}\n${check.stdout}`);
  }
  const staticCases = [
    ['capped width still loses aspectRatio', 'image-static-source-aspect-ratio', `
      const { width } = useWindowDimensions();
      const bannerWidth = Math.min(width - 48, 720);
      return <Image source={require('./banner.jpg')} style={{ width: bannerWidth, aspectRatio: 3 }} />;
    `],
    ['asset alias and style array', 'image-static-source-aspect-ratio', `
      const banner = require('./banner.jpg');
      const styles = StyleSheet.create({ banner: { aspectRatio: 3 } });
      return <Image source={banner} style={[styles.banner, { width: 320 }]} />;
    `],
    ['asset map member', 'image-static-source-aspect-ratio', `
      const IMAGES = { banner: require('./banner.jpg') };
      return <Image source={IMAGES.banner} style={{ width: '100%', aspectRatio: 3 }} />;
    `],
    ['absoluteFill only', 'image-static-source-absolute-fill', `
      return <View style={{ width: '100%', maxWidth: 720, aspectRatio: 3 }}>
        <Image source={require('./banner.jpg')} style={StyleSheet.absoluteFill} />
      </View>;
    `],
    ['absoluteFillObject spread only', 'image-static-source-absolute-fill', `
      const styles = StyleSheet.create({ image: { ...StyleSheet.absoluteFillObject } });
      return <Image source={require('./banner.jpg')} style={styles.image} />;
    `],
    ['explicit height keeps static asset safe', null, `
      return <Image source={require('./banner.jpg')} style={{ width: '100%', height: '100%' }} />;
    `],
    ['absoluteFill with explicit size is safe', null, `
      return <Image source={require('./banner.jpg')} style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} />;
    `],
    ['network source aspectRatio is a style recommendation', 'image-aspect-ratio-without-size', `
      return <Image source={{ uri: 'https://x/banner.jpg' }} style={{ width: 320, aspectRatio: 3 }} />;
    `],
    ['height-only aspectRatio also loses ratio', 'image-static-source-aspect-ratio', `
      return <Image source={require('./banner.jpg')} style={{ height: 120, aspectRatio: 3 }} />;
    `],
    ['ES import asset is a static source', 'image-static-source-aspect-ratio', `
      return <Image source={bannerAsset} style={{ width: '100%', aspectRatio: 3 }} />;
    `],
    ['multi-resolution source array is a style recommendation', 'image-aspect-ratio-without-size', `
      return <Image source={[require('./a.jpg'), require('./b.jpg')]} style={{ width: 320, aspectRatio: 3 }} />;
    `],
  ];
  const staticRuleIds = ['image-static-source-aspect-ratio', 'image-static-source-absolute-fill', 'image-aspect-ratio-without-size'];
  for (const [name, expected, body] of staticCases) {
    const fixture = path.join(fixtureRoot, 'static-case.tsx');
    fs.writeFileSync(fixture, `import { Image, View, StyleSheet, useWindowDimensions } from 'react-native';\nimport bannerAsset from './banner.png';\nexport function Banner() { ${body} }`);
    const check = spawnSync(process.execPath, [scanner, fixture], { encoding: 'utf8' });
    assert.equal(check.error, undefined, `${name}: ${check.error}`);
    for (const ruleId of staticRuleIds) {
      assert.equal(check.stdout.includes(ruleId), ruleId === expected, `${name}: ${ruleId}\n${check.stdout}`);
    }
    const isHigh = expected && expected !== 'image-aspect-ratio-without-size';
    assert.equal(check.status, isHigh ? 1 : 0, `${name}: static-source findings are HIGH, non-static style finding is MEDIUM\n${check.stdout}`);
    if (expected === 'image-aspect-ratio-without-size') assert.match(check.stdout, /^MEDIUM image-aspect-ratio-without-size /m, name);
  }
  const unrelatedCap = path.join(fixtureRoot, 'unrelated-cap.tsx');
  fs.writeFileSync(unrelatedCap, `
    import { Image, View } from 'react-native';
    const sidebar = { maxWidth: 720 };
    export const Banner = () => <View style={{ width: '100%', aspectRatio: 3 }}><Image /></View>;
  `);
  const unrelatedCheck = spawnSync(process.execPath, [scanner, unrelatedCap], { encoding: 'utf8' });
  assert.equal(unrelatedCheck.status, 0, unrelatedCheck.stderr);
  assert.match(unrelatedCheck.stdout, /image-unbounded-full-width-frame/, 'unrelated maxWidth must not hide a literal unbounded media frame');
  // One fixture per rule: [name, file, source, expected rule ids, forbidden rule ids].
  const ruleCases = [
    ['module window value with any name', 'a.tsx', `
      import { Dimensions, StyleSheet } from 'react-native';
      const width = Dimensions.get('window').width;
      export const s = StyleSheet.create({ c: { width: width - 32 } });
    `, ['module-window-cache'], ['module-derived-metrics']],
    ['module window destructure', 'a.tsx', `
      import { Dimensions } from 'react-native';
      const { width } = Dimensions.get('window');
      export const w = width;
    `, ['module-window-destructure'], []],
    ['module derived rem', 'a.tsx', `
      import { Dimensions } from 'react-native';
      const rem = Dimensions.get('window').width / 375;
      export const r = rem;
    `, ['module-derived-metrics'], ['module-window-cache']],
    ['physical screen and static stylesheet window', 'a.tsx', `
      import { Dimensions, StyleSheet } from 'react-native';
      export const s = StyleSheet.create({ c: { width: Dimensions.get('screen').width } });
    `, ['physical-screen-layout', 'static-stylesheet-window'], []],
    ['fontScale drives spacing, lineHeight does not', 'a.tsx', `
      import { useWindowDimensions } from 'react-native';
      export function H() { const { fontScale } = useWindowDimensions();
        return [{ paddingHorizontal: 16 * fontScale }, { lineHeight: 20 * fontScale }]; }
    `, ['fontscale-drives-layout'], []],
    ['lineHeight alone is text sizing', 'a.tsx', `
      import { useWindowDimensions } from 'react-native';
      export function H() { const { fontScale } = useWindowDimensions(); return { lineHeight: 20 * fontScale }; }
    `, [], ['fontscale-drives-layout']],
    ['double font scaling', 'a.tsx', `
      import { useWindowDimensions } from 'react-native';
      export function H() { const { fontScale } = useWindowDimensions(); return { fontSize: 14 * fontScale }; }
    `, ['double-font-scaling'], ['fontscale-drives-layout']],
    ['PixelRatio on margin', 'a.tsx', `
      import { PixelRatio } from 'react-native';
      export const s = { marginTop: 8 * PixelRatio.get() };
    `, ['pixel-ratio-layout'], []],
    ['root and native remount on size', 'a.tsx', `
      import { NavigationContainer } from '@react-navigation/native';
      import { useWindowDimensions } from 'react-native';
      export function A() { const { width } = useWindowDimensions();
        return <NavigationContainer key={width}><MapNativeView key={breakpoint} /></NavigationContainer>; }
    `, ['root-remount-on-size', 'native-remount-on-size'], []],
    ['module animation from window', 'a.tsx', `
      import { Animated, Dimensions } from 'react-native';
      const x = new Animated.Value(Dimensions.get('window').width);
      export default x;
    `, ['module-animation-dimension'], []],
    ['global scale mutation and unrelated remove', 'a.tsx', `
      import { Dimensions } from 'react-native';
      let rem = 1;
      export function f(list) { Dimensions.addEventListener('change', ({ window }) => { rem = window.width / 375; }); list.remove(); }
    `, ['global-scale-mutation', 'dimensions-listener-without-remove'], []],
    ['subscription removed by owner', 'a.tsx', `
      import { Dimensions } from 'react-native';
      export function f(set) { const sub = Dimensions.addEventListener('change', ({ window }) => set(window.width)); return () => sub.remove(); }
    `, [], ['dimensions-listener-without-remove']],
    ['global font scaling disabled', 'a.tsx', `
      import { Text } from 'react-native';
      Text.defaultProps = Text.defaultProps || {};
      Text.defaultProps.allowFontScaling = false;
    `, ['global-disable-font-scaling'], []],
    ['commented absolute left is ignored', 'a.tsx', `
      import { View } from 'react-native';
      // position: 'absolute', left: 0
      export const G = () => <View />;
    `, [], ['absolute-physical-horizontal-edge']],
    ['display size sent to host', 'entry/src/main/ets/pages/Index.ets', `
      import display from '@ohos.display';
      const d = display.getDefaultDisplaySync();
      rnInstance.onWindowSizeChange(d.width, d.height); // RNInstance
    `, ['display-size-to-host'], []],
    ['restricted window mode, locked orientation, phone only', 'entry/src/main/module.json5', `
      { "module": { "deviceTypes": ["phone"], "abilities": [{ "supportWindowMode": ["fullscreen"], "orientation": "portrait" }] } }
    `, ['module-window-mode-restricted', 'module-orientation-locked', 'module-device-types-without-large-screen'], []],
    ['equal percent columns in a wrap grid', 'a.tsx', `
      import { StyleSheet, View, useWindowDimensions } from 'react-native';
      export function Grid() { const { width } = useWindowDimensions(); const isSm = width < 600;
        return <View style={styles.row}><View style={[styles.col, { width: isSm ? '25%' : '12.5%' }]} /></View>; }
      const styles = StyleSheet.create({ row: { flexDirection: 'row', flexWrap: 'wrap' }, col: { height: 40 } });
    `, ['flexwrap-equal-percent-columns'], []],
    ['template third in a wrap grid', 'a.tsx', `
      import { View } from 'react-native';
      export const G = ({ n }) => <View style={{ flexWrap: 'wrap', flexDirection: 'row' }}><View style={{ width: \`\${100 / n}%\` }} /></View>;
    `, ['flexwrap-equal-percent-columns'], []],
    ['33.33% sums below 100% and no-wrap percent are fine', 'a.tsx', `
      import { View } from 'react-native';
      export const G = () => <View style={{ flexWrap: 'wrap' }}><View style={{ width: '33.33%' }} /><View style={{ width: '100%' }} /></View>;
    `, [], ['flexwrap-equal-percent-columns']],
    ['centering offsets in a wrap file are fine', 'a.tsx', `
      import { View } from 'react-native';
      export const G = () => <View style={{ flexWrap: 'wrap' }}><View style={{ position: 'absolute', left: '50%', top: '25%' }} /></View>;
    `, [], ['flexwrap-equal-percent-columns']],
    ['percent without flexWrap is fine', 'a.tsx', `
      import { View } from 'react-native';
      export const G = () => <View style={{ flexDirection: 'row' }}><View style={{ width: '50%' }} /><View style={{ width: '50%' }} /></View>;
    `, [], ['flexwrap-equal-percent-columns']],
    ['bundled JS in rawfile is ignored', 'entry/src/main/resources/rawfile/bundle.harmony.js', `
      var w = require('react-native').Dimensions.get('screen').width;
    `, [], ['physical-screen-layout']],
    ['open window capabilities', 'entry/src/main/module.json5', `
      { "module": { "deviceTypes": ["phone", "tablet", "2in1"], "abilities": [{ "supportWindowMode": ["fullscreen", "split", "floating"], "orientation": "auto_rotation" }] } }
    `, [], ['module-window-mode-restricted', 'module-orientation-locked', 'module-device-types-without-large-screen']],
  ];
  for (const [name, file, source, expected, forbidden] of ruleCases) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rnoh-scan-rule-'));
    try {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      // Dedent: module-level rules anchor at column 0 like real top-level code.
      fs.writeFileSync(path.join(root, file), source.replace(/^ {6}/gm, ''));
      const check = spawnSync(process.execPath, [scanner, root], { encoding: 'utf8' });
      assert.notEqual(check.status, 2, `${name}: scanner failed\n${check.stderr}`);
      for (const ruleId of expected) assert.match(check.stdout, new RegExp(`\\b${ruleId}\\b`), `${name}: missing ${ruleId}\n${check.stdout}`);
      for (const ruleId of forbidden) assert.doesNotMatch(check.stdout, new RegExp(`\\b${ruleId}\\b`), `${name}: false positive ${ruleId}\n${check.stdout}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  // Input mode and generated-code noise.
  const modeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rnoh-scan-mode-'));
  try {
    fs.writeFileSync(path.join(modeRoot, 'App.tsx'), `
      import { View, NativeModules } from 'react-native';
      import { Surface } from 'react-native-paper';
      export const App = () => <Surface><View /></Surface>;
    `);
    const generated = path.join(modeRoot, 'entry/src/main/cpp/generated');
    fs.mkdirSync(generated, { recursive: true });
    for (const name of ['a.h', 'b.h', 'c.h']) fs.writeFileSync(path.join(generated, name), '// generated');
    const check = spawnSync(process.execPath, [scanner, modeRoot], { encoding: 'utf8' });
    assert.match(check.stdout, /Input mode candidate: RN_ONLY/, `plain RN with paper Surface must stay RN_ONLY\n${check.stdout}`);
    assert.equal(check.stdout.match(/manual-generated-edit-risk/g)?.length, 1, `generated dir reported once\n${check.stdout}`);
  } finally {
    fs.rmSync(modeRoot, { recursive: true, force: true });
  }

  console.log(`PASS: ${ruleCases.length} per-rule cases; input-mode and generated-dir checks.`);
  console.log(`PASS: ${expectedRuleIds.length} positive and negative scanner checks; ${mediaCases.length} computed-media cases; ${staticCases.length} static-source cases; unrelated-cap suppression regression.`);
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  fs.rmSync(safeFixtureRoot, { recursive: true, force: true });
}
