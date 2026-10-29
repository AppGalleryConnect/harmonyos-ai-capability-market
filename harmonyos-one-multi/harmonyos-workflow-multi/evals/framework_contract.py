"""通过公开 CLI 验证 H5/RN/Flutter 账本接入与可选风险扫描边界。"""

from __future__ import annotations

from contextlib import redirect_stderr, redirect_stdout
import importlib.util
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from unittest.mock import patch


def check_device_preparation(skill_root: Path) -> None:
    """模拟 CLI 的真实结果，验证失败分类；不连接或改动本机设备。"""
    script = skill_root / "scripts" / "verification" / "prepare-device.py"
    spec = importlib.util.spec_from_file_location("prepare_device_eval", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    instance = "ExistingFold"
    rows = [{"name": instance, "deviceType": "triplefold", "status": "stopped"}]
    connected = f"{instance}  127.0.0.1:5555  emulator  triplefold\n"
    original_error = "first cause\n" + "x" * 1100 + "\nlast cause"
    plans = [
        {"issueId": "B01-001", "form": "foldable-expanded", "checkId": "fold"},
        {"issueId": "B01-001", "form": "tablet-landscape", "checkId": "tablet"},
    ]

    for case in ("start-failed", "list-failed", "connect-timeout", "cleanup-failed",
                 "reused", "started", "missing", "partial-route"):
        calls: list[list[str]] = []
        state = {"stage": "multimodal_approved", "batchId": "B01"}
        case_plans = plans
        if case == "partial-route":
            case_plans = [{**plans[0], "form": "phone-portrait"}, plans[1]]
            state["unavailablePlans"] = [case_plans[0]]

        def fake_run(argv: list[str], *, timeout: float) -> subprocess.CompletedProcess[str]:
            calls.append(argv)
            command = argv[1:]
            code, output, error = 0, "", ""
            if command == ["device", "list"]:
                if case == "partial-route":
                    output = "ExistingTablet  tablet-serial  device  tablet\n"
                elif case == "reused" or (case == "started" and len(calls) > 1):
                    output = connected
            elif command == ["emulator", "list", "--format", "json"]:
                if case == "list-failed":
                    code, error = 7, "instance list unavailable"
                else:
                    output = json.dumps([] if case in {"missing", "partial-route"} else rows)
            elif command == ["emulator", "start", instance]:
                if case == "start-failed":
                    code, output, error = 1, "image lookup", original_error
            elif command == ["emulator", "stop", instance]:
                if case == "cleanup-failed":
                    raise module.PrepareError("cleanup timed out", command=argv)
            else:
                raise AssertionError(f"unexpected device command: {argv}")
            return subprocess.CompletedProcess(argv, code, output, error)

        output, error = io.StringIO(), io.StringIO()
        with patch.object(sys, "argv", [str(script), ".", "--connect-timeout", "0.01"]), \
                patch.object(module.shutil, "which", return_value="fixture-cli"), \
                patch.object(module, "load_state", return_value=state), \
                patch.object(module, "current_plans", return_value=case_plans), \
                patch.object(module, "require_license"), \
                patch.object(module, "bind", return_value="FULL") as bind, \
                patch.object(module, "run", side_effect=fake_run), \
                patch.object(module.time, "monotonic", side_effect=range(100)), \
                redirect_stdout(output), redirect_stderr(error):
            code = module.main()

        result = json.loads(error.getvalue() if code else output.getvalue())
        if case in {"reused", "started", "partial-route"}:
            assert code == 0 and result.get("mode") == "FULL", result
            assert result["started"] == (case == "started")
            assert bind.call_count == 1
            if case == "partial-route":
                assert result["device"]["serial"] == "tablet-serial"
                assert calls == [["fixture-cli", "device", "list"]]
                assert state["unavailablePlans"] == [case_plans[0]] and len(case_plans) == 2
        elif case == "missing":
            assert code == 0 and result["next"] == "ask-install"
            assert bind.call_count == 0
        else:
            assert code == 2 and result["ok"] is False and "next" not in result
            assert bind.call_count == 0
            if case == "start-failed":
                assert result["action"] == "start-emulator" and result["instanceName"] == instance
                assert result["command"] == ["fixture-cli", "emulator", "start", instance]
                assert result["exitCode"] == 1
                assert "image lookup" in result["error"] and original_error in result["error"]
            elif case == "list-failed":
                assert result["action"] == "list-instances" and result["exitCode"] == 7
                assert result["command"] == ["fixture-cli", "emulator", "list", "--format", "json"]
            else:
                assert result["action"] == "connect-device" and result["instanceName"] == instance
                assert result["exitCode"] is None  # 连接等待超时没有进程退出码。
                assert ["fixture-cli", "emulator", "stop", instance] in calls
                if case == "cleanup-failed":
                    assert result["cleanupError"] == "cleanup timed out"

    argv = ["fixture-cli", "emulator", "start", instance]
    with patch.object(module.subprocess, "run", side_effect=subprocess.TimeoutExpired(argv, 1)):
        try:
            module.run(argv, timeout=1)
        except module.PrepareError as error:
            assert error.command == argv and error.exit_code is None
        else:
            raise AssertionError("命令超时必须保留调用信息")


def run(skill_root: Path) -> tuple[bool, str]:
    script = skill_root.resolve() / "scripts" / "task-ledger.py"
    scanner = skill_root.resolve() / "scripts" / "scanners" / "scan-h5-adaptation.mjs"
    cases = [
        ("B01", "h5", "web/src/pages/Login.vue", "<template><main>Login</main></template>\n"),
        ("B02", "rn", "rn/src/screens/Home.tsx",
         "import { Text } from 'react-native';\nexport default () => <Text>Home</Text>;\n"),
        ("B03", "flutter", "flutter/lib/pages/Cart.dart",
         "import 'package:flutter/widgets.dart';\n"
         "class Cart extends StatelessWidget {\n"
         "  const Cart({super.key});\n"
         "  Widget build(BuildContext context) => const Text('Cart');\n}\n"),
    ]

    with tempfile.TemporaryDirectory(prefix="onemulti-framework-eval-") as temporary:
        root = Path(temporary)
        project = root / "project"
        om = project / ".onemulti"
        ledger = om / "decisions.json"
        route_map = om / "output" / "route-map.json"

        def write_json(path: Path, value: object) -> None:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")

        def command(executable: str, *arguments: str, expect: int = 0) -> subprocess.CompletedProcess[str]:
            result = subprocess.run(
                [executable, *arguments], cwd=project,
                text=True, capture_output=True, check=False, timeout=30,
            )
            assert result.returncode == expect, (
                f"{' '.join(arguments)} exited {result.returncode}, expected {expect}: "
                f"{result.stdout}{result.stderr}"
            )
            return result

        def ledger_command(*arguments: str, expect: int = 0) -> None:
            command(sys.executable, "-B", str(script), *arguments, expect=expect)

        try:
            for _, _, page, source in cases:
                path = project / page
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(source, encoding="utf-8")

            routes = [{
                "routeId": f"R-{batch_id}", "batchId": batch_id, "targetPage": page,
                "steps": [{
                    "stepId": "S01", "action": "launch", "desc": f"打开 {Path(page).stem}",
                    "target": "framework-fixture/EntryAbility", "expectPage": Path(page).stem,
                }],
            } for batch_id, _, page, _ in cases]
            routes[0]["steps"] = []
            routes[0]["unavailableReason"] = "仅交付 H5 源码，尚未提供运行宿主"
            write_json(route_map, {"schemaVersion": 1, "routes": routes, "unresolved": []})
            bootstrap = root / "bootstrap.json"
            write_json(bootstrap, {
                "task": {
                    "taskId": "framework-contract", "scope": [page for _, _, page, _ in cases],
                    "targetForms": ["phone-portrait"], "confirmationMode": "batch",
                    "currentBatch": "B01",
                },
                "decisions": [],
                "pages": [{
                    "path": page, "type": "page", "module": page.split("/")[0],
                    "dependencies": [],
                } for _, _, page, _ in cases],
                "batches": [{
                    "batchId": batch_id, "pages": [page], "dependencies": [],
                    "predecessors": [], "domains": [domain], "risk": "low",
                } for batch_id, domain, page, _ in cases],
            })
            # 不运行 project-scan；从经人工核实的真实相对路径直接建立计划。
            ledger_command("bootstrap", str(ledger), "--input", str(bootstrap),
                           "--route-map", str(route_map))
            data = json.loads(ledger.read_text(encoding="utf-8"))
            assert set(data["pages"]) == {page for _, _, page, _ in cases}
            assert data["task"]["routeMap"] == "output/route-map.json"
            assert data["issues"] == []
            batches = {batch["batchId"]: batch for batch in data["batches"]}
            assert len(batches) == 3
            for batch_id, domain, page, _ in cases:
                assert (project / page).is_file()
                assert data["pages"][page]["batchId"] == batch_id
                assert batches[batch_id]["pages"] == [page]
                assert batches[batch_id]["domains"] == [domain]

            scanner_detail = "H5 扫描跳过（Node.js 不可用）"
            if node := shutil.which("node"):
                web = project / "web"
                for ignored in (".onemulti", ".preview"):
                    artifact = web / ignored / "generated.js"
                    artifact.parent.mkdir(parents=True)
                    artifact.write_text("navigator.userAgent;\n", encoding="utf-8")
                before_scan = ledger.read_bytes()
                command(node, str(scanner), str(web))
                risk_file = web / "src" / "layout-risk.js"
                risk_file.write_text("navigator.userAgent;\n", encoding="utf-8")
                command(node, str(scanner), str(web), expect=1)
                command(node, str(scanner), str(project / "missing-web"), expect=2)
                assert ledger.read_bytes() == before_scan, "扫描线索不得自动成为账本问题"
                scanner_detail = "H5 退出码 0/1/2、产物目录过滤和风险/issue 隔离通过"

            issues = []
            for batch_id, domain, page, _ in cases:
                issue = {
                    "issueId": f"{batch_id}-001", "batchId": batch_id,
                    "page": page, "domain": domain, "targetForms": ["phone-portrait"],
                    "problem": "窄窗口下内容溢出", "source": "task_analysis",
                    "rootCause": "页面主容器未按可用宽度收缩", "proposal": "按父约束布局",
                    "plannedFiles": [page],
                    "verificationPlan": [{
                        "form": "phone-portrait", "checkId": "layout-width",
                        "routeId": f"R-{batch_id}", "check": "内容不超出可用窗口",
                    }],
                }
                issues.append(issue)
                issue_input = root / f"{batch_id}-issues.json"
                write_json(issue_input, {"issues": [issue]})
                ledger_command("put-issues", str(ledger), "--batch-id", batch_id,
                               "--input", str(issue_input))

            ledger_command("validate", str(ledger))
            data = json.loads(ledger.read_text(encoding="utf-8"))
            stored = {issue["issueId"]: issue for issue in data["issues"]}
            assert len(stored) == 3
            route_by_id = {route["routeId"]: route for route in routes}
            for batch_id, domain, page, _ in cases:
                issue = stored[f"{batch_id}-001"]
                assert (issue["batchId"], issue["domain"], issue["page"]) == (batch_id, domain, page)
                route = route_by_id[issue["verificationPlan"][0]["routeId"]]
                assert (route["batchId"], route["targetPage"]) == (batch_id, page)

            # 路径不要求 ETS，但跨批次 routeId 仍必须被正式入口拒绝且不能污染账本。
            invalid = dict(issues[0])
            invalid["verificationPlan"] = [{**issues[0]["verificationPlan"][0], "routeId": "R-B02"}]
            invalid_input = root / "cross-batch-issue.json"
            write_json(invalid_input, invalid)
            before_invalid = ledger.read_bytes()
            ledger_command("put-issues", str(ledger), "--batch-id", "B01",
                           "--input", str(invalid_input), expect=1)
            assert ledger.read_bytes() == before_invalid

            # 暂不可执行路径可进入 SPEC 和静态验证，但不能伪造运行通过。
            preflight = skill_root / "scripts" / "verification" / "preflight.py"
            evidence = skill_root / "scripts" / "verification" / "evidence-session.py"
            modified = root / "modified.json"
            write_json(modified, {"issue": {"changeStatus": "modified",
                       "changedFiles": [cases[0][2]], "changeSummary": "按可用宽度收缩"}})
            ledger_command("transition-issue", str(ledger), "B01-001", "--input", str(modified))
            result = command(sys.executable, str(preflight), "begin", str(project))
            state = json.loads(result.stdout)
            assert state["mode"] == "STATIC_ONLY" and state["stage"] == "route_validated"
            assert state["reason"] == "route_unavailable" and state["next"] == "record-static-only-results"
            unavailable = state["unavailablePlans"]
            assert len(unavailable) == 1 and unavailable[0]["status"] == "not_verified"
            probe = command(sys.executable, str(preflight), "record-multimodal", str(project),
                            "--available", "--description", "不应读取探测图")
            assert json.loads(probe.stdout)["next"] == "record-static-only-results"

            record_input = root / "results.json"
            base_command = {"argv": ["npm", "run", "build"], "cwd": "web", "exitCode": 0,
                            "phase": "framework_build", "links": [{"issueId": "B01-001"}]}
            write_json(record_input, {"round": 1, "commands": [base_command],
                                     "artifacts": [], "results": unavailable})
            command(sys.executable, str(evidence), "record-batch", str(project), "--input", str(record_input))
            saved = json.loads(ledger.read_text(encoding="utf-8"))["issues"][0]["verificationResults"]
            assert saved[0]["status"] == "not_verified"
            template = om / "assets" / "report" / "report-template.html"
            template.parent.mkdir(parents=True)
            shutil.copy2(skill_root / "assets" / "report" / "report-template.html", template)
            report = skill_root / "scripts" / "render-report.py"
            static_report = json.loads(command(sys.executable, str(report), str(om), "--batch-id", "B01").stdout)
            assert static_report["verificationState"] == "incomplete"
            assert static_report["counts"]["notVerified"] == 1
            before_rejection = (ledger.read_bytes(), (om / "evidence" / "index.json").read_bytes())
            write_json(record_input, {"round": 1, "commands": [], "artifacts": [],
                                     "results": [{**unavailable[0], "status": "passed"}]})
            command(sys.executable, str(evidence), "record-batch", str(project),
                    "--input", str(record_input), expect=2)
            assert before_rejection == (ledger.read_bytes(), (om / "evidence" / "index.json").read_bytes())

            # 部分路径不可执行时，其他路径仍可按原流程验证并登记真实结果。
            routes.append({"routeId": "R-B01-READY", "batchId": "B01", "targetPage": cases[0][2],
                           "steps": [{"stepId": "S01", "action": "launch", "desc": "打开可运行测试页",
                                      "target": "fixture/AvailableAbility"}]})
            write_json(route_map, {"schemaVersion": 1, "routes": routes, "unresolved": []})
            issue = json.loads(ledger.read_text(encoding="utf-8"))["issues"][0]
            issue["verificationPlan"].append({**issue["verificationPlan"][0],
                                             "checkId": "available-layout", "routeId": "R-B01-READY"})
            write_json(invalid_input, issue)
            ledger_command("put-issues", str(ledger), "--batch-id", "B01", "--input", str(invalid_input))
            mixed = json.loads(command(sys.executable, str(preflight), "begin", str(project)).stdout)
            assert mixed["next"] == "record-multimodal" and len(mixed["unavailablePlans"]) == 1
            write_json(record_input, {"round": 1, "commands": [{
                "argv": ["fixture-runtime-check"], "exitCode": 0,
                "links": [{"issueId": "B01-001", "form": "phone-portrait", "checkId": "available-layout"}],
            }], "artifacts": [], "results": [{"issueId": "B01-001", "form": "phone-portrait",
                "checkId": "available-layout", "status": "passed"}]})
            command(sys.executable, str(evidence), "record-batch", str(project), "--input", str(record_input))
            ledger_command("validate", str(ledger))
            partial_report = json.loads(command(sys.executable, str(report), str(om), "--batch-id", "B01").stdout)
            assert partial_report["verificationState"] == "incomplete"
            assert partial_report["counts"]["passed"] == 1 and partial_report["counts"]["notVerified"] == 1

            # 已授权/绑定后可明确改选基础测试，不重建边界、重探测或丢失清理信息。
            index_path = om / "evidence" / "index.json"
            probe_image = om / "assets" / "verification" / "startIcon.png"
            probe_image.parent.mkdir(parents=True)
            device_input = root / "device.json"
            write_json(device_input, {"kind": "emulator", "identifier": "fixture-device"})
            for bind_device in (False, True):
                shutil.copy2(skill_root / "assets" / "verification" / "startIcon.png", probe_image)
                command(sys.executable, str(preflight), "begin", str(project))
                command(sys.executable, str(preflight), "record-multimodal", str(project),
                        "--available", "--description", "测试图标")
                approved = json.loads(command(sys.executable, str(preflight), "record-test-scope",
                                             str(project), "--choice", "basic_and_multimodal").stdout)
                assert approved["stage"] == "multimodal_approved" and approved["next"] == "prepare-device"
                if bind_device:
                    command(sys.executable, str(preflight), "bind-device", str(project),
                            "--input", str(device_input))
                before_switch = json.loads(index_path.read_text(encoding="utf-8"))
                before_ledger = ledger.read_bytes()
                # 不扩展原 basic_and_multimodal 授权门禁，也不以改选触发图片探测。
                command(sys.executable, str(preflight), "record-test-scope", str(project),
                        "--choice", "basic_and_multimodal", expect=2)
                assert json.loads(index_path.read_text(encoding="utf-8")) == before_switch
                probe_image.unlink()
                declined = json.loads(command(sys.executable, str(preflight), "record-test-scope",
                                             str(project), "--choice", "basic_only").stdout)
                assert declined == {"mode": "STATIC_ONLY", "stage": "multimodal_declined",
                                    "next": "record-static-only-results", "reason": "multimodal_declined_by_user"}
                expected = json.loads(json.dumps(before_switch))
                frozen = next(item["data"] for item in expected["entries"]
                              if item["evidenceId"] == "E-PREFLIGHT")
                frozen.update({"mode": "STATIC_ONLY", "stage": "multimodal_declined",
                               "reason": "multimodal_declined_by_user"})
                assert json.loads(index_path.read_text(encoding="utf-8")) == expected
                assert ledger.read_bytes() == before_ledger
                command(sys.executable, str(preflight), "bind-device", str(project),
                        "--input", str(device_input), expect=2)
                assert json.loads(index_path.read_text(encoding="utf-8")) == expected

            # STOPPED 的失败边界不能借 basic_only 放行，即使计划哈希仍然匹配。
            valid_ledger = json.loads(ledger.read_text(encoding="utf-8"))
            failed_boundary = json.loads(json.dumps(valid_ledger))
            failed_boundary["issues"][0]["changedFiles"] = []
            write_json(ledger, failed_boundary)
            command(sys.executable, str(preflight), "begin", str(project), expect=2)
            stopped = index_path.read_bytes()
            assert next(item["data"] for item in json.loads(stopped)["entries"]
                        if item["evidenceId"] == "E-PREFLIGHT")["stage"] == "boundary_failed"
            command(sys.executable, str(preflight), "record-test-scope", str(project),
                    "--choice", "basic_only", expect=2)
            assert index_path.read_bytes() == stopped
            assert json.loads(ledger.read_text(encoding="utf-8")) == failed_boundary
            write_json(ledger, valid_ledger)

            # 缺少原因/同时声明可执行步骤和不可执行原因均为无效契约。
            valid_routes = json.loads(route_map.read_text(encoding="utf-8"))
            for bad_route in ({key: value for key, value in routes[0].items() if key != "unavailableReason"},
                              {**routes[-1], "unavailableReason": "运行目标未提供"}):
                changed = json.loads(json.dumps(valid_routes))
                changed["routes"][0] = {**bad_route, "routeId": "R-B01"}
                write_json(route_map, changed)
                ledger_command("validate", str(ledger), expect=1)
            write_json(route_map, valid_routes)

            # 共同根旁边的目录和生成产物不进入 scope 快照，也不跟随符号链接。
            sys.path.insert(0, str(skill_root / "scripts" / "verification"))
            from preflight import source_snapshot
            unrelated = project / "unrelated" / "secret.txt"
            unrelated.parent.mkdir()
            unrelated.write_text("outside one", encoding="utf-8")
            (project / "web" / "outside-link").symlink_to(unrelated.parent, target_is_directory=True)
            generated = project / "web" / "dist" / "bundle.js"
            generated.parent.mkdir()
            generated.write_text("generated one", encoding="utf-8")
            scope = ["web", "rn"]
            snapshot = source_snapshot(project, scope)
            unrelated.write_text("outside two", encoding="utf-8")
            generated.write_text("generated two", encoding="utf-8")
            assert source_snapshot(project, scope) == snapshot
            (project / cases[0][2]).write_text("changed source", encoding="utf-8")
            assert source_snapshot(project, scope) != snapshot
            return True, f"三框架 bootstrap、不可执行路径静态/部分验证、拒绝假通过及范围快照通过；{scanner_detail}"
        except (AssertionError, OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
            return False, str(error)
