import React from 'react'
import { RiAlertFill, RiShieldCheckLine, RiExternalLinkLine } from 'react-icons/ri'

interface AbliteratedWarningBannerProps {
  modelName?: string
  isAbliterated?: boolean
  source?: string
  className?: string
}

const ABLITERATED_REGEX = /abliterat|heretic|uncensor|abliter8|huihui/i

export function checkIsAbliterated(modelName?: string, isAbliteratedFlag?: boolean): boolean {
  if (isAbliteratedFlag === true) return true
  if (!modelName) return false
  return ABLITERATED_REGEX.test(modelName)
}

export const AbliteratedWarningBanner: React.FC<AbliteratedWarningBannerProps> = ({
  modelName = '',
  isAbliterated = false,
  source = 'abliteratedmodels.org',
  className = ''
}) => {
  const active = checkIsAbliterated(modelName, isAbliterated)
  if (!active) return null

  return (
    <div
      role="alert"
      className={`w-full bg-gradient-to-r from-amber-950/90 via-red-950/90 to-amber-950/90 border-t-2 border-b border-amber-500/80 px-4 py-2.5 shadow-[0_0_30px_rgba(245,158,11,0.25)] text-amber-200 z-50 backdrop-blur-xl ${className}`}
    >
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5 text-xs font-mono">
        <div className="flex items-start gap-2.5 flex-1">
          <div className="p-1 rounded-lg bg-amber-500/20 text-amber-400 shrink-0 mt-0.5 animate-pulse">
            <RiAlertFill className="w-4 h-4" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold tracking-wider text-amber-300 uppercase text-[11px] bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/40">
                ⚠️ ABLITERATED / UNALIGNED MODEL ACTIVE (is_abliterated = true)
              </span>
              {modelName && (
                <span className="text-zinc-300 text-[11px] font-mono truncate max-w-xs bg-black/40 px-2 py-0.5 rounded border border-white/10">
                  {modelName}
                </span>
              )}
              {source && (
                <span className="text-amber-400/80 text-[10px]">
                  [{source}]
                </span>
              )}
            </div>
            <p className="text-[11px] text-amber-200/90 leading-relaxed font-sans">
              Safety refusal vectors have been orthogonalized from this checkpoint (abliteratedmodels.org). Outputs may be unfiltered, inaccurate, or inappropriate—verify all generated output independently. <strong className="text-emerald-400">Nexus ScopeGuard remains strictly enforced</strong> on all local filesystem, terminal, and UI actions, and all cloud execution remains subject to Kaggle / Hugging Face Terms of Service.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 self-end md:self-center text-[10px]">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-950/50 text-emerald-400 border border-emerald-500/30 font-mono font-semibold">
            <RiShieldCheckLine className="w-3.5 h-3.5" />
            <span>ScopeGuard Locked</span>
          </span>
          <a
            href="https://abliteratedmodels.org"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-200 underline underline-offset-2"
          >
            <span>Research Docs</span>
            <RiExternalLinkLine className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  )
}

export default AbliteratedWarningBanner
