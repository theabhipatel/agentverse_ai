import { useCallback, useEffect, useRef, useState } from 'react'
import type { MicVAD } from '@ricky0123/vad-web'
import { toast } from 'sonner'
import { env } from '@/config/env'
import { api, getApiErrorMessage } from '@/lib/api'
import type { VoiceTurnHandlers } from '@/stores/chat-store'
import type { ApiSuccessResponse, TranscriptionPayload } from '@/types/api'
import { PcmPlayer, encodeWav, loudness, playChime } from './voice-audio'

/**
 * off: voice mode closed. connecting: loading the detector and the microphone.
 * listening: waiting for the user. hearing: the user is talking.
 * thinking: transcribing and waiting for the reply. speaking: the reply is playing.
 */
export type VoicePhase = 'off' | 'connecting' | 'listening' | 'hearing' | 'thinking' | 'speaking'

/** The detector hands over speech at this rate. */
const SPEECH_SAMPLE_RATE = 16000

/** The settings the detector would ask for itself: one channel, cleaned up by the browser. */
const MICROPHONE: MediaStreamConstraints = {
  audio: { channelCount: 1, echoCancellation: true, autoGainControl: true, noiseSuppression: true },
}

/** How sure the detector must be that someone is talking. */
const LISTENING_THRESHOLDS = { positiveSpeechThreshold: 0.5, negativeSpeechThreshold: 0.35 }
/**
 * A little stricter while the reply plays, so its echo cannot interrupt itself.
 * Not much: echo cancellation also turns the user's own voice down while the reply plays.
 */
const SPEAKING_THRESHOLDS = { positiveSpeechThreshold: 0.6, negativeSpeechThreshold: 0.45 }

/** A piece of the reply: its text, and when its audio plays on the player's clock. */
interface SpokenPiece {
  text: string
  startAt: number | null
  duration: number
}

interface Turn {
  controller: AbortController
  /** Everything the user said this turn, including an unanswered turn it was joined to. */
  said: Promise<string>
  /** The reply has started to speak. From then on the turn stands even when talked over. */
  spoke: boolean
  pieces: SpokenPiece[]
}

/** The reply text heard so far: whole pieces already played, and the words of the one playing. */
function heardText(pieces: SpokenPiece[], now: number): string {
  let text = ''
  for (const piece of pieces) {
    if (piece.startAt === null || now < piece.startAt) {
      break
    }
    const played = piece.duration > 0 ? (now - piece.startAt) / piece.duration : 1
    if (played >= 1) {
      text += piece.text
      continue
    }
    // Whole words only, so half a word is never shown.
    const cut = piece.text.lastIndexOf(' ', Math.round(piece.text.length * played))
    return cut > 0 ? text + piece.text.slice(0, cut) : text
  }
  return text
}

async function transcribe(audio: Float32Array): Promise<string> {
  try {
    const { data } = await api.post<ApiSuccessResponse<TranscriptionPayload>>(
      '/transcribe',
      encodeWav(audio, SPEECH_SAMPLE_RATE),
      { headers: { 'Content-Type': 'audio/wav' } },
    )
    return data.data.text.trim()
  } catch (error) {
    toast.error(getApiErrorMessage(error, 'Could not transcribe what you said'))
    return ''
  }
}

/** Opens the microphone. Until it is allowed, this is what shows the browser's permission prompt. */
async function openMicrophone(): Promise<MediaStream> {
  // Browsers only offer the microphone on https pages (and localhost).
  if (!window.isSecureContext || !navigator.mediaDevices) {
    throw new DOMException('The microphone is not available here', 'NotSupportedError')
  }
  return navigator.mediaDevices.getUserMedia(MICROPHONE)
}

/** What to tell the user when the microphone cannot be opened, going by what the browser reported. */
function microphoneProblem(error: unknown): string {
  const name = error instanceof Error ? error.name : ''
  const detail = error instanceof Error ? error.message.toLowerCase() : ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      // Chrome's wording tells apart a closed prompt, a block on this site, and a block by the computer itself.
      if (detail.includes('dismissed')) {
        return 'Voice mode needs your microphone. Choose Allow when the browser asks.'
      }
      if (detail.includes('system')) {
        return 'Your computer is blocking the browser from using the microphone. Allow it in your system privacy settings, then try again.'
      }
      return 'The microphone is blocked for this site. Allow it from the icon at the left of the address bar, then try again.'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No microphone was found. Connect one and try again.'
    case 'NotReadableError':
    case 'AbortError':
      return 'The microphone could not be started. Close other apps that are using it and try again.'
    case 'NotSupportedError':
      return 'This browser cannot use the microphone on this page. Voice mode needs a secure (https) connection.'
    default:
      return 'Voice mode could not use your microphone. Please try again.'
  }
}

