import { useEffect, useState } from 'react'
import {
  BrainCircuitIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlugIcon,
  PlusIcon,
  Trash2Icon,
  UsersIcon,
} from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { getApiErrorMessage } from '@/lib/api'
import { useAdminStore } from '@/stores/admin-store'
import type { AdminAgent, AgentFormInput } from '@/types/api'
import { AdminLayout } from './admin-layout'
import { AgentFormDialog } from './agent-form-dialog'

function audienceLabel(agent: AdminAgent): string {
  if (agent.audience === 'all') {
    return 'All users'
  }
  return agent.users.length === 1 ? '1 user' : `${agent.users.length} users`
}

function confirmDescription(agent: AdminAgent): string {
  const who = agent.audience === 'all' ? 'every user' : 'everyone who can use it'
  if (agent.enabled) {
    const fallback = agent.isDefault ? ' New chats will use the next agent that is on.' : ''
    return `${agent.name} will be turned off for ${who}. They can still open their chats with it, but cannot send messages or start new chats with it.${fallback}`
  }
  return `${agent.name} will be available to ${who} again, and their chats with it can continue where they left off.`
}

interface DialogState {
  agent: AdminAgent | null
}

export function AdminAgentsPage() {
  const agents = useAdminStore((state) => state.agents)
  const loading = useAdminStore((state) => state.agentsLoading)
  const saving = useAdminStore((state) => state.saving)
  const users = useAdminStore((state) => state.users)
  const fetchAgents = useAdminStore((state) => state.fetchAgents)
  const fetchUsers = useAdminStore((state) => state.fetchUsers)
  const createAgent = useAdminStore((state) => state.createAgent)
  const updateAgent = useAdminStore((state) => state.updateAgent)
  const setAgentEnabled = useAdminStore((state) => state.setAgentEnabled)
  const deleteAgent = useAdminStore((state) => state.deleteAgent)

  const [dialog, setDialog] = useState<DialogState | null>(null)
  // The switch only moves once the admin confirms, so the flipped row waits here.
  const [pendingSwitch, setPendingSwitch] = useState<AdminAgent | null>(null)
  const [pendingDelete, setPendingDelete] = useState<AdminAgent | null>(null)

  const defaultAgentName = agents.find((agent) => agent.isDefault)?.name ?? 'the default agent'
  const userOptions = users.map((user) => ({ id: user.id, name: user.name, email: user.email }))

  useEffect(() => {
    void fetchAgents().catch((error: unknown) => {
      toast.error(getApiErrorMessage(error, 'Could not load agents'))
    })
    // For the user picker in the agent form.
    void fetchUsers().catch((error: unknown) => {
      toast.error(getApiErrorMessage(error, 'Could not load users'))
    })
  }, [fetchAgents, fetchUsers])

  async function handleSubmit(input: AgentFormInput) {
    if (!dialog) {
      return
    }
    try {
      if (dialog.agent) {
        await updateAgent(dialog.agent.id, input)
        toast.success(`${input.name} updated`)
      } else {
        await createAgent(input)
        toast.success(`${input.name} created`)
      }
      setDialog(null)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not save the agent'))
    }
  }

  async function handleSwitch() {
    if (!pendingSwitch) {
      return
    }
    const enabling = !pendingSwitch.enabled
    try {
      await setAgentEnabled(pendingSwitch.id, enabling)
      toast.success(`${pendingSwitch.name} turned ${enabling ? 'on' : 'off'}`)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not update the agent'))
    } finally {
      setPendingSwitch(null)
    }
  }

  async function handleDelete() {
    if (!pendingDelete) {
      return
    }
    try {
      await deleteAgent(pendingDelete.id)
      toast.success(`${pendingDelete.name} deleted`)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not delete the agent'))
    } finally {
      setPendingDelete(null)
    }
  }

  return (
    <AdminLayout title="Agents">
      <div className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-heading text-2xl font-bold">Agents</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Create and manage the agents your users chat with. Turning one off stops everyone chatting with
              it, while their chats stay readable.
            </p>
          </div>
          <Button onClick={() => setDialog({ agent: null })}>
            <PlusIcon />
            New agent
          </Button>
        </div>

        {loading && agents.length === 0 ? (
          <div className="space-y-3">
            {[0, 1].map((key) => (
              <Skeleton key={key} className="h-20 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map((agent) => (
              <Item key={agent.id} variant="outline">
                <ItemMedia variant="icon" className="text-xl" aria-hidden>
                  {agent.emoji}
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>
                    {agent.name}
                    {agent.isDefault ? (
                      <Badge variant="secondary">Default</Badge>
                    ) : agent.isBuiltIn ? (
                      <Badge variant="secondary">Built in</Badge>
                    ) : null}
                    <Badge variant={agent.enabled ? 'default' : 'outline'}>
                      {agent.enabled ? 'On' : 'Off'}
                    </Badge>
                  </ItemTitle>
                  <ItemDescription>{agent.description}</ItemDescription>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Badge variant="outline">
                      <UsersIcon />
                      {audienceLabel(agent)}
                    </Badge>
                    {agent.usesIntelligenceHub ? (
                      <Badge variant="outline">
                        <BrainCircuitIcon />
                        Intelligence Hub
                      </Badge>
                    ) : null}
                    <Badge variant="outline">
                      <PlugIcon />
                      {agent.usesIntegrations ? 'Integrations' : 'No integrations'}
                    </Badge>
                  </div>
                </ItemContent>
                <ItemActions>
                  <Switch
                    checked={agent.enabled}
                    onCheckedChange={() => setPendingSwitch(agent)}
                    aria-label={`${agent.enabled ? 'Turn off' : 'Turn on'} ${agent.name}`}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${agent.name}`}>
                          <MoreHorizontalIcon />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onClick={() => setDialog({ agent })}>
                        <PencilIcon />
                        Edit
                      </DropdownMenuItem>
                      {agent.isBuiltIn ? null : (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => setPendingDelete(agent)}>
                            <Trash2Icon />
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </ItemActions>
              </Item>
            ))}
          </div>
        )}
      </div>

      {dialog ? (
        <AgentFormDialog
          key={dialog.agent?.id ?? 'new'}
          open
          agent={dialog.agent}
          users={userOptions}
          defaultAgentName={defaultAgentName}
          saving={saving}
          onClose={() => setDialog(null)}
          onSubmit={handleSubmit}
        />
      ) : null}

      <AlertDialog
        open={pendingSwitch !== null}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setPendingSwitch(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingSwitch?.enabled ? 'Turn off' : 'Turn on'} {pendingSwitch?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingSwitch ? confirmDescription(pendingSwitch) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={pendingSwitch?.enabled ? 'destructive' : 'default'}
              disabled={saving}
              onClick={handleSwitch}
            >
              {saving ? <Spinner /> : null}
              {pendingSwitch?.enabled ? 'Turn off' : 'Turn on'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setPendingDelete(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Users stop seeing it straight away. Their chats with it are kept and move to {defaultAgentName},
              so they can carry on. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={saving} onClick={handleDelete}>
              {saving ? <Spinner /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  )
}
