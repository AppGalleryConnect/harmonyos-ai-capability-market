"""HTML 报告渲染契约：统计、截图、转义、汇总和失败原子性。"""

from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile


_ONE_PIXEL_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


def _issue(batch_id: str, status: str) -> dict:
    issue_id = f"{batch_id}-UI-001"
    page = f"entry/src/main/ets/pages/{batch_id}.ets"
    result_reason = None if status == "passed" else "multimodal_declined_by_user"
    return {
        "issueId": issue_id,
        "batchId": batch_id,
        "page": page,
        "component": f"{batch_id} 页面",
        "domain": "size-layout",
        "affectedPages": [],
        "targetForms": ["LG"],
        "problem": "固定单列 <script>alert(1)</script>& 会在宽窗留白",
        "source": "task_analysis",
        "rootCause": "布局没有响应窗口宽度",
        "proposal": "LG 使用双列布局",
        "plannedFiles": [page],
        "verificationPlan": [{
            "form": "LG",
            "checkId": "layout",
            "routeId": f"R-{batch_id}",
            "check": "宽窗显示双列且内容不留异常空白",
        }],
        "changeStatus": "modified",
        "verificationResults": [{
            "form": "LG",
            "checkId": "layout",
            "status": status,
            "reason": result_reason,
        }],
        "changedFiles": [page],
        "changeSummary": "已按窗口宽度切换为双列",
        "notChangedReason": None,
        "introducedByBatch": None,
        "deferredRegressions": [],
    }


def _ledger() -> dict:
    batches = []
    pages = {}
    issues = []
    for batch_id, result in (("B01", "passed"), ("B02", "not_verified")):
        page = f"entry/src/main/ets/pages/{batch_id}.ets"
        pages[page] = {
            "type": "page",
            "module": "entry",
            "dependencies": [],
            "batchId": batch_id,
            "missingFromScan": False,
        }
        batches.append({
            "batchId": batch_id,
            "pages": [page],
            "dependencies": [],
            "predecessors": [] if batch_id == "B01" else ["B01"],
            "domains": ["size-layout"],
            "risk": "low",
            "status": "executing",
            "specConfirmed": True,
            "testConclusion": "not_run",
        })
        issues.append(_issue(batch_id, result))
    return {
        "schemaVersion": 3,
        "task": {
            "taskId": "ui-report-contract",
            "scope": list(pages),
            "targetForms": ["LG"],
            "confirmationMode": "batch",
            "routeMap": "output/route-map.json",
            "status": "executing",
            "currentBatch": "B01",
        },
        "decisions": [],
        "pages": pages,
        "batches": batches,
        "issues": issues,
    }


def _evidence() -> dict:
    entries = []
    for number, batch_id in enumerate(("B01", "B02"), start=1):
        entries.append({
            "evidenceId": f"E-CMD-{number:02d}",
            "type": "command",
            "round": 1,
            "links": [{"issueId": f"{batch_id}-UI-001"}],
            "data": {
                "argv": ["devecocli", "build"],
                "exitCode": 0,
                "phase": "step3_foundation",
            },
        })
    entries.append({
        "evidenceId": "E-SHOT-01",
        "type": "screenshot",
        "round": 1,
        "links": [{
            "issueId": "B01-UI-001",
            "form": "LG",
            "checkId": "layout",
        }],
        "path": "evidence/B01/round-1/layout.png",
    })
    return {"schemaVersion": 3, "taskId": "ui-report-contract", "entries": entries}


def _write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _run_cli(script: Path, root: Path, *arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(script), str(root), *arguments],
        text=True,
        capture_output=True,
        check=False,
    )


def _assert_navigation_targets(html: str) -> None:
    navigation = html.split('<aside class="side-nav"', 1)[1].split("</aside>", 1)[0]
    targets = re.findall(r'href="(#[^"]+)"', navigation)
    assert targets, "侧栏没有页内导航"
    for target in targets:
        assert f'id="{target[1:]}"' in html, f"侧栏目标不存在: {target}"


