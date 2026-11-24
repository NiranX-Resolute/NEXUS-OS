import React from 'react'
import { motion, HTMLMotionProps } from 'framer-motion'

export type HudCardVariant = 'default' | 'cyan' | 'emerald' | 'amber' | 'purple' | 'crimson'

export interface HudBracketCardProps extends Omit<HTMLMotionProps<'div'>, 'title'> {
  children?: React.ReactNode
  className?: string
  variant?: HudCardVariant
  /** Title displayed in the card header */
  title?: React.ReactNode
  /** Subtitle or small tag displayed alongside title */
  subtitle?: React.ReactNode
  /** Right-aligned action slot in header */
  headerAction?: React.ReactNode
  /** Corner bracket size in px (default: 6px) */
  cornerSize?: number
  /** Whether the specular border highlight is visible (default: true) */
  specular?: boolean
  /** Whether corner brackets have an active breathing pulse animation (default: true) */
  animated?: boolean
  /** Whether to apply interactive hover glow & specular shift (default: true) */
  interactive?: boolean
}

const VARIANT_MAP: Record<
  HudCardVariant,
  {
    border: string
    glow: string
    bracket: string
    specular: string
    titleColor: string
    badgeBg: string
  }
> = {
  cyan: {
    border: 'border-cyan-500/30',
    glow: 'rgba(0, 245, 212, 0.15)',
    bracket: 'text-cyan-400 border-cyan-400 shadow-[0_0_8px_rgba(0,245,212,0.6)]',
    specular: 'from-cyan-400/40 via-cyan-200/10 to-transparent',
    titleColor: 'text-cyan-300',
    badgeBg: 'bg-cyan-950/50 text-cyan-300 border-cyan-500/30'
  },
  emerald: {
    border: 'border-emerald-500/30',
    glow: 'rgba(16, 185, 129, 0.15)',
    bracket: 'text-emerald-400 border-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]',
    specular: 'from-emerald-400/40 via-emerald-200/10 to-transparent',
    titleColor: 'text-emerald-300',
    badgeBg: 'bg-emerald-950/50 text-emerald-300 border-emerald-500/30'
  },
  amber: {
    border: 'border-amber-500/30',
    glow: 'rgba(245, 158, 11, 0.15)',
    bracket: 'text-amber-400 border-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.6)]',
    specular: 'from-amber-400/40 via-amber-200/10 to-transparent',
    titleColor: 'text-amber-300',
    badgeBg: 'bg-amber-950/50 text-amber-300 border-amber-500/30'
  },
  purple: {
    border: 'border-purple-500/30',
    glow: 'rgba(168, 85, 247, 0.15)',
    bracket: 'text-purple-400 border-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.6)]',
    specular: 'from-purple-400/40 via-purple-200/10 to-transparent',
    titleColor: 'text-purple-300',
    badgeBg: 'bg-purple-950/50 text-purple-300 border-purple-500/30'
  },
  crimson: {
    border: 'border-rose-500/40',
    glow: 'rgba(244, 63, 94, 0.2)',
    bracket: 'text-rose-400 border-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.7)]',
    specular: 'from-rose-400/50 via-rose-200/10 to-transparent',
    titleColor: 'text-rose-300',
    badgeBg: 'bg-rose-950/50 text-rose-300 border-rose-500/30'
  },
  default: {
    border: 'border-white/10',
    glow: 'rgba(255, 255, 255, 0.05)',
    bracket: 'text-cyan-400/80 border-cyan-400/80 shadow-[0_0_6px_rgba(0,245,212,0.4)]',
    specular: 'from-white/25 via-white/5 to-transparent',
    titleColor: 'text-slate-200',
    badgeBg: 'bg-slate-900/60 text-slate-300 border-slate-700/50'
  }
}

/**
 * HudBracketCard — Glass HUD Card with Animated 6px L-Shaped Corner Brackets [ ] & Specular Border
 */