/**
 * A hands free conversation: the microphone stays open, a turn ends when the
 * user stops talking, the reply is spoken with its transcript following the
 * voice, and talking over it cuts it off.
 */
export function useVoiceConversation({
  sendTurn,
}: {
  sendTurn: (content: string, handlers: VoiceTurnHandlers) => Promise<void>
}) {
  const [phase, setPhase] = useState<VoicePhase>('off')
  const [muted, setMuted] = useState(false)

  const phaseRef = useRef<VoicePhase>('off')
  const vadRef = useRef<MicVAD | null>(null)
  const playerRef = useRef<PcmPlayer | null>(null)
  const turnRef = useRef<Turn | null>(null)
  /** What the user said in a turn they talked over before it answered. It joins the next turn. */
  const carryRef = useRef<Promise<string> | null>(null)
  const micLevelRef = useRef(0)
  const sendTurnRef = useRef(sendTurn)

  useEffect(() => {
    sendTurnRef.current = sendTurn
  }, [sendTurn])

  const moveTo = useCallback((next: VoicePhase) => {
    const vad = vadRef.current
    if (vad && (next === 'speaking') !== (phaseRef.current === 'speaking')) {
      vad.setOptions(next === 'speaking' ? SPEAKING_THRESHOLDS : LISTENING_THRESHOLDS)
    }
    phaseRef.current = next
    setPhase(next)
  }, [])

  /** Where to rest once nothing is happening: still playing, or waiting for the user. */
  const settle = useCallback(() => {
    if (phaseRef.current === 'off' || phaseRef.current === 'hearing') {
      return
    }
    if (playerRef.current?.playing) {
      moveTo('speaking')
    } else if (!turnRef.current) {
      moveTo('listening')
    }
  }, [moveTo])

  /** Stops the reply that is playing or on its way, so the user can take the turn. */
  const interrupt = useCallback(() => {
    playerRef.current?.stop()
    const turn = turnRef.current
    if (!turn) {
      return
    }
    turn.controller.abort()
    turnRef.current = null
    if (!turn.spoke) {
      carryRef.current = turn.said
    }
  }, [])

  /** One turn, from what the user said to the last of the reply's audio. */
  const runTurn = useCallback(
    async (input: Float32Array | string) => {
      interrupt()
      const carried = carryRef.current
      carryRef.current = null

      // Not tied to the turn's abort: if it is talked over, its words are still needed for the next turn.
      const heard = typeof input === 'string' ? Promise.resolve(input) : transcribe(input)
      const said = Promise.all([carried ?? Promise.resolve(''), heard]).then((parts) =>
        parts.map((part) => part.trim()).filter(Boolean).join(' '),
      )
      const turn: Turn = { controller: new AbortController(), said, spoke: false, pieces: [] }
      const { signal } = turn.controller
      turnRef.current = turn
      moveTo('thinking')

      try {
        const content = await said
        if (!content || signal.aborted) {
          return
        }
        await sendTurnRef.current(content, {
          signal,
          onSpeech: (text) => {
            turn.spoke = true
            turn.pieces.push({ text, startAt: null, duration: 0 })
          },
          onAudio: (pcm, sampleRate) => {
            const player = playerRef.current
            if (signal.aborted || !player) {
              return
            }
            const { startAt, duration } = player.play(pcm, sampleRate)
            const piece = turn.pieces.at(-1)
            if (piece) {
              piece.startAt ??= startAt
              piece.duration += duration
            }
            if (phaseRef.current === 'thinking') {
              moveTo('speaking')
            }
          },
          heard: () => heardText(turn.pieces, playerRef.current?.currentTime ?? 0),
          whenPlayed: () => playerRef.current?.whenIdle() ?? Promise.resolve(),
        })
      } catch (error) {
        if (!signal.aborted) {
          toast.error(getApiErrorMessage(error, error instanceof Error ? error.message : 'The voice reply failed'))
        }
      } finally {
        if (turnRef.current === turn) {
          turnRef.current = null
          settle()
        }
      }
    },
    [interrupt, moveTo, settle],
  )

  const stop = useCallback(() => {
    // Only a session that got as far as listening chimes as it closes.
    const connected = phaseRef.current !== 'off' && phaseRef.current !== 'connecting'
    turnRef.current?.controller.abort()
    turnRef.current = null
    carryRef.current = null
    void vadRef.current?.destroy()
    vadRef.current = null
    playerRef.current?.close()
    playerRef.current = null
    micLevelRef.current = 0
    setMuted(false)
    moveTo('off')
    if (connected) {
      playChime('disconnect')
    }
  }, [moveTo])

  const start = useCallback(async () => {
    if (phaseRef.current !== 'off') {
      return
    }
    moveTo('connecting')

    // Made inside the click, before any await, so the browser lets it play sound.
    const player = new PcmPlayer()
    player.onIdle = settle
    playerRef.current = player

    // The microphone comes first, so the permission prompt shows straight away, before the detector loads.
    let stream: MediaStream
    try {
      stream = await openMicrophone()
    } catch (error) {
      if (playerRef.current === player) {
        stop()
        toast.error(microphoneProblem(error))
      }
      return
    }
    const releaseMicrophone = () => stream.getTracks().forEach((track) => track.stop())
    // Closed while the prompt was open.
    if (playerRef.current !== player) {
      releaseMicrophone()
      return
    }

    try {
      // Loaded on first use: the detector and its runtime are heavy, and most chats never open voice mode.
      const { MicVAD } = await import('@ricky0123/vad-web')
      const vad = await MicVAD.new({
        model: 'v5',
        baseAssetPath: env.vadAssetsPath,
        onnxWASMBasePath: env.vadAssetsPath,
        getStream: async () => stream,
        ...LISTENING_THRESHOLDS,
        // How long a pause ends the turn. Talking again before the reply starts joins the two.
        redemptionMs: 900,
        preSpeechPadMs: 300,
        // Short enough that a plain "yes" still counts.
        minSpeechMs: 250,
        onFrameProcessed: (_probabilities, frame) => {
          micLevelRef.current = loudness(frame)
        },
        onSpeechStart: () => {
          if (phaseRef.current === 'listening') {
            moveTo('hearing')
          }
        },
        onSpeechRealStart: () => {
          if (phaseRef.current === 'speaking' || phaseRef.current === 'thinking') {
            interrupt()
          }
          moveTo('hearing')
        },
        onVADMisfire: () => {
          if (phaseRef.current !== 'hearing') {
            return
          }
          if (carryRef.current) {
            // A false alarm cut off an unanswered turn, so it goes again as it was.
            void runTurn('')
            return
          }
          moveTo('listening')
          settle()
        },
        onSpeechEnd: (audio) => {
          void runTurn(audio)
        },
      })

      // Closed while the detector was loading.
      if (playerRef.current !== player) {
        void vad.destroy()
        return
      }
      vadRef.current = vad
      moveTo('listening')
      playChime('connect')
    } catch {
      // The microphone worked, so this is the detector itself failing to load.
      releaseMicrophone()
      if (playerRef.current === player) {
        stop()
        toast.error('Voice mode could not start. Please refresh the page and try again.')
      }
    }
  }, [interrupt, moveTo, runTurn, settle, stop])

  const toggleMute = useCallback(async () => {
    const vad = vadRef.current
    if (!vad) {
      return
    }
    if (muted) {
      await vad.start()
      setMuted(false)
    } else {
      await vad.pause()
      micLevelRef.current = 0
      setMuted(true)
      if (phaseRef.current === 'hearing') {
        moveTo('listening')
        settle()
      }
    }
  }, [moveTo, muted, settle])

  /** Typing while in voice mode still gets a spoken reply. */
  const sendText = useCallback(
    (content: string) => {
      void runTurn(content)
    },
    [runTurn],
  )

  /** How loud the current speaker is, for the orb: the reply while it plays, the user while they talk. */
  const getLevel = useCallback(() => {
    if (phaseRef.current === 'speaking') {
      return playerRef.current?.level() ?? 0
    }
    return phaseRef.current === 'hearing' ? micLevelRef.current : 0
  }, [])

  useEffect(() => stop, [stop])

  return { phase, active: phase !== 'off', muted, start, stop, toggleMute, sendText, getLevel }
}
