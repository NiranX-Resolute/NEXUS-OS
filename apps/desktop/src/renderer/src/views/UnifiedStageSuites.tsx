import React, { Suspense, lazy, useState } from 'react'
import {
  AppWindow,
  BookOpen,
  Bot,
  Camera,
  Code2,
  Cpu,
  Globe,
  Layers,
  PenTool,
  Radio,
  Shield,
  Smartphone,
  StickyNote,
  Terminal,
  User,
  Workflow,
  Zap
} from 'lucide-react'
import { useNexusRuntime } from '@renderer/context/NexusRuntimeContext'
import { demandComponentManager } from '@renderer/services/demand-component-manager'

const NexKoderStudioView = lazy(() =>
  import('@renderer/views/NexKoderStudioView').then((m) => ({ default: m.NexKoderStudioView }))
)
const AgenticView = lazy(() => import('@renderer/views/AgenticView'))
const MemoryAndScholarView = lazy(() =>
  import('@renderer/views/MemoryAndScholarView').then((m) => ({
    default: m.MemoryAndScholarView
  }))
)
const NotesView = lazy(() => import('@renderer/views/Notes'))
const AutopilotAndMacrosView = lazy(() =>
  import('@renderer/views/AutopilotAndMacrosView').then((m) => ({
    default: m.AutopilotAndMacrosView
  }))
)
const WorkFlowEditorView = lazy(() => import('@renderer/views/WorkFlowEditor'))
const AppsView = lazy(() => import('@renderer/views/APP'))
const BrowserControlView = lazy(() => import('@renderer/views/BrowserControl'))
const ServerlessBrowserView = lazy(() => import('@renderer/views/ServerlessBrowser'))
const WorldAndBrowserView = lazy(() =>
  import('@renderer/views/WorldAndBrowserView').then((m) => ({
    default: m.WorldAndBrowserView
  }))
)
const ObscuraInspectorView = lazy(() => import('@renderer/views/ObscuraInspectorView'))
const BoardVaultWidgetsView = lazy(() =>
  import('@renderer/views/BoardVaultWidgetsView').then((m) => ({
    default: m.BoardVaultWidgetsView
  }))
)
const WhiteboardView = lazy(() => import('@renderer/views/Whiteboard'))
const GalleryView = lazy(() => import('@renderer/views/Gallery'))
const PhoneView = lazy(() => import('@renderer/views/Phone'))
const ProfileEnclaveView = lazy(() =>
  import('@renderer/views/ProfileEnclaveView').then((m) => ({ default: m.ProfileEnclaveView }))
)
const ProfileView = lazy(() => import('@renderer/views/Profile'))

const SuiteFallback: React.FC<{ title: string }> = ({ title }) => (
  <div className="flex h-full w-full items-center justify-center bg-black/40">
    <div className="flex flex-col items-center gap-2 font-mono text-xs text-cyan-300">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/20 border-t-cyan-400" />
      <span className="tracking-widest uppercase">LOADING {title}...</span>
    </div>
  </div>
)

