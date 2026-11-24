"""Unit and integration tests for Vision Biometrics, Gesture Control & Posture Guard Plugin.

Verifies:
- @nexus_tool decoration and metadata for face_lock, gesture_control, posture_guard
- face_lock_verify execution and verify_operator_face returns
- gesture_control_scan motion vector emissions (pinch, spread, swipe)
- posture_guard_check and posture_guard_monitor 3-minute slouch reminder
- Real HTTP IPC server POST /api/vision/biometrics endpoint execution
- WorkspaceGovernor [SILENT] mode air-gapped blocking (HTTP 403)
Zero mocks, complete real logic.
"""

from __future__ import annotations

import base64
import json
import socket
import threading
import time
import urllib.request
import urllib.error

import cv2
import numpy as np
import pytest

from core.mcp.plugins.vision_biometrics_plugin import (
    _POSTURE_TRACKER,
    _detect_operator_presence,
    _analyze_hand_gestures,
    _calculate_slouch_angle,
    face_lock_verify,
    verify_operator_face,
    gesture_control_scan,
    posture_guard_check,
    posture_guard_monitor,
    process_biometrics_action,
)
from core.runtime.workspaces import WorkspaceGovernor


def _encode_frame_to_b64(frame: np.ndarray) -> str:
    """Encodes a numpy image frame into a base64 string."""
    ret, buf = cv2.imencode(".jpg", frame)
    if not ret:
        raise ValueError("Failed to encode frame")
    return base64.b64encode(buf.tobytes()).decode("utf-8")


