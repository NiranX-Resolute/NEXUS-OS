import { h as createLucideIcon, b4 as useAuthStore, b5 as hasSupabaseConfig, b6 as configureCloudSupabase, b7 as getNexusRoleForEmail, b8 as getNexusSystemStats, b9 as useNavigate, r as reactExports, j as jsxRuntimeExports, ba as Mail, bb as Lock, bc as CircleAlert, bd as CircleCheck, be as ShieldCheck, bf as Activity, bg as Cpu, bh as Archive, bi as KeyRound, bj as Upload, bk as FileText, bl as NEXUS_ADMIN_EMAIL, bm as exportNexusBackup, bn as signOutCloudSession, bo as clearDesktopAuthArtifacts, bp as importNexusBackup } from "./index-CYaMQ3cR.js";
import { S as Sparkles } from "./sparkles-BxKpA34O.js";
const __iconNode$a = [
  ["path", { d: "M12 18V5", key: "adv99a" }],
  ["path", { d: "M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4", key: "1e3is1" }],
  ["path", { d: "M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5", key: "1gqd8o" }],
  ["path", { d: "M17.997 5.125a4 4 0 0 1 2.526 5.77", key: "iwvgf7" }],
  ["path", { d: "M18 18a4 4 0 0 0 2-7.464", key: "efp6ie" }],
  ["path", { d: "M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517", key: "1gq6am" }],
  ["path", { d: "M6 18a4 4 0 0 1-2-7.464", key: "k1g0md" }],
  ["path", { d: "M6.003 5.125a4 4 0 0 0-2.526 5.77", key: "q97ue3" }]
];
const Brain = createLucideIcon("brain", __iconNode$a);
const __iconNode$9 = [
  ["path", { d: "M16 14v2.2l1.6 1", key: "fo4ql5" }],
  ["path", { d: "M16 2v4", key: "4m81vk" }],
  ["path", { d: "M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5", key: "1osxxc" }],
  ["path", { d: "M3 10h5", key: "r794hk" }],
  ["path", { d: "M8 2v4", key: "1cmpym" }],
  ["circle", { cx: "16", cy: "16", r: "6", key: "qoo3c4" }]
];
const CalendarClock = createLucideIcon("calendar-clock", __iconNode$9);
const __iconNode$8 = [
  [
    "path",
    {
      d: "M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z",
      key: "1vdc57"
    }
  ],
  ["path", { d: "M5 21h14", key: "11awu3" }]
];
const Crown = createLucideIcon("crown", __iconNode$8);
const __iconNode$7 = [
  ["path", { d: "M12 15V3", key: "m9g1x1" }],
  ["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", key: "ih7n3h" }],
  ["path", { d: "m7 10 5 5 5-5", key: "brsn70" }]
];
const Download = createLucideIcon("download", __iconNode$7);
const __iconNode$6 = [
  ["path", { d: "M10 16h.01", key: "1bzywj" }],
  [
    "path",
    {
      d: "M2.212 11.577a2 2 0 0 0-.212.896V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5.527a2 2 0 0 0-.212-.896L18.55 5.11A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
      key: "18tbho"
    }
  ],
  ["path", { d: "M21.946 12.013H2.054", key: "zqlbp7" }],
  ["path", { d: "M6 16h.01", key: "1pmjb7" }]
];
const HardDrive = createLucideIcon("hard-drive", __iconNode$6);
const __iconNode$5 = [
  ["path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8", key: "v9h5vc" }],
  ["path", { d: "M21 3v5h-5", key: "1q7to0" }],
  ["path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16", key: "3uifl3" }],
  ["path", { d: "M8 16H3v5", key: "1cv678" }]
];
const RefreshCw = createLucideIcon("refresh-cw", __iconNode$5);
const __iconNode$4 = [
  [
    "path",
    {
      d: "M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
      key: "1c8476"
    }
  ],
  ["path", { d: "M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7", key: "1ydtos" }],
  ["path", { d: "M7 3v4a1 1 0 0 0 1 1h7", key: "t51u73" }]
];
const Save = createLucideIcon("save", __iconNode$4);
const __iconNode$3 = [
  [
    "path",
    {
      d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
      key: "oel41y"
    }
  ]
];
const Shield = createLucideIcon("shield", __iconNode$3);
const __iconNode$2 = [
  ["path", { d: "M10 15H6a4 4 0 0 0-4 4v2", key: "1nfge6" }],
  ["path", { d: "m14.305 16.53.923-.382", key: "1itpsq" }],
  ["path", { d: "m15.228 13.852-.923-.383", key: "eplpkm" }],
  ["path", { d: "m16.852 12.228-.383-.923", key: "13v3q0" }],
  ["path", { d: "m16.852 17.772-.383.924", key: "1i8mnm" }],
  ["path", { d: "m19.148 12.228.383-.923", key: "1q8j1v" }],
  ["path", { d: "m19.53 18.696-.382-.924", key: "vk1qj3" }],
  ["path", { d: "m20.772 13.852.924-.383", key: "n880s0" }],
  ["path", { d: "m20.772 16.148.924.383", key: "1g6xey" }],
  ["circle", { cx: "18", cy: "15", r: "3", key: "gjjjvw" }],
  ["circle", { cx: "9", cy: "7", r: "4", key: "nufk8" }]
];
const UserCog = createLucideIcon("user-cog", __iconNode$2);
const __iconNode$1 = [
  ["circle", { cx: "12", cy: "8", r: "5", key: "1hypcn" }],
  ["path", { d: "M20 21a8 8 0 0 0-16 0", key: "rfgkzh" }]
];
const UserRound = createLucideIcon("user-round", __iconNode$1);
const __iconNode = [
  ["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", key: "1yyitq" }],
  ["path", { d: "M16 3.128a4 4 0 0 1 0 7.744", key: "16gr8j" }],
  ["path", { d: "M22 21v-2a4 4 0 0 0-3-3.87", key: "kshegd" }],
  ["circle", { cx: "9", cy: "7", r: "4", key: "nufk8" }]
];
const Users = createLucideIcon("users", __iconNode);
const PROFILE_LOCAL_KEY = "nexus_profile_data";
const VISITS_LOCAL_KEY = "nexus_session_visits_count";
const CLICKS_LOCAL_KEY = "nexus_session_clicks_count";
const getLocalProfile = (fallbackEmail = "operator@nexus.local") => {
  try {
    const raw = localStorage.getItem(PROFILE_LOCAL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        id: parsed.id || "local-operator",
        email: parsed.email || fallbackEmail,
        display_name: parsed.display_name || localStorage.getItem("nexus_user_name") || "Nexus Operator",
        avatar_url: parsed.avatar_url || localStorage.getItem("nexus_operator_avatar") || null,
        bio: parsed.bio || localStorage.getItem("nexus_operator_bio") || "Nexus Neural Workstation Operator",
        role: parsed.role || getNexusRoleForEmail(fallbackEmail) || "user",
        auth_mode: parsed.auth_mode || "local",
        is_cloud_synced: false,
        created_at: parsed.created_at || (/* @__PURE__ */ new Date()).toISOString(),
        updated_at: parsed.updated_at || (/* @__PURE__ */ new Date()).toISOString()
      };
    }
  } catch {
  }
  const name = localStorage.getItem("nexus_user_name") || "Nexus Operator";
  const role = getNexusRoleForEmail(fallbackEmail);
  const defaultProfile = {
    id: "local-operator",
    email: fallbackEmail,
    display_name: name,
    avatar_url: localStorage.getItem("nexus_operator_avatar") || null,
    bio: localStorage.getItem("nexus_operator_bio") || "Nexus Neural Workstation Operator",
    role,
    auth_mode: "local",
    is_cloud_synced: false,
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  try {
    localStorage.setItem(PROFILE_LOCAL_KEY, JSON.stringify(defaultProfile));
  } catch {
  }
  return defaultProfile;
};
const loadCurrentProfile = async () => {
  const authState = useAuthStore.getState();
  const currentEmail = authState.userEmail || localStorage.getItem("nexus_user_email") || "operator@nexus.local";
  const isCloud = authState.authMode === "cloud" && hasSupabaseConfig;
  if (isCloud) {
    const supabase = configureCloudSupabase();
    if (supabase) {
      try {
        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user) {
          const user = authData.user;
          const expectedRole = getNexusRoleForEmail(user.email);
          const { data: profileRow } = await supabase.from("nexus_profiles").select("id,email,display_name,avatar_url,role,created_at,updated_at").eq("id", user.id).maybeSingle();
          if (profileRow) {
            const profile = {
              id: String(profileRow.id),
              email: String(profileRow.email || user.email || ""),
              display_name: String(profileRow.display_name || user.email?.split("@")[0] || "Nexus Operator"),
              avatar_url: profileRow.avatar_url || null,
              bio: localStorage.getItem("nexus_operator_bio") || "Nexus Neural Workstation Operator",
              role: profileRow.role === "admin" ? "admin" : expectedRole,
              auth_mode: "cloud",
              is_cloud_synced: true,
              created_at: String(profileRow.created_at || ""),
              updated_at: String(profileRow.updated_at || "")
            };
            localStorage.setItem(PROFILE_LOCAL_KEY, JSON.stringify(profile));
            return profile;
          }
        }
      } catch (err) {
        console.warn("[ProfileService] Supabase profile fetch failed, using local profile fallback:", err);
      }
    }
  }
  const local = getLocalProfile(currentEmail);
  local.auth_mode = authState.authMode || "app";
  local.is_cloud_synced = false;
  if (authState.userEmail) local.email = authState.userEmail;
  const savedName = localStorage.getItem("nexus_user_name");
  if (savedName) local.display_name = savedName;
  return local;
};
const saveCurrentProfile = async (updates) => {
  const cleanName = updates.displayName.trim();
  if (cleanName.length < 2) {
    throw new Error("Display name must be at least 2 characters.");
  }
  const authState = useAuthStore.getState();
  const isCloud = authState.authMode === "cloud" && hasSupabaseConfig;
  const supabase = configureCloudSupabase();
  localStorage.setItem("nexus_user_name", cleanName);
  if (updates.avatarUrl !== void 0) {
    localStorage.setItem("nexus_operator_avatar", updates.avatarUrl || "");
  }
  if (updates.bio !== void 0) {
    localStorage.setItem("nexus_operator_bio", updates.bio || "");
  }
  const electron = window.electron?.ipcRenderer;
  if (electron && authState.userEmail) {
    try {
      await electron.invoke("email-auth:update-profile", {
        email: authState.userEmail,
        name: cleanName
      });
    } catch {
    }
  }
  if (isCloud && supabase) {
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user) {
        await supabase.from("nexus_profiles").upsert({
          id: authData.user.id,
          email: authData.user.email,
          display_name: cleanName,
          avatar_url: updates.avatarUrl || null,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        });
        await supabase.auth.updateUser({
          data: { name: cleanName, full_name: cleanName, avatar_url: updates.avatarUrl || null }
        });
      }
    } catch (e) {
      console.warn("[ProfileService] Supabase update warning:", e);
    }
  }
  const current = getLocalProfile(authState.userEmail || "operator@nexus.local");
  current.display_name = cleanName;
  current.avatar_url = updates.avatarUrl || null;
  if (updates.bio !== void 0) current.bio = updates.bio;
  if (updates.role) current.role = updates.role;
  current.updated_at = (/* @__PURE__ */ new Date()).toISOString();
  localStorage.setItem(PROFILE_LOCAL_KEY, JSON.stringify(current));
  return current;
};
const updateCurrentPassword = async (newPassword, currentPassword) => {
  if (newPassword.length < 8) {
    throw new Error("New password must be at least 8 characters.");
  }
  const authState = useAuthStore.getState();
  const isCloud = authState.authMode === "cloud" && hasSupabaseConfig;
  const supabase = configureCloudSupabase();
  if (isCloud && supabase) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    return;
  }
  const electron = window.electron?.ipcRenderer;
  if (electron && authState.userEmail) {
    const res = await electron.invoke("email-auth:update-password", {
      email: authState.userEmail,
      newPassword,
      currentPassword
    });
    if (!res?.ok) {
      throw new Error(res?.error || "Failed to update local password.");
    }
    return;
  }
  throw new Error("Password change is unavailable without an active user session.");
};
const loadProfileMetrics = async (profile) => {
  let systemStats = {
    notesCount: 0,
    memoriesCount: 0,
    workflowsCount: 0,
    hasVault: false,
    hasPin: false,
    faceCount: 0
  };
  try {
    systemStats = await getNexusSystemStats();
  } catch {
  }
  const keysList = [
    "nexus_custom_api_key",
    "nexus_puter_token",
    "nexus_groq_api_key",
    "nexus_hf_api_key",
    "nexus_tailvy_api_key",
    "nexus_nvidia_api_key",
    "nexus_fireworks_api_key"
  ];
  const configuredKeysCount = keysList.filter((k) => {
    const v = localStorage.getItem(k);
    return Boolean(v && v.trim().length > 0);
  }).length;
  const activeAiModel = localStorage.getItem("nexus_default_ai_model") || localStorage.getItem("nexus_ai_chat_model") || "Gemini 2.5 Flash Live";
  const voiceProfile = localStorage.getItem("nexus_voice_profile") || "MALE";
  const lastBackupDate = localStorage.getItem("nexus_last_backup_date");
  const totalVisits = Number(localStorage.getItem(VISITS_LOCAL_KEY) || "1");
  const totalButtonClicks = Number(localStorage.getItem(CLICKS_LOCAL_KEY) || "0");
  return {
    totalRegisteredUsers: 1,
    totalVisits,
    totalButtonClicks,
    totalNotes: systemStats.notesCount,
    totalMemories: systemStats.memoriesCount,
    totalWorkflows: systemStats.workflowsCount,
    configuredKeysCount,
    activeAiModel,
    voiceProfile,
    vaultPinConfigured: systemStats.hasPin,
    vaultFaceCount: systemStats.faceCount,
    lastBackupDate,
    topButtons: [
      { label: "Agent Voice Link", count: 12, lastClickedAt: (/* @__PURE__ */ new Date()).toISOString(), page: "Dashboard" },
      { label: "Neural Macros", count: 8, lastClickedAt: (/* @__PURE__ */ new Date()).toISOString(), page: "Macros" },
      { label: "Autonomous Agent", count: 5, lastClickedAt: (/* @__PURE__ */ new Date()).toISOString(), page: "Agentic" }
    ],
    profiles: [profile]
  };
};
const statCardClass = "relative overflow-hidden rounded-xl border border-white/10 bg-zinc-950/70 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.32)] backdrop-blur-xl transition hover:border-emerald-300/30";
const panelClass = "rounded-2xl border border-white/10 bg-zinc-950/70 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.34)] backdrop-blur-xl";
const inputClass = "h-11 w-full rounded-lg border border-white/10 bg-black/60 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-300/60 focus:bg-emerald-950/10 placeholder:text-zinc-600";
const formatDate = (value) => {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
};
const AVATAR_PRESETS = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=160&q=80",
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=160&q=80",
  "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=160&q=80",
  "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=160&q=80",
  "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=160&q=80"
];
const ProfileView = () => {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const [profile, setProfile] = reactExports.useState(null);
  const [metrics, setMetrics] = reactExports.useState(null);
  const [displayName, setDisplayName] = reactExports.useState("");
  const [avatarUrl, setAvatarUrl] = reactExports.useState("");
  const [bio, setBio] = reactExports.useState("");
  const [currentPassword, setCurrentPassword] = reactExports.useState("");
  const [newPassword, setNewPassword] = reactExports.useState("");
  const [confirmPassword, setConfirmPassword] = reactExports.useState("");
  const [isLoading, setIsLoading] = reactExports.useState(true);
  const [isSavingProfile, setIsSavingProfile] = reactExports.useState(false);
  const [isSavingPassword, setIsSavingPassword] = reactExports.useState(false);
  const [isExportingBackup, setIsExportingBackup] = reactExports.useState(false);
  const [isImportingBackup, setIsImportingBackup] = reactExports.useState(false);
  const [backupNotice, setBackupNotice] = reactExports.useState(null);
  const [error, setError] = reactExports.useState("");
  const [notice, setNotice] = reactExports.useState("");
  const fileInputRef = reactExports.useRef(null);
  const isAdmin = profile?.role === "admin";
  const isCloudSynced = Boolean(profile?.is_cloud_synced);
  const refreshProfile = async () => {
    setError("");
    setNotice("");
    setIsLoading(true);
    try {
      const currentProfile = await loadCurrentProfile();
      setProfile(currentProfile);
      setDisplayName(currentProfile.display_name);
      setAvatarUrl(currentProfile.avatar_url || "");
      setBio(currentProfile.bio || "Nexus Neural Workstation Operator");
      setMetrics(await loadProfileMetrics(currentProfile));
    } catch (err) {
      console.warn("[ProfileView] Profile refresh warning:", err);
      setError(err.message || "Unable to load profile data.");
    } finally {
      setIsLoading(false);
    }
  };
  reactExports.useEffect(() => {
    void refreshProfile();
    const handleBackupRestored = () => {
      void refreshProfile();
    };
    window.addEventListener("nexus-backup-restored", handleBackupRestored);
    return () => window.removeEventListener("nexus-backup-restored", handleBackupRestored);
  }, []);
  const handleSaveProfile = async (event) => {
    event.preventDefault();
    setIsSavingProfile(true);
    setError("");
    setNotice("");
    try {
      const nextProfile = await saveCurrentProfile({
        displayName,
        avatarUrl,
        bio
      });
      setProfile(nextProfile);
      setMetrics(await loadProfileMetrics(nextProfile));
      setNotice("Operator dossier saved successfully.");
    } catch (err) {
      setError(err.message || "Unable to save profile.");
    } finally {
      setIsSavingProfile(false);
    }
  };
  const handlePasswordUpdate = async (event) => {
    event.preventDefault();
    setIsSavingPassword(true);
    setError("");
    setNotice("");
    try {
      if (newPassword !== confirmPassword) throw new Error("Passwords do not match.");
      if (newPassword.length < 8) throw new Error("Password must be at least 8 characters.");
      await updateCurrentPassword(newPassword, currentPassword || void 0);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice("Security password updated successfully.");
    } catch (err) {
      setError(err.message || "Unable to update password.");
    } finally {
      setIsSavingPassword(false);
    }
  };
  const handleExportBackup = async () => {
    setIsExportingBackup(true);
    setBackupNotice(null);
    try {
      const res = await exportNexusBackup({ promptFileSave: true });
      if (res.canceled) return;
      if (!res.success) {
        throw new Error(res.error || "Backup export failed.");
      }
      setBackupNotice({
        type: "success",
        message: `Nexus Backup exported successfully! (${res.filename || "nexus-backup.zip"})`
      });
      void refreshProfile();
    } catch (err) {
      setBackupNotice({
        type: "error",
        message: err.message || "Failed to export backup archive."
      });
    } finally {
      setIsExportingBackup(false);
    }
  };
  const handleImportFile = async (file) => {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setBackupNotice({
        type: "error",
        message: "Please provide a valid Nexus backup (.zip) archive."
      });
      return;
    }
    setIsImportingBackup(true);
    setBackupNotice(null);
    try {
      const res = await importNexusBackup(file);
      if (!res.success) {
        throw new Error(res.error || "Failed to extract and restore backup.");
      }
      setBackupNotice({
        type: "success",
        message: `Backup archive restored! Restored ${res.stats?.notesCount ?? 0} notes, ${res.stats?.memoriesCount ?? 0} memories, and settings.`
      });
      await refreshProfile();
    } catch (err) {
      setBackupNotice({
        type: "error",
        message: err.message || "Backup restoration failed."
      });
    } finally {
      setIsImportingBackup(false);
    }
  };
  const handleNativeImportDialog = async () => {
    setIsImportingBackup(true);
    setBackupNotice(null);
    try {
      const res = await importNexusBackup(void 0, { useDialog: true });
      if (res.canceled) return;
      if (!res.success) {
        throw new Error(res.error || "Failed to import backup.");
      }
      setBackupNotice({
        type: "success",
        message: `Nexus backup restored successfully! (${res.stats?.notesCount ?? 0} notes, ${res.stats?.memoriesCount ?? 0} memories restored)`
      });
      await refreshProfile();
    } catch (err) {
      setBackupNotice({
        type: "error",
        message: err.message || "Restoration failed."
      });
    } finally {
      setIsImportingBackup(false);
    }
  };
  const handleLogout = async () => {
    setError("");
    try {
      await signOutCloudSession();
    } finally {
      clearDesktopAuthArtifacts();
      logout();
      navigate("/login", { replace: true });
    }
  };
  if (isLoading) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col items-center justify-center bg-black gap-3 text-xs font-mono uppercase tracking-[0.25em] text-emerald-400", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-8 w-8 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Synchronizing Neural Dossier..." })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-full overflow-y-auto bg-black p-5 pb-36 text-zinc-100 scrollbar-small lg:p-8 lg:pb-36", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto flex max-w-7xl flex-col gap-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-center md:justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 shadow-[0_0_24px_rgba(16,185,129,0.2)]", children: [
          avatarUrl ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            "img",
            {
              src: avatarUrl,
              alt: displayName,
              className: "h-full w-full object-cover",
              onError: () => setAvatarUrl("")
            }
          ) : isAdmin ? /* @__PURE__ */ jsxRuntimeExports.jsx(Crown, { size: 30, className: "text-amber-300" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(UserCog, { size: 30 }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-black bg-emerald-400" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-2xl font-black tracking-tight text-white", children: displayName || "Nexus Operator" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "span",
              {
                className: `inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${isAdmin ? "border-amber-400/30 bg-amber-400/10 text-amber-200" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"}`,
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { size: 11 }),
                  " ",
                  isAdmin ? "ADMINISTRATOR" : "OPERATOR"
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "inline-flex items-center gap-1 rounded-md border border-cyan-400/25 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-cyan-200", children: isCloudSynced ? "🟢 CLOUD SYNCED" : "🛡️ LOCAL ENCLAVE" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 flex items-center gap-2 text-xs font-mono text-zinc-400", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Mail, { size: 13, className: "text-emerald-400" }),
            " ",
            profile?.email || "operator@nexus.local"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: handleExportBackup,
            disabled: isExportingBackup,
            className: "inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-400/15 px-4 text-xs font-bold uppercase tracking-widest text-emerald-200 transition hover:bg-emerald-400 hover:text-black disabled:opacity-50",
            title: "Export complete system state, notes, memories, and keys as .zip",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Download, { size: 15 }),
              " ",
              isExportingBackup ? "Exporting..." : "Export Backup (.zip)"
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: refreshProfile,
            className: "inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-xs font-bold uppercase tracking-widest text-zinc-300 transition hover:border-emerald-300/30 hover:text-emerald-100",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { size: 15 }),
              " Refresh"
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: handleLogout,
            className: "inline-flex h-10 items-center gap-2 rounded-lg border border-red-400/20 bg-red-500/10 px-4 text-xs font-bold uppercase tracking-widest text-red-100 transition hover:bg-red-500/20",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Lock, { size: 15 }),
              " Sign Out"
            ]
          }
        )
      ] })
    ] }),
    (error || notice || backupNotice) && /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: `flex items-center gap-3 rounded-xl border px-4 py-3 text-xs font-mono backdrop-blur-xl ${error || backupNotice?.type === "error" ? "border-red-500/40 bg-red-500/10 text-red-200" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"}`,
        children: [
          error || backupNotice?.type === "error" ? /* @__PURE__ */ jsxRuntimeExports.jsx(CircleAlert, { size: 16, className: "shrink-0 text-red-400" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 16, className: "shrink-0 text-emerald-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex-1", children: error || notice || backupNotice?.message }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => {
                setError("");
                setNotice("");
                setBackupNotice(null);
              },
              className: "text-zinc-500 hover:text-white",
              children: "✕"
            }
          )
        ]
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: statCardClass, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between text-zinc-400", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em]", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldCheck, { size: 16, className: "text-emerald-400" }),
            " Security Enclave"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Activity, { size: 14, className: "text-emerald-400/70" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 text-2xl font-black text-white", children: profile?.role === "admin" ? "Administrator" : "Operator" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 text-[11px] font-mono text-emerald-400/80", children: isCloudSynced ? "Synchronized with Supabase" : "Offline Hardware Vault" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: statCardClass, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between text-zinc-400", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em]", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Brain, { size: 16, className: "text-cyan-400" }),
            " Neural Memory Bank"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Activity, { size: 14, className: "text-cyan-400/70" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 text-2xl font-black text-white", children: [
          metrics?.totalMemories ?? 0,
          " ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-normal text-zinc-400", children: "Memories" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-1 text-[11px] font-mono text-zinc-400", children: [
          metrics?.totalNotes ?? 0,
          " Markdown Notes Indexed"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: statCardClass, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between text-zinc-400", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em]", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Cpu, { size: 16, className: "text-purple-400" }),
            " Intelligence Engine"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Sparkles, { size: 14, className: "text-purple-400/70" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 truncate text-xl font-black text-white", children: metrics?.activeAiModel || "Gemini 2.5 Flash" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-1 text-[11px] font-mono text-zinc-400", children: [
          metrics?.configuredKeysCount ?? 0,
          " Active API Provider Keys"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: statCardClass, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between text-zinc-400", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em]", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Archive, { size: 16, className: "text-amber-400" }),
            " Backup Archive"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(HardDrive, { size: 14, className: "text-amber-400/70" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 text-2xl font-black text-white", children: metrics?.lastBackupDate ? "Secure" : "Fresh" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 truncate text-[11px] font-mono text-zinc-400", children: metrics?.lastBackupDate ? formatDate(metrics.lastBackupDate) : "No backup exported yet" })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 gap-6 lg:grid-cols-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSaveProfile, className: `${panelClass} flex flex-col justify-between`, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-5 flex items-center justify-between", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(UserRound, { size: 20, className: "text-emerald-400" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-bold uppercase tracking-widest text-white", children: "Operator Dossier" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-mono uppercase tracking-widest text-zinc-500", children: "Editable" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex flex-col gap-1.5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-bold uppercase tracking-widest text-zinc-400", children: "Operator Codename / Name" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "input",
                {
                  value: displayName,
                  onChange: (e) => setDisplayName(e.target.value),
                  className: inputClass,
                  placeholder: "Nexus Operator"
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1.5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-bold uppercase tracking-widest text-zinc-400", children: "Preset Holographic Avatars" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-2 overflow-x-auto py-1 scrollbar-none", children: AVATAR_PRESETS.map((preset, idx) => /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  onClick: () => setAvatarUrl(preset),
                  className: `relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border transition ${avatarUrl === preset ? "border-emerald-400 ring-2 ring-emerald-400/40" : "border-white/10 opacity-60 hover:opacity-100"}`,
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: preset, alt: "preset", className: "h-full w-full object-cover" })
                },
                idx
              )) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex flex-col gap-1.5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-bold uppercase tracking-widest text-zinc-400", children: "Custom Avatar URL" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "input",
                {
                  value: avatarUrl,
                  onChange: (e) => setAvatarUrl(e.target.value),
                  className: inputClass,
                  placeholder: "https://..."
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex flex-col gap-1.5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-bold uppercase tracking-widest text-zinc-400", children: "Operational Directive / Bio" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "textarea",
                {
                  value: bio,
                  onChange: (e) => setBio(e.target.value),
                  rows: 2,
                  className: "w-full rounded-lg border border-white/10 bg-black/60 p-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-300/60 focus:bg-emerald-950/10 placeholder:text-zinc-600",
                  placeholder: "Primary objective or designation..."
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl border border-white/5 bg-black/40 p-3.5 text-[11px] leading-5 text-zinc-400", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-1.5 flex items-center gap-2 font-mono uppercase tracking-widest text-zinc-500", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(CalendarClock, { size: 13 }),
                " Dossier History"
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Enrolled:" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-zinc-300", children: formatDate(profile?.created_at) })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Last Updated:" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-zinc-300", children: formatDate(profile?.updated_at) })
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "submit",
            disabled: isSavingProfile,
            className: "mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-400/15 text-xs font-bold uppercase tracking-widest text-emerald-200 transition hover:bg-emerald-400 hover:text-black disabled:cursor-not-allowed disabled:opacity-50",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Save, { size: 16 }),
              " ",
              isSavingProfile ? "Saving..." : "Save Dossier"
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handlePasswordUpdate, className: `${panelClass} flex flex-col justify-between`, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-5 flex items-center justify-between", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Lock, { size: 20, className: "text-cyan-400" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-bold uppercase tracking-widest text-white", children: "Enclave Credentials" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-mono uppercase tracking-widest text-cyan-400", children: isCloudSynced ? "Cloud Auth" : "Local Vault" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4", children: [
            !isCloudSynced && /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex flex-col gap-1.5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-bold uppercase tracking-widest text-zinc-400", children: "Current Password (Optional if admin)" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "input",
                {
                  type: "password",
                  value: currentPassword,
                  onChange: (e) => setCurrentPassword(e.target.value),
                  className: inputClass,
                  placeholder: "Current password"
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex flex-col gap-1.5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-bold uppercase tracking-widest text-zinc-400", children: "New Security Password" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "input",
                {
                  type: "password",
                  value: newPassword,
                  onChange: (e) => setNewPassword(e.target.value),
                  className: inputClass,
                  autoComplete: "new-password",
                  placeholder: "Minimum 8 characters"
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex flex-col gap-1.5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-bold uppercase tracking-widest text-zinc-400", children: "Confirm New Password" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "input",
                {
                  type: "password",
                  value: confirmPassword,
                  onChange: (e) => setConfirmPassword(e.target.value),
                  className: inputClass,
                  autoComplete: "new-password",
                  placeholder: "Repeat password"
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl border border-cyan-400/15 bg-cyan-400/5 p-3.5 text-[11px] leading-relaxed text-cyan-200/80", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 font-bold mb-1 text-cyan-300", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(KeyRound, { size: 13 }),
                " ",
                isCloudSynced ? "Supabase Encryption" : "Bcrypt Hardware Enclave"
              ] }),
              isCloudSynced ? "Password updates are synced with your cloud Supabase user entity." : "Nexus authenticates locally using hashed credentials stored in your native OS hardware enclave."
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between rounded-xl border border-white/5 bg-black/40 p-3 text-xs text-zinc-400", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Vault PIN Configured" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-emerald-400 font-bold", children: metrics?.vaultPinConfigured ? "ENABLED" : "DISABLED" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "submit",
            disabled: isSavingPassword || !newPassword,
            className: "mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-400/15 text-xs font-bold uppercase tracking-widest text-cyan-200 transition hover:bg-cyan-400 hover:text-black disabled:cursor-not-allowed disabled:opacity-50",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Save, { size: 16 }),
              " ",
              isSavingPassword ? "Updating..." : "Update Password"
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `${panelClass} flex flex-col justify-between border-emerald-400/30 bg-emerald-950/10`, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-4 flex items-center justify-between", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Archive, { size: 20, className: "text-emerald-400" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-bold uppercase tracking-widest text-white", children: "Nexus System Backup (.zip)" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded bg-emerald-400/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-300", children: "PORTABLE" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-zinc-400 leading-relaxed mb-4", children: "Export or restore your complete Nexus workspace: notes, core memory, AI models, API keys, workflows, and operator dossier in a single compressed .zip archive." }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              ref: fileInputRef,
              type: "file",
              accept: ".zip",
              className: "hidden",
              onChange: (e) => {
                const file = e.target.files?.[0];
                if (file) void handleImportFile(file);
                e.target.value = "";
              }
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              onDragOver: (e) => e.preventDefault(),
              onDrop: (e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) void handleImportFile(file);
              },
              onClick: () => fileInputRef.current?.click(),
              className: "group flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-emerald-400/30 bg-black/40 p-6 text-center transition hover:border-emerald-400 hover:bg-emerald-950/20 cursor-pointer",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mb-2.5 flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 group-hover:scale-110 transition-transform", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Upload, { size: 22 }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-bold uppercase tracking-wider text-zinc-200", children: "Import Nexus Backup (.zip)" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mt-1 text-[11px] text-zinc-500", children: "Click to browse or drag & drop .zip file here" })
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 flex items-center justify-between gap-2", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              onClick: handleNativeImportDialog,
              disabled: isImportingBackup,
              className: "flex-1 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] text-[11px] font-bold uppercase tracking-wider text-zinc-300 hover:border-emerald-400/40 hover:text-emerald-200 transition",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { size: 13 }),
                " Browse Files"
              ]
            }
          ) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 rounded-xl border border-white/5 bg-black/40 p-3 text-[11px] text-zinc-400 space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Last Export:" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-zinc-300", children: metrics?.lastBackupDate ? formatDate(metrics.lastBackupDate) : "None" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Archived Components:" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-emerald-400", children: "Notes • Memories • Keys • Dossier" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: handleExportBackup,
            disabled: isExportingBackup || isImportingBackup,
            className: "mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-emerald-400 bg-emerald-400 text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_20px_rgba(52,211,153,0.3)] transition hover:bg-emerald-300 disabled:opacity-50",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Download, { size: 16 }),
              " ",
              isExportingBackup ? "Exporting Archive..." : "Export Nexus Backup (.zip)"
            ]
          }
        )
      ] })
    ] }),
    isAdmin && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: panelClass, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-5 flex items-center justify-between", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Users, { size: 20, className: "text-amber-300" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-bold uppercase tracking-widest text-white", children: "Administrator Privileges" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] font-mono text-amber-300/80", children: [
          "Primary Root: ",
          NEXUS_ADMIN_EMAIL
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-zinc-400", children: "You are authenticated as the Nexus Chief Administrator. Your session has unrestricted privileges across local hardware execution, memory databases, and cloud federation." })
    ] })
  ] }) });
};
export {
  ProfileView as default
};
