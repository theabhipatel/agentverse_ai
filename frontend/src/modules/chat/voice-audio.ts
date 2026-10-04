/** Root mean square of a block of samples: how loud it is, from 0 upwards. */
export function loudness(samples: Float32Array): number {
  let total = 0
  for (const sample of samples) {
    total += sample * sample
  }
  return samples.length > 0 ? Math.sqrt(total / samples.length) : 0
}

/** Wraps mono float samples in a 16 bit WAV file, the format the transcription route takes. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index))
    }
  }

  writeText(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample))
    view.setInt16(44 + index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  })

  return new Blob([buffer], { type: 'audio/wav' })
}

/** A little lead so the first chunk never starts in the past, which clicks. */
const START_LEAD_SECONDS = 0.05

/**
 * Plays the reply's 16 bit mono PCM chunks back to back as they arrive, and can
 * go silent instantly when the user talks over it.
 */
export class PcmPlayer {
  private readonly context = new AudioContext()
  private readonly analyser = this.context.createAnalyser()
  private readonly levelSamples: Float32Array<ArrayBuffer>
  private readonly sources = new Set<AudioBufferSourceNode>()
  /** A chunk can end half way through a sample. That byte waits for the next chunk. */
  private carry: Uint8Array | null = null
  private endsAt = 0
  private idleWaiters: Array<() => void> = []
  /** Called when the last queued chunk finishes playing. */
  onIdle: (() => void) | null = null

  constructor() {
    this.analyser.fftSize = 512
    this.analyser.connect(this.context.destination)
    this.levelSamples = new Float32Array(this.analyser.fftSize)
  }

  get playing(): boolean {
    return this.sources.size > 0
  }

  /** The clock that `play` schedules against, in seconds. */
  get currentTime(): number {
    return this.context.currentTime
  }

  /** Resolves once nothing is playing: everything queued has been heard, or was stopped. */
  whenIdle(): Promise<void> {
    return this.playing ? new Promise((resolve) => this.idleWaiters.push(resolve)) : Promise.resolve()
  }

