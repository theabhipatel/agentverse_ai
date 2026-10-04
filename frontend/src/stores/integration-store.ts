import { create } from 'zustand'
import { api } from '@/lib/api'
import type {
  ApiSuccessResponse,
  ConnectIntegrationPayload,
  Integration,
  IntegrationListPayload,
  ToolkitSlug,
} from '@/types/api'

interface IntegrationState {
  integrations: Integration[]
  loading: boolean
  loaded: boolean
  pendingSlug: ToolkitSlug | null
  fetchIntegrations: () => Promise<void>
  connect: (slug: ToolkitSlug) => Promise<string>
  disconnect: (slug: ToolkitSlug) => Promise<void>
  reset: () => void
}

export const useIntegrationStore = create<IntegrationState>((set) => ({
  integrations: [],
  loading: false,
  loaded: false,
  pendingSlug: null,

  fetchIntegrations: async () => {
    set({ loading: true })
    try {
      const { data } = await api.get<ApiSuccessResponse<IntegrationListPayload>>('/integrations')
      set({ integrations: data.data.integrations, loaded: true })
    } finally {
      set({ loading: false })
    }
  },

  /** Returns the Composio URL the browser must be sent to. */
  connect: async (slug) => {
    set({ pendingSlug: slug })
    try {
      const { data } = await api.post<ApiSuccessResponse<ConnectIntegrationPayload>>(
        `/integrations/${slug}/connect`,
      )
      return data.data.redirectUrl
    } catch (error) {
      set({ pendingSlug: null })
      throw error
    }
  },

  disconnect: async (slug) => {
    set({ pendingSlug: slug })
    try {
      await api.delete(`/integrations/${slug}`)
      set((state) => ({
        integrations: state.integrations.map((item) =>
          item.slug === slug ? { ...item, status: 'not_connected', connected: false } : item,
        ),
      }))
    } finally {
      set({ pendingSlug: null })
    }
  },

  reset: () => {
    set({ integrations: [], loaded: false, pendingSlug: null })
  },
}))