function SuiteHeader<T extends string>({
  title,
  tabs,
  active,
  onSelect,
  extra
}: {
  title: string
  tabs: Array<{ id: T; label: string; icon: React.ComponentType<{ size?: number }> }>
  active: T
  onSelect: (tab: T) => void
  extra?: React.ReactNode
}): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-zinc-950/60 px-5 py-2.5 backdrop-blur-xl shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold tracking-wide text-zinc-100">{title}</span>
      </div>

      <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isSelected = active === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelect(tab.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                isSelected
                  ? 'border border-emerald-400/35 bg-emerald-500/15 text-emerald-200'
                  : 'border border-transparent text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100'
              }`}
            >
              <Icon size={13} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {extra && <div className="flex items-center gap-2">{extra}</div>}
    </div>
  )
}

export const StudioSuiteView: React.FC = () => {
  const [subTab, setSubTab] = useState<'nexkoder' | 'agentic'>('nexkoder')

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <SuiteHeader
        title="NexKoder & Agentic Studio"
        active={subTab}
        onSelect={setSubTab}
        tabs={[
          { id: 'nexkoder', label: 'NexKoder IDE', icon: Code2 },
          { id: 'agentic', label: 'Agentic Multi-Session', icon: Bot }
        ]}
        extra={
          <button
            type="button"
            onClick={() => demandComponentManager.demandComponent('terminal', {}, 'studio-header')}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-200 transition-colors cursor-pointer"
          >
            <Terminal size={13} className="text-cyan-300" />
            <span>Floating Terminal</span>
          </button>
        }
      />
      <div className="flex-1 min-h-0 overflow-hidden">
        <Suspense fallback={<SuiteFallback title="Studio" />}>
          {subTab === 'nexkoder' ? <NexKoderStudioView /> : <AgenticView />}
        </Suspense>
      </div>
    </div>
  )
}

export const ScholarSuiteView: React.FC = () => {
  const [subTab, setSubTab] = useState<'scholar' | 'notes'>('scholar')

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <SuiteHeader
        title="Memory, Scholar & Notes"
        active={subTab}
        onSelect={setSubTab}
        tabs={[
          { id: 'scholar', label: 'Scholar Lab & 3D Galaxy', icon: BookOpen },
          { id: 'notes', label: 'Sovereign Notes', icon: StickyNote }
        ]}
      />
      <div className="flex-1 min-h-0 overflow-hidden">
        <Suspense fallback={<SuiteFallback title="Scholar" />}>
          {subTab === 'scholar' ? <MemoryAndScholarView /> : <NotesView />}
        </Suspense>
      </div>
    </div>
  )
}

export const AutopilotSuiteView: React.FC = () => {
  const [subTab, setSubTab] = useState<'autopilot' | 'workflows' | 'apps'>('autopilot')

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <SuiteHeader
        title="Autopilot, Workflows & OS Apps"
        active={subTab}
        onSelect={setSubTab}
        tabs={[
          { id: 'autopilot', label: 'Autopilot & Macros', icon: Zap },
          { id: 'workflows', label: 'Visual Flow Builder', icon: Workflow },
          { id: 'apps', label: 'Installed OS Apps', icon: AppWindow }
        ]}
      />
      <div className="flex-1 min-h-0 overflow-hidden">
        <Suspense fallback={<SuiteFallback title="Autopilot" />}>
          {subTab === 'autopilot' && <AutopilotAndMacrosView />}
          {subTab === 'workflows' && <WorkFlowEditorView />}
          {subTab === 'apps' && <AppsView />}
        </Suspense>
      </div>
    </div>
  )
}

export const WorldSuiteView: React.FC<{
  initialTab?: 'world' | 'webview' | 'serverless' | 'obscura'
  obscuraView?: React.ReactNode
}> = ({ initialTab, obscuraView }) => {
  const runtime = useNexusRuntime()
  const [subTab, setSubTab] = useState<'world' | 'webview' | 'serverless' | 'obscura'>(
    initialTab || 'world'
  )
  const [prevInitialTab, setPrevInitialTab] = useState(initialTab)

  if (initialTab !== prevInitialTab) {
    setPrevInitialTab(initialTab)
    if (initialTab) {
      setSubTab(initialTab)
    }
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <SuiteHeader
        title="World, Live Browser & Obscura"
        active={subTab}
        onSelect={setSubTab}
        tabs={[
          { id: 'world', label: 'PlanetWatch & AgentTown', icon: Globe },
          { id: 'webview', label: 'AI Browser WebView', icon: Radio },
          { id: 'serverless', label: 'Edge Browser', icon: Layers },
          { id: 'obscura', label: 'Obscura DOM Inspector', icon: Cpu }
        ]}
      />
      <div className="flex-1 min-h-0 overflow-hidden">
        <Suspense fallback={<SuiteFallback title="World & Browser" />}>
          {subTab === 'world' && <WorldAndBrowserView />}
          {subTab === 'webview' && (
            <BrowserControlView
              isSystemActive={runtime.isSystemActive}
              isSystemStarting={runtime.isSystemStarting}
              isMicMuted={runtime.isMicMuted}
              toggleSystem={runtime.toggleSystem}
              toggleMic={runtime.toggleMic}
              sendTextCommand={async (cmd) => {
                await runtime.sendPromptToCore(cmd)
              }}
            />
          )}
          {subTab === 'serverless' && <ServerlessBrowserView />}
          {subTab === 'obscura' && (obscuraView ?? <ObscuraInspectorView />)}
        </Suspense>
      </div>
    </div>
  )
}

export const VaultSuiteView: React.FC = () => {
  const [subTab, setSubTab] = useState<'hub' | 'sketch' | 'gallery' | 'phone'>('hub')

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <SuiteHeader
        title="Board, Vault, Media & ADB Phone"
        active={subTab}
        onSelect={setSubTab}
        tabs={[
          { id: 'hub', label: 'Blueprint, Creator & Widgets', icon: Layers },
          { id: 'sketch', label: 'Voice Whiteboard', icon: PenTool },
          { id: 'gallery', label: 'Gallery Vault', icon: Camera },
          { id: 'phone', label: 'Android ADB Control', icon: Smartphone }
        ]}
      />
      <div className="flex-1 min-h-0 overflow-hidden">
        <Suspense fallback={<SuiteFallback title="Vault & Board" />}>
          {subTab === 'hub' && <BoardVaultWidgetsView />}
          {subTab === 'sketch' && <WhiteboardView />}
          {subTab === 'gallery' && <GalleryView />}
          {subTab === 'phone' && <PhoneView />}
        </Suspense>
      </div>
    </div>
  )
}

export const ProfileSuiteView: React.FC = () => {
  const [subTab, setSubTab] = useState<'enclave' | 'operator'>('enclave')

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <SuiteHeader
        title="Sovereign Profile & Security Enclave"
        active={subTab}
        onSelect={setSubTab}
        tabs={[
          { id: 'enclave', label: 'Security Enclave & Shield', icon: Shield },
          { id: 'operator', label: 'Operator Dossier & Backup', icon: User }
        ]}
      />
      <div className="flex-1 min-h-0 overflow-auto">
        <Suspense fallback={<SuiteFallback title="Profile" />}>
          {subTab === 'enclave' ? <ProfileEnclaveView /> : <ProfileView />}
        </Suspense>
      </div>
    </div>
  )
}
