import { useCallback, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ArrowUpIcon, AudioLinesIcon, CircleOffIcon, MicIcon, MicOffIcon, SquareIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useVoiceRecorder } from './use-voice-recorder'
import { VoiceWaveform } from './voice-waveform'

/** The hands free conversation, driven from the chat window. */
export interface VoiceModeControls {
  active: boolean
  muted: boolean
  onStart: () => void
  onEnd: () => void
  onToggleMute: () => void
}

export function ChatInput({
  onSend,
  disabled,
  lockedReason,
  autoFocus,
  voiceMode,
  className,
}: {
  onSend: (content: string) => void
  /** Busy sending. The send button shows a spinner. */
  disabled?: boolean
  /** Nothing can be sent at all, for this reason. Shown in place of the text box. */
  lockedReason?: string | null
  autoFocus?: boolean
  voiceMode?: VoiceModeControls
  className?: string
}) {
  const [value, setValue] = useState('')

  // Dictation lands in the box for the user to edit or send, it never sends on its own.
  const appendTranscript = useCallback((transcript: string) => {
    setValue((current) => (current.trim() ? `${current.trim()} ${transcript}` : transcript))
  }, [])

  const voice = useVoiceRecorder({ onTranscript: appendTranscript })
  const isRecording = voice.status === 'recording'
  const isListening = isRecording || voice.status === 'starting'
  const isTranscribing = voice.status === 'transcribing'
  const inVoiceMode = voiceMode?.active ?? false
  const hasText = value.trim().length > 0
  // An empty box offers voice mode where the send button would be, as ChatGPT does.
  const offersVoiceMode = Boolean(voiceMode) && voice.supported && !hasText && !disabled
  const buttonCount = inVoiceMode ? (hasText ? 3 : 2) : (voice.supported ? 1 : 0) + 1

  function submit() {
    const content = value.trim()
    if (!content || disabled || isListening || isTranscribing) {
      return
    }
    setValue('')
    onSend(content)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    submit()
  }

  // Enter sends, Shift+Enter adds a newline.
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  if (lockedReason) {
    return (
      <div
        aria-disabled
        className={cn('flex items-center gap-3 rounded-2xl border border-border bg-muted/50 p-2 pl-4', className)}
      >
        <CircleOffIcon className="size-4 shrink-0 text-muted-foreground" />
        <p className="min-h-11 flex-1 content-center text-sm text-muted-foreground">{lockedReason}</p>
        <Button type="button" size="icon" disabled aria-label="Send message" className="rounded-full">
          <ArrowUpIcon />
        </Button>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn('relative rounded-2xl border border-border bg-card p-2 shadow-sm', className)}
    >
      {isListening ? (
        <div className="flex h-11 items-center gap-3 px-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={voice.cancel}
            aria-label="Cancel recording"
            className="rounded-full"
          >
            <XIcon />
          </Button>

          <div className="flex min-w-0 flex-1 items-center">
            {isRecording && voice.stream ? (
              <VoiceWaveform stream={voice.stream} />
            ) : (
              <span className="text-xs text-muted-foreground">Starting...</span>
            )}
          </div>

          <Button
            type="button"
            size="icon"
            onClick={voice.stop}
            disabled={!isRecording}
            aria-label="Stop recording"
            className="rounded-full"
          >
            <SquareIcon className="fill-current" />
          </Button>
        </div>
      ) : (
        <>
          <Textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={inVoiceMode ? 'Type' : 'Ask anything...'}
            rows={1}
            autoFocus={autoFocus}
            className={cn(
              'max-h-40 min-h-11 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0',
              buttonCount === 3 ? 'pr-32' : buttonCount === 2 ? 'pr-24' : 'pr-12',
            )}
          />

          {voiceMode && inVoiceMode ? (
            <div className="absolute right-3 bottom-3 flex items-center gap-1">
              {hasText ? (
                <Button
                  type="submit"
                  size="icon"
                  aria-label="Send message"
                  disabled={disabled}
                  className="rounded-full"
                >
                  {disabled ? <Spinner /> : <ArrowUpIcon />}
                </Button>
              ) : null}

              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={voiceMode.onToggleMute}
                aria-pressed={voiceMode.muted}
                aria-label={voiceMode.muted ? 'Unmute microphone' : 'Mute microphone'}
                className={cn(
                  'rounded-full',
                  voiceMode.muted &&
                    'bg-destructive text-destructive-foreground hover:bg-destructive/85 hover:text-destructive-foreground dark:hover:bg-destructive/85',
                )}
              >
                <MicOffIcon />
              </Button>

              <Button
                type="button"
                size="icon"
                onClick={voiceMode.onEnd}
                aria-label="End voice mode"
                className="rounded-full bg-foreground text-background hover:bg-foreground/80"
              >
                <XIcon />
              </Button>
            </div>
          ) : (
            <div className="absolute right-3 bottom-3 flex items-center gap-1">
              {voice.supported ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => void voice.start()}
                  disabled={disabled || isTranscribing}
                  aria-label="Start voice input"
                  className="rounded-full"
                >
                  {isTranscribing ? <Spinner /> : <MicIcon />}
                </Button>
              ) : null}

              {voiceMode && offersVoiceMode ? (
                <Button
                  type="button"
                  size="icon"
                  onClick={voiceMode.onStart}
                  aria-label="Start voice mode"
                  className="rounded-full"
                >
                  <AudioLinesIcon />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  aria-label="Send message"
                  disabled={disabled || !hasText}
                  className="rounded-full"
                >
                  {disabled ? <Spinner /> : <ArrowUpIcon />}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </form>
  )
}
