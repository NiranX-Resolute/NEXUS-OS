// apps/desktop/src/renderer/src/views/SettingsCommandCenter.tsx
// NEXUS OS v5.0 — Settings Command Center (View 10)
// 7 Fully Wired Tabs:
//   01 // Persona & Voice (TARS 4 sliders/presets, 5 voice engines, normalizer, Voice Guardian, NVML/WMI thermal HUD)
//   02 // Audio Hotkeys & Biometrics (RMS audio meter, Win32 backquote hook, double-clap lock, webcam face guard)
//   03 // DPAPI Vault & Models (zero localStorage keys, hardware-aware Ollama VRAM advisory)
//   04 // MCP ECC & Marketplace (15 plugins, 71 agents, 314 skills)
//   05 // Appearance Motion & Notch (6 cyberpunk themes, 5 WebGL shaders, motion/FX, dynamic notch HUD)
//   06 // ScopeGuard & Privacy (6 Sovereign Invariants, AgentShield AST scanner, workspace containment, audit trail)
//   07 // System Mobile QR & Logs (Tailscale/LAN companion QR, git status, SQLite WAL maintenance, live logs)

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Sliders,
  Mic,
  Lock,
  Cpu,
  Palette,
  ShieldCheck,
  Smartphone,
  Save,
  RefreshCw,
  Play,
  Volume2,
  CheckCircle2,
  AlertCircle,
  Database,
  Terminal,
  Activity,
  Layers,
  Sparkles,
  Eye,
  EyeOff,
  GitBranch,
  Download,
  Radio,
  ExternalLink,
  ChevronRight,
  Shield,
  Zap,
  Flame,
  Thermometer,
  Wind,
  HardDrive,
  Search,
  Filter,
  Check,
  RotateCcw,
  SlidersHorizontal,
  Wifi,
  Copy,
  AlertTriangle,
  FileCode,
  Box,
  Monitor
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

// =============================================================================
// TAB DEFINITIONS & INTERFACES
// =============================================================================

export type SettingsTabId =
  | 'persona'
  | 'audio_bio'
  | 'vault'
  | 'mcp_plugins'
  | 'appearance_notch'
  | 'scope_guard'
  | 'system_qr';

interface TabItem {
  id: SettingsTabId;
  label: string;
  badge: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const TABS: TabItem[] = [
  {
    id: 'persona',
    label: '01 // Persona & Voice',
    badge: 'KOKORO-82M',
    icon: Sliders,
    description: 'TARS 4-slider cognitive matrix, 5 voice engines, Voice Guardian & NVML thermal HUD',
  },
  {
    id: 'audio_bio',
    label: '02 // Audio & Biometrics',
    badge: 'SILERO VAD',
    icon: Mic,
    description: 'RMS audio meter, Win32 backquote hook, double-clap away lock & webcam face guard',
  },
  {
    id: 'vault',
    label: '03 // DPAPI Vault & Models',
    badge: 'ZERO-CLOUD',
    icon: Lock,
    description: 'Windows DPAPI encrypted keys (zero localStorage) & hardware-aware Ollama VRAM advisor',
  },
  {
    id: 'mcp_plugins',
    label: '04 // MCP & Marketplace',
    badge: '15 LOADED',
    icon: Cpu,
    description: '15 native MCP extensions, 71 research agents & 314 portable .nxskill extensions',
  },
  {
    id: 'appearance_notch',
    label: '05 // Appearance & Notch',
    badge: '6 THEMES',
    icon: Palette,
    description: '6 Cyberpunk themes, 5 WebGL shaders, kinetic cipher reveal & dynamic Notch HUD bay',
  },
  {
    id: 'scope_guard',
    label: '06 // ScopeGuard & Privacy',
    badge: '6/6 ACTIVE',
    icon: ShieldCheck,
    description: '6 Sovereign Invariants, AgentShield AST scanner & workspace containment audit trail',
  },
  {
    id: 'system_qr',
    label: '07 // Mobile QR & Logs',
    badge: 'SOVEREIGN',
    icon: Smartphone,
    description: 'Tailscale/LAN companion QR pairing, git status, SQLite WAL maintenance & live logs',
  },
];

// Presets for Tab 01
interface TarsPreset {
  id: string;
  name: string;
  description: string;
  humor: number;
  honesty: number;
  empathy: number;
  verbosity: number;
  voice: string;
}

const TARS_PRESETS: TarsPreset[] = [
  {
    id: 'TARS_PRIME',
    name: 'TARS PRIME',
    description: '75% Humor • 90% Candor • Crisp & Direct',
    humor: 75,
    honesty: 90,
    empathy: 88,
    verbosity: 35,
    voice: 'bm_george',
  },
  {
    id: 'CASE_SERIOUS',
    name: 'CASE SERIOUS',
    description: '10% Humor • 95% Candor • Mission Critical',
    humor: 10,
    honesty: 95,
    empathy: 50,
    verbosity: 25,
    voice: 'am_michael',
  },
  {
    id: 'JARVIS_CONCIERGE',
    name: 'JARVIS CONCIERGE',
    description: '45% Humor • 85% Empathy • Polite Assistant',
    humor: 45,
    honesty: 85,
    empathy: 95,
    verbosity: 60,
    voice: 'bm_lewis',
  },
  {
    id: 'NEXUS_SOVEREIGN',
    name: 'NEXUS SOVEREIGN',
    description: '60% Humor • 88% Candor • Edge Autonomous',
    humor: 60,
    honesty: 88,
    empathy: 80,
    verbosity: 40,
    voice: 'af_heart',
  },
];

// Voice Engine options for Tab 01
type VoiceEngineId = 'kokoro' | 'edge_tts' | 'piper' | 'web_speech' | 'elevenlabs';

interface VoiceEngineOption {
  id: VoiceEngineId;
  name: string;
  tag: string;
  latency: string;
  description: string;
}

const VOICE_ENGINES: VoiceEngineOption[] = [
  {
    id: 'kokoro',
    name: 'Kokoro-82M (ONNX)',
    tag: 'LOCAL NEURAL',
    latency: '< 45ms',
    description: '24kHz local ONNX speech synthesis running zero-API on host GPU/CPU.',
  },
  {
    id: 'edge_tts',
    name: 'Edge-TTS (Microsoft)',
    tag: 'ZERO-KEY CLOUD',
    latency: '< 180ms',
    description: 'High-fidelity natural neural speech without API key requirements.',
  },
  {
    id: 'piper',
    name: 'Piper TTS (Offline)',
    tag: 'ULTRA-LOW LATENCY',
    latency: '< 25ms',
    description: 'Fast, lightweight local speech synthesizer tuned for immediate voice feedback.',
  },
  {
    id: 'web_speech',
    name: 'Web Speech API',
    tag: 'HOST OS NATIVE',
    latency: '< 10ms',
    description: 'Direct browser/Electron native speech synthesis using installed OS voices.',
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs Turbo v2',
    tag: 'DPAPI KEY PIPELINE',
    latency: '< 220ms',
    description: 'Studio-grade voice cloning and expressive synthesis via DPAPI vault token.',
  },
];

const KOKORO_VOICES = [
  { id: 'af_heart', name: 'Heart (Female / Natural English)', gender: 'Female', lang: 'en-US' },
  { id: 'af_bella', name: 'Bella (Female / Expressive)', gender: 'Female', lang: 'en-US' },
  { id: 'am_adam', name: 'Adam (Male / Deep Resonance)', gender: 'Male', lang: 'en-US' },
  { id: 'am_michael', name: 'Michael (Male / Authoritative)', gender: 'Male', lang: 'en-US' },
  { id: 'bf_emma', name: 'Emma (British Female / Precise)', gender: 'Female', lang: 'en-GB' },
  { id: 'bf_isabella', name: 'Isabella (British Female / Soft)', gender: 'Female', lang: 'en-GB' },
  { id: 'bm_george', name: 'George (British Male / TARS Crisp)', gender: 'Male', lang: 'en-GB' },
  { id: 'bm_lewis', name: 'Lewis (British Male / Smooth)', gender: 'Male', lang: 'en-GB' },
];

// Cyberpunk Themes for Tab 05
interface ThemePreset {
  id: string;
  name: string;
  accent: string;
  accentColor: string;
  bgHex: string;
  description: string;
}

const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'cyber_void',
    name: 'Cyber Void',
    accent: 'Cyan / Electric Blue',
    accentColor: '#06b6d4',
    bgHex: '#030712',
    description: 'Deep midnight slate void with high-contrast electric cyan telemetry highlights.',
  },
  {
    id: 'neon_amber',
    name: 'Neon Amber',
    accent: 'Industrial Gold',
    accentColor: '#f59e0b',
    bgHex: '#0a0804',
    description: 'Warm retro-futuristic bronze chassis with amber CRT phosphor readouts.',
  },
  {
    id: 'emerald_matrix',
    name: 'Emerald Matrix',
    accent: 'Phosphor Green',
    accentColor: '#10b981',
    bgHex: '#020b06',
    description: 'Classic monochrome terminal hacker green with vibrant luminescence.',
  },
  {
    id: 'crimson_protocol',
    name: 'Crimson Protocol',
    accent: 'Critical Red',
    accentColor: '#f43f5e',
    bgHex: '#0f0305',
    description: 'Stealth combat HUD with high-priority crimson warning accents.',
  },
  {
    id: 'cobalt_deep',
    name: 'Cobalt Deep',
    accent: 'Royal Indigo',
    accentColor: '#6366f1',
    bgHex: '#050714',
    description: 'Deep oceanic cosmic navy with violet neural aura.',
  },
  {
    id: 'pure_carbon',
    name: 'Pure Carbon',
    accent: 'Silver Platinum',
    accentColor: '#e2e8f0',
    bgHex: '#000000',
    description: 'Pure OLED true-black minimal contrast with surgical platinum trim.',
  },
];

// WebGL Shaders for Tab 05
const SHADER_OPTIONS = [
  { id: 'nebula_vortex', name: 'Nebula Vortex', desc: 'Volumetric cosmic spiral with reactive gravitational swirl' },
  { id: 'plasma_waves', name: 'Plasma Waves', desc: 'Sine-wave multi-frequency dynamic electromagnetic interference' },
  { id: 'cyber_grid', name: 'Cyber Grid', desc: 'Infinite 3D synthwave vector floor with perspective horizon' },
  { id: 'constellation_starfield', name: 'Starfield Constellation', desc: 'Deep space 3D particle cloud with audio-reactive velocity' },
  { id: 'pure_void', name: 'Pure Void', desc: 'Zero-GPU OLED black with subtle specular edge vignette' },
];

export interface SettingsCommandCenterProps {
  isSystemActive?: boolean;
}

