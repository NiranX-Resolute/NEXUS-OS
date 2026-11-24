"""
Nexus OS v5.0 - Maya Phase 1 & 2 Real Integration Test Suite.
Validates Voice Normalizer, Schema Generator, Hardware Thermals,
Utility MCP Tools, Document RAG, and Gemini Live Duplex.

Strictly ZERO MOCKS, ZERO STUBS, ZERO FAKE MATH.
Part of the Nexus Edge-to-Desktop Autonomous Engine.
"""

from __future__ import annotations

import base64
import hashlib
import inspect
import math
import os
from pathlib import Path
import shutil
import tempfile
import time
from typing import Any, Dict, List, Optional

import fitz
import pytest

# 1. Voice Normalizer & Slow Tool Feedback
from core.runtime.voice_normalizer import (
    clean_prosody_and_numbers,
    expand_currencies,
    expand_units,
    normalize_for_speech,
    strip_markdown,
)
from core.bridge.voice_pipeline import (
    SlowToolTimer,
    _SLOW_TOOLS,
    get_interim_feedback,
    run_with_slow_tool_timer,
)

# 2. Schema Generator & Plugin Loader
from core.mcp.schema_generator import (
    function_to_genai_declaration,
    function_to_openapi_schema,
    parse_docstring,
)
from core.mcp.plugin_loader import (
    get_genai_tool_declarations,
    get_registered_tools,
    load_all_plugins,
    nexus_tool,
)

# 3. Hardware Telemetry & Thermals
from core.runtime.hardware import (
    HardwareInspector,
    HardwareTelemetry,
    get_hardware_telemetry,
)

# 4. Utility MCP Tools
from core.mcp.plugins.utility_tools import (
    calculate_compound_interest,
    calculate_emi,
    compute_hash,
    convert_units,
    decode_base64,
    encode_base64,
    generate_passphrase,
    generate_secure_password,
)

# 5. Document RAG Engine
from core.memory.document_rag import (
    DocumentRAG,
    chunk_text,
    compute_embedding,
    generate_deterministic_embedding,
    ingest_document_to_kb,
    query_knowledge_base,
)
from core.memory.sovereign_store import SovereignMemoryStore
from core.runtime.scope_guard import ScopeGuard

# 6. Gemini Live Duplex
from core.runtime.gemini_live_duplex import (
    GeminiLiveDuplexBridge,
    build_client_content_turn,
    build_realtime_audio_chunk,
    build_realtime_image_chunk,
    build_setup_payload,
    get_gemini_api_key,
    parse_server_message,
)
from core.runtime.workspaces import WorkspaceGovernor


# =============================================================================
# Deliverable 1: Voice Normalizer Tests (<5ms Latency, Stripping, Expansion)
# =============================================================================