def _assert_framework_foundation(skill_root: Path) -> None:
    """通过正式登记入口检查三方多根命令、重录、轮次和路径边界。"""
    render = skill_root / "scripts" / "render-report.py"
    record = skill_root / "scripts" / "verification" / "evidence-session.py"
    with tempfile.TemporaryDirectory() as temp_dir:
        project = Path(temp_dir)
        om = project / ".onemulti"
        template = om / "assets" / "report" / "report-template.html"
        template.parent.mkdir(parents=True)
        shutil.copy2(skill_root / "assets" / "report" / "report-template.html", template)
        _write_json(om / "decisions.json", _ledger())
        index = _evidence()
        index["entries"] = [entry for entry in index["entries"] if entry["evidenceId"] != "E-CMD-01"]
        _write_json(om / "evidence" / "index.json", index)
        screenshot = om / "evidence" / "B01" / "round-1" / "layout.png"
        screenshot.parent.mkdir(parents=True)
        screenshot.write_bytes(_ONE_PIXEL_PNG)
        (project / "frontend").mkdir()
        (project / "host").mkdir()

        def command(phase: str, cwd: str, argv: list[str], exit_code: int = 0) -> dict:
            return {"phase": phase, "cwd": cwd, "argv": argv, "exitCode": exit_code,
                    "links": [{"issueId": "B01-UI-001"}], "reason": "command_failed"}

        def record_commands(round_number: int, commands: list[dict]) -> subprocess.CompletedProcess[str]:
            payload = project / "commands.json"
            _write_json(payload, {"round": round_number, "commands": commands,
                                  "artifacts": [], "results": []})
            return subprocess.run(
                [sys.executable, str(record), "record-batch", str(project), "--input", str(payload)],
                text=True, capture_output=True, check=False,
            )

        def assert_state(expected: str) -> None:
            result = _run_cli(render, om, "--batch-id", "B01")
            assert result.returncode == 0, result.stderr
            data = json.loads(result.stdout)
            assert data["verificationState"] == expected, data
            assert data["testConclusion"] == ("passed" if expected == "passed" else "failed"), data

        # 非法 cwd 不得污染证据；任务根使用 '.'，缺省亦按 '.' 对待。
        before = (_digest(om / "decisions.json"), _digest(om / "evidence" / "index.json"))
        for cwd in ("", "/tmp", "../frontend", "frontend/../host", r"C:\repo", r"..\frontend", None, 123):
            invalid = record_commands(1, [command("framework_build", cwd, ["npm", "run", "build"])])
            assert invalid.returncode != 0, f"错误接受 cwd={cwd!r}"
            assert before == (_digest(om / "decisions.json"), _digest(om / "evidence" / "index.json"))

        frontend = command("framework_build", "frontend", ["npm", "run", "build"], 1)
        host = command("framework_build", "host", ["devecocli", "build"])
        check = command("framework_check", "frontend", ["npm", "run", "lint"])
        recorded = record_commands(1, [frontend, host, check])
        assert recorded.returncode == 0, recorded.stderr
        stored = json.loads((om / "evidence" / "index.json").read_text(encoding="utf-8"))
        assert [entry["data"]["cwd"] for entry in stored["entries"][-3:]] == ["frontend", "host", "frontend"]
        assert_state("failed")  # H5 前端失败不能被宿主和 lint 成功覆盖。

        frontend["exitCode"] = 0
        rerecorded = record_commands(1, [frontend])
        assert rerecorded.returncode == 0, rerecorded.stderr
        assert_state("passed")  # 完全相同的命令重测允许替换旧结论。
        other_root = command("framework_build", "host", ["npm", "run", "build"], 1)
        rerecorded = record_commands(1, [other_root, frontend])
        assert rerecorded.returncode == 0, rerecorded.stderr
        assert_state("failed")  # 同 argv、不同 cwd 不能覆盖。

        recovered = record_commands(2, [frontend, host, check])
        assert recovered.returncode == 0, recovered.stderr
        assert_state("passed")  # 新轮完整通过不受第一轮失败锁定。
        only_check = record_commands(3, [check])
        assert only_check.returncode == 0, only_check.stderr
        assert_state("incomplete")  # 不能借用上一轮构建。
        html = (om / "adaptation-report-B01.html").read_text(encoding="utf-8")
        assert "本轮缺少框架构建记录" in html
        restarted = record_commands(2, [other_root])
        assert restarted.returncode == 0, restarted.stderr
        assert_state("failed")  # 追加顺序定义当前轮，轮次数字可因补测重新开始。

        native = command("step3_foundation", ".", ["devecocli", "build"], 1)
        mixed = record_commands(3, [frontend, native])
        assert mixed.returncode == 0, mixed.stderr
        assert_state("failed")
        native["exitCode"] = 0
        mixed = record_commands(3, [native])
        assert mixed.returncode == 0, mixed.stderr
        assert_state("passed")
        root_build = command("framework_build", ".", ["npm", "run", "verify"], 1)
        root_check = command("framework_check", "./", ["npm", "run", "verify"])
        same_argv = record_commands(3, [root_build, root_check])
        assert same_argv.returncode == 0, same_argv.stderr
        assert_state("failed")  # 同 cwd/argv、不同 phase 不可互相覆盖。
        root_build.pop("cwd")
        root_build["exitCode"] = 0
        default_cwd = record_commands(3, [root_build])
        assert default_cwd.returncode == 0, default_cwd.stderr
        assert_state("passed")  # 未指定 cwd 与任务根 '.' 具有相同身份。

        exhausted = record_commands(5, [{**frontend, "exitCode": 1}, host, check])
        assert exhausted.returncode == 0, exhausted.stderr
        assert_state("failed")
        resumed = record_commands(1, [frontend, host, check])
        assert resumed.returncode == 0, resumed.stderr
        assert_state("passed")  # 只取末尾连续 round=1 段，不混入旧 round=1/5 失败。

        native_failed = record_commands(5, [{**native, "exitCode": 1}])
        assert native_failed.returncode == 0, native_failed.stderr
        assert_state("failed")
        native_resumed = record_commands(1, [native])
        assert native_resumed.returncode == 0, native_resumed.stderr
        assert_state("passed")  # 原生仍以最后追加的基础摘要为准。
        native_html = (om / "adaptation-report-B01.html").read_text(encoding="utf-8")
        assert "L1 构建" in native_html and "L2 静态检查" in native_html
        assert 'L2 静态检查</td><td><span class="badge neutral">未登记' in native_html
        native["argv"] += ["--check-script", "check.py"]
        assert record_commands(1, [native]).returncode == 0
        assert_state("passed")
        native_html = (om / "adaptation-report-B01.html").read_text(encoding="utf-8")
        assert 'L2 静态检查</td><td><span class="badge passed">通过' in native_html

        # 基础测试通过不能覆盖构建/分析失败，也不能扩增设备验证计数。
        build = command("framework_build", ".", ["flutter", "build", "hap"], 1)
        build["reason"] = "SignHap 证书路径失效 <待修复>"
        analyze = command("framework_check", ".", ["flutter", "analyze"], 1)
        analyze["reason"] = "基线 MyApp 类型错误"
        unit = command("framework_check", ".", ["flutter", "test"])
        assert record_commands(2, [build, analyze, unit]).returncode == 0
        assert_state("failed")
        html = (om / "adaptation-report-B01.html").read_text(encoding="utf-8")
        assert "SignHap 证书路径失效 &lt;待修复&gt;" in html and "基线 MyApp 类型错误" in html
        assert '基础测试 · flutter test</td><td><span class="badge passed">通过' in html
        payload = json.loads(_run_cli(render, om, "--batch-id", "B01").stdout)
        assert payload["counts"]["plans"] == payload["counts"]["passed"] == 1


