import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { getApiErrorMessage } from '@/lib/api'
import { ChatSidebar } from '@/modules/chat/chat-sidebar'
import { useAgentStore } from '@/stores/agent-store'
import type { Agent } from '@/types/api'
import { AgentCard } from './agent-card'

export function AgentsPage() {
  const agents = useAgentStore((state) => state.agents)
  const loaded = useAgentStore((state) => state.loaded)
  const fetchAgents = useAgentStore((state) => state.fetchAgents)
  const navigate = useNavigate()

  // Re-read on every visit: an admin may have added, changed or turned off an agent since.
  useEffect(() => {
    void fetchAgents().catch((error: unknown) => {
      toast.error(getApiErrorMessage(error, 'Could not load your agents'))
    })
  }, [fetchAgents])

  function handleChat(agent: Agent) {
    navigate(`/chat?agent=${agent.id}`)
  }

  return (
    <SidebarProvider>
      <ChatSidebar />
      <SidebarInset>
        <div className="flex h-svh flex-col">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
            <SidebarTrigger />
            <h1 className="text-sm font-medium">Agents</h1>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-5xl space-y-8 px-6 py-10">
              <div className="space-y-2">
                <h2 className="font-heading text-3xl font-bold">Your agents</h2>
                <p className="text-sm text-muted-foreground">Pick an agent to start a new chat with it.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {loaded
                  ? agents.map((agent) => <AgentCard key={agent.id} agent={agent} onChat={handleChat} />)
                  : [0, 1].map((key) => <Skeleton key={key} className="min-h-56 rounded-xl" />)}
              </div>
            </div>
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
