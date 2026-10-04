import { useEffect } from 'react'
import { toast } from 'sonner'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { getApiErrorMessage } from '@/lib/api'
import { ChatSidebar } from '@/modules/chat/chat-sidebar'
import { useIntegrationStore } from '@/stores/integration-store'
import type { ToolkitSlug } from '@/types/api'
import { IntegrationCard } from './integration-card'

export function IntegrationsPage() {
  const integrations = useIntegrationStore((state) => state.integrations)
  const loading = useIntegrationStore((state) => state.loading)
  const loaded = useIntegrationStore((state) => state.loaded)
  const pendingSlug = useIntegrationStore((state) => state.pendingSlug)
  const fetchIntegrations = useIntegrationStore((state) => state.fetchIntegrations)
  const connect = useIntegrationStore((state) => state.connect)
  const disconnect = useIntegrationStore((state) => state.disconnect)

  // Composio sends the browser back here, so a fresh load always re-reads status.
  useEffect(() => {
    void fetchIntegrations().catch((error: unknown) => {
      toast.error(getApiErrorMessage(error, 'Could not load your integrations'))
    })
  }, [fetchIntegrations])

  async function handleConnect(slug: ToolkitSlug) {
    try {
      const redirectUrl = await connect(slug)
      window.location.assign(redirectUrl)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not start the connection'))
    }
  }

  async function handleDisconnect(slug: ToolkitSlug) {
    try {
      await disconnect(slug)
      toast.success('Integration disconnected')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not disconnect'))
    }
  }

  const connected = integrations.filter((item) => item.connected)
  const available = integrations.filter((item) => !item.connected)

  return (
    <SidebarProvider>
      <ChatSidebar />
      <SidebarInset>
        <div className="flex h-svh flex-col">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
            <SidebarTrigger />
            <h1 className="text-sm font-medium">Integrations</h1>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-5xl space-y-10 px-6 py-10">
              <div className="space-y-2">
                <h2 className="font-heading text-3xl font-bold">Integrations</h2>
                <p className="text-sm text-muted-foreground">
                  Connect an app and the agent can act inside it on your behalf. Connections belong to
                  your account only.
                </p>
              </div>

              {loading && integrations.length === 0 ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((key) => (
                    <Skeleton key={key} className="h-16 w-full" />
                  ))}
                </div>
              ) : loaded && integrations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No integrations are available right now.</p>
              ) : (
                <>
                  {connected.length > 0 ? (
                    <section className="space-y-3">
                      <h3 className="text-sm font-medium text-muted-foreground">Connected</h3>
                      {connected.map((integration) => (
                        <IntegrationCard
                          key={integration.slug}
                          integration={integration}
                          busy={pendingSlug === integration.slug}
                          onConnect={() => handleConnect(integration.slug)}
                          onDisconnect={() => handleDisconnect(integration.slug)}
                        />
                      ))}
                    </section>
                  ) : null}

                  {available.length > 0 ? (
                    <section className="space-y-3">
                      <h3 className="text-sm font-medium text-muted-foreground">Available</h3>
                      {available.map((integration) => (
                        <IntegrationCard
                          key={integration.slug}
                          integration={integration}
                          busy={pendingSlug === integration.slug}
                          onConnect={() => handleConnect(integration.slug)}
                          onDisconnect={() => handleDisconnect(integration.slug)}
                        />
                      ))}
                    </section>
                  ) : null}
                </>
              )}
            </div>
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
