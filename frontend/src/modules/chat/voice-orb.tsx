import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { createOrbFog } from './voice-orb-fog'
import type { VoicePhase } from './use-voice-conversation'

const PHASE_LABELS: Record<VoicePhase, string> = {
  off: 'Voice mode is off',
  connecting: 'Connecting',
  listening: 'Listening',
  hearing: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
}

/** How much the orb swells at full volume. */
const LEVEL_SCALE = 0.35
const LEVEL_SMOOTHING = 0.25
/** The glow behind the orb spreads further than the orb itself, and never quite goes out. */
const GLOW_SCALE = 0.8
const GLOW_REST = 0.35
const GLOW_DIMMED = 0.12
/** How fast the fog drifts: always a little, faster with the voice, and faster while thinking. */
const FOG_SPEED = 1
const FOG_LEVEL_SPEED = 3
const FOG_THINKING_SPEED = 1.5

/**
 * The voice mode orb: a teal sky with fog drifting through it. It breathes
 * while waiting, pulses while thinking, and swells and glows with whoever is
 * talking. Everything moves in one animation loop that writes straight to the
 * elements, so it never re-renders React.
 */
export function VoiceOrb({
  phase,
  muted,
  getLevel,
  className,
}: {
  phase: VoicePhase
  muted: boolean
  getLevel: () => number
  className?: string
}) {
  const orbRef = useRef<HTMLDivElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)
  const dimmed = muted || phase === 'connecting'
  const liveRef = useRef({ phase, dimmed, getLevel })

  useEffect(() => {
    liveRef.current = { phase, dimmed, getLevel }
  }, [phase, dimmed, getLevel])

  useEffect(() => {
    const orb = orbRef.current
    const glow = glowRef.current
    if (!orb || !glow) {
      return
    }
    // A fresh canvas each time, because a canvas keeps its first WebGL context even after it is lost.
    const canvas = document.createElement('canvas')
    canvas.className = 'block size-full'
    orb.append(canvas)
    // Without WebGL the orb keeps its plain gradient.
    const fog = createOrbFog(canvas, () => delete orb.dataset.fog)
    if (fog) {
      orb.dataset.fog = 'on'
    }

    let frame = 0
    let level = 0
    let fogTime = 0
    let last = performance.now()

    const loop = (time: number) => {
      const { phase, dimmed, getLevel } = liveRef.current
      const elapsed = Math.min(0.1, (time - last) / 1000)
      last = time

      level += (Math.min(1, getLevel() * 4) - level) * LEVEL_SMOOTHING
      const breathe =
        phase === 'thinking' ? Math.sin(time / 220) * 0.04 : phase === 'connecting' ? 0 : Math.sin(time / 1100) * 0.025
      orb.style.transform = `scale(${1 + breathe + level * LEVEL_SCALE})`
      glow.style.transform = `scale(${1 + breathe * 2 + level * GLOW_SCALE})`
      glow.style.opacity = String(dimmed ? GLOW_DIMMED : GLOW_REST + level * (1 - GLOW_REST))

      fogTime += elapsed * (FOG_SPEED + level * FOG_LEVEL_SPEED + (phase === 'thinking' ? FOG_THINKING_SPEED : 0))
      fog?.draw(fogTime)
      frame = requestAnimationFrame(loop)
    }

    frame = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(frame)
      fog?.dispose()
      canvas.remove()
      delete orb.dataset.fog
    }
  }, [])

  return (
    <div role="status" className={cn('relative size-20', className)}>
      <span className="sr-only">{muted ? 'Microphone muted' : PHASE_LABELS[phase]}</span>
      <div
        ref={glowRef}
        aria-hidden
        className="absolute inset-0 rounded-full bg-voice-orb-mid blur-xl will-change-transform"
      />
      <div
        ref={orbRef}
        aria-hidden
        className={cn(
          'relative size-full rounded-full bg-linear-to-t from-voice-orb-light via-voice-orb-mid to-voice-orb-deep shadow-lg shadow-voice-orb-deep/40 transition-[opacity,filter] duration-500 will-change-transform data-[fog=on]:bg-none',
          dimmed && 'opacity-60 saturate-50',
        )}
      />
    </div>
  )
}