def _assert_runtime_environments(skill_root: Path) -> None:
    """Only linked environment evidence classifies checks; missing L2 is never passed."""
    sys.path.insert(0, str(skill_root / "scripts"))
    from onemulti.reporting import batch_model, summary_model, runtime_groups

    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)
        ledger, index = _ledger(), _evidence()
        template = root / "assets" / "report" / "report-template.html"
        template.parent.mkdir(parents=True)
        shutil.copy2(skill_root / "assets" / "report" / "report-template.html", template)
        screenshot = root / "evidence" / "B01" / "round-1" / "layout.png"
        screenshot.parent.mkdir(parents=True)
        screenshot.write_bytes(_ONE_PIXEL_PNG)
        issue = ledger["issues"][0]
        issue["verificationPlan"].append({**issue["verificationPlan"][0], "checkId": "device"})
        issue["verificationResults"].append({"form": "LG", "checkId": "device",
                                             "status": "not_verified", "reason": "H5 尚未部署"})
        index["entries"][0]["data"]["phase"] = "framework_build"
        for env, check in (("browser_regression", "layout"), ("device_preparation", "device")):
            index["entries"].append({
                "evidenceId": f"E-{env}", "type": "command", "round": 1,
                "data": {"argv": [env], "exitCode": 0, "phase": env},
                "links": [{"issueId": issue["issueId"], "form": "LG", "checkId": check}],
            })
        _write_json(root / "decisions.json", ledger)
        _write_json(root / "evidence" / "index.json", index)
        model = batch_model(ledger, index, root, "B01")
        assert model["foundation"]["buildStatus"] == "passed"
        assert model["foundation"]["checkStatus"] == "not_verified"
        assert model["runtimeGroups"]["浏览器检查"]["passed"] == 1
        assert model["runtimeGroups"]["设备验证"]["not_verified"] == 1
        assert model["conclusion"] == "failed"  # 浏览器通过不覆盖设备未验证。

        render = skill_root / "scripts" / "render-report.py"
        for batch_id in ("B01", "B02"):
            result = _run_cli(render, root, "--batch-id", batch_id)
            assert result.returncode == 0, result.stderr
        html = (root / "adaptation-report-B01.html").read_text(encoding="utf-8")
        l2 = re.search(r'<tr><td>L2 静态检查</td>(.*?)</tr>', html).group(1)
        assert 'badge passed' not in l2 and "无静态检查记录" in l2 and "未登记" in l2
        assert "浏览器检查：1 项通过" in html and "设备验证：1 项未验证" in html

        for batch in ledger["batches"]:
            batch["status"], batch["testConclusion"] = "completed", "failed"
        ledger["task"]["status"] = "completed"
        _write_json(root / "decisions.json", ledger)
        summary = summary_model(ledger, index, root)
        assert summary["runtimeGroups"]["浏览器检查"]["passed"] == 1
        assert summary["runtimeGroups"]["设备验证"]["not_verified"] == 1
        assert summary["runtimeGroups"]["运行态验证"]["not_verified"] == 1
        assert sum(sum(values.values()) for values in summary["runtimeGroups"].values()) == summary["counts"]["plans"]
        result = _run_cli(render, root, "--summary")
        assert result.returncode == 0, result.stderr
        assert "设备验证：1 项未验证" in (root / "adaptation-summary.html").read_text(encoding="utf-8")

        # 名称和形态不是执行环境；无 phase 保持旧版原生展示，冲突关联不重复计数。
        assert runtime_groups(model["rows"], []) == {}
        duplicate = json.loads(json.dumps(index["entries"][-2]))
        duplicate["data"]["phase"] = "device_verification"
        groups = runtime_groups(model["rows"], [*index["entries"], duplicate])
        assert groups["其他运行检查"]["passed"] == 1
        assert sum(sum(values.values()) for values in groups.values()) == 2
        # 全部跳过时，准备命令仅关联部分计划也不拆成设备/其他检查。
        skipped = [{**row, "status": "not_verified", "reason": "multimodal_declined_by_user"}
                   for row in model["rows"]]
        groups = runtime_groups(skipped, index["entries"])
        assert list(groups) == ["运行态验证"] and groups["运行态验证"]["not_verified"] == 2


