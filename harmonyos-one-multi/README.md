# harmonyos-one-multi — HarmonyOS 一多技能集

HarmonyOS 一多（多设备/多形态适配）Agent Skill 整仓。本仓库自身就是一个 skill：根目录 `SKILL.md` 是入口（prompt 触发 + 领域路由），6 个领域 skill 源目录与其同层（与现网插件发布范围一致），整仓即技能集。

## 领域 Skill

| 目录 | 领域 |
| --- | --- |
| `harmonyos-ui-multi` | 原生 ArkUI 布局、断点、安全区、折展、横竖屏 |
| `harmonyos-camera-multi` | 相机取流页面（扫码/拍照/录像预览、旋转镜像、花屏） |
| `harmonyos-h5-multi` | WebView/H5 响应式、动态 REM、ArkTS 联动 |
| `harmonyos-flutter-multi` | Flutter 多设备适配 |
| `harmonyos-rn-multi` | React Native for OpenHarmony 多设备布局 |
| `harmonyos-workflow-multi` | 工程级全流程编排（五步闭环） |

## 使用（外部用户）

一条 `git clone` 完成引导，再跑一次安装命令把 6 个领域 skill 装到 skills 根目录：

```bash
curl -fsSL https://github.com/AppGalleryConnect/harmonyos-ai-capability-market/archive/refs/heads/main.zip -o /tmp/market.zip
unzip -qo /tmp/market.zip 'harmonyos-ai-capability-market-main/harmonyos-one-multi/*' -d /tmp/market
mkdir -p ~/.agents/skills && mv /tmp/market/harmonyos-ai-capability-market-main/harmonyos-one-multi ~/.agents/skills/
bash ~/.agents/skills/harmonyos-one-multi/scripts/remote_load.sh all
```

> 独立镜像仓（可直接整仓 clone）：https://github.com/PigBomber/one-mutil-pull

（ZCode 工程级用 `.zcode/skills/`，Claude Code 用 `.claude/skills/`，同理。）

之后任何涉及一多的提示词（多设备/折叠屏/断点/安全区/横竖屏/H5/Flutter/RNOH 等）自动触发入口 skill：检查齐装 → 缺失则 `remote_load.sh all` 本地安装 → 按命中的领域 SKILL.md 执行。

- 默认 symlink 安装（`git pull` 后即自动生效新内容）；`--link-mode copy` 改为拷贝。
- 本仓不含某领域源时脚本回退云端拉取（默认 Matrix 注册表，可 `--base-url` 指定静态 zip 源）。
- 团队工程可在根 `AGENTS.md` 预置上面两条命令，成员零操作。

> 说明：本仓库范围与现网插件发布版一致，仅含上表 6 个领域 skill；`multi-form-test-pipeline`、`python-hypium`、`ux-judge` 尚未发布到现网，暂不包含，发布后随仓库更新加入。
