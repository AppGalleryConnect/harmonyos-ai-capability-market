#!/usr/bin/env python3
"""默认快速检查；--only 按模块回归，--full 运行全部离线契约测试。"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "scripts"))
UI_CHECK_ROOT = HERE.parent / "scripts" / "verification" / "checks" / "ui"
sys.path.insert(0, str(UI_CHECK_ROOT))

from onemulti.project import build_page_inventory  # noqa: E402
from ui_checks import static_rules  # noqa: E402
from ui_checks.project import scan_static  # noqa: E402
from ledger_contract import run as run_ledger  # noqa: E402
from report_contract import run as run_report  # noqa: E402
from skill_contract import run as run_skill  # noqa: E402
from ui_device_types_contract import run as run_device_types  # noqa: E402
from framework_contract import check_device_preparation, run as run_framework  # noqa: E402

GROUPS = ("skill", "device", "ledger", "report", "device-types", "framework",
          "ui-static", "inventory", "rn-scanner")


def run_device(root: Path) -> tuple[bool, str]:
    try:
        check_device_preparation(root)
        return True, "启动/枚举失败、连接超时、清理异常与设备复用通过（离线模拟）"
    except (AssertionError, OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        return False, str(error)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument("--only", nargs="+", choices=GROUPS, help="只运行指定模块，可选多个")
    selection.add_argument("--full", action="store_true", help="完整回归；提交或跨模块修改时使用")
    args = parser.parse_args()
    groups = set(GROUPS if args.full else args.only or ("skill", "device"))
    started = time.perf_counter()
    passed = failed = 0
    print(f"本次模块：{', '.join(name for name in GROUPS if name in groups)}", flush=True)
    if "ui-static" in groups:
        print("— ui-static-rules")
        fixtures = HERE / "ui_static" / "fixtures"
        for case in sorted(path for path in fixtures.iterdir() if path.is_dir()):
            expected = json.loads((case / "expected.json").read_text(encoding="utf-8"))
            issues = scan_static(str(case / "project"))
            got_fail = {item.rule for item in issues if item.severity == static_rules.SEVERITY_FAIL}
            got_warn = {item.rule for item in issues if item.severity == static_rules.SEVERITY_WARN}
            ok = got_fail == set(expected.get("expect_fail", [])) \
                and got_warn == set(expected.get("expect_warn", []))
            print(f"  {'PASS' if ok else 'FAIL'}  {case.name}")
            passed += int(ok)
            failed += int(not ok)

    if "inventory" in groups:
        print("— inventory")
        fixtures = HERE / "inventory" / "fixtures"
        for case in sorted(path for path in fixtures.iterdir() if path.is_dir()):
            expected = json.loads((case / "expected.json").read_text(encoding="utf-8"))["expect"]
            actual = [
                {key: value for key, value in item.items() if key != "type"}
                for item in build_page_inventory(str(case / "project"))
            ]
            ok = actual == expected
            print(f"  {'PASS' if ok else 'FAIL'}  {case.name}")
            passed += int(ok)
            failed += int(not ok)

    print("— workflow-contract")
    if "skill" in groups:
        for result in run_skill(HERE.parent):
            print(f"  {'PASS' if result.passed else 'FAIL'}  {result.name}: {result.detail}")
            passed += int(result.passed)
            failed += int(not result.passed)

    for name, runner in (("device", run_device), ("ledger", run_ledger), ("report", run_report),
                         ("device-types", run_device_types), ("framework", run_framework)):
        if name not in groups:
            continue
        ok, detail = runner(HERE.parent)
        print(f"  {'PASS' if ok else 'FAIL'}  {name}: {detail}")
        passed += int(ok)
        failed += int(not ok)

    if "rn-scanner" in groups:
        node = shutil.which("node")
        if node:
            result = subprocess.run(
                [node, str(HERE / "test-scan-rules.mjs")],
                text=True, capture_output=True, check=False, timeout=60,
            )
            ok = result.returncode == 0
            print(f"  {'PASS' if ok else 'FAIL'}  rn-scanner: {(result.stdout + result.stderr).strip()}")
            passed += int(ok)
            failed += int(not ok)
        else:
            print("  SKIP  rn-scanner: Node.js 不可用，未验证可选风险扫描器")

    print(f"合计 {passed} 通过 / {failed} 失败；耗时 {time.perf_counter() - started:.2f} 秒")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
