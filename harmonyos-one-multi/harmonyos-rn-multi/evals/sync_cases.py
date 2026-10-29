#!/usr/bin/env python3
"""从 references/test-prompts.md 生成 evals/behavior/cases.json。

test-prompts.md 是用例的唯一来源；修改用例后运行本脚本，再运行 run_evals.py。
"""

from __future__ import annotations

import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "references" / "test-prompts.md"
TARGET = ROOT / "evals" / "behavior" / "cases.json"

SECTIONS = {"应触发": ("trigger", True), "不应处理": ("no-trigger", False), "边界用例": ("boundary", True)}
MODES = r"`(RN_ONLY|HOST_ONLY|NATIVE_ONLY|HYBRID|INSUFFICIENT)`"


def parse(text: str) -> list[dict]:
    cases: list[dict] = []
    for section in re.split(r"^## ", text, flags=re.M):
        title = section.split("\n", 1)[0].strip()
        if title not in SECTIONS:
            continue
        prefix, trigger = SECTIONS[title]
        for number, body in re.findall(r"^(\d+)\. (.*)$", section, re.M):
            quoted = re.match(r"^“(.+?)”(.*)$", body)
            case: dict = {"id": f"{prefix}-{int(number):02d}", "should_trigger": trigger}
            if quoted:
                case["prompt"], expected = quoted.group(1), quoted.group(2).strip()
            else:
                case["situation"], expected = body.split("：", 1)[0], body
            modes = re.findall(MODES, expected)
            if modes:
                case["expected_input_mode"] = list(dict.fromkeys(modes))
            primary = re.search(r"主场景 `(RN-\d+)`", expected)
            if primary:
                case["primary_scene"] = primary.group(1)
            secondary = re.search(r"次场景 `([^`]+)`", expected)
            if secondary:
                case["secondary_scenes"] = [
                    item if item.startswith("RN-") else f"RN-{item}"
                    for item in secondary.group(1).split("/")
                ]
            case["expected"] = expected
            cases.append(case)
    return cases


def main() -> int:
    cases = parse(SOURCE.read_text(encoding="utf-8"))
    TARGET.write_text(json.dumps(cases, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"写入 {len(cases)} 条用例 -> {TARGET.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
