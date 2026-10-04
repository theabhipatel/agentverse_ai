import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  PlugZapIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Spinner } from '@/components/ui/spinner'
import { getApiErrorMessage } from '@/lib/api'
import { useLlmStore } from '@/stores/llm-store'
import type {
  ChatProvider,
  LlmProvider,
  LlmSection,
  LlmSettings,
  ProviderKey,
  SttProvider,
  TtsProvider,
} from '@/types/api'
import { AdminLayout } from './admin-layout'

const CHAT_PROVIDERS: Array<{
  value: ChatProvider
  label: string
  defaultModel: string
}> = [
  { value: 'minimax', label: 'MiniMax', defaultModel: 'MiniMax-M3' },
  {
    value: 'openrouter',
    label: 'OpenRouter',
    defaultModel: 'openai/gpt-4o-mini',
  },
  { value: 'openai', label: 'OpenAI', defaultModel: 'gpt-4o-mini' },
  { value: 'glm', label: 'GLM (Z.ai)', defaultModel: 'glm-4.5-flash' },
]

const STT_PROVIDERS: Array<{ value: SttProvider; label: string; defaultModel: string }> = [
  { value: 'groq', label: 'Groq', defaultModel: 'whisper-large-v3' },
  { value: 'openai', label: 'OpenAI', defaultModel: 'whisper-1' },
]

const TTS_PROVIDERS: Array<{
  value: TtsProvider
  label: string
  defaultModel: string
  defaultVoice: string
}> = [
  {
    value: 'minimax',
    label: 'MiniMax',
    defaultModel: 'speech-2.8-turbo',
    defaultVoice: 'English_ConfidentWoman',
  },
  {
    value: 'elevenlabs',
    label: 'ElevenLabs',
    defaultModel: 'eleven_flash_v2_5',
    defaultVoice: '21m00Tcm4TlvDq8ikWAM',
  },
]

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
})

function providerLabel(provider: ChatProvider): string {
  return CHAT_PROVIDERS.find((entry) => entry.value === provider)?.label ?? provider
}

function defaultModelFor(provider: ChatProvider): string {
  return CHAT_PROVIDERS.find((entry) => entry.value === provider)?.defaultModel ?? ''
}

function keyOf(settings: LlmSettings, provider: LlmProvider): ProviderKey | undefined {
  return settings.providers.find((entry) => entry.provider === provider)
}

function ProviderSelect<T extends string>({
  id,
  value,
  options,
  onChange,
}: {
  id: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (provider: T) => void
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const provider = options.find((entry) => entry.value === next)
        if (provider) {
          onChange(provider.value)
        }
      }}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue>
          {(selected: T) => options.find((entry) => entry.value === selected)?.label ?? selected}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((entry) => (
          <SelectItem key={entry.value} value={entry.value}>
            {entry.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

const TABS: Array<{ value: LlmSection; label: string }> = [
  { value: 'chat', label: 'Chat model' },
  { value: 'voice', label: 'Voice model' },
  { value: 'stt', label: 'Speech to text' },
  { value: 'tts', label: 'Text to speech' },
  { value: 'embedding', label: 'Embeddings' },
]

/** A tab whose provider has no key yet is marked, so tabs hide nothing. */
function sectionReady(settings: LlmSettings, section: LlmSection): boolean {
  const provider =
    section === 'chat'
      ? settings.chat.provider
      : section === 'voice'
        ? (settings.voice.provider ?? settings.chat.provider)
        : section === 'stt'
          ? settings.stt.provider
          : section === 'tts'
            ? settings.tts.provider
            : settings.embedding.provider
  return keyOf(settings, provider)?.hasKey ?? false
}

function ProviderRow({ name, note }: { name: string; note: string }) {
  return (
    <Field>
      <FieldLabel>Provider</FieldLabel>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
        {name}
      </div>
      <FieldDescription>{note}</FieldDescription>
    </Field>
  )
}

/**
 * A stored key can never be read back, so it is shown as a saved row with a
 * Replace button rather than an input that looks editable but is not.
 */
function KeyField({
  id,
  providerKey,
  value,
  onChange,
  replacing,
  onReplacingChange,
}: {
  id: string
  providerKey: ProviderKey | undefined
  value: string
  onChange: (value: string) => void
  replacing: boolean
  onReplacingChange: (replacing: boolean) => void
}) {
  const name = providerKey?.name ?? 'Provider'
  const saved = providerKey?.hasKey ?? false
  const [visible, setVisible] = useState(false)

  if (saved && !replacing) {
    return (
      <Field>
        <FieldLabel>{name} API key</FieldLabel>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <KeyRoundIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="font-mono text-sm">
            {'•'.repeat(8)}
            {providerKey?.last6}
          </span>
          <Badge variant="secondary">
            <CheckIcon />
            Saved
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ms-auto"
            onClick={() => onReplacingChange(true)}
          >
            Replace key
          </Button>
        </div>
        <FieldDescription>
          {providerKey?.updatedAt
            ? `Last changed ${dateFormatter.format(new Date(providerKey.updatedAt))}. `
            : ''}
          Only the last 6 characters are ever shown. Replacing it means pasting the whole new key.
        </FieldDescription>
      </Field>
    )
  }

  return (
    <Field>
      <FieldLabel htmlFor={id}>
        {saved ? `New ${name} API key` : `${name} API key`}
        {saved ? null : (
          <Badge variant="destructive">
            <TriangleAlertIcon />
            Not set
          </Badge>
        )}
      </FieldLabel>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          // Hidden by default, but a password manager must not fill this with an account password.
          type={visible ? 'text' : 'password'}
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore
          spellCheck={false}
          value={value}
          autoFocus={replacing}
          placeholder={`Paste the whole ${name} key`}
          onChange={(event) => onChange(event.target.value)}
          required={!saved}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={visible ? 'Hide the key' : 'Show the key'}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </Button>
        {saved ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onChange('')
              setVisible(false)
              onReplacingChange(false)
            }}
          >
            <XIcon />
            Cancel
          </Button>
        ) : null}
      </div>
      <FieldDescription>
        {value.length > 0 ? `${value.trim().length} characters. ` : ''}
        The key is tested against {name} before it is saved.
      </FieldDescription>
    </Field>
  )
}

