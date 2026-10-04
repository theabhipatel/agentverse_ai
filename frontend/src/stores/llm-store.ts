import { create } from 'zustand'
import { api } from '@/lib/api'
import type {
  ApiSuccessResponse,
  ChatModelInput,
  EmbeddingInput,
  LlmSection,
  LlmSettings,
  LlmSettingsPayload,
  LlmStatusPayload,
  LlmWarning,
  SttInput,
  TtsInput,
  VoiceListPayload,
  VoiceModelInput,
  VoiceOption,
} from '@/types/api'

interface LlmState {
  /** Admin only: the providers and models behind the app. */
  settings: LlmSettings | null
  loading: boolean
  saving: boolean
  testing: LlmSection | null
  /** Every user: what has no API key, shown once per session as a toast. */
  warnings: LlmWarning[]
  statusChecked: boolean
  /** The current text to speech provider's voice library, for the voice picker. */
  voices: VoiceOption[]
  voicesLoading: boolean
  fetchSettings: () => Promise<void>
  saveChat: (input: ChatModelInput) => Promise<void>
  saveVoice: (input: VoiceModelInput) => Promise<void>
  saveStt: (input: SttInput) => Promise<void>
  saveTts: (input: TtsInput) => Promise<void>
  saveEmbedding: (input: EmbeddingInput) => Promise<void>
  testSection: (section: LlmSection, input: unknown) => Promise<void>
  fetchStatus: () => Promise<void>
  fetchVoices: () => Promise<void>
  /** Synthesizes a short sample line in this voice and returns its raw PCM. */
  previewVoice: (voice: string) => Promise<ArrayBuffer>
  reset: () => void
}

export const useLlmStore = create<LlmState>((set, get) => {
  const save = async (section: Exclude<LlmSection, never>, input: unknown) => {
    set({ saving: true })
    try {
      const { data } = await api.put<ApiSuccessResponse<LlmSettingsPayload>>(`/admin/llm/${section}`, input)
      set({ settings: data.data.settings })
    } finally {
      set({ saving: false })
    }
  }

  return {
    settings: null,
    loading: false,
    saving: false,
    testing: null,
    warnings: [],
    statusChecked: false,
    voices: [],
    voicesLoading: false,

    fetchSettings: async () => {
      set({ loading: true })
      try {
        const { data } = await api.get<ApiSuccessResponse<LlmSettingsPayload>>('/admin/llm')
        set({ settings: data.data.settings })
      } finally {
        set({ loading: false })
      }
    },

    saveChat: (input) => save('chat', input),
    saveVoice: (input) => save('voice', input),
    saveStt: (input) => save('stt', input),
    saveTts: (input) => save('tts', input),
    saveEmbedding: (input) => save('embedding', input),

    /** Tries the values the admin is looking at, saved or not. Writes nothing. */
    testSection: async (section, input) => {
      set({ testing: section })
      try {
        await api.post(`/admin/llm/test/${section}`, input)
      } finally {
        set({ testing: null })
      }
    },

    fetchStatus: async () => {
      if (get().statusChecked) {
        return
      }
      // Marked before the call, so a second page does not ask again while this one waits.
      set({ statusChecked: true })
      try {
        const { data } = await api.get<ApiSuccessResponse<LlmStatusPayload>>('/llm/status')
        set({ warnings: data.data.warnings })
      } catch {
        set({ statusChecked: false })
      }
    },

    fetchVoices: async () => {
      set({ voicesLoading: true })
      try {
        const { data } = await api.get<ApiSuccessResponse<VoiceListPayload>>('/admin/llm/tts/voices')
        set({ voices: data.data.voices })
      } finally {
        set({ voicesLoading: false })
      }
    },

    previewVoice: async (voice) => {
      const response = await api.post<ArrayBuffer>(
        '/admin/llm/tts/preview',
        { voice },
        { responseType: 'arraybuffer' },
      )
      return response.data
    },

    reset: () => {
      set({
        settings: null,
        warnings: [],
        statusChecked: false,
        loading: false,
        saving: false,
        testing: null,
        voices: [],
        voicesLoading: false,
      })
    },
  }
})
