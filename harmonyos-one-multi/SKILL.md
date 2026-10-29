---
name: harmonyos-one-multi
description: HarmonyOS 一多（多设备/多形态适配）技能集入口与云端加载器。当用户的提示词涉及一多、多设备适配、多端、多形态、自适应/响应式布局、断点、折叠屏、悬停、折痕、平板、大屏、2in1、安全区、键盘避让、横竖屏、旋转、分屏、自由窗、多窗口、H5/WebView 多设备、Flutter 多设备、RN/RNOH 多设备、一多验证或回归时使用本 Skill。本 Skill 先判断请求属于哪个领域；技能集是一个整体（统称一多 skill，本仓整仓即技能集），本机未齐装时通过 scripts/remote_load.sh 一次性安装全部领域 Skill（优先从本仓本地安装，本仓无源时回退云端拉取），再按对应 Skill 的 SKILL.md 执行。
metadata:
  version: 1.3.0
  keywords:
    - 一多
    - 多设备适配
    - 多端适配
    - 多形态
    - 自适应布局
    - 响应式布局
    - 断点
    - 折叠屏
    - 悬停态
    - 平板适配
    - 大屏适配
    - 安全区
    - 键盘避让
    - 横竖屏
    - 分屏
    - 自由窗
---

# HarmonyOS 一多技能集入口

## 职责

本 Skill 只做两件事：**判定领域** 和 **整体拉取**。诊断、修复、验证的具体方法全部来自领域 Skill，本入口不展开实现细节，不重复领域知识。

## 领域路由表

按用户请求的信号词选择要加载使用的领域 Skill（可能同时命中多个，全部使用）：

| 信号（示例） | 领域 Skill |
| --- | --- |
| 原生 ArkUI 布局：断点、栅格、导航挪移、留白/遮挡、安全区、键盘避让、折展、横竖屏 | `harmonyos-ui-multi` |
| 相机取流页面：扫码 customScan、拍照、录像预览、旋转镜像、预览拉伸、stride 花屏 | `harmonyos-camera-multi` |
| WebView/H5 页面：响应式布局、动态 REM、viewport、响应式图片/视频、ArkTS-H5 联动 | `harmonyos-h5-multi` |
| Flutter/Dart 工程的多设备适配 | `harmonyos-flutter-multi` |
| React Native for OpenHarmony（RN/RNOH）的多设备布局 | `harmonyos-rn-multi` |
| 工程级全流程：页面集/模块/全工程分析、分批 SPEC、高保真、完整验证与报告 | `harmonyos-workflow-multi`（编排层，按框架联合上表对应 Skill） |

无法判断领域时，先向用户澄清框架与问题现象，不要盲目开始。

## 整体安装流程

技能集 6 个领域 Skill 是一个整体，统称一多 skill：**要么已齐装、要么整体安装，不做单领域按需安装**。本仓为整仓布局，入口 SKILL.md 与 6 个领域 skill 源目录同层，安装脚本优先直接从本仓安装，无需网络。

1. **检查是否齐装**：在以下位置查找 9 个领域 Skill（ui / workflow / camera / h5 / rn / flutter）的 `<skill>/SKILL.md`：
   - 当前工程 `.zcode/skills/`、`.agents/skills/`、`.claude/skills/`
   - 用户目录 `~/.zcode/skills/`、`~/.agents/skills/`、`~/.claude/skills/`

   9 个全部存在则跳过拉取，按路由表直接使用。
2. **整体安装**：任一领域 Skill 缺失时，定位本 Skill 的基目录（本 SKILL.md 所在目录），一次性安装全部领域 Skill：

   ```bash
   bash <本Skill基目录>/scripts/remote_load.sh all
   ```

   - 默认自动检测本仓内的 6 个领域 Skill 源目录并本地安装（symlink 到本仓所在 skills 根目录，`--link-mode copy` 可改为拷贝），无需网络。
   - 本仓不含领域 Skill 源时（入口被单独安装的罕见场景）回退云端：默认 Matrix 技能注册表，静态云源追加 `--base-url <地址> --url-style zip`；已缓存自动复用。
   - 入口 Skill 自身不在安装范围内（本仓即入口）。
3. **安装后立即可用**：安装成功后，用 Read 工具读取本次请求命中的 `<skills 根>/<领域 Skill 名>/SKILL.md` 全文，按其正文执行（新安装的 Skill 在下一次 turn 或新会话才会被平台自动发现，但内容当前会话即可使用）。目标 Skill 引用的 references/、assets/ 文件同样按相对路径 Read。
4. **失败处理**：安装失败时，向用户展示脚本输出和手动命令，不要假装已安装，也不要凭自身经验替代领域 Skill 的内容。

## 约束

- 拉取只能拉本技能集内的 Skill（脚本内置白名单，多余名称会被拒绝）。
- 技能集已齐装时不重复拉取；不确定时先查再拉。
- 本入口不缓存领域知识：命中的领域 Skill 未就绪前不开始诊断或写代码。