function Section({
  title,
  description,
  section,
  running,
  ready,
  dirty,
  onSubmit,
  onTest,
  children,
}: {
  title: string
  description: string
  section: LlmSection
  /** What is live right now, so the form can be read against it at a glance. */
  running: string
  ready: boolean
  dirty: boolean
  onSubmit: () => Promise<void>
  /** The values on screen, tested without saving them. */
  onTest: () => Promise<void>
  children: ReactNode
}) {
  const saving = useLlmStore((state) => state.saving)
  const testing = useLlmStore((state) => state.testing)

  async function handleTest() {
    try {
      await onTest()
      toast.success(`${title} is working`)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'The test failed'))
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onSubmit()
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle>{title}</CardTitle>
          {ready ? (
            <Badge variant="secondary">
              <CheckIcon />
              In use: {running}
            </Badge>
          ) : (
            <Badge variant="destructive">
              <TriangleAlertIcon />
              Needs an API key
            </Badge>
          )}
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          {children}
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <Button type="submit" disabled={saving || !dirty}>
              {saving ? <Spinner /> : null}
              {dirty ? 'Save changes' : 'Saved'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={testing !== null || !ready}
              onClick={handleTest}
            >
              {testing === section ? <Spinner /> : <PlugZapIcon />}
              Test
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function ChatSection({ settings }: { settings: LlmSettings }) {
  const saveChat = useLlmStore((state) => state.saveChat)
  const testSection = useLlmStore((state) => state.testSection)
  const [provider, setProvider] = useState<ChatProvider>(settings.chat.provider)
  const [model, setModel] = useState(settings.chat.model)
  const [apiKey, setApiKey] = useState('')
  const [replacing, setReplacing] = useState(false)

  const providerKey = keyOf(settings, provider)
  const dirty =
    provider !== settings.chat.provider || model !== settings.chat.model || apiKey.trim().length > 0

  // A model id belongs to its provider, so switching provider brings that provider's model.
  function changeProvider(next: ChatProvider) {
    setProvider(next)
    setModel(next === settings.chat.provider ? settings.chat.model : defaultModelFor(next))
    setApiKey('')
    setReplacing(false)
  }

  const payload = () => ({
    provider,
    model: model.trim(),
    ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
  })

  async function submit() {
    try {
      await saveChat(payload())
      setApiKey('')
      setReplacing(false)
      toast.success('Chat model saved')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not save the chat model'))
    }
  }

  return (
    <Section
      title="Chat model"
      description="The model behind every agent. Pick a provider, add its key, then any model id it offers that supports tool calling."
      section="chat"
      running={`${providerLabel(settings.chat.provider)} ${settings.chat.model}`}
      ready={keyOf(settings, settings.chat.provider)?.hasKey ?? false}
      dirty={dirty}
      onSubmit={submit}
      onTest={() => testSection('chat', payload())}
    >
      <Field>
        <FieldLabel htmlFor="chat-provider">Provider</FieldLabel>
        <ProviderSelect
          id="chat-provider"
          value={provider}
          options={CHAT_PROVIDERS}
          onChange={changeProvider}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="chat-model">Model</FieldLabel>
        <Input
          id="chat-model"
          value={model}
          placeholder={defaultModelFor(provider)}
          onChange={(event) => setModel(event.target.value)}
          required
        />
        <FieldDescription>A model id as {providerLabel(provider)} writes it.</FieldDescription>
      </Field>

      <KeyField
        id="chat-key"
        providerKey={providerKey}
        value={apiKey}
        onChange={setApiKey}
        replacing={replacing}
        onReplacingChange={setReplacing}
      />
    </Section>
  )
}

function VoiceSection({ settings }: { settings: LlmSettings }) {
  const saveVoice = useLlmStore((state) => state.saveVoice)
  const testSection = useLlmStore((state) => state.testSection)
  const [sameAsChat, setSameAsChat] = useState(settings.voice.sameAsChat)
  const [provider, setProvider] = useState<ChatProvider>(settings.voice.provider ?? settings.chat.provider)
  const [model, setModel] = useState(settings.voice.model ?? settings.chat.model)
  const [apiKey, setApiKey] = useState('')
  const [replacing, setReplacing] = useState(false)

  const providerKey = keyOf(settings, provider)
  const dirty =
    sameAsChat !== settings.voice.sameAsChat ||
    (!sameAsChat && (provider !== settings.voice.provider || model !== settings.voice.model)) ||
    apiKey.trim().length > 0

  function changeProvider(next: ChatProvider) {
    setProvider(next)
    setModel(
      next === settings.voice.provider && settings.voice.model ? settings.voice.model : defaultModelFor(next),
    )
    setApiKey('')
    setReplacing(false)
  }

  const payload = () =>
    sameAsChat
      ? { sameAsChat: true }
      : {
          sameAsChat: false,
          provider,
          model: model.trim(),
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        }

  async function submit() {
    try {
      await saveVoice(payload())
      setApiKey('')
      setReplacing(false)
      toast.success('Voice model saved')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not save the voice model'))
    }
  }

  const liveProvider = settings.voice.provider ?? settings.chat.provider
  const liveModel = settings.voice.model ?? settings.chat.model

  return (
    <Section
      title="Voice model"
      description="What answers in a voice conversation. Its reasoning is always switched off, because nothing can be spoken until the thinking ends."
      section="voice"
      running={
        settings.voice.sameAsChat
          ? `the chat model, ${providerLabel(liveProvider)} ${liveModel}`
          : `${providerLabel(liveProvider)} ${liveModel}`
      }
      ready={keyOf(settings, liveProvider)?.hasKey ?? false}
      dirty={dirty}
      onSubmit={submit}
      onTest={() => testSection('voice', payload())}
    >
      <RadioGroup
        value={sameAsChat ? 'same' : 'own'}
        onValueChange={(value) => setSameAsChat(value === 'same')}
      >
        <Field orientation="horizontal">
          <RadioGroupItem value="same" id="voice-same" />
          <FieldLabel htmlFor="voice-same" className="font-normal">
            Same as the chat model
          </FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <RadioGroupItem value="own" id="voice-own" />
          <FieldLabel htmlFor="voice-own" className="font-normal">
            A model of its own, usually a faster one
          </FieldLabel>
        </Field>
      </RadioGroup>

      {sameAsChat ? null : (
        <>
          <Field>
            <FieldLabel htmlFor="voice-provider">Provider</FieldLabel>
            <ProviderSelect
              id="voice-provider"
              value={provider}
              options={CHAT_PROVIDERS}
              onChange={changeProvider}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="voice-model">Model</FieldLabel>
            <Input
              id="voice-model"
              value={model}
              placeholder={defaultModelFor(provider)}
              onChange={(event) => setModel(event.target.value)}
              required
            />
          </Field>

          <KeyField
            id="voice-key"
            providerKey={providerKey}
            value={apiKey}
            onChange={setApiKey}
            replacing={replacing}
            onReplacingChange={setReplacing}
          />
        </>
      )}
    </Section>
  )
}

function SttSection({ settings }: { settings: LlmSettings }) {
  const saveStt = useLlmStore((state) => state.saveStt)
  const testSection = useLlmStore((state) => state.testSection)
  const [provider, setProvider] = useState<SttProvider>(settings.stt.provider)
  const [model, setModel] = useState(settings.stt.model)
  const [apiKey, setApiKey] = useState('')
  const [replacing, setReplacing] = useState(false)
  const providerKey = keyOf(settings, provider)

  // A model id belongs to its provider, so switching provider brings that provider's model.
  function changeProvider(next: SttProvider) {
    setProvider(next)
    setModel(
      next === settings.stt.provider
        ? settings.stt.model
        : (STT_PROVIDERS.find((entry) => entry.value === next)?.defaultModel ?? ''),
    )
    setApiKey('')
    setReplacing(false)
  }

  const payload = () => ({
    provider,
    model: model.trim(),
    ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
  })

  async function submit() {
    try {
      await saveStt(payload())
      setApiKey('')
      setReplacing(false)
      toast.success('Speech to text saved')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not save speech to text'))
    }
  }

  return (
    <Section
      title="Speech to text"
      description="Turns what a user says into text."
      section="stt"
      running={settings.stt.model}
      ready={keyOf(settings, settings.stt.provider)?.hasKey ?? false}
      dirty={provider !== settings.stt.provider || model !== settings.stt.model || apiKey.trim().length > 0}
      onSubmit={submit}
      onTest={() => testSection('stt', payload())}
    >
      <Field>
        <FieldLabel htmlFor="stt-provider">Provider</FieldLabel>
        <ProviderSelect
          id="stt-provider"
          value={provider}
          options={STT_PROVIDERS}
          onChange={changeProvider}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="stt-model">Model</FieldLabel>
        <Input
          id="stt-model"
          value={model}
          placeholder={STT_PROVIDERS.find((entry) => entry.value === provider)?.defaultModel}
          onChange={(event) => setModel(event.target.value)}
          required
        />
      </Field>
      <KeyField
        id="stt-key"
        providerKey={providerKey}
        value={apiKey}
        onChange={setApiKey}
        replacing={replacing}
        onReplacingChange={setReplacing}
      />
    </Section>
  )
}

function TtsSection({ settings }: { settings: LlmSettings }) {
  const saveTts = useLlmStore((state) => state.saveTts)
  const testSection = useLlmStore((state) => state.testSection)
  const [provider, setProvider] = useState<TtsProvider>(settings.tts.provider)
  const [model, setModel] = useState(settings.tts.model)
  const [voice, setVoice] = useState(settings.tts.voice)
  const [apiKey, setApiKey] = useState('')
  const [replacing, setReplacing] = useState(false)
  const providerKey = keyOf(settings, provider)
  const defaults = TTS_PROVIDERS.find((entry) => entry.value === provider)

  // A voice id belongs to its provider, so the model and the voice both follow it.
  function changeProvider(next: TtsProvider) {
    const nextDefaults = TTS_PROVIDERS.find((entry) => entry.value === next)
    setProvider(next)
    setModel(next === settings.tts.provider ? settings.tts.model : (nextDefaults?.defaultModel ?? ''))
    setVoice(next === settings.tts.provider ? settings.tts.voice : (nextDefaults?.defaultVoice ?? ''))
    setApiKey('')
    setReplacing(false)
  }

  const payload = () => ({
    provider,
    model: model.trim(),
    voice: voice.trim(),
    ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
  })

  async function submit() {
    try {
      await saveTts(payload())
      setApiKey('')
      setReplacing(false)
      toast.success('Text to speech saved')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not save text to speech'))
    }
  }

  return (
    <Section
      title="Text to speech"
      description="The voice a reply is spoken in."
      section="tts"
      running={`${settings.tts.model}, ${settings.tts.voice}`}
      ready={keyOf(settings, settings.tts.provider)?.hasKey ?? false}
      dirty={
        provider !== settings.tts.provider ||
        model !== settings.tts.model ||
        voice !== settings.tts.voice ||
        apiKey.trim().length > 0
      }
      onSubmit={submit}
      onTest={() => testSection('tts', payload())}
    >
      <Field>
        <FieldLabel htmlFor="tts-provider">Provider</FieldLabel>
        <ProviderSelect
          id="tts-provider"
          value={provider}
          options={TTS_PROVIDERS}
          onChange={changeProvider}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="tts-model">Model</FieldLabel>
        <Input
          id="tts-model"
          value={model}
          placeholder={defaults?.defaultModel}
          onChange={(event) => setModel(event.target.value)}
          required
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="tts-voice">Voice</FieldLabel>
        <Input
          id="tts-voice"
          value={voice}
          placeholder={defaults?.defaultVoice}
          onChange={(event) => setVoice(event.target.value)}
          required
        />
        <FieldDescription>
          {provider === 'elevenlabs' ? 'The voice id from your ElevenLabs library.' : 'A MiniMax voice name.'}{' '}
          <Link to="/admin/voices" className="text-primary underline underline-offset-2">
            Browse and preview voices
          </Link>
          .
        </FieldDescription>
      </Field>
      <KeyField
        id="tts-key"
        providerKey={providerKey}
        value={apiKey}
        onChange={setApiKey}
        replacing={replacing}
        onReplacingChange={setReplacing}
      />
    </Section>
  )
}

function EmbeddingSection({ settings }: { settings: LlmSettings }) {
  const saveEmbedding = useLlmStore((state) => state.saveEmbedding)
  const testSection = useLlmStore((state) => state.testSection)
  const [model, setModel] = useState(settings.embedding.model)
  const [apiKey, setApiKey] = useState('')
  const [replacing, setReplacing] = useState(false)
  const providerKey = keyOf(settings, settings.embedding.provider)

  const payload = () => ({
    model: model.trim(),
    ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
  })

  async function submit() {
    try {
      await saveEmbedding(payload())
      setApiKey('')
      setReplacing(false)
      toast.success('Embeddings saved')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not save the embedding model'))
    }
  }

  return (
    <Section
      title="Embeddings"
      description="Indexes and searches the Intelligence Hub, on the OpenAI account."
      section="embedding"
      running={settings.embedding.model}
      ready={providerKey?.hasKey ?? false}
      dirty={model !== settings.embedding.model || apiKey.trim().length > 0}
      onSubmit={submit}
      onTest={() => testSection('embedding', payload())}
    >
      <ProviderRow
        name={providerKey?.name ?? settings.embedding.provider}
        note="Embeddings run on the OpenAI account. Changing provider would mean re-indexing everything."
      />

      <Field>
        <FieldLabel htmlFor="embedding-model">Model</FieldLabel>
        <Input
          id="embedding-model"
          value={model}
          placeholder="text-embedding-3-small"
          onChange={(event) => setModel(event.target.value)}
          required
        />
        <FieldDescription>
          Changing this means every Intelligence Hub document has to be indexed again, because vectors from
          different models cannot be compared.
        </FieldDescription>
      </Field>
      <KeyField
        id="embedding-key"
        providerKey={providerKey}
        value={apiKey}
        onChange={setApiKey}
        replacing={replacing}
        onReplacingChange={setReplacing}
      />
    </Section>
  )
}

export function LlmSettingsPage() {
  const settings = useLlmStore((state) => state.settings)
  const loading = useLlmStore((state) => state.loading)
  const fetchSettings = useLlmStore((state) => state.fetchSettings)

  useEffect(() => {
    void fetchSettings().catch((error: unknown) => {
      toast.error(getApiErrorMessage(error, 'Could not load the AI settings'))
    })
  }, [fetchSettings])

  return (
    <AdminLayout title="AI models">
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="font-heading text-2xl font-bold">AI models</h2>
          <p className="text-sm text-muted-foreground">
            Every API key and model the app runs on. A key is encrypted before it is stored and never shown
            again, and each save is tested against the provider first.
          </p>
        </div>

        {!settings && loading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-64 w-full" />
            ))}
          </div>
        ) : settings ? (
          <Tabs defaultValue="chat">
            {/* Five labels do not fit a phone, so the row scrolls rather than wraps. */}
            <div className="-mx-1 overflow-x-auto px-1 pb-1">
              <TabsList className="w-full min-w-max">
                {TABS.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value}>
                    {sectionReady(settings, tab.value) ? null : (
                      <TriangleAlertIcon className="text-destructive" />
                    )}
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value="chat">
              <ChatSection
                key={`chat-${settings.chat.provider}-${settings.chat.model}`}
                settings={settings}
              />
            </TabsContent>
            <TabsContent value="voice">
              <VoiceSection
                key={`voice-${settings.voice.provider ?? 'same'}-${settings.voice.model ?? ''}`}
                settings={settings}
              />
            </TabsContent>
            <TabsContent value="stt">
              <SttSection key={`stt-${settings.stt.provider}-${settings.stt.model}`} settings={settings} />
            </TabsContent>
            <TabsContent value="tts">
              <TtsSection
                key={`tts-${settings.tts.provider}-${settings.tts.model}-${settings.tts.voice}`}
                settings={settings}
              />
            </TabsContent>
            <TabsContent value="embedding">
              <EmbeddingSection key={`embedding-${settings.embedding.model}`} settings={settings} />
            </TabsContent>
          </Tabs>
        ) : null}
      </div>
    </AdminLayout>
  )
}
