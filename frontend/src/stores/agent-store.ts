import { create } from 'zustand'
import { api } from '@/lib/api'
import type { Agent, AgentListPayload, ApiSuccessResponse } from '@/types/api'

interface AgentState {
  agents: Agent[]
  loading: boolean
  loaded: boolean
  fetchAgents: () => Promise<void>
  reset: () => void
}

/** The agents an admin made available to this user. Re-read on each visit to a page that shows them. */
export const useAgentStore = create<AgentState>((set) => ({
  agents: [],
  loading: false,
  loaded: false,

  fetchAgents: async () => {
    set({ loading: true })
    try {
      const { data } = await api.get<ApiSuccessResponse<AgentListPayload>>('/agents')
      set({ agents: data.data.agents, loaded: true })
    } finally {
      set({ loading: false })
    }
  },

  reset: () => {
    set({ agents: [], loading: false, loaded: false })
  },
}))

/**
 * The agent asked for, or for a plain new chat the first one that is on. The list
 * comes default first, so that is the default unless an admin turned it off.
 */
export function findAgent(agents: Agent[], agentId: string | null): Agent | undefined {
  return agentId ? agents.find((agent) => agent.id === agentId) : agents.find((agent) => agent.enabled)
}
