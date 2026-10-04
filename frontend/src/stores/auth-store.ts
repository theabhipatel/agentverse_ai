import { create } from 'zustand'
import { api, refreshAccessToken, setUnauthorizedHandler } from '@/lib/api'
import { clearAccessToken, setAccessToken } from '@/lib/token'
import { useAgentStore } from './agent-store'
import { useChatStore } from './chat-store'
import { useAdminStore } from './admin-store'
import { useIntegrationStore } from './integration-store'
import { useKnowledgeStore } from './knowledge-store'
import { useLlmStore } from './llm-store'
import type {
  ApiSuccessResponse,
  AuthPayload,
  ChangePasswordInput,
  LoginInput,
  MePayload,
  RegisterInput,
  UpdateProfileInput,
  User,
} from '@/types/api'

export type AuthStatus = 'unknown' | 'authenticated' | 'unauthenticated'

interface AuthState {
  user: User | null
  status: AuthStatus
  bootstrap: () => Promise<void>
  login: (input: LoginInput) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  updateProfile: (input: UpdateProfileInput) => Promise<void>
  changePassword: (input: ChangePasswordInput) => Promise<void>
  logout: () => Promise<void>
  clearSession: () => void
}

/**
 * Global auth state. API calls live here next to the state they own,
 * there is no separate service layer for a prototype this size.
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'unknown',

  /**
   * Runs once on app start and after a Google redirect. Memory holds no token
   * yet, so the httpOnly refresh cookie is exchanged for one before anything renders.
   */
  bootstrap: async () => {
    try {
      await refreshAccessToken()
      const { data } = await api.get<ApiSuccessResponse<MePayload>>('/auth/me')
      set({ user: data.data.user, status: 'authenticated' })
    } catch {
      clearAccessToken()
      set({ user: null, status: 'unauthenticated' })
    }
  },

  login: async (input) => {
    const { data } = await api.post<ApiSuccessResponse<AuthPayload>>('/auth/login', input)
    setAccessToken(data.data.accessToken)
    set({ user: data.data.user, status: 'authenticated' })
  },

  register: async (input) => {
    const { data } = await api.post<ApiSuccessResponse<AuthPayload>>('/auth/register', input)
    setAccessToken(data.data.accessToken)
    set({ user: data.data.user, status: 'authenticated' })
  },

  updateProfile: async (input) => {
    const { data } = await api.patch<ApiSuccessResponse<MePayload>>('/auth/me', input)
    set({ user: data.data.user })
  },

  /** The backend revokes every session and hands this one a fresh pair, so keep it. */
  changePassword: async (input) => {
    const { data } = await api.post<ApiSuccessResponse<AuthPayload>>('/auth/change-password', input)
    setAccessToken(data.data.accessToken)
    set({ user: data.data.user })
  },

  logout: async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      clearAccessToken()
      useChatStore.getState().reset()
      useAgentStore.getState().reset()
      useIntegrationStore.getState().reset()
      useAdminStore.getState().reset()
      useKnowledgeStore.getState().reset()
      useLlmStore.getState().reset()
      set({ user: null, status: 'unauthenticated' })
    }
  },

  clearSession: () => {
    clearAccessToken()
    useChatStore.getState().reset()
    useAgentStore.getState().reset()
    useIntegrationStore.getState().reset()
    useAdminStore.getState().reset()
    useKnowledgeStore.getState().reset()
    useLlmStore.getState().reset()
    set({ user: null, status: 'unauthenticated' })
  },
}))

// A refresh that fails mid session drops the user straight back to unauthenticated.
setUnauthorizedHandler(() => {
  useAuthStore.getState().clearSession()
})
