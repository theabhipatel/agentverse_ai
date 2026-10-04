import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckIcon, PlayIcon, SearchIcon, SquareIcon, Volume2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { getApiErrorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'
// A generic browser audio utility, not chat business logic, so it is shared rather than duplicated.
import { PcmPlayer } from '@/modules/chat/voice-audio'
import { useLlmStore } from '@/stores/llm-store'
import type { TtsProvider, VoiceOption } from '@/types/api'
import { AdminLayout } from './admin-layout'

const TTS_PROVIDER_LABELS: Record<TtsProvider, string> = {
  minimax: 'MiniMax',
  elevenlabs: 'ElevenLabs',
}

/**
 * Matches SPEECH_SAMPLE_RATE in backend/src/modules/voice/voice.tts.ts: the
 * preview endpoint streams raw PCM with no header, so the rate has to be known
 * ahead of time rather than read from the response.
 */
const VOICE_PREVIEW_SAMPLE_RATE = 24000

export function AdminVoicesPage() {
  const settings = useLlmStore((state) => state.settings)
  const settingsLoading = useLlmStore((state) => state.loading)
  const fetchSettings = useLlmStore((state) => state.fetchSettings)
  const voices = useLlmStore((state) => state.voices)
  const voicesLoading = useLlmStore((state) => state.voicesLoading)
  const fetchVoices = useLlmStore((state) => state.fetchVoices)
  const previewVoice = useLlmStore((state) => state.previewVoice)
  const saveTts = useLlmStore((state) => state.saveTts)

  const [playingId, setPlayingId] = useState<string | null>(null)
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null)
  const [selectingId, setSelectingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const playerRef = useRef<PcmPlayer | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    void fetchSettings().catch((error: unknown) => {
      toast.error(getApiErrorMessage(error, 'Could not load the AI settings'))
    })
  }, [fetchSettings])

  useEffect(() => {
    void fetchVoices().catch((error: unknown) => {
      toast.error(getApiErrorMessage(error, 'Could not load the voice library'))
    })
  }, [fetchVoices])

  // Stops anything still playing when the admin leaves this page.
  useEffect(
    () => () => {
      playerRef.current?.close()
      audioRef.current?.pause()
    },
    [],
  )

  function stopPlayback() {
    playerRef.current?.stop()
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setPlayingId(null)
  }

  async function handlePlay(voiceOption: VoiceOption) {
    if (playingId === voiceOption.id) {
      stopPlayback()
      return
    }
    stopPlayback()

    // ElevenLabs hands back a ready made sample; MiniMax needs one synthesized.
    if (voiceOption.previewUrl) {
      const audio = new Audio(voiceOption.previewUrl)
      audioRef.current = audio
      audio.onended = () => setPlayingId(null)
      setPlayingId(voiceOption.id)
      try {
        await audio.play()
      } catch (error) {
        setPlayingId(null)
        toast.error(getApiErrorMessage(error, 'Could not play this voice'))
      }
      return
    }

    setLoadingPreviewId(voiceOption.id)
    try {
      const buffer = await previewVoice(voiceOption.id)
      playerRef.current?.close()
      const player = new PcmPlayer()
      player.onIdle = () => setPlayingId(null)
      playerRef.current = player
      setPlayingId(voiceOption.id)
      player.play(buffer, VOICE_PREVIEW_SAMPLE_RATE)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not play this voice'))
    } finally {
      setLoadingPreviewId(null)
    }
  }

  async function handleSelect(voiceOption: VoiceOption) {
    if (!settings) {
      return
    }
    setSelectingId(voiceOption.id)
    try {
      await saveTts({ provider: settings.tts.provider, model: settings.tts.model, voice: voiceOption.id })
      toast.success(`${voiceOption.name} is now the app's voice`)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not select this voice'))
    } finally {
      setSelectingId(null)
    }
  }

  const providerLabel = settings ? TTS_PROVIDER_LABELS[settings.tts.provider] : 'your text to speech provider'
  const loadingList =
    (!settings && settingsLoading) || (Boolean(settings) && voicesLoading && voices.length === 0)

  const selectedVoice = settings
    ? voices.find((voiceOption) => voiceOption.id === settings.tts.voice)
    : undefined
  const selectedVoiceName = selectedVoice?.name ?? settings?.tts.voice ?? ''

  const filteredVoices = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) {
      return voices
    }
    return voices.filter(
      (voiceOption) =>
        voiceOption.name.toLowerCase().includes(query) || voiceOption.id.toLowerCase().includes(query),
    )
  }, [voices, search])

  return (
    <AdminLayout title="Voices">
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="font-heading text-2xl font-bold">Voices</h2>
          <p className="text-sm text-muted-foreground">
            Every voice {providerLabel} offers on this account. Preview one, then select it to use it for
            every agent in the app.
          </p>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Volume2Icon className="size-5" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Provider</p>
                {settings ? (
                  <p className="text-base font-semibold">{providerLabel}</p>
                ) : (
                  <Skeleton className="h-5 w-24" />
                )}
              </div>
            </div>

            <div className="hidden h-10 w-px bg-border sm:block" />

            <div className="space-y-1 sm:text-right">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Selected voice
              </p>
              {settings ? (
                <>
                  <p className="text-base font-semibold">{selectedVoiceName}</p>
                  <p className="font-mono text-xs text-muted-foreground">{settings.tts.voice}</p>
                </>
              ) : (
                <Skeleton className="h-5 w-32" />
              )}
            </div>
          </CardContent>
        </Card>

        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search voices by name or id"
            className="pl-9"
            disabled={voices.length === 0}
          />
        </div>

        {loadingList ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-14 w-full" />
            ))}
          </div>
        ) : !settings ? null : voices.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No voices found. Check that a {providerLabel} API key is saved under AI models.
            </CardContent>
          </Card>
        ) : filteredVoices.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No voices match "{search}".
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filteredVoices.map((voiceOption) => {
              const isSelected = voiceOption.id === settings.tts.voice
              const isPlaying = playingId === voiceOption.id
              const isLoadingPreview = loadingPreviewId === voiceOption.id
              return (
                <div
                  key={voiceOption.id}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-lg border border-border p-3',
                    isSelected && 'border-primary bg-primary/5',
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{voiceOption.name}</p>
                    {isSelected ? (
                      <Badge variant="secondary" className="mt-1">
                        <CheckIcon />
                        Selected
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label={isPlaying ? `Stop ${voiceOption.name}` : `Play ${voiceOption.name}`}
                      disabled={isLoadingPreview}
                      onClick={() => void handlePlay(voiceOption)}
                    >
                      {isLoadingPreview ? <Spinner /> : isPlaying ? <SquareIcon /> : <PlayIcon />}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={isSelected || selectingId === voiceOption.id}
                      onClick={() => void handleSelect(voiceOption)}
                    >
                      {selectingId === voiceOption.id ? <Spinner /> : null}
                      {isSelected ? 'Selected' : 'Select'}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
