import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import type { ApiSuccessResponse, TranscriptionPayload } from '@/types/api'

export type RecorderStatus = 'idle' | 'starting' | 'recording' | 'transcribing'

/** First container the browser actually supports. Chrome and Firefox pick webm, Safari mp4. */
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

function pickMimeType(): string | undefined {
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type))
}

function isSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
}

/**
 * Records from the microphone and sends the clip to the backend, which transcribes it.
 * The stream is exposed so the waveform can read levels from the same microphone
 * rather than opening a second one.
 */
export function useVoiceRecorder({ onTranscript }: { onTranscript: (transcript: string) => void }) {
  const [supported] = useState(isSupported)
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [stream, setStream] = useState<MediaStream | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const cancelledRef = useRef(false)
  const onTranscriptRef = useRef(onTranscript)

  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  useEffect(() => {
    return () => {
      cancelledRef.current = true
      recorderRef.current?.stop()
      recorderRef.current = null
    }
  }, [])

  const start = useCallback(async () => {
    if (recorderRef.current) {
      return
    }

    const mimeType = pickMimeType()
    if (!mimeType) {
      toast.error('This browser cannot record audio')
      return
    }

    setStatus('starting')
    let media: MediaStream
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setStatus('idle')
      toast.error('Microphone access is blocked. Allow it in your browser settings and try again.')
      return
    }

    const recorder = new MediaRecorder(media, { mimeType })
    const chunks: Blob[] = []
    cancelledRef.current = false

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data)
      }
    }

    recorder.onstop = () => {
      media.getTracks().forEach((track) => track.stop())
      recorderRef.current = null
      setStream(null)

      if (cancelledRef.current || chunks.length === 0) {
        setStatus('idle')
        return
      }

      const clip = new Blob(chunks, { type: mimeType })
      setStatus('transcribing')
      api
        .post<ApiSuccessResponse<TranscriptionPayload>>('/transcribe', clip, {
          headers: { 'Content-Type': mimeType },
        })
        .then(({ data }) => {
          const transcript = data.data.text.trim()
          if (transcript) {
            onTranscriptRef.current(transcript)
          } else {
            toast.error('I did not catch anything. Try again.')
          }
        })
        .catch((error: unknown) => {
          toast.error(getApiErrorMessage(error, 'Could not transcribe the recording'))
        })
        .finally(() => {
          setStatus('idle')
        })
    }

    recorderRef.current = recorder
    setStream(media)
    setStatus('recording')
    recorder.start()
  }, [])

  /** Keeps the recording and sends it for transcription. */
  const stop = useCallback(() => {
    recorderRef.current?.stop()
  }, [])

  /** Throws the recording away. */
  const cancel = useCallback(() => {
    cancelledRef.current = true
    recorderRef.current?.stop()
  }, [])

  return { supported, status, stream, start, stop, cancel }
}
