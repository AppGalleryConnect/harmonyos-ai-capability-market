"""RN 多设备 Skill 的结构、引用、用例与脚本契约。"""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import re
import shutil
import subprocess

SKILL_BYTES_BUDGET = 16 * 1024
SCENES = [f"RN-{n:02d}" for n in range(1, 14)]
MODES = {"RN_ONLY", "HOST_ONLY", "NATIVE_ONLY", "HYBRID", "INSUFFICIENT"}

# 已修复过的缺陷写法，出现即视为回归。
REGRESSIONS = {
    "magic status bar fallback": re.compile(r"currentHeight\s*\?\?\s*\d"),
    "layout.y treated as screen coords": re.compile(r"layout\.y 直接是屏幕坐标"),
    "keyboard strategy assumes window resize": re.compile(r"\| 普通表单 \| window resize"),
    # 版本只能作为出处（登记表、括注），不能写成决策条件里的“某版本默认”。
    "version baked into decision rule": re.compile(r"0\.\d+(?:\.\d+)?\s*默认|0\.\d+(?:\.\d+)?'s default"),
    # 补丁版本的真机观察只登记在 compatibility-matrix 表格里，正文不写。
    "patch-version observation in prose": re.compile(r"0\.\d+\.\d+\s*真机"),
}


@dataclass(frozen=True)
class CheckResult:
    name: str
    passed: bool
    detail: str


def _result(name: str, passed: bool, detail: str) -> CheckResult:
    return CheckResult(name, passed, detail)


def _frontmatter_keys(text: str) -> set[str]:
    match = re.match(r"\A---\n(.*?)\n---\n", text, re.DOTALL)
    if not match:
        return set()
    return {
        line.split(":", 1)[0].strip()
        for line in match.group(1).splitlines()
        if ":" in line and not line.startswith((" ", "\t"))
    }


def _find(root: Path, name: str) -> Path | None:
    for base in (root, root / "references", root / "references" / "adaptive-components",
                 root / "assets" / "recipes", root / "assets" / "responsive-shell", root / "scripts"):
        if (base / name).exists():
            return base / name
    return None


def _check_refs(root: Path, markdown: list[Path]) -> tuple[list[str], list[str]]:
    broken: list[str] = []
    anchors: list[str] = []
    ref_re = re.compile(r"`((?:references|assets|scripts|evals)/[\w./-]+|[\w-]+\.(?:md|tsx|ts|mjs|py))`")
    anchor_re = re.compile(r"`([\w-]+\.md)`(?:\s*的)?\s*「([^」]+)」")
    for source in markdown:
        text = source.read_text(encoding="utf-8")
        for ref in ref_re.findall(text):
            target = root / ref if "/" in ref else _find(root, ref)
            if target is None or not target.exists():
                broken.append(f"{source.relative_to(root)} -> {ref}")
        for file_name, heading in anchor_re.findall(text):
            target = _find(root, file_name)
            if target is None or heading not in target.read_text(encoding="utf-8"):
                anchors.append(f"{source.relative_to(root)} -> {file_name}「{heading}」")
    return broken, anchors