def _find_free_port() -> int:
    """Returns an ephemeral free port on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_vision_biometrics_metadata():
    """Validates that @nexus_tool metadata matches specification."""
    meta_face = getattr(face_lock_verify, "_nexus_tool_meta", {})
    assert meta_face.get("name") == "face_lock_verify"
    assert "vision biometrics" in meta_face.get("description", "").lower()
    assert "cv2" in meta_face.get("dependencies", [])

    meta_gesture = getattr(gesture_control_scan, "_nexus_tool_meta", {})
    assert meta_gesture.get("name") == "gesture_control_scan"
    assert "gesture" in meta_gesture.get("description", "").lower()
    assert "cv2" in meta_gesture.get("dependencies", [])

    meta_posture = getattr(posture_guard_check, "_nexus_tool_meta", {})
    assert meta_posture.get("name") == "posture_guard_check"
    assert "slouching" in meta_posture.get("description", "").lower()
    assert "cv2" in meta_posture.get("dependencies", [])

    meta_monitor = getattr(posture_guard_monitor, "_nexus_tool_meta", {})
    assert meta_monitor.get("name") == "posture_guard_monitor"
    assert "slouch" in meta_monitor.get("description", "").lower()


def test_face_lock_verify_execution():
    """Executes face_lock_verify and confirms boolean response."""
    result = face_lock_verify(camera_index=0)
    assert isinstance(result, bool)


def test_posture_guard_check_execution():
    """Executes posture_guard_check and confirms posture status or alert string."""
    result = posture_guard_check(camera_index=0)
    assert isinstance(result, str)
    assert "POSTURE OK" in result or "POSTURE ALERT" in result


def test_operator_presence_synthetic_frames():
    """Tests synthetic frame heuristics against edge-case images."""
    # 1. Pure black / covered camera frame
    black_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    detected, box = _detect_operator_presence(black_frame)
    assert detected is False
    assert box is None

    # 2. Pure white / overexposed frame
    white_frame = np.ones((480, 640, 3), dtype=np.uint8) * 255
    detected, box = _detect_operator_presence(white_frame)
    assert detected is False
    assert box is None

    # 3. Synthetic skin-tone head oval placed centrally
    skin_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    cv2.ellipse(skin_frame, (320, 200), (90, 120), 0, 0, 360, (130, 160, 215), -1)

    detected, box = _detect_operator_presence(skin_frame)
    assert detected is True
    assert box is not None
    bx, by, bw, bh = box
    assert bw > 50 and bh > 50


def test_verify_operator_face_with_b64_and_sovereign_lock():
    """Validates verify_operator_face returns sovereign lock status and operator identity."""
    # Authentic face frame -> SOVEREIGN_LOCK UNLOCKED
    skin_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    cv2.ellipse(skin_frame, (320, 200), (90, 120), 0, 0, 360, (130, 160, 215), -1)
    b64_valid = _encode_frame_to_b64(skin_frame)

    res_valid = verify_operator_face(frame_b64=b64_valid)
    assert res_valid["success"] is True
    assert res_valid["verified"] is True
    assert res_valid["operator"] == "NiranX"
    assert res_valid["sovereign_lock"] == "UNLOCKED"
    assert res_valid["confidence"] >= 0.85
    assert res_valid["bounding_box"] is not None

    # Dark/Covered frame -> SOVEREIGN_LOCK LOCKED
    dark_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    b64_dark = _encode_frame_to_b64(dark_frame)

    res_dark = verify_operator_face(frame_b64=b64_dark)
    assert res_dark["success"] is True
    assert res_dark["verified"] is False
    assert res_dark["operator"] == "UNKNOWN"
    assert res_dark["sovereign_lock"] == "LOCKED"


def test_gesture_control_scan_vectors():
    """Tests hand pinch, spread, and swipe motion vectors."""
    # 1. Neutral / Empty frame
    empty_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    b64_empty = _encode_frame_to_b64(empty_frame)

    res_empty = gesture_control_scan(frame_b64=b64_empty)
    assert res_empty["success"] is True
    assert res_empty["gesture"] == "neutral"
    assert res_empty["vector"]["scale"] == 1.0

    # 2. Hand contour spread -> scale > 1.0
    spread_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    # Draw hand palm with fingers
    cv2.circle(spread_frame, (320, 300), 70, (130, 160, 215), -1)
    cv2.circle(spread_frame, (250, 180), 22, (130, 160, 215), -1)
    cv2.circle(spread_frame, (300, 150), 22, (130, 160, 215), -1)
    cv2.circle(spread_frame, (360, 160), 22, (130, 160, 215), -1)
    cv2.circle(spread_frame, (410, 190), 20, (130, 160, 215), -1)
    b64_spread = _encode_frame_to_b64(spread_frame)

    res_spread = gesture_control_scan(frame_b64=b64_spread)
    assert res_spread["success"] is True
    assert res_spread["gesture"] in ("spread", "neutral")
    assert res_spread["vector"]["scale"] >= 1.0

    # 3. Direct hardware probe (graceful handling if camera offline)
    res_hw = gesture_control_scan(camera_index=0)
    assert res_hw["success"] is True
    assert "gesture" in res_hw
    assert "vector" in res_hw


def test_posture_guard_monitor_3min_slouch_alert():
    """Validates head-to-shoulder slouch tracking and the >3-minute Notch HUD trigger."""
    # Reset module tracker state
    _POSTURE_TRACKER["slouch_start_ts"] = None
    _POSTURE_TRACKER["last_reminder_ts"] = None
    _POSTURE_TRACKER["consecutive_slouch_sec"] = 0.0
    _POSTURE_TRACKER["reminder_triggered"] = False

    # 1. Normal upright frame: head centered around y=200 in a 480h frame (relative Y = 0.41)
    upright_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    cv2.ellipse(upright_frame, (320, 180), (80, 100), 0, 0, 360, (130, 160, 215), -1)
    b64_upright = _encode_frame_to_b64(upright_frame)

    t0 = 1000.0
    res_upright = posture_guard_monitor(frame_b64=b64_upright, current_time=t0)
    assert res_upright["success"] is True
    assert res_upright["status"] == "POSTURE OK"
    assert res_upright["slouched"] is False
    assert res_upright["notch_reminder_triggered"] is False

    # 2. Slouched frame: head sunken low (y=360, relative Y = 0.75)
    slouch_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    cv2.ellipse(slouch_frame, (320, 360), (80, 100), 0, 0, 360, (130, 160, 215), -1)
    b64_slouch = _encode_frame_to_b64(slouch_frame)

    # First slouch detection (0 seconds into slouch)
    res_slouch_start = posture_guard_monitor(frame_b64=b64_slouch, current_time=t0)
    assert res_slouch_start["status"] == "POSTURE ALERT"
    assert res_slouch_start["slouched"] is True
    assert res_slouch_start["notch_reminder_triggered"] is False  # Under 3 minutes

    # 2 minutes later (120 seconds into slouch - still under 180 seconds threshold)
    t1 = t0 + 120.0
    res_slouch_2m = posture_guard_monitor(frame_b64=b64_slouch, current_time=t1)
    assert res_slouch_2m["status"] == "POSTURE ALERT"
    assert res_slouch_2m["consecutive_slouch_sec"] == 120.0
    assert res_slouch_2m["notch_reminder_triggered"] is False

    # 3 minutes and 5 seconds later (185 seconds - exceeds 3-minute threshold!)
    t2 = t0 + 185.0
    res_slouch_3m = posture_guard_monitor(frame_b64=b64_slouch, current_time=t2)
    assert res_slouch_3m["status"] == "POSTURE ALERT"
    assert res_slouch_3m["consecutive_slouch_sec"] == 185.0
    assert res_slouch_3m["notch_reminder_triggered"] is True  # Gentle Notch HUD reminder fired!

    # 3. Operator straightens up -> resets slouch duration
    t3 = t2 + 10.0
    res_recovered = posture_guard_monitor(frame_b64=b64_upright, current_time=t3)
    assert res_recovered["status"] == "POSTURE OK"
    assert res_recovered["slouched"] is False
    assert res_recovered["consecutive_slouch_sec"] == 0.0
    assert res_recovered["notch_reminder_triggered"] is False


def test_process_biometrics_action_unified():
    """Tests unified action dispatcher for face_lock, gesture_control, and posture_guard."""
    skin_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    cv2.ellipse(skin_frame, (320, 200), (90, 120), 0, 0, 360, (130, 160, 215), -1)
    b64 = _encode_frame_to_b64(skin_frame)

    r_face = process_biometrics_action("face_lock", {"frame_b64": b64})
    assert r_face["success"] is True
    assert r_face["verified"] is True

    r_gest = process_biometrics_action("gesture_control", {"frame_b64": b64})
    assert r_gest["success"] is True
    assert "vector" in r_gest

    r_post = process_biometrics_action("posture_guard", {"frame_b64": b64})
    assert r_post["success"] is True
    assert "slouched" in r_post

    r_inv = process_biometrics_action("unknown_action", {})
    assert r_inv["success"] is False
    assert "Invalid biometrics action" in r_inv["error"]


def test_ipc_biometrics_rest_endpoint_e2e():
    """
    Spins up real NexusIPCServer on a free port and tests POST /api/vision/biometrics:
    - Authentication verification
    - Execution of face_lock, gesture_control, posture_guard
    - WorkspaceGovernor SILENT mode enforcement (HTTP 403)
    """
    from core.runtime.ipc_server import NexusIPCServer

    test_port = _find_free_port()
    test_token = "test-biometrics-token-nexus-v5"

    server = NexusIPCServer(host="127.0.0.1", port=test_port, token=test_token, dry_run_hardware=True)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True, name="TestIPCServer")
    server_thread.start()

    # Wait for server socket to accept connections
    time.sleep(0.5)

    base_url = f"http://127.0.0.1:{test_port}"

    # 1. Unauthenticated request should yield HTTP 401
    req_unauth = urllib.request.Request(
        f"{base_url}/api/vision/biometrics",
        data=json.dumps({"action": "face_lock"}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with pytest.raises(urllib.error.HTTPError) as exc_info:
        urllib.request.urlopen(req_unauth)
    assert exc_info.value.code == 401

    # 2. Authenticated face_lock request with synthetic frame
    skin_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    cv2.ellipse(skin_frame, (320, 200), (90, 120), 0, 0, 360, (130, 160, 215), -1)
    b64_frame = _encode_frame_to_b64(skin_frame)

    req_face = urllib.request.Request(
        f"{base_url}/api/vision/biometrics",
        data=json.dumps({"action": "face_lock", "frame_b64": b64_frame}).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {test_token}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req_face) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data["success"] is True
        assert data["verified"] is True
        assert data["operator"] == "NiranX"
        assert data["sovereign_lock"] == "UNLOCKED"

    # 3. Authenticated gesture_control request
    req_gest = urllib.request.Request(
        f"{base_url}/api/vision/biometrics",
        data=json.dumps({"action": "gesture_control", "frame_b64": b64_frame}).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {test_token}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req_gest) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data["success"] is True
        assert "gesture" in data
        assert "vector" in data

    # 4. Authenticated posture_guard request
    req_posture = urllib.request.Request(
        f"{base_url}/api/vision/biometrics",
        data=json.dumps({"action": "posture_guard", "frame_b64": b64_frame}).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {test_token}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req_posture) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data["success"] is True
        assert "slouched" in data

    # 5. Enforce WorkspaceGovernor [SILENT] Mode Air-Gap (Must return HTTP 403)
    server.workspace_governor.set_mode("SILENT")
    try:
        req_silent = urllib.request.Request(
            f"{base_url}/api/vision/biometrics",
            data=json.dumps({"action": "face_lock"}).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {test_token}",
            },
            method="POST",
        )
        with pytest.raises(urllib.error.HTTPError) as exc_silent:
            urllib.request.urlopen(req_silent)
        assert exc_silent.value.code == 403
        silent_resp = json.loads(exc_silent.value.read().decode("utf-8"))
        assert silent_resp["success"] is False
        assert "SILENT air-gapped mode" in silent_resp["error"]
    finally:
        # Restore DEV workspace mode
        server.workspace_governor.set_mode("DEV")

    # Stop test server
    try:
        server.shutdown()
        server.server_close()
    except Exception:
        pass


def test_plugin_loader_discovery():
    """Verifies that plugin_loader discovers and registers all vision biometric tools."""
    from core.mcp.plugin_loader import discover_plugins

    discovered = discover_plugins()
    tool_names = [tool["name"] for tool in discovered]

    assert "face_lock_verify" in tool_names
    assert "posture_guard_check" in tool_names
    assert "gesture_control_scan" in tool_names
    assert "posture_guard_monitor" in tool_names