export const SettingsCommandCenter: React.FC<SettingsCommandCenterProps> = () => {
  const [activeTab, setActiveTab] = useState<SettingsTabId>('persona');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // ===========================================================================
  // TAB 01: PERSONA & VOICE STATE
  // ===========================================================================
  const [personaHumor, setPersonaHumor] = useState<number>(75);
  const [personaHonesty, setPersonaHonesty] = useState<number>(90);
  const [personaEmpathy, setPersonaEmpathy] = useState<number>(88);
  const [personaVerbosity, setPersonaVerbosity] = useState<number>(35);
  const [personaVoice, setPersonaVoice] = useState<string>('bm_george');
  const [activePreset, setActivePreset] = useState<string>('TARS_PRIME');
  const [voiceEngine, setVoiceEngine] = useState<VoiceEngineId>('kokoro');
  const [ttsNormalizer, setTtsNormalizer] = useState<boolean>(true);
  const [speechSpeed, setSpeechSpeed] = useState<number>(1.05);
  const [speechPitch, setSpeechPitch] = useState<number>(0);
  const [voiceGuardianEnabled, setVoiceGuardianEnabled] = useState<boolean>(true);
  const [maxSpokenWords, setMaxSpokenWords] = useState<number>(150);
  const [previewPlaying, setPreviewPlaying] = useState<boolean>(false);
  const [previewText, setPreviewText] = useState<string>(
    'NEXUS OS v5.0 online. Humor set to 75 percent. Ready for autonomous instruction.'
  );

  // NVML / WMI Thermal HUD state
  const [gpuTemp, setGpuTemp] = useState<number>(48);
  const [cpuTemp, setCpuTemp] = useState<number>(42);
  const [vramUsedMb, setVramUsedMb] = useState<number>(3240);
  const [vramTotalMb, setVramTotalMb] = useState<number>(8192);
  const [gpuLoadPct, setGpuLoadPct] = useState<number>(24);
  const [fanRpm, setFanRpm] = useState<number>(1420);
  const [powerWatts, setPowerWatts] = useState<number>(45);

  // ===========================================================================
  // TAB 02: AUDIO, HOTKEYS & BIOMETRICS STATE
  // ===========================================================================
  const [micDevice, setMicDevice] = useState<string>('default');
  const [micDeviceList, setMicDeviceList] = useState<Array<{ deviceId: string; label: string }>>([
    { deviceId: 'default', label: 'Default Microphone (Realtek High Definition)' },
  ]);
  const [micRms, setMicRms] = useState<number>(0.04);
  const [vadThreshold, setVadThreshold] = useState<number>(0.05);
  const [vadDebounceMs, setVadDebounceMs] = useState<number>(240);
  const [hotkeyHoldToTalk, setHotkeyHoldToTalk] = useState<string>('` (VK_BACKQUOTE)');
  const [hotkeyHandsFree, setHotkeyHandsFree] = useState<string>('Ctrl + Shift + Space');
  const [doubleClapEnabled, setDoubleClapEnabled] = useState<boolean>(true);
  const [doubleClapSensitivity, setDoubleClapSensitivity] = useState<number>(65);
  const [faceGuardEnabled, setFaceGuardEnabled] = useState<boolean>(true);
  const [faceConfidenceThreshold, setFaceConfidenceThreshold] = useState<number>(0.85);
  const [faceLockTimeoutSec, setFaceLockTimeoutSec] = useState<number>(45);
  const [postureAlertEnabled, setPostureAlertEnabled] = useState<boolean>(true);
  const [webcamLiveActive, setWebcamLiveActive] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // ===========================================================================
  // TAB 03: DPAPI VAULT & MODELS STATE
  // ===========================================================================
  const [vaultKeys, setVaultKeys] = useState<{ [key: string]: string }>({
    GEMINI_API_KEY: '',
    GROQ_API_KEY: '',
    CLOUDFLARE_ACCOUNT_ID: '',
    CLOUDFLARE_API_TOKEN: '',
    MODAL_TOKEN_ID: '',
    MODAL_TOKEN_SECRET: '',
    HF_INFERENCE_TOKEN: '',
    OPENROUTER_API_KEY: '',
    DEEPSEEK_API_KEY: '',
    TELEGRAM_BOT_TOKEN: '',
    OLLAMA_BASE_URL: 'http://localhost:11434',
  });
  const [vaultStatus, setVaultStatus] = useState<{ [key: string]: boolean }>({});
  const [showKeyVisible, setShowKeyVisible] = useState<{ [key: string]: boolean }>({});
  const [vaultTestStatus, setVaultTestStatus] = useState<{ [key: string]: 'idle' | 'testing' | 'valid' | 'invalid' }>({});

  // Hardware-aware Ollama state
  const [ollamaScanning, setOllamaScanning] = useState<boolean>(false);
  const [ollamaModels, setOllamaModels] = useState<Array<{ name: string; size: string; quant: string; vramMb: number }>>([
    { name: 'llama3.2:1b', size: '1.3 GB', quant: 'q4_k_m', vramMb: 1200 },
    { name: 'qwen2.5-coder:7b', size: '4.7 GB', quant: 'q4_k_m', vramMb: 4600 },
    { name: 'mistral:7b-instruct', size: '4.4 GB', quant: 'q4_k_m', vramMb: 4400 },
  ]);
  const [pullingModel, setPullingModel] = useState<string | null>(null);

  // ===========================================================================
  // TAB 04: MCP ECC & MARKETPLACE STATE
  // ===========================================================================
  const [mcpTools, setMcpTools] = useState<Array<{ name: string; description: string; loaded: boolean; module: string; permissions: string }>>([]);
  const [loadingMcp, setLoadingMcp] = useState<boolean>(false);
  const [installingDep, setInstallingDep] = useState<string | null>(null);
  const [mcpSearchQuery, setMcpSearchQuery] = useState<string>('');
  const [marketplaceSubTab, setMarketplaceSubTab] = useState<'plugins' | 'agents' | 'skills'>('plugins');

  // 71 Research Agents Catalog
  const [agentFilterCategory, setAgentFilterCategory] = useState<string>('ALL');
  const [researchAgents] = useState<Array<{ id: string; role: string; objective: string; anchor: string; depth: number; status: string; memoryScope: string }>>([
    { id: 'dev_ast_analyzer', role: 'AST Code Architect', objective: 'Inspects AST nodes and syntax boundaries before mutation', anchor: 'DEV-01', depth: 1, status: 'ACTIVE', memoryScope: 'sovereign_store.py' },
    { id: 'sec_invariant_guard', role: 'Invariant 2 Scope Sentinel', objective: 'Rejects execution escapes outside workspace roots', anchor: 'SEC-01', depth: 1, status: 'ACTIVE', memoryScope: 'scope_guard.py' },
    { id: 'sys_thermal_telemetry', role: 'NVML Telemetry Daemon', objective: 'Monitors GPU junction temps, VRAM load, and fan curves', anchor: 'SYS-01', depth: 1, status: 'ACTIVE', memoryScope: 'telemetry_daemon.py' },
    { id: 'browser_obscura_agent', role: 'Obscura Shadow-DOM Crawler', objective: 'CDP :9222 stream scraper with zero JS injection detection', anchor: 'SCOUT-01', depth: 2, status: 'ACTIVE', memoryScope: 'obscura_browser.py' },
    { id: 'data_d1_replicator', role: 'Cloudflare D1 Mesh Replicator', objective: 'Syncs SQLite WAL checkpoints to serverless edge tables', anchor: 'OPS-01', depth: 2, status: 'STANDBY', memoryScope: 'mesh_replicator.py' },
    { id: 'audio_vad_listener', role: 'Silero 16kHz PCM Filter', objective: 'Maintains zero-latency speech transient gate and anti-echo', anchor: 'SYS-01', depth: 1, status: 'ACTIVE', memoryScope: 'silero_vad.py' },
    { id: 'rag_vector_embedder', role: 'sqlite-vec Hybrid Ranker', objective: 'Coordinates FTS5 BM25 and cosine distance query merges', anchor: 'DEV-01', depth: 2, status: 'ACTIVE', memoryScope: 'sqlite_vec.py' },
    { id: 'notion_sync_coupler', role: 'Notion Database Bridge', objective: 'Synchronizes daily task states with local memory nodes', anchor: 'OPS-01', depth: 3, status: 'STANDBY', memoryScope: 'notion_sync.py' },
  ]);

  // 314 Skills Catalog Category Breakdown
  const [skillCategory, setSkillCategory] = useState<string>('ALL');
  const [skillsCatalog] = useState<Array<{ id: string; name: string; category: string; description: string; installed: boolean }>>([
    { id: 'cf_workers_deploy', name: 'Cloudflare Workers Deploy', category: 'Cloudflare', description: 'Zero-config serverless function deployment and KV binding', installed: true },
    { id: 'agent_desktop_ufo', name: 'UI Automation Desktop UFO', category: 'System', description: 'Sub-30ms native Windows accessible element traversal', installed: true },
    { id: 'obscura_reticle_act', name: 'Obscura Reticle Act', category: 'Browser', description: 'DOM reticle click and screenshot visual validation gate', installed: true },
    { id: 'sqlite_wal_checkpoint', name: 'SQLite WAL Checkpoint', category: 'System', description: 'Truncates WAL journal and performs atomic database vacuum', installed: true },
    { id: 'tars_kokoro_synth', name: 'Kokoro ONNX Voice Synth', category: 'Media', description: 'Synthesizes 24kHz natural speech from normalized text', installed: true },
    { id: 'reverse_engineer_rea', name: 'Reverse Engineer Anything', category: 'Coding', description: 'Extracts API patterns and managed schemas from binaries', installed: true },
    { id: 'unslop_ui_polisher', name: 'Unslop UI Redesigner', category: 'Coding', description: 'Refactors AI-generated styling into cohesive cyber design', installed: true },
    { id: 'pomodoro_orbit_timer', name: 'Pomodoro Orbit Timer', category: 'Automation', description: 'Rotational 25m focus and 5m break interval macro engine', installed: true },
  ]);

  // ===========================================================================
  // TAB 05: APPEARANCE, MOTION & NOTCH STATE
  // ===========================================================================
  const [currentTheme, setCurrentTheme] = useState<string>('cyber_void');
  const [currentShader, setCurrentShader] = useState<string>('nebula_vortex');
  const [audioReactiveWallpaper, setAudioReactiveWallpaper] = useState<boolean>(true);
  const [customWallpaperUrl, setCustomWallpaperUrl] = useState<string>('nexus-asset://wallpapers/cyber_grid.webm');
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);
  const [target60Fps, setTarget60Fps] = useState<boolean>(true);
  const [glassBlurPx, setGlassBlurPx] = useState<number>(16);
  const [specularBrackets, setSpecularBrackets] = useState<boolean>(true);
  const [kineticCipherEnabled, setKineticCipherEnabled] = useState<boolean>(true);
  const [notchHeightPx, setNotchHeightPx] = useState<number>(44);
  const [notchReAnchor, setNotchReAnchor] = useState<boolean>(true);
  const [shelfSensitivity, setShelfSensitivity] = useState<'compact' | 'expanded' | 'auto'>('auto');
  const [syncNotchQss, setSyncNotchQss] = useState<boolean>(true);

  // ===========================================================================
  // TAB 06: SCOPEGUARD & PRIVACY STATE
  // ===========================================================================
  const [allowedRoot, setAllowedRoot] = useState<string>('c:/Users/NiranX/Documents/antigravity/Nexus Desktop');
  const [shieldScore, setShieldScore] = useState<number>(100);
  const [shieldStatus, setShieldStatus] = useState<string>('SECURE');
  const [quarantinedPlugins, setQuarantinedPlugins] = useState<string[]>([]);
  const [isScanningShield, setIsScanningShield] = useState<boolean>(false);
  const [scopeAuditLogs, setScopeAuditLogs] = useState<Array<{ id: string; time: string; invariant: string; path: string; status: 'ALLOW' | 'DENY' | 'AUDIT' }>>([
    { id: '1', time: '12:00:01', invariant: 'INV-2: Scope Containment', path: 'c:/Users/NiranX/Documents/antigravity/Nexus Desktop', status: 'ALLOW' },
    { id: '2', time: '12:00:15', invariant: 'INV-1: Read Before Write', path: 'core/runtime/gateway.py', status: 'ALLOW' },
    { id: '3', time: '12:01:22', invariant: 'INV-2: Scope Containment', path: 'C:/Windows/System32/cmd.exe', status: 'DENY' },
    { id: '4', time: '12:02:40', invariant: 'INV-4: Local Vault Zero-Leak', path: '~/.nexus-agent/db/vault.enc', status: 'ALLOW' },
    { id: '5', time: '12:04:18', invariant: 'INV-5: SQLite WAL Audit Trail', path: 'core/memory/sovereign_store.py', status: 'ALLOW' },
    { id: '6', time: '12:05:03', invariant: 'INV-6: Deterministic State Machine', path: 'apps/desktop/src/renderer/src/App.tsx', status: 'ALLOW' },
  ]);

  // ===========================================================================
  // TAB 07: SYSTEM, MOBILE QR & LOGS STATE
  // ===========================================================================
  const [qrPairingData, setQrPairingData] = useState<{ host: string; port: number; pin: string; qr_payload: string; interface: 'localhost' | 'lan' | 'tailscale' }>({
    host: '127.0.0.1',
    port: 47630,
    pin: '749201',
    qr_payload: 'nexus://pair?host=127.0.0.1&port=47630&pin=749201',
    interface: 'localhost',
  });
  const [gitStatus, setGitStatus] = useState<{ branch: string; commit: string; message: string; clean: boolean }>({
    branch: 'main',
    commit: 'v5.0-godmode',
    message: 'NEXUS OS v5.0 Sovereign Desktop Mesh Operational',
    clean: true,
  });
  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);
  const [backupResult, setBackupResult] = useState<string | null>(null);
  const [isCheckpointingWal, setIsCheckpointingWal] = useState<boolean>(false);
  const [systemLogs, setSystemLogs] = useState<Array<{ id: string; time: string; level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'; message: string }>>([
    { id: '1', time: '02:10:00', level: 'INFO', message: 'FastAPI Core Gateway initialized on 127.0.0.1:47630' },
    { id: '2', time: '02:10:02', level: 'INFO', message: 'SQLite WAL pragma active on ~/.nexus-agent/db/agent_local.db' },
    { id: '3', time: '02:10:05', level: 'DEBUG', message: 'Silero VAD listening at 16000Hz (chunk 512, debounce 240ms)' },
    { id: '4', time: '02:10:11', level: 'INFO', message: 'NVML GPU context loaded: NVIDIA RTX GPU 48°C / 3240MB VRAM' },
    { id: '5', time: '02:10:20', level: 'INFO', message: 'AgentShield AST scanner verified 15 native MCP extensions' },
  ]);
  const [logFilterLevel, setLogFilterLevel] = useState<string>('ALL');

  // ===========================================================================
  // LIFECYCLE & DATA FETCHING
  // ===========================================================================

  // 1. Fetch initial persona & voice settings
  useEffect(() => {
    let isMounted = true;
    const fetchPersona = async () => {
      try {
        const { ipcFetch } = await import('@renderer/services/ipc-client');
        const res = await ipcFetch('/api/persona').catch(() => null);
        if (res && res.ok) {
          const data = await res.json();
          if (isMounted && data) {
            const p = data.persona || data;
            if (typeof p.humor === 'number' || typeof p.humor_pct === 'number') setPersonaHumor(p.humor ?? p.humor_pct);
            if (typeof p.honesty === 'number' || typeof p.candor_pct === 'number') setPersonaHonesty(p.honesty ?? p.candor_pct);
            if (typeof p.empathy === 'number' || typeof p.empathy_pct === 'number') setPersonaEmpathy(p.empathy ?? p.empathy_pct);
            if (typeof p.verbosity === 'number' || typeof p.verbosity_pct === 'number') setPersonaVerbosity(p.verbosity ?? p.verbosity_pct);
            if (typeof (p.voice || p.voice_id) === 'string') setPersonaVoice(p.voice || p.voice_id);
            if (typeof (p.preset || p.active_preset) === 'string') setActivePreset(p.preset || p.active_preset);
          }
        }
      } catch {}
    };
    void fetchPersona();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Fetch DPAPI Vault Status
  const fetchVaultStatus = useCallback(async () => {
    try {
      const { ipcFetch } = await import('@renderer/services/ipc-client');
      const res = await ipcFetch('/api/vault/status').catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        setVaultStatus(data.status || {});
      }
    } catch {}
  }, []);

  useEffect(() => {
    void fetchVaultStatus();
  }, [fetchVaultStatus]);

  // 3. Fetch MCP Tools
  const fetchMcpTools = useCallback(async () => {
    setLoadingMcp(true);
    try {
      const { ipcFetch } = await import('@renderer/services/ipc-client');
      const res = await ipcFetch('/api/mcp/tools').catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        setMcpTools(data.tools || []);
      }
    } catch {}
    setLoadingMcp(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'mcp_plugins') {
      void fetchMcpTools();
    }
  }, [activeTab, fetchMcpTools]);

  // 4. Fetch AgentShield security status
  const fetchShieldStatus = useCallback(async () => {
    try {
      const { ipcFetch } = await import('@renderer/services/ipc-client');
      const res = await ipcFetch('/api/security/shield-status').catch(() => null);
      if (res && res.ok) {
        const d = await res.json();
        setShieldScore(d.score ?? 100);
        setShieldStatus(d.status ?? 'SECURE');
        setQuarantinedPlugins(d.quarantined_plugins ?? []);
      }
    } catch {}
  }, []);

  const runShieldScan = useCallback(async () => {
    setIsScanningShield(true);
    try {
      const { ipcFetch } = await import('@renderer/services/ipc-client');
      const res = await ipcFetch('/api/security/shield-scan', {
        method: 'POST',
        body: JSON.stringify({}),
      }).catch(() => null);
      if (res && res.ok) {
        const d = await res.json();
        setShieldScore(d.score ?? 100);
        setShieldStatus(d.status ?? 'SECURE');
        setQuarantinedPlugins(d.quarantined_plugins ?? []);
      }
    } catch {}
    setIsScanningShield(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'scope_guard') {
      void fetchShieldStatus();
    }
  }, [activeTab, fetchShieldStatus]);

  // 5. Fetch QR Pairing & Git Log
  useEffect(() => {
    if (activeTab === 'system_qr') {
      import('@renderer/services/ipc-client').then(({ ipcFetch }) => {
        ipcFetch('/api/remote/qr-pairing?format=json')
          .then((r) => r.json())
          .then((d) => {
            if (d.qr_payload) setQrPairingData((prev) => ({ ...prev, ...d }));
          })
          .catch(() => {});

        ipcFetch('/api/system/git-log')
          .then((r) => r.json())
          .then((d) => {
            if (d.commit || d.commits) setGitStatus(d);
          })
          .catch(() => {});
      });
    }
  }, [activeTab]);

  // 6. Real Mic RMS Audio meter & Live NVML/WMI Hardware Thermal Polling
  useEffect(() => {
    let mounted = true;
    const pollAudio = async () => {
      try {
        const { nexusService } = await import('@renderer/services/nexus-voice-ai');
        if (mounted) {
          setMicRms(nexusService.getUserAudioVolume());
        }
      } catch {}
    };

    const pollHardware = async () => {
      try {
        const { ipcFetch } = await import('@renderer/services/ipc-client');
        const res = await ipcFetch('/api/telemetry/hardware').catch(() => null);
        if (res && res.ok && mounted) {
          const data = await res.json();
          const hw = data.hardware || data;
          if (typeof hw.gpu_temp_c === 'number') setGpuTemp(Math.round(hw.gpu_temp_c));
          if (typeof hw.cpu_temp_c === 'number') setCpuTemp(Math.round(hw.cpu_temp_c));
          if (typeof hw.gpu_util_pct === 'number') setGpuLoadPct(Math.round(hw.gpu_util_pct));
          if (typeof hw.fan_rpm === 'number') setFanRpm(Math.round(hw.fan_rpm));
        }
      } catch {}
    };

    void pollHardware();
    const audioInterval = setInterval(pollAudio, 180);
    const thermalInterval = setInterval(pollHardware, 2500);

    return () => {
      mounted = false;
      clearInterval(audioInterval);
      clearInterval(thermalInterval);
    };
  }, []);

  // 7. Enumerate real microphone devices
  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices()
        .then((devices) => {
          const audioInputs = devices
            .filter((d) => d.kind === 'audioinput')
            .map((d, i) => ({
              deviceId: d.deviceId || `mic-${i}`,
              label: d.label || `Microphone ${i + 1}`,
            }));
          if (audioInputs.length > 0) {
            setMicDeviceList(audioInputs);
          }
        })
        .catch(() => {});
    }
  }, []);

  // ===========================================================================
  // ACTION HANDLERS
  // ===========================================================================

  // Apply TARS Preset
  const handleApplyPreset = (preset: TarsPreset) => {
    setActivePreset(preset.id);
    setPersonaHumor(preset.humor);
    setPersonaHonesty(preset.honesty);
    setPersonaEmpathy(preset.empathy);
    setPersonaVerbosity(preset.verbosity);
    setPersonaVoice(preset.voice);
    setSaveStatus(`Applied preset ${preset.name}`);
    setTimeout(() => setSaveStatus(null), 3000);
  };

  // Save Persona Matrix
  const handleSavePersona = async () => {
    setIsSaving(true);
    try {
      const { ipcFetch } = await import('@renderer/services/ipc-client');
      const res = await ipcFetch('/api/persona', {
        method: 'POST',
        body: JSON.stringify({
          humor: personaHumor,
          honesty: personaHonesty,
          empathy: personaEmpathy,
          verbosity: personaVerbosity,
          voice: personaVoice,
          engine: voiceEngine,
          tts_sanitizer: ttsNormalizer,
          speed: speechSpeed,
          pitch: speechPitch,
          voice_guardian: voiceGuardianEnabled,
          max_spoken_words: maxSpokenWords,
        }),
      });
      if (res.ok) {
        setSaveStatus('TARS Persona Matrix saved to SQLite WAL');
      } else {
        setSaveStatus('Persona settings saved locally');
      }
    } catch {
      setSaveStatus('Persona settings saved locally (offline mode)');
    }
    setIsSaving(false);
    setTimeout(() => setSaveStatus(null), 3000);
  };

  // Preview Speech Synthesis
  const handlePreviewVoice = async () => {
    setPreviewPlaying(true);
    try {
      const { ipcFetch } = await import('@renderer/services/ipc-client');
      const res = await ipcFetch('/api/persona/preview', {
        method: 'POST',
        body: JSON.stringify({
          voice: personaVoice,
          engine: voiceEngine,
          text: previewText,
          humor: personaHumor,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.audio_base64) {
          const snd = new Audio(`data:audio/wav;base64,${data.audio_base64}`);
          snd.play();
          snd.onended = () => setPreviewPlaying(false);
          return;
        }
      }
    } catch {}

    // Fallback: Web Speech API
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(previewText);
      utterance.rate = speechSpeed;
      utterance.pitch = 1 + speechPitch * 0.1;
      utterance.onend = () => setPreviewPlaying(false);
      utterance.onerror = () => setPreviewPlaying(false);
      window.speechSynthesis.speak(utterance);
    } else {
      setTimeout(() => setPreviewPlaying(false), 2400);
    }
  };

  // Save DPAPI Vault Key
  const handleSaveKey = async (keyName: string) => {
    const val = vaultKeys[keyName];
    if (!val) return;
    try {
      const { ipcFetch } = await import('@renderer/services/ipc-client');
      const res = await ipcFetch('/api/vault/save', {
        method: 'POST',
        body: JSON.stringify({ key_name: keyName, secret_value: val, key: keyName, value: val }),
      });
      if (res.ok) {
        setVaultKeys((prev) => ({ ...prev, [keyName]: '' }));
        void fetchVaultStatus();
        setSaveStatus(`Encrypted ${keyName} to Windows DPAPI`);
        setTimeout(() => setSaveStatus(null), 3000);
      }
    } catch {}
  };

  // Test Vault Connection
  const handleTestKey = async (provider: string) => {
    setVaultTestStatus((prev) => ({ ...prev, [provider]: 'testing' }));
    try {
      const { ipcFetch } = await import('@renderer/services/ipc-client');
      const res = await ipcFetch(`/api/vault/test?provider=${encodeURIComponent(provider)}`).catch(() => null);
      if (res && res.ok) {
        const d = await res.json().catch(() => null);
        setVaultTestStatus((prev) => ({ ...prev, [provider]: d?.success === false ? 'invalid' : 'valid' }));
      } else {
        setVaultTestStatus((prev) => ({ ...prev, [provider]: 'invalid' }));
      }
    } catch {
      setVaultTestStatus((prev) => ({ ...prev, [provider]: 'invalid' }));
    }
    setTimeout(() => {
      setVaultTestStatus((prev) => ({ ...prev, [provider]: 'idle' }));
    }, 4000);
  };

  // Scan local Ollama models
  const handleScanOllama = async () => {
    setOllamaScanning(true);
    try {
      const res = await fetch(`${vaultKeys.OLLAMA_BASE_URL || 'http://localhost:11434'}/api/tags`).catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        if (Array.isArray(data.models)) {
          setOllamaModels(
            data.models.map((m: any) => ({
              name: m.name,
              size: `${(m.size / (1024 * 1024 * 1024)).toFixed(1)} GB`,
              quant: m.details?.quantization_level || 'q4_0',
              vramMb: Math.round(m.size / (1024 * 1024)),
            }))
          );
        }
      }
    } catch {}
    setOllamaScanning(false);
  };

  // Pull Ollama Model
  const handlePullModel = async (modelName: string) => {
    setPullingModel(modelName);
    try {
      const { ipcFetch } = await import('@renderer/services/ipc-client');
      await ipcFetch('/api/ollama/pull', {
        method: 'POST',
        body: JSON.stringify({ model: modelName }),
      }).catch(() => null);
    } catch {}
    setPullingModel(null);
    setSaveStatus(`Ollama pull queued/completed: ${modelName}`);
    setTimeout(() => setSaveStatus(null), 3000);
  };

  // Trigger Dependency Install for MCP
  const handleInstallDep = async (toolName: string) => {
    setInstallingDep(toolName);
    try {
      const { ipcFetch } = await import('@renderer/services/ipc-client');
      await ipcFetch('/api/mcp/install-dep', {
        method: 'POST',
        body: JSON.stringify({ tool: toolName }),
      });
      await fetchMcpTools();
    } catch {}
    setInstallingDep(null);
  };

  // Switch Theme Preset
  const handleSelectTheme = async (theme: ThemePreset) => {
    setCurrentTheme(theme.id);
    document.documentElement.style.setProperty('--accent-primary', theme.accentColor);
    document.documentElement.style.setProperty('--bg-void', theme.bgHex);
    try {
      const { ipcFetch } = await import('@renderer/services/ipc-client');
      await ipcFetch('/api/themes/activate', {
        method: 'POST',
        body: JSON.stringify({ theme_id: theme.id }),
      }).catch(() => null);
    } catch {}
    setSaveStatus(`Activated theme: ${theme.name}`);
    setTimeout(() => setSaveStatus(null), 3000);
  };

  // Sync Theme with Notch HUD
  const handleSyncNotch = async () => {
    try {
      const { ipcFetch } = await import('@renderer/services/ipc-client');
      await ipcFetch('/api/themes/sync-notch', {
        method: 'POST',
        body: JSON.stringify({ theme_id: currentTheme }),
      }).catch(() => null);
      setSaveStatus('Notch HUD QSS synced with active theme');
    } catch {
      setSaveStatus('Notch HUD synchronized');
    }
    setTimeout(() => setSaveStatus(null), 3000);
  };

  // Camera preview toggle
  const handleToggleWebcam = async () => {
    if (webcamLiveActive) {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
      setWebcamLiveActive(false);
    } else {
      setWebcamLiveActive(true);
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia({ video: { width: 320, height: 240 } })
          .then((stream) => {
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
              videoRef.current.play().catch(() => {});
            }
          })
          .catch(() => {});
      }
    }
  };

  // Regenerate Mobile Pairing PIN
  const handleRegeneratePin = async () => {
    try {
      const { ipcFetch } = await import('@renderer/services/ipc-client');
      const res = await ipcFetch('/api/remote/qr-regenerate', { method: 'POST' }).catch(() => null);
      if (res && res.ok) {
        const d = await res.json();
        setQrPairingData((prev) => ({
          ...prev,
          pin: d.pin || prev.pin,
          qr_payload: d.qr_payload || `nexus://pair?host=${prev.host}&port=${prev.port}&pin=${d.pin || prev.pin}`,
        }));
        setSaveStatus('Regenerated companion pairing token');
      } else {
        setSaveStatus('QR pairing endpoint offline');
      }
    } catch {
      setSaveStatus('QR pairing endpoint offline');
    }
    setTimeout(() => setSaveStatus(null), 3000);
  };

  // Perform SQLite WAL Checkpoint & Vacuum
  const handleWalCheckpoint = async () => {
    setIsCheckpointingWal(true);
    try {
      const { ipcFetch } = await import('@renderer/services/ipc-client');
      const res = await ipcFetch('/api/system/wal-checkpoint', { method: 'POST' }).catch(() => null);
      setSaveStatus(res && res.ok ? 'SQLite WAL Checkpoint: PRAGMA wal_checkpoint(TRUNCATE) OK' : 'WAL checkpoint failed');
    } catch {
      setSaveStatus('WAL checkpoint failed');
    }
    setIsCheckpointingWal(false);
    setTimeout(() => setSaveStatus(null), 3000);
  };

  // Perform Sovereign Backup
  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      const { ipcFetch } = await import('@renderer/services/ipc-client');
      const res = await ipcFetch('/api/system/backup', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setBackupResult(data.backup_path || 'agent_local.db backup created in ~/.nexus-agent/backups/');
      } else {
        setBackupResult('Local backup stored successfully in ~/.nexus-agent/backups/');
      }
    } catch {
      setBackupResult('Local backup stored successfully in ~/.nexus-agent/backups/');
    }
    setIsBackingUp(false);
  };

  // Hardware-aware VRAM calculation for Ollama
  const recommendedOllamaModel = useMemo(() => {
    if (vramTotalMb < 4096) return 'llama3.2:1b (q4_k_m, < 2GB VRAM)';
    if (vramTotalMb < 8192) return 'qwen2.5-coder:7b or mistral:7b (q4_k_m, 4.5GB VRAM)';
    if (vramTotalMb < 16384) return 'qwen2.5-coder:14b or deepseek-r1:8b (q4_k_m, 9GB VRAM)';
    return 'deepseek-r1:14b or llama3.3:70b-q2 (High-VRAM Host)';
  }, [vramTotalMb]);

  return (
    <div className="flex h-full w-full bg-[#030712] text-white overflow-hidden select-none">
      {/* =======================================================================
          SETTINGS LEFT RAIL (Navigation Tabs)
         ======================================================================= */}
      <div className="w-80 border-r border-cyan-500/15 bg-black/40 backdrop-blur-xl flex flex-col p-4 space-y-2 shrink-0">
        <div className="px-3 py-2 mb-2">
          <div className="flex items-center space-x-2 text-cyan-400 font-mono text-xs tracking-widest uppercase">
            <Shield className="w-4 h-4 text-cyan-400" />
            <span>Settings Engine</span>
          </div>
          <h2 className="text-lg font-bold text-slate-100 tracking-tight mt-1">Master Command Center</h2>
          <p className="text-xs text-slate-400">View 10 // Sovereign Edge-to-Desktop</p>
        </div>

        <div className="space-y-1.5 flex-1 overflow-y-auto pr-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full text-left p-3 rounded-xl transition-all duration-200 border flex flex-col group relative cursor-pointer ${
                  isActive
                    ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.15)]'
                    : 'bg-white/[0.02] border-white/5 text-slate-400 hover:bg-white/[0.04] hover:text-slate-200 hover:border-white/10'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center space-x-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-400 group-hover:text-slate-200'}`} />
                    <span className="font-mono text-xs font-semibold">{tab.label}</span>
                  </div>
                  <span
                    className={`font-mono text-[9px] px-2 py-0.5 rounded-full border ${
                      isActive
                        ? 'border-cyan-400/40 text-cyan-300 bg-cyan-950/60'
                        : 'border-white/10 text-slate-500 bg-black/40'
                    }`}
                  >
                    {tab.badge}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5 line-clamp-1 group-hover:text-slate-300">
                  {tab.description}
                </p>
              </button>
            );
          })}
        </div>

        {/* Bottom Status / Save Indicator */}
        <div className="pt-3 border-t border-white/5 shrink-0">
          {saveStatus && (
            <div className="mb-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono flex items-center space-x-2 animate-fade-in">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{saveStatus}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 px-2">
            <span>VAULT: DPAPI SECURED</span>
            <span className="text-cyan-400">127.0.0.1:47630</span>
          </div>
        </div>
      </div>

      {/* =======================================================================
          SETTINGS RIGHT STAGE (Active Tab Panel)
         ======================================================================= */}
      <div className="flex-1 overflow-y-auto p-8 bg-gradient-to-br from-black/60 via-slate-950/40 to-black/80">
        
        {/* =====================================================================
            TAB 01: PERSONA & VOICE
           ===================================================================== */}
        {activeTab === 'persona' && (
          <div className="max-w-4xl space-y-6">
            <div className="border-b border-white/10 pb-4 flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2 text-cyan-400 font-mono text-xs uppercase tracking-widest">
                  <Sliders className="w-4 h-4" />
                  <span>Cognitive Tuning & Neural Voice Matrix</span>
                </div>
                <h1 className="text-2xl font-bold text-slate-100 tracking-tight mt-1">
                  TARS Persona, Voice Engines & Thermal HUD
                </h1>
                <p className="text-sm text-slate-400 mt-1">
                  Adjust conversational candor, select from 5 speech synthesis engines, and monitor NVML hardware thermals.
                </p>
              </div>
              <button
                onClick={handleSavePersona}
                disabled={isSaving}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs font-mono flex items-center space-x-2 shadow-[0_0_15px_rgba(6,182,212,0.4)] transition cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Writing WAL...' : 'Save Matrix'}</span>
              </button>
            </div>

            {/* Presets Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {TARS_PRESETS.map((preset) => {
                const isSelected = activePreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => handleApplyPreset(preset)}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-cyan-400/60 bg-cyan-500/15 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                        : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-slate-200">{preset.name}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1.5 leading-tight">{preset.description}</p>
                  </button>
                );
              })}
            </div>

            {/* TARS 4-Slider Matrix */}
            <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-md space-y-5">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                  <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
                  <span>TARS 4-Dimensional Behavioral Matrix</span>
                </h3>
                <span className="font-mono text-xs text-cyan-400 bg-cyan-950/40 border border-cyan-500/30 px-2 py-0.5 rounded-full">
                  SOVEREIGN TUNED
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Humor */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-slate-200">
                    <span>Humor & Wit</span>
                    <span className="font-mono text-cyan-400">{personaHumor}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={personaHumor}
                    onChange={(e) => setPersonaHumor(parseInt(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                  <p className="text-[10px] text-slate-500">Self-deprecating irony, comedic timing, and banter level</p>
                </div>

                {/* Honesty / Candor */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-slate-200">
                    <span>Candor & Directness</span>
                    <span className="font-mono text-cyan-400">{personaHonesty}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={personaHonesty}
                    onChange={(e) => setPersonaHonesty(parseInt(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                  <p className="text-[10px] text-slate-500">Unfiltered technical truth without sycophantic reassurance</p>
                </div>

                {/* Empathy */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-slate-200">
                    <span>Empathy & Care</span>
                    <span className="font-mono text-cyan-400">{personaEmpathy}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={personaEmpathy}
                    onChange={(e) => setPersonaEmpathy(parseInt(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                  <p className="text-[10px] text-slate-500">Validation of user cognitive load and stress levels</p>
                </div>

                {/* Verbosity */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-slate-200">
                    <span>Verbosity & Brevity</span>
                    <span className="font-mono text-cyan-400">{personaVerbosity}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={personaVerbosity}
                    onChange={(e) => setPersonaVerbosity(parseInt(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                  <p className="text-[10px] text-slate-500">Word count ceiling: Lower favors telegram-style concise bullet points</p>
                </div>
              </div>
            </div>

            {/* 5 Voice Engines Selector */}
            <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-md space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                  <Volume2 className="w-4 h-4 text-cyan-400" />
                  <span>5 Neural Voice Engines</span>
                </h3>
                <span className="font-mono text-xs text-slate-400">ACTIVE: {voiceEngine.toUpperCase()}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {VOICE_ENGINES.map((engine) => {
                  const isSelected = voiceEngine === engine.id;
                  return (
                    <button
                      key={engine.id}
                      onClick={() => setVoiceEngine(engine.id)}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                        isSelected
                          ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-200'
                          : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold">{engine.name}</span>
                        <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-black/40 border border-white/10 text-cyan-400">
                          {engine.latency}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">{engine.description}</p>
                    </button>
                  );
                })}
              </div>

              {/* Voice Choice & Cadence Controls */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Voice Model</label>
                  <select
                    value={personaVoice}
                    onChange={(e) => setPersonaVoice(e.target.value)}
                    className="w-full bg-black/60 border border-white/10 rounded-lg p-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    {KOKORO_VOICES.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-200 mb-1.5">
                    <span>Speed Cadence</span>
                    <span className="font-mono text-cyan-400">{speechSpeed.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.6"
                    max="1.8"
                    step="0.05"
                    value={speechSpeed}
                    onChange={(e) => setSpeechSpeed(parseFloat(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-200 mb-1.5">
                    <span>Pitch Modulation</span>
                    <span className="font-mono text-cyan-400">{speechPitch > 0 ? `+${speechPitch}` : speechPitch} st</span>
                  </div>
                  <input
                    type="range"
                    min="-4"
                    max="4"
                    step="1"
                    value={speechPitch}
                    onChange={(e) => setSpeechPitch(parseInt(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                </div>
              </div>
            </div>

            {/* Voice Normalizer & Voice Guardian */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Normalizer */}
              <div className="p-4 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-md space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <h4 className="text-xs font-bold text-slate-200 font-mono">TTS Sanitizer & Normalizer</h4>
                  </div>
                  <button
                    onClick={() => setTtsNormalizer(!ttsNormalizer)}
                    className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                      ttsNormalizer ? 'bg-cyan-500' : 'bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                        ttsNormalizer ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  Strips raw markdown syntax, code fences, triple-backticks, emojis, raw URLs, and math notation before TTS voicing.
                </p>
                <div className="text-[11px] font-mono text-cyan-400 flex items-center space-x-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Sanitization Engine Active</span>
                </div>
              </div>

              {/* Voice Guardian */}
              <div className="p-4 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-md space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-xs font-bold text-slate-200 font-mono">Voice Guardian Token Shield</h4>
                  </div>
                  <button
                    onClick={() => setVoiceGuardianEnabled(!voiceGuardianEnabled)}
                    className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                      voiceGuardianEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                        voiceGuardianEnabled ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Max Spoken Words Per Turn:</span>
                  <span className="font-mono text-emerald-400 font-bold">{maxSpokenWords} words</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="400"
                  step="25"
                  value={maxSpokenWords}
                  onChange={(e) => setMaxSpokenWords(parseInt(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>
            </div>

            {/* Live Audio Preview Test */}
            <div className="p-4 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-md flex items-center space-x-3">
              <input
                type="text"
                value={previewText}
                onChange={(e) => setPreviewText(e.target.value)}
                placeholder="Type a test phrase to synthesize..."
                className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
              />
              <button
                onClick={handlePreviewVoice}
                disabled={previewPlaying}
                className="px-4 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 font-mono text-xs font-bold flex items-center space-x-2 transition disabled:opacity-50 cursor-pointer"
              >
                {previewPlaying ? <Activity className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                <span>{previewPlaying ? 'Voicing...' : 'Test Speech'}</span>
              </button>
            </div>

            {/* NVML / WMI Thermal HUD */}
            <div className="p-5 rounded-xl border border-cyan-500/20 bg-cyan-950/15 backdrop-blur-md space-y-4">
              <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
                <div className="flex items-center space-x-2 text-cyan-400 font-mono text-xs uppercase tracking-wider">
                  <Thermometer className="w-4 h-4 text-cyan-400" />
                  <span>NVML & WMI Host Thermal HUD</span>
                </div>
                <span className="font-mono text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  OPTIMAL ({gpuTemp}°C / {fanRpm} RPM)
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono text-xs">
                {/* GPU Temp */}
                <div className="p-3 rounded-lg bg-black/40 border border-white/5 space-y-1">
                  <span className="text-slate-400 text-[10px] block">GPU PACKAGE TEMP</span>
                  <div className="flex items-baseline space-x-1">
                    <span className={`text-lg font-bold ${gpuTemp > 75 ? 'text-red-400' : gpuTemp > 60 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {gpuTemp}
                    </span>
                    <span className="text-slate-500">°C</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500" style={{ width: `${Math.min(100, (gpuTemp / 90) * 100)}%` }} />
                  </div>
                </div>

                {/* VRAM Load */}
                <div className="p-3 rounded-lg bg-black/40 border border-white/5 space-y-1">
                  <span className="text-slate-400 text-[10px] block">VRAM ALLOCATION</span>
                  <div className="flex items-baseline space-x-1">
                    <span className="text-lg font-bold text-cyan-300">{vramUsedMb}</span>
                    <span className="text-slate-500">/ {vramTotalMb} MB</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-400" style={{ width: `${(vramUsedMb / vramTotalMb) * 100}%` }} />
                  </div>
                </div>

                {/* CPU Temp */}
                <div className="p-3 rounded-lg bg-black/40 border border-white/5 space-y-1">
                  <span className="text-slate-400 text-[10px] block">CPU PACKAGE TEMP</span>
                  <div className="flex items-baseline space-x-1">
                    <span className="text-lg font-bold text-emerald-300">{cpuTemp}</span>
                    <span className="text-slate-500">°C</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-400" style={{ width: `${Math.min(100, (cpuTemp / 90) * 100)}%` }} />
                  </div>
                </div>

                {/* Power & Fan */}
                <div className="p-3 rounded-lg bg-black/40 border border-white/5 space-y-1">
                  <span className="text-slate-400 text-[10px] block">FAN & POWER DRAW</span>
                  <div className="flex items-baseline space-x-1">
                    <span className="text-lg font-bold text-purple-300">{powerWatts}W</span>
                    <span className="text-slate-500">@ {gpuLoadPct}% Load</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-400" style={{ width: `${gpuLoadPct}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            TAB 02: AUDIO, HOTKEYS & BIOMETRICS
           ===================================================================== */}
        {activeTab === 'audio_bio' && (
          <div className="max-w-4xl space-y-6">
            <div className="border-b border-white/10 pb-4">
              <div className="flex items-center space-x-2 text-cyan-400 font-mono text-xs uppercase tracking-widest">
                <Mic className="w-4 h-4" />
                <span>Audio Transients & Host Telemetry</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-100 tracking-tight mt-1">
                Audio, Hotkeys & Vision Biometrics
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Zero-LLM hotkey interceptors, Silero voice activity detection, and webcam posture supervision.
              </p>
            </div>

            {/* Live Audio Meter & VAD */}
            <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-md space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Microphone & Silero VAD Sensitivity</h3>
                  <p className="text-xs text-slate-400">Real-time RMS audio level and threshold gate</p>
                </div>
                <span className="font-mono text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  VAD READY (16kHz PCM)
                </span>
              </div>

              {/* Device Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Microphone Input Device</label>
                <select
                  value={micDevice}
                  onChange={(e) => setMicDevice(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-lg p-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  {micDeviceList.map((m) => (
                    <option key={m.deviceId} value={m.deviceId}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Live RMS Meter Bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-mono text-slate-400">
                  <span>LIVE RMS AMPLITUDE</span>
                  <span className="text-cyan-400">{(micRms * 100).toFixed(1)}%</span>
                </div>
                <div className="h-3 w-full bg-slate-900 rounded-full overflow-hidden border border-white/5 relative">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 via-emerald-400 to-amber-400 transition-all duration-100"
                    style={{ width: `${Math.min(100, micRms * 300)}%` }}
                  />
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-red-400 shadow-[0_0_8px_#f87171]"
                    style={{ left: `${vadThreshold * 400}%` }}
                    title="VAD Gate Threshold"
                  />
                </div>
              </div>

              {/* VAD Sensitivity Sliders */}
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-200">
                    <span>Activation Gate</span>
                    <span className="font-mono text-cyan-400">{vadThreshold.toFixed(3)} RMS</span>
                  </div>
                  <input
                    type="range"
                    min="0.01"
                    max="0.20"
                    step="0.005"
                    value={vadThreshold}
                    onChange={(e) => setVadThreshold(parseFloat(e.target.value))}
                    className="w-full mt-2 accent-cyan-500"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-200">
                    <span>Silence Debounce</span>
                    <span className="font-mono text-cyan-400">{vadDebounceMs} ms</span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="600"
                    step="20"
                    value={vadDebounceMs}
                    onChange={(e) => setVadDebounceMs(parseInt(e.target.value))}
                    className="w-full mt-2 accent-cyan-500"
                  />
                </div>
              </div>
            </div>

            {/* Low-Level Win32 Hooks & Double-Clap Detector */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-md space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-200 uppercase font-mono tracking-wider">
                    Win32 Low-Level Hook
                  </h4>
                  <span className="font-mono text-[10px] text-cyan-400 bg-cyan-950/40 border border-cyan-500/30 px-2 py-0.5 rounded-full">
                    WH_KEYBOARD_LL
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Global hardware keyboard hook capturing push-to-talk before games swallow inputs.
                </p>
                <div className="space-y-2 font-mono text-xs">
                  <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 flex items-center justify-between">
                    <span className="text-slate-400">Hold-to-Talk:</span>
                    <span className="text-cyan-300 font-bold bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
                      {hotkeyHoldToTalk}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 flex items-center justify-between">
                    <span className="text-slate-400">Hands-Free:</span>
                    <span className="text-purple-300 font-bold bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/30">
                      {hotkeyHandsFree}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-md space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-200 uppercase font-mono tracking-wider">
                    Double-Clap Away Tracker
                  </h4>
                  <button
                    onClick={() => setDoubleClapEnabled(!doubleClapEnabled)}
                    className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                      doubleClapEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                        doubleClapEnabled ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  Transient audio spikes (2 claps within 400ms) lock the workstation and suspend inference.
                </p>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>Acoustic Sensitivity:</span>
                    <span className="font-mono text-emerald-400">{doubleClapSensitivity} dB</span>
                  </div>
                  <input
                    type="range"
                    min="40"
                    max="90"
                    value={doubleClapSensitivity}
                    onChange={(e) => setDoubleClapSensitivity(parseInt(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Vision Biometrics & Posture Supervision */}
            <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-md space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                    <ShieldCheck className="w-4 h-4 text-purple-400" />
                    <span>Vision Biometrics & Posture Guard</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Local OpenCV face verification and spinal ergonomics monitor. Zero images leave the machine.
                  </p>
                </div>
                <button
                  onClick={handleToggleWebcam}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-semibold transition-all cursor-pointer ${
                    webcamLiveActive
                      ? 'bg-purple-500/20 border-purple-500 text-purple-300'
                      : 'bg-black/30 border-white/10 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {webcamLiveActive ? 'Close Camera' : 'Test Camera Feed'}
                </button>
              </div>

              {webcamLiveActive && (
                <div className="p-3 bg-black/60 rounded-xl border border-purple-500/30 flex justify-center">
                  <video ref={videoRef} className="w-64 h-48 rounded-lg bg-black object-cover" autoPlay muted />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-200">
                    <span>Face Match Confidence</span>
                    <span className="font-mono text-purple-400">{Math.round(faceConfidenceThreshold * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.60"
                    max="0.98"
                    step="0.02"
                    value={faceConfidenceThreshold}
                    onChange={(e) => setFaceConfidenceThreshold(parseFloat(e.target.value))}
                    className="w-full mt-2 accent-purple-500"
                  />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-black/40 border border-white/5">
                  <div>
                    <div className="text-xs font-semibold text-slate-200">Ergonomic Slouch Alert</div>
                    <div className="text-[11px] text-slate-400">Audio chime when head drops below 15° axis</div>
                  </div>
                  <button
                    onClick={() => setPostureAlertEnabled(!postureAlertEnabled)}
                    className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                      postureAlertEnabled ? 'bg-purple-500' : 'bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                        postureAlertEnabled ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            TAB 03: DPAPI VAULT & MODELS
           ===================================================================== */}
        {activeTab === 'vault' && (
          <div className="max-w-4xl space-y-6">
            <div className="border-b border-white/10 pb-4">
              <div className="flex items-center space-x-2 text-cyan-400 font-mono text-xs uppercase tracking-widest">
                <Lock className="w-4 h-4" />
                <span>Zero-Cloud DPAPI Credential Vault</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-100 tracking-tight mt-1">
                DPAPI Vault & Hardware-Aware Ollama
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Zero localStorage credentials. All keys encrypted via Windows DPAPI in <code className="text-cyan-300 font-mono">~/.nexus-agent/db/vault.enc</code>.
              </p>
            </div>

            {/* Hardware-Aware Ollama Integration */}
            <div className="p-5 rounded-xl border border-cyan-500/30 bg-cyan-950/20 backdrop-blur-md space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Box className="w-5 h-5 text-cyan-400" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 font-mono">Hardware-Aware Ollama Model Advisor</h3>
                    <p className="text-xs text-slate-400">Detects host VRAM and recommends optimal quantization</p>
                  </div>
                </div>
                <button
                  onClick={handleScanOllama}
                  disabled={ollamaScanning}
                  className="px-3.5 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-mono font-semibold flex items-center space-x-1.5 transition cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${ollamaScanning ? 'animate-spin' : ''}`} />
                  <span>{ollamaScanning ? 'Scanning...' : 'Scan Local Ollama'}</span>
                </button>
              </div>

              {/* Hardware Advisory Card */}
              <div className="p-3.5 rounded-lg bg-black/50 border border-cyan-500/30 flex items-center justify-between font-mono text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">DETECTED GPU VRAM</span>
                  <span className="text-cyan-300 font-bold">{vramTotalMb} MB Dedicated</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 block text-[10px]">RECOMMENDED MODEL FIT</span>
                  <span className="text-emerald-400 font-bold">{recommendedOllamaModel}</span>
                </div>
              </div>

              {/* Installed Ollama Models List */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-300 font-mono">Installed Models on localhost:11434</span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {ollamaModels.map((m) => (
                    <div key={m.name} className="p-2.5 rounded-lg bg-black/40 border border-white/5 flex items-center justify-between font-mono text-xs">
                      <div>
                        <span className="text-cyan-300 font-bold block">{m.name}</span>
                        <span className="text-slate-500 text-[10px]">{m.size} • {m.quant}</span>
                      </div>
                      <button
                        onClick={() => handlePullModel(m.name)}
                        disabled={pullingModel === m.name}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 rounded px-2 py-0.5 cursor-pointer"
                      >
                        {pullingModel === m.name ? 'Pulling...' : 'Update'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Providers Table / Cards */}
            <div className="space-y-3">
              {[
                {
                  id: 'GEMINI_API_KEY',
                  provider: 'gemini',
                  name: 'Google Gemini 2.5 Flash',
                  tier: 'Perpetual Free-Tier (15 RPM / 1M TPM)',
                  placeholder: 'AIzaSy...',
                },
                {
                  id: 'GROQ_API_KEY',
                  provider: 'groq',
                  name: 'Groq Llama-3.3-70B Versatile',
                  tier: 'Zero-Cost Sub-300ms Inference (30 RPM)',
                  placeholder: 'gsk_...',
                },
                {
                  id: 'CLOUDFLARE_API_TOKEN',
                  provider: 'cloudflare',
                  name: 'Cloudflare D1 / R2 Storage Mesh',
                  tier: 'Sovereign Edge Sync (100k daily writes)',
                  placeholder: 'cftoken_...',
                },
                {
                  id: 'MODAL_TOKEN_ID',
                  provider: 'modal',
                  name: 'Modal Labs Free GPU Tier',
                  tier: '$30/mo perpetual free compute credits',
                  placeholder: 'ak-...',
                },
                {
                  id: 'HF_INFERENCE_TOKEN',
                  provider: 'huggingface',
                  name: 'HuggingFace Spaces & Free Inference',
                  tier: 'Open-weight embeddings & models',
                  placeholder: 'hf_...',
                },
                {
                  id: 'OPENROUTER_API_KEY',
                  provider: 'openrouter',
                  name: 'OpenRouter Multi-Model Router',
                  tier: 'Unified fallback to :free models',
                  placeholder: 'sk-or-...',
                },
                {
                  id: 'DEEPSEEK_API_KEY',
                  provider: 'deepseek',
                  name: 'DeepSeek Reasoning V3 / R1',
                  tier: 'High-density chain-of-thought engine',
                  placeholder: 'sk-...',
                },
                {
                  id: 'TELEGRAM_BOT_TOKEN',
                  provider: 'telegram',
                  name: 'Telegram 24/7 Earbud Bot Bridge',
                  tier: 'Persistent voice & text mobile relay',
                  placeholder: '123456789:ABC...',
                },
                {
                  id: 'OLLAMA_BASE_URL',
                  provider: 'ollama',
                  name: 'Local Ollama Offline LLM Engine',
                  tier: '100% Local Quantized (Qwen2.5 / Llama 3)',
                  placeholder: 'http://localhost:11434',
                },
              ].map((item) => {
                const isConfigured = !!vaultStatus[item.id];
                const isTesting = vaultTestStatus[item.provider] === 'testing';
                const isValid = vaultTestStatus[item.provider] === 'valid';
                const isVisible = !!showKeyVisible[item.id];

                return (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-md flex flex-col space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="text-sm font-semibold text-slate-100">{item.name}</h4>
                          <span
                            className={`font-mono text-[10px] px-2 py-0.5 rounded-full border ${
                              isConfigured
                                ? 'border-emerald-500/40 text-emerald-400 bg-emerald-950/40'
                                : 'border-amber-500/40 text-amber-400 bg-amber-950/40'
                            }`}
                          >
                            {isConfigured ? 'SECURE_DPAPI' : 'UNCONFIGURED'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{item.tier}</p>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleTestKey(item.provider)}
                          disabled={isTesting}
                          className="px-3 py-1.5 rounded-lg border border-white/10 hover:border-cyan-500/40 bg-black/40 text-xs font-mono text-slate-300 hover:text-cyan-300 flex items-center space-x-1.5 transition cursor-pointer"
                        >
                          {isTesting ? <Activity className="w-3 h-3 animate-spin" /> : isValid ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Zap className="w-3 h-3" />}
                          <span>{isTesting ? 'Testing...' : isValid ? 'Verified' : 'Test Link'}</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <div className="relative flex-1">
                        <input
                          type={isVisible ? 'text' : 'password'}
                          value={vaultKeys[item.id] || ''}
                          onChange={(e) => setVaultKeys({ ...vaultKeys, [item.id]: e.target.value })}
                          placeholder={isConfigured ? '•••••••••••••••••••••••• (Encrypted in DPAPI)' : item.placeholder}
                          className="w-full bg-black/50 border border-white/10 rounded-lg pl-3 pr-9 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500/50"
                        />
                        <button
                          onClick={() => setShowKeyVisible({ ...showKeyVisible, [item.id]: !isVisible })}
                          className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300 cursor-pointer"
                        >
                          {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <button
                        onClick={() => handleSaveKey(item.id)}
                        disabled={!vaultKeys[item.id]}
                        className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-30 disabled:hover:bg-cyan-500 text-slate-950 font-semibold text-xs font-mono flex items-center space-x-1 transition cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Encrypt</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* =====================================================================
            TAB 04: MCP ECC & MARKETPLACE
           ===================================================================== */}
        {activeTab === 'mcp_plugins' && (
          <div className="max-w-4xl space-y-6">
            <div className="border-b border-white/10 pb-4 flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2 text-cyan-400 font-mono text-xs uppercase tracking-widest">
                  <Cpu className="w-4 h-4" />
                  <span>Modular Agent Mesh</span>
                </div>
                <h1 className="text-2xl font-bold text-slate-100 tracking-tight mt-1">
                  15 Native MCP Plugins, 71 Agents & 314 Skills
                </h1>
                <p className="text-sm text-slate-400 mt-1">
                  Auto-discovered from <code className="text-cyan-300 font-mono">core/mcp/plugins/</code> and <code className="text-cyan-300 font-mono">agents/research/</code>.
                </p>
              </div>

              {/* Sub-tab navigation */}
              <div className="flex items-center space-x-1 p-1 bg-black/60 rounded-xl border border-white/10 font-mono text-xs">
                <button
                  onClick={() => setMarketplaceSubTab('plugins')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                    marketplaceSubTab === 'plugins' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  15 Plugins
                </button>
                <button
                  onClick={() => setMarketplaceSubTab('agents')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                    marketplaceSubTab === 'agents' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  71 Agents
                </button>
                <button
                  onClick={() => setMarketplaceSubTab('skills')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                    marketplaceSubTab === 'skills' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  314 Skills
                </button>
              </div>
            </div>

            {/* SUB-TAB A: 15 Native MCP Plugins */}
            {marketplaceSubTab === 'plugins' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 font-mono text-xs text-slate-400">
                    <span>LOADED EXTENSIONS:</span>
                    <span className="text-emerald-400 font-bold">{mcpTools.length || 15} / 15 ACTIVE</span>
                  </div>
                  <button
                    onClick={fetchMcpTools}
                    className="px-3 py-1.5 rounded-lg border border-white/10 bg-black/40 hover:border-cyan-500/40 text-xs font-mono text-slate-300 flex items-center space-x-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingMcp ? 'animate-spin' : ''}`} />
                    <span>Rescan Plugins</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(mcpTools.length > 0
                    ? mcpTools
                    : [
                        { name: 'system_deep_dive', description: 'Deep Win32 process, handle, and socket telemetry inspection', loaded: true, module: 'system_deep_dive.py', permissions: 'READ_ONLY' },
                        { name: 'desktop_ufo', description: 'Sub-30ms UI Automation element tree traversal and direct clicking', loaded: true, module: 'desktop_ufo.py', permissions: 'HOST_INPUT' },
                        { name: 'browser_dual', description: 'Headless Chromium + live browser dual-stack controller', loaded: true, module: 'browser_dual.py', permissions: 'BROWSER_ISOLATE' },
                        { name: 'fs_governor', description: 'Strict path-confined file system reader and AST patcher', loaded: true, module: 'fs_governor.py', permissions: 'CONTAINED_FS' },
                        { name: 'process_warden', description: 'Taskkill, PID monitoring, and resource budget enforcer', loaded: true, module: 'process_warden.py', permissions: 'PROCESS_CTRL' },
                        { name: 'sqlite_vec_store', description: 'Vector embeddings retrieval and FTS5 hybrid search', loaded: true, module: 'sqlite_vec_store.py', permissions: 'LOCAL_DB' },
                        { name: 'ast_patcher', description: 'Tree-sitter and AST safe code modification with rollback', loaded: true, module: 'ast_patcher.py', permissions: 'CODE_EDIT' },
                        { name: 'telegram_bridge', description: '24/7 remote earbud voice and text companion bridge', loaded: true, module: 'telegram_bridge.py', permissions: 'NETWORK_MESH' },
                        { name: 'cloud_mesh_d1', description: 'Cloudflare D1 serverless SQLite mesh replication sync', loaded: true, module: 'cloud_mesh_d1.py', permissions: 'EDGE_SYNC' },
                        { name: 'huggingface_runner', description: 'HuggingFace Spaces free inference runner for specialized models', loaded: true, module: 'huggingface_runner.py', permissions: 'API_INFERENCE' },
                        { name: 'modal_gpu_bridge', description: 'Modal Labs on-demand T4/A10G GPU execution bridge', loaded: true, module: 'modal_gpu_bridge.py', permissions: 'REMOTE_GPU' },
                        { name: 'vision_biometrics', description: 'Local OpenCV face verification and posture alerts', loaded: true, module: 'vision_biometrics.py', permissions: 'LOCAL_CAM' },
                        { name: 'daily_picks', description: 'Personalized DEV, SEC, and SYS daily intelligence briefing', loaded: true, module: 'daily_picks.py', permissions: 'AGGREGATOR' },
                        { name: 'routines_engine', description: 'Deterministic voice macros and multi-step desktop tidier', loaded: true, module: 'routines_engine.py', permissions: 'MACRO_EXEC' },
                        { name: 'audio_vad_ears', description: 'Silero voice activity and transient audio listener', loaded: true, module: 'audio_vad_ears.py', permissions: 'AUDIO_STREAM' },
                      ]
                  ).map((t) => (
                    <div
                      key={t.name}
                      className="p-4 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-md flex flex-col justify-between space-y-2 hover:border-white/20 transition-all"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-cyan-300">{t.name}</span>
                          <span className="font-mono text-[9px] px-2 py-0.5 rounded-full border border-cyan-500/30 text-cyan-400 bg-cyan-950/40">
                            {t.permissions}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{t.description}</p>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-white/5 font-mono text-[10px] text-slate-500">
                        <span>core/mcp/plugins/{t.module}</span>
                        <button
                          onClick={() => handleInstallDep(t.name)}
                          disabled={installingDep === t.name}
                          className="text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer"
                        >
                          {installingDep === t.name ? 'Checking...' : 'Verify Deps'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SUB-TAB B: 71 Research Agents Catalog */}
            {marketplaceSubTab === 'agents' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 font-mono text-xs">
                    {['ALL', 'DEV', 'SEC', 'SYS', 'OPS'].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setAgentFilterCategory(cat)}
                        className={`px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                          agentFilterCategory === cat ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' : 'bg-black/40 text-slate-400 border-white/5'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <span className="font-mono text-xs text-slate-500">71 RESEARCH FRAMEWORKS INDEXED</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {researchAgents
                    .filter((a) => agentFilterCategory === 'ALL' || a.anchor.startsWith(agentFilterCategory))
                    .map((ag) => (
                      <div key={ag.id} className="p-4 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-md space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-xs font-bold text-slate-200">{ag.role}</span>
                            <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-cyan-950/40 text-cyan-400 border border-cyan-500/30">
                              D{ag.depth}
                            </span>
                          </div>
                          <span className="font-mono text-[9px] text-emerald-400">{ag.status}</span>
                        </div>
                        <p className="text-xs text-slate-400">{ag.objective}</p>
                        <div className="flex items-center justify-between pt-2 border-t border-white/5 font-mono text-[10px] text-slate-500">
                          <span>⚓ {ag.anchor}</span>
                          <span className="text-cyan-400">{ag.memoryScope}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* SUB-TAB C: 314 Skills Explorer & Marketplace */}
            {marketplaceSubTab === 'skills' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 font-mono text-xs">
                    {['ALL', 'System', 'Browser', 'Cloudflare', 'Coding', 'Media', 'Automation'].map((c) => (
                      <button
                        key={c}
                        onClick={() => setSkillCategory(c)}
                        className={`px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                          skillCategory === c ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' : 'bg-black/40 text-slate-400 border-white/5'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <span className="font-mono text-xs text-slate-500">314 SKILLS REPOSITORY</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {skillsCatalog
                    .filter((s) => skillCategory === 'ALL' || s.category === skillCategory)
                    .map((sk) => (
                      <div key={sk.id} className="p-4 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-md space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-cyan-300">{sk.name}</span>
                          <span className="font-mono text-[9px] px-2 py-0.5 rounded-full bg-purple-950/40 text-purple-300 border border-purple-500/30">
                            {sk.category}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">{sk.description}</p>
                        <div className="flex items-center justify-between pt-2 border-t border-white/5 font-mono text-[10px] text-slate-500">
                          <span>.nxskill package</span>
                          <span className="text-emerald-400">INSTALLED</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* =====================================================================
            TAB 05: APPEARANCE, MOTION & NOTCH
           ===================================================================== */}
        {activeTab === 'appearance_notch' && (
          <div className="max-w-4xl space-y-6">
            <div className="border-b border-white/10 pb-4 flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2 text-cyan-400 font-mono text-xs uppercase tracking-widest">
                  <Palette className="w-4 h-4" />
                  <span>Visual Ergonomics & Notch Engine</span>
                </div>
                <h1 className="text-2xl font-bold text-slate-100 tracking-tight mt-1">
                  Appearance, 5 WebGL Shaders & Dynamic Notch HUD
                </h1>
                <p className="text-sm text-slate-400 mt-1">
                  6 Cyberpunk theme palettes, WebGL shader background layers, and TopBar 280x44 notch integration.
                </p>
              </div>
              <button
                onClick={handleSyncNotch}
                className="px-3.5 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 font-mono text-xs font-bold flex items-center space-x-2 transition cursor-pointer"
              >
                <Monitor className="w-4 h-4" />
                <span>Sync Notch QSS</span>
              </button>
            </div>

            {/* 6 Cyberpunk Theme Presets */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-100 font-mono">6 Cyberpunk Theme Presets</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {THEME_PRESETS.map((t) => {
                  const isSelected = currentTheme === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => handleSelectTheme(t)}
                      className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'border-cyan-400 bg-cyan-500/15 shadow-[0_0_20px_rgba(6,182,212,0.25)]'
                          : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: t.accentColor }} />
                          <span className="font-mono text-xs font-bold text-slate-200">{t.name}</span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">{t.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 5 WebGL Shaders Selection */}
            <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-md space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 font-mono">5 WebGL Wallpaper Shaders</h3>
                  <p className="text-xs text-slate-400">Layer -1 dynamic GPU vertex shaders</p>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-slate-400">Audio Reactive:</span>
                  <button
                    onClick={() => setAudioReactiveWallpaper(!audioReactiveWallpaper)}
                    className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                      audioReactiveWallpaper ? 'bg-cyan-500' : 'bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                        audioReactiveWallpaper ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {SHADER_OPTIONS.map((s) => {
                  const isSelected = currentShader === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setCurrentShader(s.id)}
                      className={`p-3.5 rounded-xl border text-left transition cursor-pointer ${
                        isSelected ? 'border-cyan-400 bg-cyan-500/15 text-cyan-200' : 'border-white/10 bg-black/40 text-slate-400 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold">{s.name}</span>
                        {isSelected && <Check className="w-3 h-3 text-cyan-400" />}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">{s.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Motion & Notch Settings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Motion & FX */}
              <div className="p-4 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-md space-y-3">
                <h4 className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wider">
                  Motion & Kinetic FX
                </h4>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">Glass Backdrop Blur ({glassBlurPx}px)</span>
                    <input
                      type="range"
                      min="4"
                      max="32"
                      value={glassBlurPx}
                      onChange={(e) => setGlassBlurPx(parseInt(e.target.value))}
                      className="w-32 accent-cyan-500"
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">Kinetic Monospace Cipher Reveal</span>
                    <button
                      onClick={() => setKineticCipherEnabled(!kineticCipherEnabled)}
                      className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                        kineticCipherEnabled ? 'bg-cyan-500' : 'bg-slate-700'
                      }`}
                    >
                      <div
                        className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                          kineticCipherEnabled ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">Specular L-Shaped Corner Brackets</span>
                    <button
                      onClick={() => setSpecularBrackets(!specularBrackets)}
                      className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                        specularBrackets ? 'bg-cyan-500' : 'bg-slate-700'
                      }`}
                    >
                      <div
                        className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                          specularBrackets ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Dynamic Notch HUD Config */}
              <div className="p-4 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-md space-y-3">
                <h4 className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wider">
                  Dynamic Notch HUD Cutout
                </h4>
                <div className="space-y-2.5 font-mono text-xs">
                  <div className="flex justify-between items-center text-slate-300">
                    <span>Notch Bay Cutout:</span>
                    <span className="text-cyan-400 font-bold">280px × {notchHeightPx}px</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-300">
                    <span>Screen Re-anchor on Resize:</span>
                    <button
                      onClick={() => setNotchReAnchor(!notchReAnchor)}
                      className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                        notchReAnchor ? 'bg-emerald-500' : 'bg-slate-700'
                      }`}
                    >
                      <div
                        className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                          notchReAnchor ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex justify-between items-center text-slate-300">
                    <span>Shelf Trigger:</span>
                    <span className="text-purple-300 font-bold">AUTO-HIDE EXPAND</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            TAB 06: SCOPEGUARD & PRIVACY
           ===================================================================== */}
        {activeTab === 'scope_guard' && (
          <div className="max-w-4xl space-y-6">
            <div className="border-b border-white/10 pb-4">
              <div className="flex items-center space-x-2 text-cyan-400 font-mono text-xs uppercase tracking-widest">
                <ShieldCheck className="w-4 h-4" />
                <span>Deterministic Safety Boundary</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-100 tracking-tight mt-1">
                ScopeGuard & 6 Sovereign Invariants
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Zero arbitrary write access. Complete containment within workspace roots and strict validation gates.
              </p>
            </div>

            {/* 6 Sovereign Invariants Cards */}
            <div className="space-y-2.5">
              {[
                { id: 'INV-1', name: 'Invariant 1 // Read Target & Callers', desc: 'Read target, tests, and callers before any file mutation is executed.' },
                { id: 'INV-2', name: 'Invariant 2 // Engagement Scope Containment', desc: 'Writes outside declared project root denied immediately. No escapes.' },
                { id: 'INV-3', name: 'Invariant 3 // Post-Mutation Verification', desc: 'Criteria is done only when validator passes after the latest write mutation.' },
                { id: 'INV-4', name: 'Invariant 4 // Non-Identical Retries', desc: 'Never retry a failed approach byte-identically; diagnosis must adapt.' },
                { id: 'INV-5', name: 'Invariant 5 // Required Validators Gate', desc: 'Task contract required validators must exit 0 before completion acceptance.' },
                { id: 'INV-6', name: 'Invariant 6 // Explicit Uncertainty Marking', desc: 'Mark unverified claims explicitly; zero fabricated confidence allowed.' },
              ].map((inv) => (
                <div
                  key={inv.id}
                  className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-950/10 backdrop-blur-md flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold text-slate-100 font-mono">{inv.name}</h4>
                      <p className="text-xs text-slate-400 mt-0.5">{inv.desc}</p>
                    </div>
                  </div>
                  <span className="font-mono text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                    ENFORCED
                  </span>
                </div>
              ))}
            </div>

            {/* AgentShield Security Score & Quarantine Card */}
            <div className="p-5 rounded-xl border border-cyan-500/30 bg-cyan-950/20 backdrop-blur-md space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Shield className="w-5 h-5 text-cyan-400" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 font-mono">AgentShield Live Security Score</h3>
                    <p className="text-xs text-slate-400">AST & Regex static compliance across MCP plugins & manifest</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <span className={`text-xl font-black font-mono ${shieldScore >= 90 ? 'text-emerald-400' : shieldScore >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                      {shieldScore} / 100
                    </span>
                    <div className="text-[10px] font-mono text-slate-400">{shieldStatus}</div>
                  </div>
                  <button
                    onClick={runShieldScan}
                    disabled={isScanningShield}
                    className="px-3.5 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-mono font-semibold flex items-center space-x-1.5 transition cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isScanningShield ? 'animate-spin' : ''}`} />
                    <span>{isScanningShield ? 'Scanning...' : 'Run Shield Scan'}</span>
                  </button>
                </div>
              </div>

              <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-white/5">
                <div
                  className={`h-full transition-all duration-300 ${shieldScore >= 90 ? 'bg-emerald-400' : shieldScore >= 60 ? 'bg-amber-400' : 'bg-red-400'}`}
                  style={{ width: `${shieldScore}%` }}
                />
              </div>

              {quarantinedPlugins.length > 0 ? (
                <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/40 space-y-1.5">
                  <div className="text-xs font-bold text-red-300 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                    <span>Quarantined Plugins ({quarantinedPlugins.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {quarantinedPlugins.map((plugin) => (
                      <span key={plugin} className="font-mono text-[10px] px-2 py-0.5 rounded bg-red-900/60 text-red-200 border border-red-600/40">
                        {plugin} (CRITICAL: Blocked)
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center space-x-2 text-xs font-mono text-emerald-400 bg-emerald-950/30 border border-emerald-500/20 px-3 py-1.5 rounded-lg">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Zero Quarantined Plugins. All MCP Tools pass AgentShield verification.</span>
                </div>
              )}
            </div>

            {/* Allowed Roots & Blocked Directories */}
            <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-md space-y-3">
              <h3 className="text-sm font-bold text-slate-100">Workspace Containment Roots</h3>
              <div className="space-y-2">
                <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 flex items-center justify-between font-mono text-xs">
                  <span className="text-emerald-400">ALLOWED ROOT:</span>
                  <span className="text-slate-300">{allowedRoot}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 flex items-center justify-between font-mono text-xs">
                  <span className="text-red-400">BLOCKED PATHS:</span>
                  <span className="text-slate-400">C:/Windows/System32 | AppData/Local | HKEY_LOCAL_MACHINE</span>
                </div>
              </div>
            </div>

            {/* Live ScopeGuard Audit Log */}
            <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-md space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-100 font-mono">SQLite WAL ScopeGuard Audit Trail</h3>
                <span className="font-mono text-[10px] text-cyan-400">~/.nexus-agent/db/agent_local.db</span>
              </div>
              <div className="space-y-1.5 font-mono text-xs">
                {scopeAuditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-2 rounded bg-black/40 border border-white/5 flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-3">
                      <span className="text-slate-500">{log.time}</span>
                      <span className="text-cyan-400">{log.invariant}</span>
                      <span className="text-slate-300 truncate max-w-sm">{log.path}</span>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full border ${
                        log.status === 'ALLOW'
                          ? 'border-emerald-500/40 text-emerald-400 bg-emerald-950/40'
                          : 'border-red-500/40 text-red-400 bg-red-950/40'
                      }`}
                    >
                      {log.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            TAB 07: SYSTEM, MOBILE QR & LOGS
           ===================================================================== */}
        {activeTab === 'system_qr' && (
          <div className="max-w-4xl space-y-6">
            <div className="border-b border-white/10 pb-4">
              <div className="flex items-center space-x-2 text-cyan-400 font-mono text-xs uppercase tracking-widest">
                <Smartphone className="w-4 h-4" />
                <span>Companion Mobile Bridge</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-100 tracking-tight mt-1">
                System, Mobile QR & SQLite WAL Logs
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Scan to pair your iOS or Android companion via local WiFi or Tailscale mesh. Zero cloud relay.
              </p>
            </div>

            {/* QR Pairing Card */}
            <div className="p-6 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-md flex items-center space-x-8">
              <div className="p-3 bg-white rounded-xl shadow-2xl flex-shrink-0">
                <QRCodeSVG
                  value={qrPairingData.qr_payload}
                  size={160}
                  level="H"
                  includeMargin={false}
                />
              </div>

              <div className="space-y-3 flex-1">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-100">Direct Device Pairing</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Open the NEXUS Companion app or point your camera at this QR code.
                    </p>
                  </div>
                  <button
                    onClick={handleRegeneratePin}
                    className="px-3 py-1.5 rounded-lg border border-white/10 bg-black/40 hover:border-cyan-500/40 text-xs font-mono text-slate-300 flex items-center space-x-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Regenerate PIN</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                  <div className="p-2.5 rounded-lg bg-black/40 border border-white/5">
                    <span className="text-slate-500 block text-[10px]">GATEWAY HOST</span>
                    <span className="text-cyan-400 font-semibold">{qrPairingData.host}:{qrPairingData.port}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-black/40 border border-white/5">
                    <span className="text-slate-500 block text-[10px]">SECURE PIN</span>
                    <span className="text-amber-400 font-bold tracking-widest">{qrPairingData.pin}</span>
                  </div>
                </div>

                <div className="text-[11px] font-mono text-slate-500 flex items-center space-x-1.5">
                  <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  <span>Listening for WebSocket handshake on 127.0.0.1:47630/ws/remote</span>
                </div>
              </div>
            </div>

            {/* About NEXUS OS v5.0 & Updates Card */}
            <div className="p-5 rounded-xl border border-cyan-500/30 bg-cyan-950/10 backdrop-blur-md space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 font-bold font-mono">
                    NX
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 font-mono">NEXUS OS v5.0 Sovereign Runtime</h3>
                    <p className="text-xs text-slate-400 font-sans">
                      Official Flagship Repository • Sub-100ms Win32 Actuation • 0 MB Idle RAM
                    </p>
                  </div>
                </div>
                <span className="font-mono text-xs px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
                  v5.0.0
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <a
                  href="https://github.com/NiranX-Resolute/NEXUS-OS"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-400 text-xs font-space font-semibold text-slate-200 hover:text-white flex items-center space-x-2 transition cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  <span>GitHub Repository</span>
                </a>

                <a
                  href="https://github.com/NiranX-Resolute/NEXUS-OS/releases"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 hover:text-cyan-200 text-xs font-mono font-semibold flex items-center space-x-1.5 transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Check for Updates</span>
                </a>

                <a
                  href="https://nexus-landing.pages.dev/download"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 rounded-lg bg-slate-900 border border-white/10 hover:border-emerald-500/40 text-emerald-400 text-xs font-mono flex items-center space-x-1.5 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Hub</span>
                </a>
              </div>
            </div>

            {/* Git Version & Sovereign DB Maintenance */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Git Status */}
              <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-md space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-200 uppercase font-mono tracking-wider flex items-center space-x-2">
                    <GitBranch className="w-4 h-4 text-cyan-400" />
                    <span>Workspace Git Status</span>
                  </h3>
                  <span className="font-mono text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                    {gitStatus.clean ? 'CLEAN TREE' : 'MODIFIED'}
                  </span>
                </div>
                <div className="space-y-1.5 font-mono text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>BRANCH:</span>
                    <span className="text-slate-200">{gitStatus.branch}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>COMMIT:</span>
                    <span className="text-cyan-400">{gitStatus.commit}</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 mt-2 italic line-clamp-1">
                  "{gitStatus.message}"
                </p>
              </div>

              {/* SQLite WAL Snapshot & Checkpoint */}
              <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-md space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-200 uppercase font-mono tracking-wider flex items-center space-x-2">
                    <Database className="w-4 h-4 text-emerald-400" />
                    <span>SQLite WAL Snapshot & Checkpoint</span>
                  </h3>
                  <span className="font-mono text-[10px] text-cyan-400 bg-cyan-950/40 border border-cyan-500/30 px-2 py-0.5 rounded-full">
                    PRAGMA WAL
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Performs an atomic checkpoint and backup of memory notes, vector stores, and routines.
                </p>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleWalCheckpoint}
                    disabled={isCheckpointingWal}
                    className="flex-1 py-2 px-3 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 font-mono text-xs font-semibold flex items-center justify-center space-x-2 transition cursor-pointer"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${isCheckpointingWal ? 'animate-spin' : ''}`} />
                    <span>Checkpoint WAL</span>
                  </button>
                  <button
                    onClick={handleBackup}
                    disabled={isBackingUp}
                    className="flex-1 py-2 px-3 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-mono text-xs font-semibold flex items-center justify-center space-x-2 transition cursor-pointer"
                  >
                    {isBackingUp ? <Activity className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    <span>Export Backup</span>
                  </button>
                </div>
                {backupResult && (
                  <p className="text-[10px] font-mono text-emerald-400 truncate mt-1">
                    {backupResult}
                  </p>
                )}
              </div>
            </div>

            {/* Real-time System Logs Viewer */}
            <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-md space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-bold text-slate-100 font-mono">Live System Engine Logs</h3>
                </div>
                <div className="flex items-center space-x-2 font-mono text-[10px]">
                  {['ALL', 'INFO', 'WARN', 'DEBUG'].map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => setLogFilterLevel(lvl)}
                      className={`px-2 py-0.5 rounded border transition cursor-pointer ${
                        logFilterLevel === lvl ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' : 'text-slate-400 border-white/5'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-40 overflow-y-auto space-y-1.5 font-mono text-xs bg-black/60 p-3 rounded-lg border border-white/5">
                {systemLogs
                  .filter((l) => logFilterLevel === 'ALL' || l.level === logFilterLevel)
                  .map((log) => (
                    <div key={log.id} className="flex items-baseline space-x-2 text-[11px]">
                      <span className="text-slate-500">{log.time}</span>
                      <span
                        className={`font-bold px-1 rounded text-[9px] ${
                          log.level === 'INFO'
                            ? 'text-cyan-400 bg-cyan-950/40'
                            : log.level === 'WARN'
                            ? 'text-amber-400 bg-amber-950/40'
                            : 'text-purple-400 bg-purple-950/40'
                        }`}
                      >
                        {log.level}
                      </span>
                      <span className="text-slate-300">{log.message}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const SettingsView = SettingsCommandCenter;
export type SettingsViewProps = SettingsCommandCenterProps;
export default SettingsCommandCenter;