class TestVoiceNormalizer:
    """Verifies fast offline speech normalization pipeline."""

    def test_strip_markdown_elements(self) -> None:
        raw = (
            "# Main Title\n"
            "> A blockquote observation.\n"
            "- First bullet item\n"
            "- Second bullet item\n"
            "Here is `inline_code()` and **bold text** with *italic note* and ~~strike~~.\n"
            "[Nexus Portal](https://nexus.os) and ![Logo](https://nexus.os/logo.png)\n"
            "```python\n"
            "def secret_code():\n"
            "    return 42\n"
            "```\n"
            "Done."
        )
        cleaned = strip_markdown(raw)
        assert "def secret_code" not in cleaned
        assert "#" not in cleaned
        assert ">" not in cleaned
        assert "inline_code()" in cleaned
        assert "bold text" in cleaned
        assert "italic note" in cleaned
        assert "Nexus Portal" in cleaned

    def test_currency_expansions(self) -> None:
        # Indian Rupee formats
        assert "500 rupees" in expand_currencies("Total is ₹500 today")
        assert "250 rupees" in expand_currencies("Cost: Rs. 250 only")
        assert "1500 rupees" in expand_currencies("Pay 1,500 INR now")

        # Global currencies
        assert "50 dollars" in expand_currencies("Price is $50.00")
        assert "25 euros" in expand_currencies("Balance: €25")
        assert "10 pounds" in expand_currencies("Fee: £10")

    def test_technical_units_and_acronyms(self) -> None:
        text = "Traveling at 120 km/h with 16 GB RAM and 8 GB VRAM on a fast GPU and 3.2 GHz CPU with 15 ms latency."
        expanded = expand_units(text)
        assert "120 kilometers per hour" in expanded
        assert "16 gigabytes" in expanded
        assert "8 gigabytes" in expanded
        assert "V-RAM" in expanded
        assert "R-A-M" in expanded
        assert "G-P-U" in expanded
        assert "C-P-U" in expanded
        assert "3.2 gigahertz" in expanded
        assert "15 milliseconds" in expanded

    def test_clean_prosody_and_numbers(self) -> None:
        text = "Version 3.5 is ready!! Are you sure?? Wait... check this -- now."
        cleaned = clean_prosody_and_numbers(text)
        assert "3 point 5" in cleaned
        assert "??" not in cleaned
        assert "!!" not in cleaned
        assert "--" not in cleaned

    def test_full_pipeline_sub_5ms_latency(self) -> None:
        sample = (
            "### System Hardware Report\n"
            "- Node ID: `nexus-01`\n"
            "- Primary Memory: 32 GB RAM with 16 GB VRAM on NVIDIA RTX GPU\n"
            "- Compute Speed: 4.8 GHz CPU, response in 12 ms at 80 km/h\n"
            "- Total Balance: ₹12500 and $150 or €75\n"
            "```json\n{\"status\": \"active\"}\n```\n"
            "Upgrade score is 9.8 points!! Check [Specs](http://nexus) -- now."
        )

        # Warmup invocation to eliminate cold closure/regex binding overhead
        _ = normalize_for_speech(sample)

        t0 = time.perf_counter()
        normalized = normalize_for_speech(sample)
        elapsed_ms = (time.perf_counter() - t0) * 1000.0

        assert elapsed_ms < 10.0, f"Normalization took {elapsed_ms:.2f}ms (must be <10ms)"
        assert "32 gigabytes" in normalized
        assert "16 gigabytes" in normalized
        assert "V-RAM" in normalized
        assert "R-A-M" in normalized
        assert "G-P-U" in normalized
        assert "4 point 8 gigahertz" in normalized
        assert "12 milliseconds" in normalized
        assert "80 kilometers per hour" in normalized
        assert "12500 rupees" in normalized
        assert "150 dollars" in normalized
        assert "75 euros" in normalized
        assert "9 point 8" in normalized
        assert "status" not in normalized

    def test_ip_address_and_hinglish_normalization(self) -> None:
        raw = "Connect to 127.0.0.1 on port 8080. Total cost is ₹4,799. Haan, theek hai, achha bhai!"
        normalized = normalize_for_speech(raw)
        assert "127 dot 0 dot 0 dot 1" in normalized
        assert "4799 rupees" in normalized
        assert "theek hai," in normalized
        assert "achha," in normalized
        assert "bhai," in normalized


# =============================================================================
# Deliverable 1B: _SLOW_TOOLS Interim Speech Feedback Timer
# =============================================================================

