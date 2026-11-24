"""
Nexus Flagship Features Unit & Integration Test Suite
=============================================================================
Validates all 16 integrated Flagship capabilities:
- Feature 4: Tool Synthesizer (FRIDAY)
- Feature 5: Dual-Agent Hierarchy & AIP (UFO)
- Feature 8: Password Vault Bridge & Resilient Matching (Skyvern)
- Feature 9: Tree-sitter Codebase Symbol Map (Aider)
- Feature 10: Architect / Editor Pipeline (Aider)
- Feature 11: ACI Editor with AST Pre-Verification (SWE-agent)
- Feature 12: Cumulative Diff Sandbox & Plan Branching (Plandex)
- Feature 13: Persistent Learning Graph (Hermes-Agent)
- Feature 14: Context Micro-Compaction & Pin-Anchoring (Hermes-Agent)
- Feature 15: Credential Pool & 429 Cooldown Cascade (Hermes-Agent)
- Feature 16: Repetition Guard & Hardware E-Stop (Hermes-Agent)
- Feature 17: Voice Pipeline & Barge-In VAD (Pipecat / IRIS)
- Feature 18: Telephony Alerting Gateway (Bolna)
- Feature 19: Omnichannel Remote Bridge (OpenClaw)
- Feature 20: Ephemeral Containment (Bytebot / OpenHands)
- Feature 21: SOP Role Chain Engine (MetaGPT / ChatDev)
=============================================================================
"""

import os
import shutil
import tempfile
import unittest
from pathlib import Path

from engine.tool_synthesizer import ToolSynthesizer
from engine.hierarchy import HostAgent, AppAgent, AIPMessage
from engine.vault_bridge import PasswordVaultBridge
from engine.repo_map import RepoMapGenerator
from engine.architect_editor import ArchitectEditorPipeline
from engine.tools.aci_editor import ACIEditor
from engine.plan_branch import CumulativeDiffSandbox
from engine.learning_graph import PersistentLearningGraph
from engine.context_compactor import ContextCompactor
from engine.credential_pool import CredentialPoolManager
from engine.safety_guard import SafetyGuard, RepetitionCircuitBreakException, EmergencyStopException
from bridge.voice_pipeline import VoicePipeline
from bridge.telephony_gateway import TelephonyGateway
from bridge.omnichannel_bridge import OmnichannelBridge
from engine.containment import ContainmentManager
from engine.sop_chain import SOPChainEngine
from engine.bbon_reranker import BehaviorBestOfNReranker, CandidateTrajectory
from engine.vla_grounding import VLAGroundingEngine, GroundedUIElement
from engine.demo_compiler import DemonstrationCompiler, DemonstrationProgram
from engine.tools.dom_distiller import DOMDistiller, DistilledElement
from engine.tools.fit_markdown import FitMarkdownGenerator


