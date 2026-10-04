import { create } from 'zustand'
import { api } from '@/lib/api'
import type {
  AdminAgent,
  AdminAgentListPayload,
  AdminAgentPayload,
  AdminIntegration,
  AdminIntegrationListPayload,
  AdminIntegrationPayload,
  AdminStats,
  AdminStatsPayload,
  AdminUser,
  AdminUserListPayload,
  AdminUserPayload,
  AgentFormInput,
  ApiSuccessResponse,
  CreateUserInput,
  SignupSettingPayload,
  ToolkitSlug,
  UpdateUserInput,
} from '@/types/api'

interface AdminState {
  users: AdminUser[]
  stats: AdminStats | null
  integrations: AdminIntegration[]
  agents: AdminAgent[]
  signupEnabled: boolean
  loading: boolean
  statsLoading: boolean
  integrationsLoading: boolean
  agentsLoading: boolean
  signupLoading: boolean
  saving: boolean
  fetchAgents: () => Promise<void>
  createAgent: (input: AgentFormInput) => Promise<void>
  updateAgent: (agentId: string, input: AgentFormInput) => Promise<void>
  setAgentEnabled: (agentId: string, enabled: boolean) => Promise<void>
  deleteAgent: (agentId: string) => Promise<void>
  fetchStats: () => Promise<void>
  fetchUsers: () => Promise<void>
  createUser: (input: CreateUserInput) => Promise<void>
  updateUser: (userId: string, input: UpdateUserInput) => Promise<void>
  deleteUser: (userId: string) => Promise<void>
  fetchIntegrations: () => Promise<void>
  setIntegrationEnabled: (slug: ToolkitSlug, enabled: boolean) => Promise<void>
  fetchSignupSetting: () => Promise<void>
  setSignupEnabled: (enabled: boolean) => Promise<void>
  reset: () => void
}

export const useAdminStore = create<AdminState>((set) => ({
  users: [],
  stats: null,
  integrations: [],
  agents: [],
  signupEnabled: true,
  loading: false,
  statsLoading: false,
  integrationsLoading: false,
  agentsLoading: false,
  signupLoading: false,
  saving: false,

  fetchAgents: async () => {
    set({ agentsLoading: true })
    try {
      const { data } = await api.get<ApiSuccessResponse<AdminAgentListPayload>>('/admin/agents')
      set({ agents: data.data.agents })
    } finally {
      set({ agentsLoading: false })
    }
  },

  createAgent: async (input) => {
    set({ saving: true })
    try {
      const { data } = await api.post<ApiSuccessResponse<AdminAgentPayload>>('/admin/agents', input)
      set((state) => ({ agents: [...state.agents, data.data.agent] }))
    } finally {
      set({ saving: false })
    }
  },

  updateAgent: async (agentId, input) => {
    set({ saving: true })
    try {
      const { data } = await api.put<ApiSuccessResponse<AdminAgentPayload>>(`/admin/agents/${agentId}`, input)
      set((state) => ({
        agents: state.agents.map((agent) => (agent.id === agentId ? data.data.agent : agent)),
      }))
    } finally {
      set({ saving: false })
    }
  },

  setAgentEnabled: async (agentId, enabled) => {
    set({ saving: true })
    try {
      const { data } = await api.patch<ApiSuccessResponse<AdminAgentPayload>>(`/admin/agents/${agentId}`, {
        enabled,
      })
      set((state) => ({
        agents: state.agents.map((agent) => (agent.id === agentId ? data.data.agent : agent)),
      }))
    } finally {
      set({ saving: false })
    }
  },

  deleteAgent: async (agentId) => {
    set({ saving: true })
    try {
      await api.delete(`/admin/agents/${agentId}`)
      set((state) => ({ agents: state.agents.filter((agent) => agent.id !== agentId) }))
    } finally {
      set({ saving: false })
    }
  },

  fetchStats: async () => {
    set({ statsLoading: true })
    try {
      const { data } = await api.get<ApiSuccessResponse<AdminStatsPayload>>('/admin/stats')
      set({ stats: data.data.stats })
    } finally {
      set({ statsLoading: false })
    }
  },

  fetchUsers: async () => {
    set({ loading: true })
    try {
      const { data } = await api.get<ApiSuccessResponse<AdminUserListPayload>>('/admin/users')
      set({ users: data.data.users })
    } finally {
      set({ loading: false })
    }
  },

  createUser: async (input) => {
    set({ saving: true })
    try {
      const { data } = await api.post<ApiSuccessResponse<AdminUserPayload>>('/admin/users', input)
      set((state) => ({ users: [data.data.user, ...state.users] }))
    } finally {
      set({ saving: false })
    }
  },

  updateUser: async (userId, input) => {
    set({ saving: true })
    try {
      const { data } = await api.patch<ApiSuccessResponse<AdminUserPayload>>(`/admin/users/${userId}`, input)
      set((state) => ({
        users: state.users.map((user) => (user.id === userId ? data.data.user : user)),
      }))
    } finally {
      set({ saving: false })
    }
  },

  deleteUser: async (userId) => {
    set({ saving: true })
    try {
      await api.delete(`/admin/users/${userId}`)
      set((state) => ({ users: state.users.filter((user) => user.id !== userId) }))
    } finally {
      set({ saving: false })
    }
  },

  fetchIntegrations: async () => {
    set({ integrationsLoading: true })
    try {
      const { data } = await api.get<ApiSuccessResponse<AdminIntegrationListPayload>>('/admin/integrations')
      set({ integrations: data.data.integrations })
    } finally {
      set({ integrationsLoading: false })
    }
  },

  setIntegrationEnabled: async (slug, enabled) => {
    set({ saving: true })
    try {
      const { data } = await api.patch<ApiSuccessResponse<AdminIntegrationPayload>>(
        `/admin/integrations/${slug}`,
        { enabled },
      )
      set((state) => ({
        integrations: state.integrations.map((integration) =>
          integration.slug === slug ? data.data.integration : integration,
        ),
      }))
    } finally {
      set({ saving: false })
    }
  },

  fetchSignupSetting: async () => {
    set({ signupLoading: true })
    try {
      const { data } = await api.get<ApiSuccessResponse<SignupSettingPayload>>('/admin/settings/signup')
      set({ signupEnabled: data.data.enabled })
    } finally {
      set({ signupLoading: false })
    }
  },

  setSignupEnabled: async (enabled) => {
    set({ saving: true })
    try {
      const { data } = await api.patch<ApiSuccessResponse<SignupSettingPayload>>('/admin/settings/signup', {
        enabled,
      })
      set({ signupEnabled: data.data.enabled })
    } finally {
      set({ saving: false })
    }
  },

  reset: () => {
    set({ users: [], stats: null, integrations: [], agents: [], signupEnabled: true })
  },
}))