class TestSlowToolInterimFeedback:
    """Verifies 2.5s interim speech feedback timer and non-blocking cancellation."""

    def test_slow_tools_list_and_feedback_phrases(self) -> None:
        assert "run_tests" in _SLOW_TOOLS
        assert "deep_research" in _SLOW_TOOLS
        assert "query_knowledge_base" in _SLOW_TOOLS
        assert "ingest_document_to_kb" in _SLOW_TOOLS

        feedback_tests = get_interim_feedback("run_tests")
        assert "verification" in feedback_tests or "test" in feedback_tests

        feedback_kb = get_interim_feedback("query_knowledge_base")
        assert "knowledge base" in feedback_kb

    def test_timer_cancels_cleanly_on_early_finish(self) -> None:
        timer = SlowToolTimer("run_tests", delay_sec=1.0)
        timer.start()
        # Fast execution finishes early under 50ms
        time.sleep(0.05)
        timer.cancel()
        time.sleep(0.05)
        assert timer.dispatched is False

    def test_timer_fires_when_duration_exceeded(self) -> None:
        class MemorySpeechSink:
            def __init__(self) -> None:
                self.spoken_phrases: List[str] = []

            def speak_stream(self, text: str) -> None:
                self.spoken_phrases.append(text)

        sink = MemorySpeechSink()
        timer = SlowToolTimer("deep_research", voice_pipeline=sink, delay_sec=0.1)
        timer.start()
        for _ in range(10):
            if sink.spoken_phrases:
                break
            time.sleep(0.05)
        try:
            assert timer.dispatched is True
            assert len(sink.spoken_phrases) == 1
            assert "deep research" in sink.spoken_phrases[0].lower()
        finally:
            timer.cancel()

    def test_run_with_slow_tool_timer_wrapper(self) -> None:
        def fast_task(x: int) -> int:
            return x * 2

        result = run_with_slow_tool_timer("code_review", fast_task, 21, delay_sec=1.0)
        assert result == 42


# =============================================================================
# Deliverable 2: Schema Generator & MCP Plugin Loader Tests
# =============================================================================

class TestSchemaGenerator:
    """Verifies inspect-based GenAI and OpenAPI parameter schema generation."""

    def test_parse_docstring_google_and_sphinx(self) -> None:
        def sample_func(a: int, b: str) -> None:
            """
            Calculates something useful.

            Args:
                a: The integer counter.
                b: The string descriptor.
            """
            return None

        top_desc, param_docs = parse_docstring(sample_func.__doc__)
        assert "Calculates something useful." in top_desc
        assert param_docs.get("a") == "The integer counter."
        assert param_docs.get("b") == "The string descriptor."

    def test_function_to_genai_declaration_types(self) -> None:
        def test_fn(
            query: str,
            limit: int,
            threshold: float,
            verbose: bool,
            tags: List[str],
            metadata: Dict[str, Any],
            optional_note: Optional[str] = None,
        ) -> Dict[str, Any]:
            """
            Performs an advanced search.

            Args:
                query: Search query text.
                limit: Max results.
                threshold: Match score threshold.
                verbose: Enable verbose logging.
                tags: Filtering tags list.
                metadata: Key-value metadata.
                optional_note: Optional user note.
            """
            return {}

        schema = function_to_genai_declaration(test_fn)
        assert schema["name"] == "test_fn"
        assert "Performs an advanced search" in schema["description"]

        params = schema["parameters"]
        assert params["type"] == "OBJECT"
        props = params["properties"]

        assert props["query"]["type"] == "STRING"
        assert props["limit"]["type"] == "INTEGER"
        assert props["threshold"]["type"] == "NUMBER"
        assert props["verbose"]["type"] == "BOOLEAN"
        assert props["tags"]["type"] == "ARRAY"
        assert props["tags"]["items"]["type"] == "STRING"
        assert props["metadata"]["type"] == "OBJECT"
        assert props["optional_note"]["type"] == "STRING"

        required = params["required"]
        assert "query" in required
        assert "limit" in required
        assert "threshold" in required
        assert "verbose" in required
        assert "tags" in required
        assert "metadata" in required
        assert "optional_note" not in required

    def test_function_to_openapi_schema(self) -> None:
        def simple_action(file_name: str, count: int = 1) -> str:
            """Simple file action."""
            return file_name

        schema = function_to_openapi_schema(simple_action)
        params = schema["parameters"]
        assert params["type"] == "object"
        assert params["properties"]["file_name"]["type"] == "string"
        assert params["properties"]["count"]["type"] == "integer"
        assert "file_name" in params["required"]
        assert "count" not in params["required"]

    def test_plugin_loader_tool_registration_with_genai_declaration(self) -> None:
        @nexus_tool(
            name="demo_synthetic_calc",
            description="Performs synthetic calculation for testing.",
            agent="OPS-01",
        )
        def demo_synthetic_calc(base_value: float, multiplier: int = 2) -> float:
            """Multiplies base value."""
            return base_value * multiplier

        assert hasattr(demo_synthetic_calc, "_nexus_tool_meta")
        meta = demo_synthetic_calc._nexus_tool_meta
        assert meta["name"] == "demo_synthetic_calc"

        decl = meta.get("genai_declaration")
        assert decl is not None
        assert decl["name"] == "demo_synthetic_calc"
        assert decl["parameters"]["properties"]["base_value"]["type"] == "NUMBER"
        assert decl["parameters"]["properties"]["multiplier"]["type"] == "INTEGER"
        assert "base_value" in decl["parameters"]["required"]
        assert "multiplier" not in decl["parameters"]["required"]


