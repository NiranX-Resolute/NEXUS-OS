import React, { useEffect, useState, useRef } from 'react'

export interface KineticTextProps {
  /** Target text to reveal */
  text: string
  /** Total animation duration in ms (default: 240ms) */
  duration?: number
  /** Delay before animation starts in ms (default: 0) */
  delay?: number
  /** Custom CSS classes */
  className?: string
  /** Cipher character set used during scrambling */
  charset?: string
  /** HTML element wrapper tag (default: 'span') */
  as?: 'span' | 'div' | 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'code'
  /** Callback fired when cipher reveal finishes */
  onComplete?: () => void
  /** Optional key/trigger to force re-running the reveal */
  triggerKey?: string | number
}

const DEFAULT_CIPHER_CHARS = '0123456789ABCDEF!@#$%^&*<>[]{}/*~_+-=?'

/**
 * KineticText — 240ms Monospace Cipher Reveal
 * Rapidly scrambles characters through a glyph matrix before locking into target text.
 */
export const KineticText: React.FC<KineticTextProps> = ({
  text,
  duration = 240,
  delay = 0,
  className = '',
  charset = DEFAULT_CIPHER_CHARS,
  as: Component = 'span',
  onComplete,
  triggerKey
}) => {
  const [displayText, setDisplayText] = useState<string>(text)
  const [isRevealed, setIsRevealed] = useState<boolean>(false)
  const animFrameRef = useRef<number | null>(null)
  const delayTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // If empty text, resolve immediately
    if (!text) {
      setDisplayText('')
      setIsRevealed(true)
      onComplete?.()
      return
    }

    // Check prefers-reduced-motion
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setDisplayText(text)
      setIsRevealed(true)
      onComplete?.()
      return
    }

    const startAnimation = () => {
      const startTime = performance.now()
      const totalChars = text.length
      setIsRevealed(false)

      const animate = (now: number) => {
        const elapsed = now - startTime
        const progress = Math.min(elapsed / Math.max(duration, 1), 1)

        // Number of locked characters at current progress
        const lockedCount = Math.floor(progress * totalChars)

        let result = ''
        for (let i = 0; i < totalChars; i++) {
          const char = text[i]
          if (char === ' ' || char === '\n' || char === '\t') {
            result += char
          } else if (i < lockedCount) {
            result += char
          } else {
            // Cipher character
            const randomIndex = Math.floor(Math.random() * charset.length)
            result += charset[randomIndex]
          }
        }

        setDisplayText(result)

        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(animate)
        } else {
          setDisplayText(text)
          setIsRevealed(true)
          onComplete?.()
        }
      }

      animFrameRef.current = requestAnimationFrame(animate)
    }

    if (delay > 0) {
      delayTimeoutRef.current = setTimeout(startAnimation, delay)
    } else {
      startAnimation()
    }

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current)
      }
      if (delayTimeoutRef.current !== null) {
        clearTimeout(delayTimeoutRef.current)
      }
    }
  }, [text, duration, delay, charset, triggerKey, onComplete])

  return (
    <Component
      className={`font-mono inline-block tracking-wider ${className}`}
      aria-label={text}
      data-resolved={isRevealed}
    >
      {displayText}
    </Component>
  )
}

export default KineticText