def _check_cases(root: Path) -> list[CheckResult]:
    source = (root / "references" / "test-prompts.md").read_text(encoding="utf-8")
    cases = json.loads((root / "evals" / "behavior" / "cases.json").read_text(encoding="utf-8"))
    ids = [case["id"] for case in cases]
    duplicates = sorted({case_id for case_id in ids if ids.count(case_id) > 1})

    numbering_errors: list[str] = []
    for section in re.split(r"^## ", source, flags=re.M)[1:]:
        title = section.split("\n", 1)[0].strip()
        numbers = [int(n) for n in re.findall(r"^(\d+)\. ", section, re.M)]
        if numbers and numbers != list(range(1, len(numbers) + 1)):
            numbering_errors.append(title)

    prompts_md = re.findall(r"^\d+\. “(.+?)”", source, re.M)
    prompts_json = [case["prompt"] for case in cases if "prompt" in case]
    in_sync = prompts_md == prompts_json

    triggers = [c for c in cases if c["id"].startswith("trigger-")]
    no_scene = [c["id"] for c in triggers if c.get("primary_scene") not in SCENES]
    bad_modes = [c["id"] for c in cases for mode in c.get("expected_input_mode", []) if mode not in MODES]
    covered = {c.get("primary_scene") for c in triggers}
    uncovered = [scene for scene in SCENES if scene not in covered]
    negatives = [c for c in cases if not c["should_trigger"]]

    return [
        _result("case-ids", not duplicates, "ID 唯一" if not duplicates else f"重复={duplicates}"),
        _result("case-numbering", not numbering_errors,
                "各节编号连续" if not numbering_errors else f"编号不连续={numbering_errors}"),
        _result("case-sync", in_sync,
                f"{len(prompts_json)} 条提示词与 test-prompts.md 一致" if in_sync
                else "cases.json 与 test-prompts.md 不一致，运行 evals/sync_cases.py"),
        _result("case-primary-scene", not no_scene,
                "应触发用例都有合法主场景" if not no_scene else f"缺主场景={no_scene}"),
        _result("case-input-mode", not bad_modes, "输入模式合法" if not bad_modes else f"非法={bad_modes}"),
        _result("scene-coverage", not uncovered,
                "RN-01..RN-13 均有主场景用例" if not uncovered else f"未覆盖={uncovered}"),
        _result("negative-cases", len(negatives) >= 5, f"不应触发用例 {len(negatives)} 条"),
    ]


def _check_assert_layout(root: Path) -> list[CheckResult]:
    node = shutil.which("node")
    if node is None:
        return [_result("assert-layout", True, "未安装 node，跳过脚本回归")]
    script = root / "scripts" / "assert-layout.mjs"
    fixtures = root / "evals" / "fixtures"
    expectations = {"grid-8col-pass.json": 0, "grid-8col-wrapped.json": 1}
    failures = []
    for fixture, expected in expectations.items():
        proc = subprocess.run(
            [node, str(script), str(fixtures / fixture), "--expect", "grid-item-*=8@grid-item-row"],
            capture_output=True, text=True, check=False,
        )
        if proc.returncode != expected:
            failures.append(f"{fixture}: exit {proc.returncode}, 期望 {expected}")
    return [_result("assert-layout", not failures,
                    "通过栅格夹具（含尾部日志、同前缀容器）" if not failures else "; ".join(failures))]


def run(root: Path) -> list[CheckResult]:
    skill = root / "SKILL.md"
    text = skill.read_text(encoding="utf-8")
    size = len(text.encode("utf-8"))
    markdown = [skill, *sorted((root / "references").rglob("*.md"))]
    broken, anchors = _check_refs(root, markdown)

    all_text = "\n".join(path.read_text(encoding="utf-8") for path in markdown)
    for path in sorted((root / "assets").rglob("*.ts*")):
        all_text += "\n" + path.read_text(encoding="utf-8")
    regressions = [name for name, pattern in REGRESSIONS.items() if pattern.search(all_text)]

    routed = [scene for scene in SCENES if f"`{scene}`" not in text]

    return [
        _result("frontmatter", _frontmatter_keys(text) == {"name", "description"},
                f"字段={sorted(_frontmatter_keys(text))}"),
        _result("skill-size", size <= SKILL_BYTES_BUDGET, f"SKILL.md {size} 字节，预算 {SKILL_BYTES_BUDGET}"),
        _result("scene-routing", not routed, "13 个场景都在路由表" if not routed else f"缺路由={routed}"),
        _result("file-references", not broken, "无坏引用" if not broken else "; ".join(broken)),
        _result("section-anchors", not anchors, "「章节」锚点都存在" if not anchors else "; ".join(anchors)),
        _result("known-regressions", not regressions, "无已修复缺陷回归" if not regressions else f"回归={regressions}"),
        *_check_cases(root),
        *_check_assert_layout(root),
    ]