class TestFlagshipFeatures(unittest.TestCase):

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="nexus_flagship_test_")

    def tearDown(self):
        SafetyGuard.reset_estop()
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    # 1. Feature 4: Self-Synthesizing Tool Registry
    def test_tool_synthesizer(self):
        syn = ToolSynthesizer(storage_dir=os.path.join(self.temp_dir, "tools"))
        code = """
def execute(a: int, b: int) -> int:
    return a * b + 10
"""
        res = syn.register_tool(
            name="multiply_add",
            code=code,
            description="Multiplies numbers and adds ten",
            tags=["math", "calculation"],
            test_inputs={"a": 3, "b": 4}
        )
        self.assertTrue(res["success"])
        exec_res = syn.execute_tool("multiply_add", a=5, b=6)
        self.assertTrue(exec_res["success"])
        self.assertEqual(exec_res["result"], 40)

        # Keyword search
        matches = syn.search_tools("math calculation")
        self.assertTrue(len(matches) > 0)
        self.assertEqual(matches[0]["name"], "multiply_add")

    # 2. Feature 5: Dual-Agent Hierarchy & AIP
    def test_hierarchy_aip(self):
        host = HostAgent()
        resp = host.dispatch_aip(
            target_app="Excel",
            intent="EXPORT_CSV",
            payload={"path": "C:/data.csv"}
        )
        self.assertEqual(resp.status, "SUCCESS")
        self.assertIn("Excel", resp.payload["app"])
        self.assertEqual(len(host.aip_log), 2)  # Request + Reply

    # 3. Feature 8: Password Vault Bridge & Resilient Matching
    def test_vault_bridge(self):
        vault_path = os.path.join(self.temp_dir, "vault.enc")
        vault = PasswordVaultBridge(vault_path=vault_path)
        vault.set_secret("DATABASE_PASSWORD", "SuperSecretPass123!")

        # Token resolution
        raw = "Connect with ${VAULT:DATABASE_PASSWORD} to db"
        resolved = vault.resolve_tokens(raw)
        self.assertEqual(resolved, "Connect with SuperSecretPass123! to db")

        # Sanitization
        leaked_log = "Error during auth with SuperSecretPass123!"
        sanitized = vault.sanitize_text(leaked_log)
        self.assertNotIn("SuperSecretPass123!", sanitized)
        self.assertIn("[VAULT:DATABASE_PASSWORD]", sanitized)

        # Layout-resilient form matching
        candidates = ["ctl00$txtUserName", "login_email", "btnSubmit"]
        matched = vault.match_form_field(candidates, "username")
        self.assertEqual(matched, "ctl00$txtUserName")

    # 4. Feature 9: Tree-sitter Codebase Symbol Map
    def test_repo_map(self):
        # Create mock file in temp
        test_py = Path(self.temp_dir) / "sample_service.py"
        test_py.write_text("class UserService:\n    def get_user(self, uid):\n        pass\n\ndef helper():\n    pass\n")

        gen = RepoMapGenerator(self.temp_dir, max_tokens=256)
        repo_map = gen.generate_map()
        self.assertIn("sample_service.py", repo_map)
        self.assertIn("class UserService:", repo_map)
        self.assertIn("def get_user(uid)", repo_map)

    # 5. Feature 10: Architect / Editor Pipeline
    def test_architect_editor(self):
        pipeline = ArchitectEditorPipeline()
        plan = pipeline.formulate_plan("Refactor auth pipeline", "repo map text")
        self.assertEqual(plan.goal, "Refactor auth pipeline")

        # Linter check valid
        val_good = pipeline.validate_code_safety("test.py", "x = 10\nprint(x)\n")
        self.assertTrue(val_good["valid"])

        # Linter check invalid syntax
        val_bad = pipeline.validate_code_safety("test.py", "def broken(\n")
        self.assertFalse(val_bad["valid"])

    # 6. Feature 11: ACI Editor with AST Pre-Verification
    def test_aci_editor(self):
        editor = ACIEditor(workspace_root=self.temp_dir)
        py_file = Path(self.temp_dir) / "calc.py"
        py_file.write_text("def add(a, b):\n    return a + b\n")

        # Open file
        view = editor.open_file("calc.py", line_number=1, window_size=10)
        self.assertTrue(view["success"])
        self.assertEqual(view["total_lines"], 2)

        # Successful edit
        ed_res = editor.edit_file("calc.py", 2, 2, "    return (a + b) * 2\n")
        self.assertTrue(ed_res["success"])
        self.assertIn("return (a + b) * 2", py_file.read_text())

        # Attempt bad edit with syntax error (AST must catch it and reject modification)
        bad_res = editor.edit_file("calc.py", 2, 2, "    return (a + b *\n")
        self.assertFalse(bad_res["success"])
        self.assertIn("SyntaxVerificationError", bad_res["error"])
        # Verify file on disk remained unmodified
        self.assertIn("return (a + b) * 2", py_file.read_text())

    # 7. Feature 12: Cumulative Diff Sandbox & Plan Branching
    def test_plan_branching(self):
        sandbox = CumulativeDiffSandbox(workspace_root=self.temp_dir)
        target = Path(self.temp_dir) / "app.txt"
        target.write_text("Version 1.0\n")

        # Main branch stage
        sandbox.stage_file_change(str(target), "Version 1.1\n")
        diff_main = sandbox.get_cumulative_diff()
        self.assertIn("+Version 1.1", diff_main)

        # Create alternative branch B
        branch_b = sandbox.create_branch("explore-feature-b")
        sandbox.stage_file_change(str(target), "Version 2.0-experimental\n")
        diff_b = sandbox.get_cumulative_diff("explore-feature-b")
        self.assertIn("+Version 2.0-experimental", diff_b)

        # Apply branch B directly to disk
        sandbox.apply_to_workspace("explore-feature-b")
        self.assertEqual(target.read_text(), "Version 2.0-experimental\n")

    # 8. Feature 13: Persistent Learning Graph
    def test_learning_graph(self):
        db_path = os.path.join(self.temp_dir, "learn.db")
        graph = PersistentLearningGraph(db_path=db_path)

        lesson_id = graph.record_lesson(
            category="SHELL_COMMAND",
            mistake="Powershell curl alias fails on flags",
            fix="Use Invoke-RestMethod or curl.exe instead",
            trigger_keywords=["curl", "powershell", "invoke-webrequest"]
        )
        self.assertTrue(lesson_id > 0)

        # Query guidance
        guidance = graph.format_prompt_guidance("running curl in powershell script")
        self.assertIn("Use Invoke-RestMethod or curl.exe instead", guidance)

    # 9. Feature 14: Context Micro-Compaction & Pin-Anchoring
    def test_context_compactor(self):
        compactor = ContextCompactor(max_context_chars=500)
        verbose_stdout = "Standard message\n" + "\n".join([f"Line {i}: Processing item" for i in range(100)]) + "\nError: Critical failed connection\nDone"
        micro = compactor.micro_compact_output(verbose_stdout, max_lines=15)
        self.assertTrue(len(micro) < len(verbose_stdout))
        self.assertIn("truncated for compaction", micro)
        self.assertIn("Error: Critical failed connection", micro)

        # Multi-turn compaction
        msgs = [
            {"role": "system", "content": "System constraints"},
            {"role": "user", "content": "Step 1" * 50},
            {"role": "assistant", "content": "Result 1" * 50},
            {"role": "user", "content": "Step 2" * 50},
            {"role": "assistant", "content": "Latest active turn"}
        ]
        compacted = compactor.compact_history(msgs, target_chars=200)
        self.assertTrue(len(compacted) < len(msgs))

    # 10. Feature 15: Credential Pool & Rate-Limit Cooldown Cascade
    def test_credential_pool(self):
        pool = CredentialPoolManager()
        pool.add_key("groq", "gsk_primary_key_1111")
        pool.add_key("groq", "gsk_backup_key_2222")
        pool.add_key("gemini", "AIzaSy_gemini_fallback")

        prov, key = pool.get_active_credential()
        self.assertEqual(prov, "groq")
        self.assertEqual(key, "gsk_primary_key_1111")

        # Mark primary key on cooldown (429)
        pool.mark_rate_limited("groq", "gsk_primary_key_1111", cooldown_seconds=30.0)

        # Next call immediately fails over to backup key
        prov2, key2 = pool.get_active_credential()
        self.assertEqual(prov2, "groq")
        self.assertEqual(key2, "gsk_backup_key_2222")

        # Mark second key on cooldown
        pool.mark_rate_limited("groq", "gsk_backup_key_2222", cooldown_seconds=30.0)

        # Next call immediately cascades to Gemini fallback provider
        prov3, key3 = pool.get_active_credential()
        self.assertEqual(prov3, "gemini")
        self.assertEqual(key3, "AIzaSy_gemini_fallback")

    # 11. Feature 16: Repetition Guard & Hardware E-Stop
    def test_safety_guard(self):
        guard = SafetyGuard(loop_threshold=3)

        # Non-repeating actions
        guard.record_and_verify_action("terminal", {"cmd": "ls"})
        guard.record_and_verify_action("terminal", {"cmd": "pwd"})

        # Repetitive loop trigger
        guard.record_and_verify_action("terminal", {"cmd": "retry_failing_command"})
        guard.record_and_verify_action("terminal", {"cmd": "retry_failing_command"})
        with self.assertRaises(RepetitionCircuitBreakException):
            guard.record_and_verify_action("terminal", {"cmd": "retry_failing_command"})

        # E-Stop trigger
        SafetyGuard.trigger_estop("Test emergency halt")
        with self.assertRaises(EmergencyStopException):
            guard.record_and_verify_action("browser", {"url": "http://test.com"})
        SafetyGuard.reset_estop()

    # 12. Feature 17: Voice Pipeline & Barge-In VAD
    def test_voice_pipeline_barge_in(self):
        pipe = VoicePipeline(energy_threshold=0.1)
        interrupted = False

        def on_interrupt():
            nonlocal interrupted
            interrupted = True

        pipe.on_barge_in = on_interrupt
        pipe.is_speaking = True

        # Simulate user speech frame exceeding threshold in legacy VAD mode
        pipe.handle_incoming_audio_frame(0.25)
        self.assertTrue(interrupted)
        self.assertFalse(pipe.is_speaking)

    def test_voice_pipeline_disturbance_tolerance(self):
        # In keyword-protected mode, disturbance/noise DOES NOT close or stop the agent
        pipe = VoicePipeline(energy_threshold=0.1, require_keyword_interruption=True)
        interrupted = False

        def on_interrupt():
            nonlocal interrupted
            interrupted = True

        pipe.on_barge_in = on_interrupt
        pipe.is_speaking = True

        # 1. Simulate ambient noise spike without transcript
        res1 = pipe.handle_incoming_audio_frame(0.45)
        self.assertFalse(res1)
        self.assertFalse(interrupted)
        self.assertTrue(pipe.is_speaking)  # Continues speaking!

        # 2. Simulate explicit disturbance frame
        res2 = pipe.handle_disturbance(0.60, "background_cough")
        self.assertFalse(res2)
        self.assertFalse(interrupted)
        self.assertTrue(pipe.is_speaking)  # Still speaking!
        self.assertGreater(pipe.disturbances_absorbed, 0)

        # 3. Simulate user speaking non-interruption words (e.g. ambient conversation)
        res3 = pipe.handle_user_utterance("okay looks interesting keep going")
        self.assertFalse(res3)
        self.assertFalse(interrupted)
        self.assertTrue(pipe.is_speaking)  # Continues speaking!

    def test_voice_pipeline_keyword_interruption(self):
        # Interruption happens ONLY when user says 'wait', 'listen me', 'stop' or similar
        keywords = ["wait", "listen me", "listen to me", "stop", "hold on", "pause", "shut up"]
        for kw in keywords:
            pipe = VoicePipeline(energy_threshold=0.1, require_keyword_interruption=True)
            interrupted = False

            def on_interrupt(reason=None):
                nonlocal interrupted
                interrupted = True

            pipe.on_barge_in = on_interrupt
            pipe.is_speaking = True

            # User commands the agent to stop/wait/listen
            res = pipe.handle_user_utterance(f"hey {kw} please")
            self.assertTrue(res)
            self.assertTrue(interrupted)
            self.assertFalse(pipe.is_speaking)  # Stopped successfully!
            self.assertIsNotNone(pipe.last_interruption_keyword)

    def test_voice_pipeline_proper_ai_responding(self):
        pipe = VoicePipeline()
        # Generates proper, articulate AI responses
        rep1 = pipe.generate_ai_response("who are you")
        self.assertIn("Nexdune", rep1)

        rep2 = pipe.generate_ai_response("what is the system status")
        self.assertTrue(len(rep2) > 10)
        self.assertNotIn("**", rep2)  # Stripped awkward markdown for clean speech


    # 13. Feature 18: Telephony Alerting Gateway
    def test_telephony_gateway(self):
        gw = TelephonyGateway()
        res = gw.dispatch_alert("+15551234567", "Deployment successful!", alert_type="VOICE")
        self.assertTrue(res["success"])
        self.assertEqual(res["status"], "DISPATCHED")
        self.assertEqual(len(gw.list_history()), 1)

    # 14. Feature 19: Omnichannel Remote Bridge
    def test_omnichannel_bridge(self):
        bridge = OmnichannelBridge(
            orchestrator_callback=lambda goal: f"Executed: {goal}"
        )
        status_res = bridge.handle_incoming_command("/status")
        self.assertIn("ONLINE", status_res["response"])

        run_res = bridge.handle_incoming_command("/run build app")
        self.assertIn("Executed: build app", run_res["response"])

        estop_res = bridge.handle_incoming_command("/estop")
        self.assertIn("E-Stop triggered", estop_res["response"])
        self.assertTrue(SafetyGuard.is_estop_active())
        SafetyGuard.reset_estop()

    # 15. Feature 20: Ephemeral Containment
    def test_containment(self):
        mgr = ContainmentManager(workspace_root=self.temp_dir)
        wsb_file = mgr.generate_windows_sandbox_config()
        self.assertTrue(wsb_file.exists())
        content = wsb_file.read_text(encoding="utf-8")
        self.assertIn("<Configuration>", content)
        self.assertIn("NexusWorkspace", content)

        doc_check = mgr.check_docker_containment()
        self.assertIn("available", doc_check)

    # 16. Feature 21: SOP Role Chain Engine
    def test_sop_chain(self):
        engine = SOPChainEngine()
        artifacts = engine.execute_full_sop("Implement Distributed Payment Gateway")
        self.assertEqual(len(artifacts), 4)

        # Check PRD
        self.assertEqual(artifacts[0].stage, "STAGE_1_PRD")
        self.assertIn("Product Requirements Document", artifacts[0].markdown_content)

        # Check Architecture
        self.assertEqual(artifacts[1].stage, "STAGE_2_ARCHITECTURE")
        self.assertIn("mermaid", artifacts[1].markdown_content)

        # Check Tasks
        self.assertEqual(artifacts[2].stage, "STAGE_3_TASK_BREAKDOWN")

        # Check QA Sign-Off
        self.assertEqual(artifacts[3].stage, "STAGE_4_QA_AUDIT")
        self.assertTrue(artifacts[3].approved)

    # 17. Feature 1: Behavior Best-of-N (bBoN) Trajectory Reranker
    def test_bbon_reranker(self):
        reranker = BehaviorBestOfNReranker(sample_size_n=3)
        c1 = CandidateTrajectory(
            id="traj_1",
            plan_title="Aggressive destructive cleanup",
            steps=[{"tool": "terminal", "args": {"cmd": "rm -rf /tmp/data"}}],
            rationale="Fast but risky",
            predicted_success_score=0.9
        )
        c2 = CandidateTrajectory(
            id="traj_2",
            plan_title="Safe selective cleanup",
            steps=[{"tool": "terminal", "args": {"cmd": "find /tmp/data -name '*.bak' -delete"}}],
            rationale="Careful and verified",
            predicted_success_score=0.88
        )
        best = reranker.select_best([c1, c2], goal_context="Clean stale temp files")
        # c2 should win because c1 triggers destructive keyword penalty
        self.assertEqual(best.id, "traj_2")
        self.assertGreater(best.final_rank_score, c1.final_rank_score)

    # 18. Feature 2: On-Device VLA Visual Grounding Engine
    def test_vla_grounding(self):
        engine = VLAGroundingEngine(screen_width=1920, screen_height=1080)
        # Known semantic region test
        save_elem = engine.ground_element("click save button")
        self.assertGreater(save_elem.confidence, 0.7)
        self.assertEqual(save_elem.pixel_x, int(save_elem.normalized_x * 1920))
        self.assertEqual(save_elem.pixel_y, int(save_elem.normalized_y * 1080))

        # Accessibility element matching
        mock_tree = [
            {"name": "Submit Order", "text": "Submit Order", "role": "button", "normalized_x": 0.65, "normalized_y": 0.80}
        ]
        grounded = engine.ground_element("Submit Order", screen_elements=mock_tree)
        self.assertEqual(grounded.normalized_x, 0.65)
        self.assertEqual(grounded.normalized_y, 0.80)
        self.assertEqual(grounded.pixel_x, int(0.65 * 1920))

    # 19. Feature 3: Demonstration Compiler & Deterministic Replay
    def test_demo_compiler(self):
        compiler = DemonstrationCompiler(storage_dir=os.path.join(self.temp_dir, "demos"))
        compiler.start_recording("test_workflow", description="Sample automated file creation")
        target_file = Path(self.temp_dir) / "output.txt"

        compiler.record_step("create_file", {"path": str(target_file), "content": "Hello World"})
        compiler.add_invariant_check("file", str(target_file), "exists")
        prog_path = compiler.compile_program()
        self.assertTrue(prog_path.exists())

        # Mock executor callback
        def mock_exec(act_type, params):
            if act_type == "create_file":
                Path(params["path"]).write_text(params["content"])
            return True

        res = compiler.replay_program("test_workflow", executor_callback=mock_exec)
        self.assertTrue(res["success"])
        self.assertEqual(res["status"], "VERIFIED")
        self.assertTrue(target_file.exists())

    # 20. Feature 6: Interactive DOM Distillation & Numeric Element Badging
    def test_dom_distiller(self):
        raw_html = """
        <html>
            <head><script>alert(1);</script></head>
            <body>
                <header><nav><a href="/home">Home Link</a></nav></header>
                <main>
                    <h1>Welcome</h1>
                    <input type="text" id="user-input" placeholder="Enter username" />
                    <button id="btn-submit" onclick="submit()">Confirm</button>
                    <div style="display:none"><input type="hidden" name="secret" /></div>
                </main>
            </body>
        </html>
        """
        distiller = DOMDistiller()
        dist_text, elem_map = distiller.distill(raw_html)

        self.assertIn("# DISTILLED INTERACTIVE WEB DOM", dist_text)
        self.assertIn("[1]", dist_text)
        self.assertIn("Confirm", dist_text)
        self.assertEqual(len(elem_map), 3)  # Home link, user-input, btn-submit

        # Resolve badge action
        action_res = distiller.resolve_badge_action(elem_map, badge_id=2, action="type", value="NiranX")
        self.assertTrue(action_res["success"])
        self.assertEqual(action_res["action"], "type")
        self.assertEqual(action_res["value"], "NiranX")

    # 21. Feature 7: Fit Markdown Generator & Content Noise Pruner
    def test_fit_markdown(self):
        noisy_html = """
        <html>
            <body>
                <nav>Navigation links and headers</nav>
                <header>Banner ad</header>
                <article>
                    <h1>Documentation Guide</h1>
                    <p>This is the primary high-density technical instruction.</p>
                    <pre><code>def compute(): return 42</code></pre>
                    <ul>
                        <li>Requirement A</li>
                        <li>Requirement B</li>
                    </ul>
                </article>
                <footer>Cookie Policy - All Rights Reserved</footer>
            </body>
        </html>
        """
        generator = FitMarkdownGenerator()
        fit_md = generator.html_to_fit_markdown(noisy_html)

        self.assertIn("# Documentation Guide", fit_md)
        self.assertIn("def compute(): return 42", fit_md)
        self.assertIn("Requirement A", fit_md)
        self.assertNotIn("Cookie Policy", fit_md)
        self.assertNotIn("Banner ad", fit_md)


if __name__ == "__main__":
    unittest.main()