  /** Queues a chunk right after whatever is queued. Returns when it will start and how long it lasts. */
  play(chunk: ArrayBuffer, sampleRate: number): { startAt: number; duration: number } {
    let bytes = new Uint8Array(chunk)
    if (this.carry) {
      const joined = new Uint8Array(this.carry.length + bytes.length)
      joined.set(this.carry)
      joined.set(bytes, this.carry.length)
      bytes = joined
      this.carry = null
    }
    if (bytes.length % 2 === 1) {
      this.carry = bytes.slice(-1)
      bytes = bytes.subarray(0, bytes.length - 1)
    }
    if (bytes.length === 0) {
      return { startAt: this.endsAt, duration: 0 }
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const frames = bytes.byteLength / 2
    const buffer = this.context.createBuffer(1, frames, sampleRate)
    const channel = buffer.getChannelData(0)
    for (let index = 0; index < frames; index += 1) {
      channel[index] = view.getInt16(index * 2, true) / 0x8000
    }

    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.connect(this.analyser)
    const startAt = Math.max(this.endsAt, this.context.currentTime + START_LEAD_SECONDS)
    source.start(startAt)
    this.endsAt = startAt + buffer.duration
    this.sources.add(source)
    source.onended = () => {
      this.sources.delete(source)
      if (this.sources.size === 0) {
        this.onIdle?.()
        this.releaseIdleWaiters()
      }
    }
    void this.context.resume()
    return { startAt, duration: buffer.duration }
  }

  /** Silences everything queued. */
  stop(): void {
    for (const source of this.sources) {
      source.onended = null
      source.stop()
    }
    this.sources.clear()
    this.carry = null
    this.endsAt = 0
    this.releaseIdleWaiters()
  }

  private releaseIdleWaiters(): void {
    const waiters = this.idleWaiters
    this.idleWaiters = []
    waiters.forEach((resolve) => resolve())
  }

  /** How loud the reply is right now, for the orb. */
  level(): number {
    this.analyser.getFloatTimeDomainData(this.levelSamples)
    return loudness(this.levelSamples)
  }

  close(): void {
    this.stop()
    this.onIdle = null
    void this.context.close()
  }
}

interface ChimeSpec {
  /** Bell notes in hertz, one after another. */
  notes: number[]
  /** A soft low chord held under the bells. */
  pad: number[]
  /** Seconds between one bell note and the next. */
  gap: number
  volume: number
}

const CHIMES = {
  // A major chord rising to its octave, so opening voice mode feels bright and ready.
  connect: { notes: [523.25, 659.25, 783.99, 1046.5], pad: [261.63, 392], gap: 0.09, volume: 0.16 },
  // The same chord settling back home, calm rather than sad.
  disconnect: { notes: [783.99, 659.25, 523.25], pad: [261.63, 392], gap: 0.12, volume: 0.12 },
} satisfies Record<string, ChimeSpec>

/** A bell is the note, its octave and a faint twelfth, the higher ones dying away sooner. */
const BELL_PARTIALS = [
  { ratio: 1, level: 1, decay: 1 },
  { ratio: 2, level: 0.35, decay: 0.6 },
  { ratio: 3, level: 0.12, decay: 0.35 },
]

const BELL_SECONDS = 0.7
/** The last note rings on, which is what makes the chime feel finished. */
const LAST_BELL_SECONDS = 1.4
const PAD_SECONDS = 1.2
const PAD_VOLUME = 0.05
const REVERB_SECONDS = 1.8
const REVERB_MIX = 0.3

/** One note that fades in over `attack` and dies away over `length`. */
function tone(
  context: AudioContext,
  destination: AudioNode,
  note: { frequency: number; type: OscillatorType; at: number; peak: number; attack: number; length: number },
): void {
  const envelope = context.createGain()
  envelope.gain.setValueAtTime(0, note.at)
  envelope.gain.linearRampToValueAtTime(note.peak, note.at + note.attack)
  envelope.gain.exponentialRampToValueAtTime(0.0001, note.at + note.length)
  envelope.connect(destination)

  const oscillator = context.createOscillator()
  oscillator.type = note.type
  oscillator.frequency.value = note.frequency
  oscillator.connect(envelope)
  oscillator.start(note.at)
  oscillator.stop(note.at + note.length)
}

/** A small room made of fading noise, which gives the chime a soft tail. */
function reverbImpulse(context: AudioContext): AudioBuffer {
  const length = Math.round(context.sampleRate * REVERB_SECONDS)
  const impulse = context.createBuffer(2, length, context.sampleRate)
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const samples = impulse.getChannelData(channel)
    for (let index = 0; index < length; index += 1) {
      samples[index] = (Math.random() * 2 - 1) * (1 - index / length) ** 3
    }
  }
  return impulse
}

/** Plays the voice mode chime: soft bells over a warm chord, made here rather than loaded from a file. */
export function playChime(kind: keyof typeof CHIMES): void {
  const context = new AudioContext()
  const { notes, pad, gap, volume } = CHIMES[kind]
  const startAt = context.currentTime + START_LEAD_SECONDS

  const output = context.createGain()
  output.connect(context.destination)
  const reverb = context.createConvolver()
  reverb.buffer = reverbImpulse(context)
  const wet = context.createGain()
  wet.gain.value = REVERB_MIX
  output.connect(reverb).connect(wet).connect(context.destination)

  notes.forEach((frequency, index) => {
    const at = startAt + index * gap
    const length = index === notes.length - 1 ? LAST_BELL_SECONDS : BELL_SECONDS
    for (const partial of BELL_PARTIALS) {
      tone(context, output, {
        frequency: frequency * partial.ratio,
        type: 'sine',
        at,
        peak: volume * partial.level,
        attack: 0.008,
        length: length * partial.decay,
      })
    }
  })

  // The chord swells in under the bells, low and muffled, and is gone before they are.
  const warmth = context.createBiquadFilter()
  warmth.type = 'lowpass'
  warmth.frequency.value = 1200
  warmth.connect(output)
  for (const frequency of pad) {
    tone(context, warmth, { frequency, type: 'triangle', at: startAt, peak: PAD_VOLUME, attack: 0.25, length: PAD_SECONDS })
  }

  // Closed on a timer rather than when the notes end, which never happens if the browser kept it silent.
  const lengthSeconds = START_LEAD_SECONDS + (notes.length - 1) * gap + LAST_BELL_SECONDS + REVERB_SECONDS
  window.setTimeout(() => void context.close(), lengthSeconds * 1000 + 200)
}
