"""
Nexus OS v5.0 - Core Runtime Package
Unified export for Reflex Router, Workspace Governor, Infinity Slice Engine,
Gravitas Guard, Dynamic Hardware Telemetry, and Zero-Cost Multi-Provider LLM Router.
"""

from .gravitas_guard import (
    AntiRetryViolationError,
    EpistemicUncertaintyError,
    GatedCompletionError,
    GravitasGuard,
    GravitasInvariantException,
    ReadBeforeWriteViolationError,
    ScopeViolationError,
    StaleEvidenceError,
)
from .scope_guard import (
    NO_DESTRUCTIVE_FORCE_REBOOT,
    NO_DPAPI_VAULT_DUMP,
    NO_RAW_CREDENTIAL_EXPOSURE,
    NO_SYSTEM32_MODIFICATION,
    NO_UNAUTHORIZED_NETWORK_LISTENERS,
    REQUIRE_HUMAN_APPROVAL_FOR_PAYMENTS,
    SOVEREIGN_INVARIANTS,
    INVARIANT_DESCRIPTIONS,
    ScopeGuard,
    ScopeGuardException,
    assert_safe_command,
)
from .hardware import (
    GpuDevice,
    HardwareInspector,
    HardwareTelemetry,
    get_hardware_telemetry,
)
from .llm_router import (
    LLMProviderError,
    LLMRouter,
)
from .reflex_router import (
    INPUT,
    INPUT_UNION,
    KEYBDINPUT,
    MOUSEINPUT,
    ReflexRouter,
    clear_temp_files_reflex,
    dispatch,
    empty_recycle_bin_reflex,
    evaluate_and_execute,
    inject_date_reflex,
    inject_timestamp_reflex,
    lock_workstation_reflex,
    mute_audio_reflex,
    type_string_at_cursor,
    volume_down_reflex,
    volume_up_reflex,
)
from .slice_engine import (
    InfinitySliceEngine,
    SliceEngine,
)
from .workspaces import (
    WorkspaceGovernor,
)
from .ipc_server import (
    NexusIPCServer,
    DEFAULT_IPC_PORT,
)
from .hotkey_daemon import (
    HotkeyDaemon,
    KBDLLHOOKSTRUCT,
    WH_KEYBOARD_LL,
    VK_BACKQUOTE,
    create_ptt_daemon,
    resolve_vk_code,
)
from .away_tracker import (
    AwayTracker,
    WtsSessionMonitor,
    check_workstation_locked,
    wake_or_focus_workstation,
    create_pcm_frame,
    DEFAULT_SPIKE_THRESHOLD,
    DEFAULT_MIN_CLAP_INTERVAL_MS,
    DEFAULT_MAX_CLAP_INTERVAL_MS,
)
from .routines_manager import (
    RoutinesManager,
    tidy_desktop_reflex,
)
try:
    from .gateway import (
        create_gateway_app,
        run_gateway,
        start_gateway_background,
        FastAPIGatewayServer,
        DEFAULT_GATEWAY_PORT,
    )
except ImportError:
    create_gateway_app = None  # type: ignore
    run_gateway = None  # type: ignore
    start_gateway_background = None  # type: ignore
    FastAPIGatewayServer = None  # type: ignore
    DEFAULT_GATEWAY_PORT = 47630

__version__ = "5.0.0"
__author__ = "Nexus OS Core Runtime Team"

__all__ = [
    # Gateway API
    "create_gateway_app",
    "run_gateway",
    "start_gateway_background",
    "FastAPIGatewayServer",
    "DEFAULT_GATEWAY_PORT",
    # Reflex Router
    "INPUT",
    "INPUT_UNION",
    "KEYBDINPUT",
    "MOUSEINPUT",
    "ReflexRouter",
    "dispatch",
    "clear_temp_files_reflex",
    "empty_recycle_bin_reflex",
    "evaluate_and_execute",
    "type_string_at_cursor",
    "mute_audio_reflex",
    "volume_up_reflex",
    "volume_down_reflex",
    "inject_timestamp_reflex",
    "inject_date_reflex",
    "lock_workstation_reflex",
    # Workspaces
    "WorkspaceGovernor",
    # IPC Server
    "NexusIPCServer",
    "DEFAULT_IPC_PORT",
    # Slice Engine
    "InfinitySliceEngine",
    "SliceEngine",
    # Gravitas & Scope Guard
    "GravitasGuard",
    "ScopeGuard",
    "ScopeGuardException",
    "assert_safe_command",
    "NO_SYSTEM32_MODIFICATION",
    "NO_RAW_CREDENTIAL_EXPOSURE",
    "NO_UNAUTHORIZED_NETWORK_LISTENERS",
    "NO_DESTRUCTIVE_FORCE_REBOOT",
    "NO_DPAPI_VAULT_DUMP",
    "REQUIRE_HUMAN_APPROVAL_FOR_PAYMENTS",
    "SOVEREIGN_INVARIANTS",
    "INVARIANT_DESCRIPTIONS",
    "GravitasInvariantException",
    "ScopeViolationError",
    "ReadBeforeWriteViolationError",
    "AntiRetryViolationError",
    "StaleEvidenceError",
    "GatedCompletionError",
    "EpistemicUncertaintyError",
    # Hardware Telemetry
    "GpuDevice",
    "HardwareInspector",
    "HardwareTelemetry",
    "get_hardware_telemetry",
    # LLM Router
    "LLMRouter",
    "LLMProviderError",
    # Hotkey Daemon
    "HotkeyDaemon",
    "KBDLLHOOKSTRUCT",
    "WH_KEYBOARD_LL",
    "VK_BACKQUOTE",
    "create_ptt_daemon",
    "resolve_vk_code",
    # Away Tracker & Acoustic Transient Engine
    "AwayTracker",
    "WtsSessionMonitor",
    "check_workstation_locked",
    "wake_or_focus_workstation",
    "create_pcm_frame",
    "DEFAULT_SPIKE_THRESHOLD",
    "DEFAULT_MIN_CLAP_INTERVAL_MS",
    "DEFAULT_MAX_CLAP_INTERVAL_MS",
    # Voice Routines & Macro Execution Engine
    "RoutinesManager",
    "tidy_desktop_reflex",
]