export const HudBracketCard: React.FC<HudBracketCardProps> = ({
  children,
  className = '',
  variant = 'cyan',
  title,
  subtitle,
  headerAction,
  cornerSize = 6,
  specular = true,
  animated = true,
  interactive = true,
  ...rest
}) => {
  const v = VARIANT_MAP[variant] || VARIANT_MAP.default

  return (
    <motion.div
      className={`relative group rounded-lg backdrop-blur-xl bg-slate-950/65 ${v.border} border transition-all duration-300 ${
        interactive ? 'hover:border-opacity-80 hover:bg-slate-950/75' : ''
      } ${className}`}
      style={{
        boxShadow: `0 4px 24px -2px ${v.glow}`
      }}
      {...rest}
    >
      {/* Specular highlight border along top and left edge */}
      {specular && (
        <div
          aria-hidden="true"
          className={`absolute inset-0 rounded-lg pointer-events-none p-[1px] bg-gradient-to-br ${v.specular} opacity-80 group-hover:opacity-100 transition-opacity duration-300 [mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] [mask-composite:exclude]`}
        />
      )}

      {/* Specular horizontal highlight beam on top border */}
      <div
        aria-hidden="true"
        className="absolute top-0 left-4 right-4 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none"
      />

      {/* 4 Animated 6px L-Shaped Corner Brackets [ ] */}
      {/* Top-Left Bracket ┌ */}
      <motion.span
        aria-hidden="true"
        animate={
          animated
            ? {
                opacity: [0.75, 1, 0.75],
                scale: [1, 1.05, 1]
              }
            : undefined
        }
        transition={
          animated
            ? {
                duration: 2.4,
                repeat: Infinity,
                ease: 'easeInOut'
              }
            : undefined
        }
        className={`absolute -top-[1px] -left-[1px] border-t-2 border-l-2 pointer-events-none z-10 transition-transform ${v.bracket}`}
        style={{
          width: `${cornerSize}px`,
          height: `${cornerSize}px`
        }}
      />

      {/* Top-Right Bracket ┐ */}
      <motion.span
        aria-hidden="true"
        animate={
          animated
            ? {
                opacity: [0.75, 1, 0.75],
                scale: [1, 1.05, 1]
              }
            : undefined
        }
        transition={
          animated
            ? {
                duration: 2.4,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: 0.6
              }
            : undefined
        }
        className={`absolute -top-[1px] -right-[1px] border-t-2 border-r-2 pointer-events-none z-10 transition-transform ${v.bracket}`}
        style={{
          width: `${cornerSize}px`,
          height: `${cornerSize}px`
        }}
      />

      {/* Bottom-Left Bracket └ */}
      <motion.span
        aria-hidden="true"
        animate={
          animated
            ? {
                opacity: [0.75, 1, 0.75],
                scale: [1, 1.05, 1]
              }
            : undefined
        }
        transition={
          animated
            ? {
                duration: 2.4,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: 1.2
              }
            : undefined
        }
        className={`absolute -bottom-[1px] -left-[1px] border-b-2 border-l-2 pointer-events-none z-10 transition-transform ${v.bracket}`}
        style={{
          width: `${cornerSize}px`,
          height: `${cornerSize}px`
        }}
      />

      {/* Bottom-Right Bracket ┘ */}
      <motion.span
        aria-hidden="true"
        animate={
          animated
            ? {
                opacity: [0.75, 1, 0.75],
                scale: [1, 1.05, 1]
              }
            : undefined
        }
        transition={
          animated
            ? {
                duration: 2.4,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: 1.8
              }
            : undefined
        }
        className={`absolute -bottom-[1px] -right-[1px] border-b-2 border-r-2 pointer-events-none z-10 transition-transform ${v.bracket}`}
        style={{
          width: `${cornerSize}px`,
          height: `${cornerSize}px`
        }}
      />

      {/* Optional Card Header */}
      {(title || subtitle || headerAction) && (
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2 border-b border-white/5">
          <div className="flex items-center gap-2.5 min-w-0">
            {title && (
              <h3 className={`text-xs font-mono font-semibold tracking-wider uppercase truncate ${v.titleColor}`}>
                {title}
              </h3>
            )}
            {subtitle && (
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${v.badgeBg} truncate`}>
                {subtitle}
              </span>
            )}
          </div>
          {headerAction && <div className="flex items-center gap-1.5">{headerAction}</div>}
        </div>
      )}

      {/* Main Content Area */}
      <div className="p-4">{children}</div>
    </motion.div>
  )
}

export default HudBracketCard