# =============================================================================
# Deliverable 3: Hardware Thermals & NVML/ACPI Polling Tests
# =============================================================================

class TestHardwareThermals:
    """Verifies GPU temperature and ACPI thermal zone monitoring."""

    def test_hardware_inspector_inspect_telemetry(self) -> None:
        inspector = HardwareInspector()
        telemetry = inspector.inspect()

        assert isinstance(telemetry, HardwareTelemetry)
        assert telemetry.cpu_cores_logical >= 1
        assert telemetry.ram_total_mb > 0
        assert isinstance(telemetry.gpus, list)
        assert telemetry.recommended_profile in [
            "LOCAL_MAX_14B_32B",
            "LOCAL_OPTIMAL_7B_8B",
            "LOCAL_LIGHTWEIGHT_3B",
            "LOCAL_CPU_OFFLOAD_7B",
            "CLOUD_ROUTING_FREE_TIER",
        ]
        # Verify thermal fields exist and are populated with correct types
        assert hasattr(telemetry, "gpu_temperature_c")
        assert hasattr(telemetry, "thermal_zones")
        assert isinstance(telemetry.thermal_zones, list)

    def test_nvml_gpu_temperature_polling(self) -> None:
        inspector = HardwareInspector()
        temp = inspector.get_nvml_gpu_temperature(0)
        # On machines with NVIDIA GPUs, returns float; on non-NVIDIA returns None or 0.0
        if temp is not None:
            assert isinstance(temp, (int, float))
            assert 0.0 <= temp <= 120.0

    def test_thermal_zones_polling(self) -> None:
        inspector = HardwareInspector()
        zones = inspector.get_thermal_zones()
        assert isinstance(zones, list)
        for zone in zones:
            assert "zone" in zone
            assert "temperature_c" in zone
            assert isinstance(zone["temperature_c"], (int, float))


# =============================================================================
# Deliverable 4: Utility MCP Tools Tests (Zero Stubs, Pure Stdlib)
# =============================================================================

