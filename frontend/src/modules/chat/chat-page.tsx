import { useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { getApiErrorMessage } from '@/lib/api'
import { useAgentStore } from '@/stores/agent-store'
import { useLlmStore } from '@/stores/llm-store'
import { useChatStore } from '@/stores/chat-store'
import { ChatSidebar } from './chat-sidebar'
import { ChatWindow } from './chat-window'
import { warmVoiceAssets } from './voice-assets'

export function ChatPage() {
  const { conversationId } = useParams<{ conversationId?: string }>()
  const [searchParams] = useSearchParams()
  const agentParam = searchParams.get('agent')

  const openConversation = useChatStore((state) => state.openConversation)
  const startNewChat = useChatStore((state) => state.startNewChat)
  const agents = useAgentStore((state) => state.agents)
  const agentsLoaded = useAgentStore((state) => state.loaded)
  const fetchAgents = useAgentStore((state) => state.fetchAgents)
  const fetchLlmStatus = useLlmStore((state) => state.fetchStatus)
  const navigate = useNavigate()

  // Re-read on every visit: an admin may have turned an agent on or off since.
  useEffect(() => {
    void fetchAgents().catch((error: unknown) => {
      toast.error(getApiErrorMessage(error, 'Could not load your agents'))
    })
  }, [fetchAgents])

  // An API key an admin has not set up yet breaks chat or voice, so everyone is told once.
  useEffect(() => {
    void fetchLlmStatus().then(() => {
      for (const warning of useLlmStore.getState().warnings) {
        toast.warning(warning.message)
      }
    })
  }, [fetchLlmStatus])

  // Voice mode's runtime is heavy, so it is fetched quietly now rather than when
  // the user presses the button and waits for it.
  useEffect(() => {
    warmVoiceAssets()
  }, [])

  // The URL is the source of truth: /chat/:id opens a chat, /chat?agent=<id> starts one
  // with that agent, and a bare /chat starts one with the default agent.
  useEffect(() => {
    if (!conversationId) {
      startNewChat(agentParam)
      return
    }
    void openConversation(conversationId).catch((error: unknown) => {
      toast.error(getApiErrorMessage(error, 'That conversation could not be opened'))
      navigate('/chat', { replace: true })
    })
  }, [conversationId, agentParam, openConversation, startNewChat, navigate])

  // A hand edited, stale or switched off ?agent= falls back to the default instead of failing on send.
  useEffect(() => {
    if (agentsLoaded && agentParam && !agents.some((agent) => agent.id === agentParam && agent.enabled)) {
      navigate('/chat', { replace: true })
    }
  }, [agentsLoaded, agentParam, agents, navigate])

  return (
    <SidebarProvider>
      <ChatSidebar />
      <SidebarInset>
        <ChatWindow />
      </SidebarInset>
    </SidebarProvider>
  )
}