def run(skill_root: Path) -> tuple[bool, str]:
    """覆盖报告主流程；返回统一用例结果供 run_evals.py 展示。"""
    script = skill_root / "scripts" / "render-report.py"
    template = skill_root / "assets" / "report" / "report-template.html"
    try:
        _assert_framework_foundation(skill_root)
        _assert_runtime_environments(skill_root)
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / ".onemulti"
            target_template = root / "assets" / "report" / "report-template.html"
            target_template.parent.mkdir(parents=True)
            shutil.copy2(template, target_template)
            _write_json(root / "decisions.json", _ledger())
            _write_json(root / "evidence" / "index.json", _evidence())
            _write_json(root / "output" / "route-map.json", {"routes": []})
            screenshot = root / "evidence" / "B01" / "round-1" / "layout.png"
            screenshot.parent.mkdir(parents=True)
            screenshot.write_bytes(_ONE_PIXEL_PNG)

            inputs_before = (_digest(root / "decisions.json"), _digest(root / "evidence" / "index.json"))
            first = _run_cli(script, root, "--batch-id", "B01")
            assert first.returncode == 0, first.stderr
            payload = json.loads(first.stdout)
            assert payload["testConclusion"] == "passed"
            assert payload["flowStatus"] == "completed"
            assert payload["verificationState"] == "passed"
            assert payload["counts"] == {
                "blocked": 0,
                "changedFiles": 1,
                "failed": 0,
                "issues": 1,
                "modified": 1,
                "notApplicable": 0,
                "notModified": 0,
                "notVerified": 0,
                "passed": 1,
                "plans": 1,
            }
            report_b01 = root / "adaptation-report-B01.html"
            html = report_b01.read_text(encoding="utf-8")
            assert "验证截图" in html and "data:image/png;base64," in html
            assert "B01 · 批次报告" in html
            assert "B01 · 批次报告 ·" not in html
            assert "LG · layout" in html
            assert "<th>原因</th><th>证据</th>" in html
            assert "<th>检查</th><th>最终结果</th><th>说明</th>" in html
            assert "L1 构建" in html and "L2 静态检查" in html and "运行态验证" in html
            assert 'class="metric" href="#changes"' in html
            assert 'class="metric" href="#validation"' in html
            assert 'id="changes"' in html and 'id="validation"' in html
            assert 'aria-label="报告导航"' in html and "B01 · 报告导航" in html
            assert "grid-template-columns: 204px minmax(0, 1fr)" in html
            _assert_navigation_targets(html)
            assert "查看详细执行记录" not in html
            assert 'id="history"' not in html and 'href="#history"' not in html
            assert "未发现适配前历史问题" not in html
            assert "<script>alert(1)</script>" not in html
            assert "&lt;script&gt;alert(1)&lt;/script&gt;&amp;" in html
            assert 'src="http' not in html and 'href="http' not in html
            assert "路由表" not in html
            assert inputs_before == (
                _digest(root / "decisions.json"),
                _digest(root / "evidence" / "index.json"),
            ), "报告脚本修改了账本或 evidence"

            first_digest = _digest(report_b01)
            repeated = _run_cli(script, root, "--batch-id", "B01")
            assert repeated.returncode == 0, repeated.stderr
            assert _digest(report_b01) == first_digest, "相同输入重复生成不确定"

            no_proof = json.loads((root / "evidence" / "index.json").read_text(encoding="utf-8"))
            no_proof["entries"] = [
                entry for entry in no_proof["entries"] if entry["evidenceId"] != "E-SHOT-01"
            ]
            _write_json(root / "evidence" / "index.json", no_proof)
            no_proof_result = _run_cli(script, root, "--batch-id", "B01")
            assert no_proof_result.returncode != 0
            assert _digest(report_b01) == first_digest, "缺少验证证据时覆盖了有效报告"
            _write_json(root / "evidence" / "index.json", _evidence())

            second = _run_cli(script, root, "--batch-id", "B02")
            assert second.returncode == 0, second.stderr
            second_payload = json.loads(second.stdout)
            assert second_payload["testConclusion"] == "failed"
            assert second_payload["flowStatus"] == "completed"
            assert second_payload["verificationState"] == "incomplete"
            assert second_payload["counts"]["notVerified"] == 1
            html_b02 = (root / "adaptation-report-B02.html").read_text(encoding="utf-8")
            assert "验证截图" not in html_b02 and "data:image/" not in html_b02
            assert "任务流程：已完成" in html_b02 and "基础验证通过" in html_b02
            assert '<span>任务流程</span><strong>已完成</strong>' in html_b02
            assert "未进行多模态验证（用户跳过）" in html_b02
            assert "待补充验证" in html_b02
            assert "1 项运行态检查尚未完成" in html_b02
            assert 'class="metric" href="#pending-validation"' in html_b02
            assert 'id="pending-validation"' in html_b02
            assert "<h2>未解决问题</h2>" not in html_b02
            validation_table = html_b02.split("<h2>验证结果矩阵</h2>", 1)[1].split("</table>", 1)[0]
            assert "<th>证据</th>" not in validation_table
            assert "multimodal_declined_by_user" not in html_b02
            assert "<span>最终结论</span>" not in html_b02

            foundation_failed = _evidence()
            foundation_failed["entries"][1]["data"]["exitCode"] = 1
            _write_json(root / "evidence" / "index.json", foundation_failed)
            failed_foundation = _run_cli(script, root, "--batch-id", "B02")
            assert failed_foundation.returncode == 0, failed_foundation.stderr
            assert json.loads(failed_foundation.stdout)["flowStatus"] == "completed"
            assert json.loads(failed_foundation.stdout)["testConclusion"] == "failed"
            failed_foundation_html = (root / "adaptation-report-B02.html").read_text(
                encoding="utf-8"
            )
            assert "验证未通过" in failed_foundation_html
            assert "L1/L2 基础检查" in failed_foundation_html
            assert "构建或静态检查至少一项未通过" in failed_foundation_html

            # 修复轮通过后读取最新基础结果，不被第一轮失败永久锁定。
            repaired = _evidence()
            repaired["entries"][0]["data"]["exitCode"] = 1
            repaired["entries"].append({
                "evidenceId": "E-REPAIRED", "type": "command", "round": 5,
                "links": [{"issueId": "B01-UI-001"}],
                "data": {"argv": ["devecocli", "build"], "exitCode": 0,
                         "phase": "step3_foundation"},
            })
            _write_json(root / "evidence" / "index.json", repaired)
            recovered = _run_cli(script, root, "--batch-id", "B01")
            assert recovered.returncode == 0, recovered.stderr
            assert json.loads(recovered.stdout)["testConclusion"] == "passed"
            _write_json(root / "evidence" / "index.json", foundation_failed)

            ledger = json.loads((root / "decisions.json").read_text(encoding="utf-8"))
            ledger["task"]["status"] = "completed"
            ledger["task"]["currentBatch"] = "B02"
            for batch in ledger["batches"]:
                batch["status"] = "completed"
                batch["testConclusion"] = "passed" if batch["batchId"] == "B01" else "failed"
            _write_json(root / "decisions.json", ledger)
            summary = _run_cli(script, root, "--summary")
            assert summary.returncode == 0, summary.stderr
            summary_payload = json.loads(summary.stdout)
            assert summary_payload["testConclusion"] == "failed"
            assert summary_payload["flowStatus"] == "completed"
            assert summary_payload["verificationState"] == "failed"
            assert summary_payload["counts"]["issues"] == 2
            summary_html = (root / "adaptation-summary.html").read_text(encoding="utf-8")
            assert "adaptation-report-B01.html" in summary_html
            assert "adaptation-report-B02.html" in summary_html
            assert "汇总报告导航" in summary_html and "批次报告" in summary_html
            assert summary_html.count('class="nav-batch"') == 2
            _assert_navigation_targets(summary_html)
            assert "基础检查未通过，仍有 1 项运行或视觉检查未验证" in summary_html
            assert "0 项验证失败" not in summary_html

            # 补测改变结论后可刷新已完成批次，旧 testConclusion 不再阻断报告。
            ledger["batches"][0]["testConclusion"] = "failed"
            _write_json(root / "decisions.json", ledger)
            ledger_before_refresh = _digest(root / "decisions.json")
            refreshed = _run_cli(script, root, "--batch-id", "B01")
            assert refreshed.returncode == 0, refreshed.stderr
            assert json.loads(refreshed.stdout)["testConclusion"] == "passed"
            assert _digest(root / "decisions.json") == ledger_before_refresh

            valid_report_digest = _digest(report_b01)
            broken = json.loads((root / "evidence" / "index.json").read_text(encoding="utf-8"))
            broken["entries"][-1]["path"] = "evidence/B01/round-1/missing.png"
            _write_json(root / "evidence" / "index.json", broken)
            rejected = _run_cli(script, root, "--batch-id", "B01")
            assert rejected.returncode != 0
            assert report_b01.exists() and _digest(report_b01) == valid_report_digest, (
                "异常输入覆盖了上一份有效报告"
            )

            # 有历史 Issue 时仍展示章节和导航，不能因空章节优化一并丢失。
            baseline_ledger = _ledger()
            baseline_ledger["issues"][0]["source"] = "baseline"
            _write_json(root / "decisions.json", baseline_ledger)
            _write_json(root / "evidence" / "index.json", _evidence())
            with_history = _run_cli(script, root, "--batch-id", "B01")
            assert with_history.returncode == 0, with_history.stderr
            history_html = report_b01.read_text(encoding="utf-8")
            assert 'id="history"' in history_html and 'href="#history"' in history_html
            _assert_navigation_targets(history_html)
    except Exception as error:  # noqa: BLE001 - 契约需返回完整失败原因
        return False, str(error)
    return True, "批次/汇总、三方多根基础检查、原生回归、截图、确定性和异常拒绝均通过"