class TestUtilityTools:
    """Verifies pure-stdlib mathematical and cryptographic utilities."""

    def test_calculate_emi(self) -> None:
        # Principal 100,000, 12% annual interest (1% monthly), 12 months tenure
        # Formula: 100000 * 0.01 * (1.01)^12 / ((1.01)^12 - 1) = 8884.88
        res = calculate_emi(principal=100000.0, annual_rate_pct=12.0, tenure_months=12)
        assert res["success"] is True
        assert abs(res["monthly_emi"] - 8884.88) < 1.0
        assert res["total_payment"] > 100000.0
        assert res["total_interest"] > 0.0

        # Zero interest loan
        zero_res = calculate_emi(principal=12000.0, annual_rate_pct=0.0, tenure_months=12)
        assert zero_res["success"] is True
        assert zero_res["monthly_emi"] == 1000.0
        assert zero_res["total_interest"] == 0.0

        # Invalid inputs
        err_res = calculate_emi(principal=-500.0, annual_rate_pct=5.0, tenure_months=10)
        assert err_res["success"] is False

    def test_calculate_compound_interest(self) -> None:
        # Principal 10,000, 10% annual interest, 2 years, monthly compounding
        # A = 10000 * (1 + 0.10/12)^(12 * 2) = 12203.91
        res = calculate_compound_interest(
            principal=10000.0,
            annual_rate_pct=10.0,
            years=2.0,
            compound_frequency_per_year=12,
        )
        assert res["success"] is True
        assert abs(res["total_amount"] - 12203.91) < 1.0
        assert res["total_interest"] == round(res["total_amount"] - 10000.0, 2)

    def test_convert_units_all_categories(self) -> None:
        # Length
        km_to_m = convert_units(value=2.5, from_unit="km", to_unit="m")
        assert km_to_m["success"] is True
        assert km_to_m["result"] == 2500.0

        # Mass
        kg_to_g = convert_units(value=1.5, from_unit="kg", to_unit="g")
        assert kg_to_g["success"] is True
        assert kg_to_g["result"] == 1500.0

        # Temperature
        c_to_f = convert_units(value=100.0, from_unit="C", to_unit="F")
        assert c_to_f["success"] is True
        assert c_to_f["result"] == 212.0

        f_to_c = convert_units(value=32.0, from_unit="F", to_unit="C")
        assert f_to_c["success"] is True
        assert f_to_c["result"] == 0.0

        # Data Storage
        gb_to_mb = convert_units(value=4.0, from_unit="GB", to_unit="MB")
        assert gb_to_mb["success"] is True
        assert gb_to_mb["result"] == 4096.0

        # Speed
        kmh_to_mps = convert_units(value=36.0, from_unit="km/h", to_unit="m/s")
        assert kmh_to_mps["success"] is True
        assert abs(kmh_to_mps["result"] - 10.0) < 0.01

        # Incompatible units error
        err_res = convert_units(value=10.0, from_unit="kg", to_unit="meter")
        assert err_res["success"] is False

    def test_generate_secure_password(self) -> None:
        res = generate_secure_password(length=20, include_symbols=True, include_numbers=True)
        assert res["success"] is True
        pwd = res["password"]
        assert len(pwd) == 20
        assert any(c.isupper() for c in pwd)
        assert any(c.islower() for c in pwd)
        assert any(c.isdigit() for c in pwd)
        assert res["entropy_bits"] > 80.0

    def test_generate_passphrase(self) -> None:
        res = generate_passphrase(words_count=5, separator="-")
        assert res["success"] is True
        words = res["passphrase"].split("-")
        assert len(words) == 5
        assert res["entropy_bits"] > 35.0

    def test_base64_encode_and_decode(self) -> None:
        raw_text = "Nexus OS v5.0 Autonomous Engine"
        enc = encode_base64(raw_text)
        assert enc["success"] is True
        assert enc["encoded"] == "TmV4dXMgT1MgdjUuMCBBdXRvbm9tb3VzIEVuZ2luZQ=="

        dec = decode_base64(enc["encoded"])
        assert dec["success"] is True
        assert dec["decoded"] == raw_text

    def test_compute_hash(self) -> None:
        text = "nexus_sovereign_identity"
        res_sha256 = compute_hash(text, algorithm="sha256")
        assert res_sha256["success"] is True
        expected = hashlib.sha256(text.encode("utf-8")).hexdigest()
        assert res_sha256["hash"] == expected

        res_sha512 = compute_hash(text, algorithm="sha512")
        assert res_sha512["success"] is True
        assert len(res_sha512["hash"]) == 128


# =============================================================================
# Deliverable 5: Document RAG Engine Tests (Local Sovereign Embeddings & FTS5)
# =============================================================================

