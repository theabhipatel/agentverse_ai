import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

const BAR_WIDTH = 2
const BAR_PITCH = 6
const BAR_MIN_HEIGHT = 2
const SAMPLE_INTERVAL_MS = 55
/**
 * Loudness is perceived logarithmically, so the meter works in decibels.
 * The quiet end cannot be a fixed number: every room and microphone has a different
 * background level, and anything above it would draw as a permanent tall band. So the
 * floor tracks the quietest recent sample and the scale starts a little above it.
 * It drops instantly when the room goes quiet and creeps back up, which is what lets
 * the bars fall flat between sentences.
 */
const CEILING_DB = -18
const NOISE_HEADROOM_DB = 6
/**
 * The floor climbs at two speeds. During a quiet passage it can follow the room up
 * quickly. While someone is talking it barely moves, because a floor that chases the
 * voice slowly swallows it: a long unbroken sentence would fade out as you spoke.
 */
const FLOOR_RISE_WHEN_QUIET = 0.05
const FLOOR_RISE_WHEN_LOUD = 0.005
/**
 * A newly opened stream reads as digital silence for a moment. No room is ever that
 * quiet, so samples below this are ignored rather than dragged into the floor, which
 * would otherwise leave the meter pinned high for several seconds at startup.
 */
const SILENCE_DB = -70
const LEVEL_SMOOTHING = 0.35

/**
 * Live microphone level, drawn right to left like a tape.
 * Reads the recorder's own stream, so only one microphone is ever opened.
 */
export function VoiceWaveform({ stream, className }: { stream: MediaStream; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) {
      return
    }

    // The canvas inherits its colour from the element, so the theme stays the source of truth.
    const barColor = getComputedStyle(canvas).color
    const levels: number[] = []
    let frame = 0
    let lastSampleAt = 0
    let level = 0
    // Seeded from the first real sample rather than a guess about the room.
    let noiseFloorDb: number | null = null

    const render = (sample: () => number, timestamp: number) => {
      const { width, height } = canvas.getBoundingClientRect()
      const ratio = window.devicePixelRatio || 1
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio)
        canvas.height = Math.round(height * ratio)
      }

      const barCount = Math.max(1, Math.floor(width / BAR_PITCH))
      if (timestamp - lastSampleAt >= SAMPLE_INTERVAL_MS) {
        lastSampleAt = timestamp

        const decibels = 20 * Math.log10(Math.max(sample(), 1e-6))
        if (decibels > SILENCE_DB) {
          if (noiseFloorDb === null) {
            noiseFloorDb = decibels
          } else {
            const speaking = decibels > noiseFloorDb + NOISE_HEADROOM_DB
            const rise = speaking ? FLOOR_RISE_WHEN_LOUD : FLOOR_RISE_WHEN_QUIET
            noiseFloorDb = Math.min(decibels, noiseFloorDb + rise)
          }
        }

        const floor = noiseFloorDb === null ? CEILING_DB : noiseFloorDb + NOISE_HEADROOM_DB
        const scaled = (decibels - floor) / Math.max(1, CEILING_DB - floor)
        level = level * LEVEL_SMOOTHING + Math.min(1, Math.max(0, scaled)) * (1 - LEVEL_SMOOTHING)
        levels.push(level)
      }
      while (levels.length > barCount) {
        levels.shift()
      }

      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.clearRect(0, 0, width, height)
      context.fillStyle = barColor

      const middle = height / 2
      const maxHeight = height
      for (let index = 0; index < levels.length; index += 1) {
        // The newest sample sits at the right edge and older ones scroll away to the left.
        const x = width - (levels.length - index) * BAR_PITCH
        const barHeight = Math.max(BAR_MIN_HEIGHT, levels[index] * maxHeight)
        context.beginPath()
        context.roundRect(x, middle - barHeight / 2, BAR_WIDTH, barHeight, BAR_WIDTH / 2)
        context.fill()
      }
    }

    const audioContext = new AudioContext()
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 1024
    audioContext.createMediaStreamSource(stream).connect(analyser)

    const buffer = new Uint8Array(analyser.fftSize)
    const sample = () => {
      analyser.getByteTimeDomainData(buffer)
      let total = 0
      for (const value of buffer) {
        const offset = (value - 128) / 128
        total += offset * offset
      }
      return Math.sqrt(total / buffer.length)
    }

    const loop = (timestamp: number) => {
      render(sample, timestamp)
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(frame)
      // The recorder owns the stream, so the tracks are left alone here.
      void audioContext.close()
    }
  }, [stream])

  return <canvas ref={canvasRef} aria-hidden className={cn('h-9 w-full text-primary', className)} />
}
