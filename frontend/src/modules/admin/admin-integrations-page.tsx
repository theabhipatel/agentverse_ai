import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { getApiErrorMessage } from '@/lib/api'
import { INTEGRATION_ICONS } from '@/modules/integration/integration-icons'
import { useAdminStore } from '@/stores/admin-store'
import type { AdminIntegration } from '@/types/api'
import { AdminLayout } from './admin-layout'

function connectedLabel(count: number): string {
  return count === 1 ? '1 user connected' : `${count} users connected`
}

function confirmDescription(integration: AdminIntegration): string {
  const { name, connectedUsers } = integration
  if (integration.enabled) {
    const affected = connectedUsers > 0 ? `, including for the ${connectedLabel(connectedUsers)}` : ''
    return `${name} will be hidden from every user and the agent will stop using it${affected}. Their connections are kept, so turning it back on restores it without reconnecting.`
  }
  const restored =
    connectedUsers > 0 ? ` Users who already connected it can use it right away, without reconnecting.` : ''
  return `${name} will be visible to every user again.${restored}`
}

export function AdminIntegrationsPage() {
  const integrations = useAdminStore((state) => state.integrations)
  const loading = useAdminStore((state) => state.integrationsLoading)
  const saving = useAdminStore((state) => state.saving)
  const fetchIntegrations = useAdminStore((state) => state.fetchIntegrations)
  const setIntegrationEnabled = useAdminStore((state) => state.setIntegrationEnabled)

  // The switch only moves once the admin confirms, so the flipped row waits here.
  const [pending, setPending] = useState<AdminIntegration | null>(null)

  useEffect(() => {
    void fetchIntegrations().catch((error: unknown) => {
      toast.error(getApiErrorMessage(error, 'Could not load integrations'))
    })
  }, [fetchIntegrations])

  async function handleConfirm() {
    if (!pending) {
      return
    }
    const enabling = !pending.enabled
    try {
      await setIntegrationEnabled(pending.slug, enabling)
      toast.success(`${pending.name} turned ${enabling ? 'on' : 'off'}`)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not update the integration'))
    } finally {
      setPending(null)
    }
  }

  return (
    <AdminLayout title="Integrations">
      <div className="space-y-8">
        <div className="space-y-1">
          <h2 className="font-heading text-2xl font-bold">Integrations</h2>
          <p className="text-sm text-muted-foreground">
            Turn an integration off to hide it from every user and stop the agent using it. Users keep their
            connections, so turning it back on needs no reconnecting.
          </p>
        </div>

        {loading && integrations.length === 0 ? (
          <div className="space-y-3">
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {integrations.map((integration) => {
              const Icon = INTEGRATION_ICONS[integration.slug]
              return (
                <Item key={integration.slug} variant="outline">
                  <ItemMedia variant="icon">
                    <Icon />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>
                      {integration.name}
                      <Badge variant={integration.enabled ? 'default' : 'outline'}>
                        {integration.enabled ? 'On' : 'Off'}
                      </Badge>
                    </ItemTitle>
                    <ItemDescription>
                      {integration.description} {connectedLabel(integration.connectedUsers)}.
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Switch
                      checked={integration.enabled}
                      onCheckedChange={() => setPending(integration)}
                      aria-label={`${integration.enabled ? 'Turn off' : 'Turn on'} ${integration.name}`}
                    />
                  </ItemActions>
                </Item>
              )
            })}
          </div>
        )}
      </div>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setPending(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.enabled ? 'Turn off' : 'Turn on'} {pending?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>{pending ? confirmDescription(pending) : null}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={pending?.enabled ? 'destructive' : 'default'}
              disabled={saving}
              onClick={handleConfirm}
            >
              {saving ? <Spinner /> : null}
              {pending?.enabled ? 'Turn off' : 'Turn on'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  )
}