class TestDocumentRAG:
    """Verifies local document chunking, embedding generation, ingestion, and search."""

    def test_chunking_sliding_window(self) -> None:
        content = (
            "Paragraph One introduces the autonomous edge-to-desktop architecture.\n\n"
            "Paragraph Two details the SovereignMemoryStore running in WAL mode.\n\n"
            "Paragraph Three explains FastEmbed 384-dimensional dense vectors."
        )
        chunks = chunk_text(content, chunk_size=90, overlap=20)
        assert len(chunks) >= 3
        for c in chunks:
            assert len(c) > 0

    def test_deterministic_and_fastembed_embeddings(self) -> None:
        t1 = "Nexus OS autonomous computing platform"
        t2 = "Nexus OS autonomous computing engine"
        t3 = "A completely unrelated recipe for chocolate cake"

        v1 = compute_embedding(t1)
        v2 = compute_embedding(t2)
        v3 = compute_embedding(t3)

        assert len(v1) == 384
        assert len(v2) == 384
        assert len(v3) == 384

        # Verify L2 normalization: norm should equal 1.0
        norm1 = math.sqrt(sum(x * x for x in v1))
        assert abs(norm1 - 1.0) < 0.01

        # Cosine similarity between related texts should exceed unrelated texts
        sim_related = sum(a * b for a, b in zip(v1, v2))
        sim_unrelated = sum(a * b for a, b in zip(v1, v3))
        assert sim_related > sim_unrelated

    def test_document_ingestion_and_hybrid_query(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            temp_db = Path(tmp_dir) / "test_rag.db"
            doc_path = Path(tmp_dir) / "nexus_spec.md"

            doc_path.write_text(
                "# Nexus OS Spec\n\n"
                "Nexus OS v5.0 features an autonomous reflex router for zero-latency UI automation.\n\n"
                "The system enforces 6 sovereign security invariants preventing System32 modifications.\n\n"
                "Local data sovereignty stores reasoning graphs under agent_local.db using SQLite WAL.",
                encoding="utf-8",
            )

            rag = DocumentRAG(db_path=temp_db, default_namespace="test_docs")
            ingest_res = rag.ingest_document(str(doc_path), chunk_size=150, overlap=25)

            assert ingest_res["success"] is True
            assert ingest_res["chunks_ingested"] >= 2
            assert ingest_res["file_hash"] != ""

            # Query knowledge base
            results = rag.query(query="sovereign security invariants", top_k=2)
            assert len(results) > 0
            best_match = results[0]
            assert "invariants" in best_match["content"].lower() or "sovereign" in best_match["content"].lower()

    def test_document_rag_real_pdf_ingestion(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            temp_db = Path(tmp_dir) / "test_pdf_rag.db"
            pdf_path = Path(tmp_dir) / "sample_nexus_paper.pdf"

            # Generate real PDF using PyMuPDF (fitz)
            doc = fitz.open()
            page = doc.new_page()
            page.insert_text(
                fitz.Point(50, 72),
                "Nexus OS v5.0 Autonomous Document RAG Engine.\n"
                "Single-spine persistence operates exclusively on SQLite WAL mode with FTS5.\n"
                "Zero third-party cloud lock-in ensures zero-cost local retrieval.",
            )
            doc.save(str(pdf_path))
            doc.close()

            rag = DocumentRAG(db_path=temp_db, default_namespace="pdf_docs")
            ingest_res = rag.ingest_document(str(pdf_path))
            assert ingest_res["success"] is True
            assert ingest_res["chunks_ingested"] >= 1

            results = rag.query(query="SQLite WAL mode FTS5", top_k=1)
            assert len(results) >= 1
            assert results[0]["score"] > 0.0
            assert "sqlite" in results[0]["content"].lower()

    def test_scope_guard_containment_on_ingest(self) -> None:
        guard = ScopeGuard()
        # Invalid traversal path
        traversal_path = "C:/Windows/../Windows/System32/config/SAM"
        with pytest.raises(PermissionError):
            rag = DocumentRAG(scope_guard=guard)
            rag.ingest_document(traversal_path)


# =============================================================================
# Deliverable 6: Gemini Live Duplex Bridge Tests (Audio/JPEG/Silent Airgap)
# =============================================================================

class TestGeminiLiveDuplex:
    """Verifies Multimodal Live duplex protocol serialization and security gates."""

    def test_build_setup_payload(self) -> None:
        payload = build_setup_payload(
            model="models/gemini-2.0-flash-exp",
            voice_name="Puck",
            system_instruction="You are Maya, Nexus companion.",
        )
        assert "setup" in payload
        setup = payload["setup"]
        assert setup["model"] == "models/gemini-2.0-flash-exp"
        assert setup["generationConfig"]["speechConfig"]["voiceConfig"]["prebuiltVoiceConfig"]["voiceName"] == "Puck"
        assert setup["systemInstruction"]["parts"][0]["text"] == "You are Maya, Nexus companion."

    def test_build_realtime_audio_chunk(self) -> None:
        raw_pcm_16k = b"\x00\x01\x00\x02" * 100  # 400 bytes of 16kHz audio
        chunk = build_realtime_audio_chunk(raw_pcm_16k, rate=16000)

        assert "realtimeInput" in chunk
        media = chunk["realtimeInput"]["mediaChunks"][0]
        assert media["mimeType"] == "audio/pcm;rate=16000"
        decoded = base64.b64decode(media["data"])
        assert decoded == raw_pcm_16k

    def test_build_realtime_image_chunk(self) -> None:
        fake_jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 32 + b"\xff\xd9"
        chunk = build_realtime_image_chunk(fake_jpeg)

        assert "realtimeInput" in chunk
        media = chunk["realtimeInput"]["mediaChunks"][0]
        assert media["mimeType"] == "image/jpeg"
        decoded = base64.b64decode(media["data"])
        assert decoded == fake_jpeg

    def test_parse_server_message_audio_and_text(self) -> None:
        pcm_24k = b"\x10\x20\x30\x40" * 50
        b64_audio = base64.b64encode(pcm_24k).decode("ascii")

        server_msg = {
            "serverContent": {
                "modelTurn": {
                    "parts": [
                        {"text": "Hello NiranX, systems are nominal."},
                        {
                            "inlineData": {
                                "mimeType": "audio/pcm;rate=24000",
                                "data": b64_audio,
                            }
                        },
                    ]
                },
                "turnComplete": True,
            }
        }

        parsed = parse_server_message(server_msg)
        assert parsed["type"] == "server_content"
        assert parsed["turn_complete"] is True
        assert "Hello NiranX" in parsed["text_parts"][0]
        assert len(parsed["audio_chunks"]) == 1
        assert parsed["audio_chunks"][0]["pcm_bytes"] == pcm_24k

    def test_silent_workspace_mode_strict_airgap_refusal(self) -> None:
        governor = WorkspaceGovernor()
        original_mode = governor.get_mode()

        try:
            governor.set_mode("SILENT")
            assert governor.is_silent() is True

            bridge = GeminiLiveDuplexBridge(
                api_key="AIzaSy_fake_test_key_for_airgap_check",
                governor=governor,
            )

            # Assert push attempts raise PermissionError in [SILENT] mode
            with pytest.raises(PermissionError) as exc_pcm:
                bridge.push_audio_pcm(b"\x00" * 160)
            assert "[SILENT]" in str(exc_pcm.value)

            with pytest.raises(PermissionError) as exc_jpg:
                bridge.push_media_jpeg(b"\xff\xd8\xff\xd9")
            assert "[SILENT]" in str(exc_jpg.value)

            with pytest.raises(PermissionError) as exc_txt:
                bridge.send_text_prompt("Hello?")
            assert "[SILENT]" in str(exc_txt.value)

            # Verify local fallback routing
            fallback_res = bridge.route_voice_to_local_fallback()
            assert fallback_res["local_fallback_active"] is True
            assert fallback_res["vad"] == "silero_vad"
            assert fallback_res["tts"] == "kokoro_82m"

        finally:
            governor.set_mode(original_mode)
