import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from '@/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { AdminAgent, AdminAgentUser, AgentAudience, AgentFormInput } from '@/types/api'

/** The icons an admin picks from. */
const AGENT_EMOJIS = [
  '🤖', '💼', '🧠', '🚀', '🎯', '📊', '📈', '💡', '✍️', '📚',
  '🗓️', '📧', '🛠️', '🔍', '💬', '🧭', '⚡', '🌱', '🎓', '❤️',
]

interface AgentFormDialogProps {
  open: boolean
  agent: AdminAgent | null
  /** Everyone a 'selected' agent can be opened to. */
  users: AdminAgentUser[]
  /** Where the chats of users taken off an agent move to. */
  defaultAgentName: string
  saving: boolean
  onClose: () => void
  onSubmit: (input: AgentFormInput) => Promise<void>
}

function matchesUser(user: AdminAgentUser, query: string): boolean {
  const needle = query.trim().toLowerCase()
  return user.name.toLowerCase().includes(needle) || user.email.toLowerCase().includes(needle)
}

/**
 * One dialog for creating and editing agents. The parent remounts it with a key,
 * so initial state comes straight from props.
 */
export function AgentFormDialog({
  open,
  agent,
  users,
  defaultAgentName,
  saving,
  onClose,
  onSubmit,
}: AgentFormDialogProps) {
  const isEdit = agent !== null
  const isBuiltIn = agent?.isBuiltIn ?? false
  const [emoji, setEmoji] = useState(agent?.emoji ?? AGENT_EMOJIS[0])
  const [name, setName] = useState(agent?.name ?? '')
  const [description, setDescription] = useState(agent?.description ?? '')
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt ?? '')
  const [usesIntelligenceHub, setUsesIntelligenceHub] = useState(agent?.usesIntelligenceHub ?? false)
  const [usesIntegrations, setUsesIntegrations] = useState(agent?.usesIntegrations ?? true)
  const [audience, setAudience] = useState<AgentAudience>(agent?.audience ?? 'all')
  const [selectedUsers, setSelectedUsers] = useState<AdminAgentUser[]>(agent?.users ?? [])
  const [usersError, setUsersError] = useState<string | null>(null)
  const anchor = useComboboxAnchor()

  // An agent's current icon stays pickable even when it is not one of the presets.
  const emojis = agent && !AGENT_EMOJIS.includes(agent.emoji) ? [agent.emoji, ...AGENT_EMOJIS] : AGENT_EMOJIS

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (audience === 'selected' && selectedUsers.length === 0) {
      setUsersError('Select at least one user')
      return
    }
    await onSubmit({
      name: name.trim(),
      emoji,
      description: description.trim(),
      systemPrompt: systemPrompt.trim(),
      usesIntelligenceHub,
      usesIntegrations,
      audience,
      userIds: audience === 'selected' ? selectedUsers.map((user) => user.id) : [],
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{isEdit ? `Edit ${agent.name}` : 'New agent'}</DialogTitle>
            <DialogDescription>
              {isBuiltIn
                ? 'A built in agent. Everything can be changed, but it is always available to every user.'
                : 'Describe what the agent does and choose who can use it.'}
            </DialogDescription>
          </DialogHeader>

          <FieldSet>
            <FieldLegend variant="label">Icon</FieldLegend>
            <div className="flex flex-wrap gap-1.5">
              {emojis.map((option) => (
                <Button
                  key={option}
                  type="button"
                  size="icon"
                  variant={option === emoji ? 'secondary' : 'ghost'}
                  aria-label={`Use ${option} as the icon`}
                  aria-pressed={option === emoji}
                  onClick={() => setEmoji(option)}
                  className={cn('text-lg', option === emoji && 'ring-2 ring-primary')}
                >
                  {option}
                </Button>
              ))}
            </div>
          </FieldSet>

          <Field>
            <FieldLabel htmlFor="agent-name">Name</FieldLabel>
            <Input
              id="agent-name"
              value={name}
              maxLength={60}
              placeholder="Sales Assistant"
              onChange={(event) => setName(event.target.value)}
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="agent-description">Description</FieldLabel>
            <Textarea
              id="agent-description"
              value={description}
              maxLength={300}
              rows={2}
              placeholder="What it helps with, in a sentence or two."
              onChange={(event) => setDescription(event.target.value)}
              required
            />
            <FieldDescription>Shown to users on the Agents page.</FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="agent-prompt">Instructions</FieldLabel>
            <Textarea
              id="agent-prompt"
              value={systemPrompt}
              maxLength={10_000}
              rows={8}
              placeholder="You are a sales assistant for the user. You help them..."
              onChange={(event) => setSystemPrompt(event.target.value)}
              className="max-h-80"
              required
            />
            <FieldDescription>
              The system prompt: who the agent is, its tone and how it works. The rules for integrations and the
              Intelligence Hub are added automatically.
            </FieldDescription>
          </Field>

          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="agent-hub">Intelligence Hub</FieldLabel>
              <FieldDescription>
                Answers questions only from the Intelligence Hub, and lists the documents it used.
              </FieldDescription>
            </FieldContent>
            <Switch id="agent-hub" checked={usesIntelligenceHub} onCheckedChange={setUsesIntelligenceHub} />
          </Field>

          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="agent-integrations">Integrations</FieldLabel>
              <FieldDescription>Can act in the apps each user has connected, such as Gmail or Notion.</FieldDescription>
            </FieldContent>
            <Switch id="agent-integrations" checked={usesIntegrations} onCheckedChange={setUsesIntegrations} />
          </Field>

          {isBuiltIn ? null : (
            <FieldSet>
              <FieldLegend variant="label">Who can use it</FieldLegend>
              <RadioGroup
                value={audience}
                onValueChange={(value) => {
                  if (value === 'all' || value === 'selected') {
                    setAudience(value)
                  }
                }}
              >
                <Field orientation="horizontal">
                  <RadioGroupItem value="all" id="agent-audience-all" />
                  <FieldLabel htmlFor="agent-audience-all" className="font-normal">
                    All users, including new sign ups
                  </FieldLabel>
                </Field>
                <Field orientation="horizontal">
                  <RadioGroupItem value="selected" id="agent-audience-selected" />
                  <FieldLabel htmlFor="agent-audience-selected" className="font-normal">
                    Selected users only
                  </FieldLabel>
                </Field>
              </RadioGroup>

              {audience === 'selected' ? (
                <Field data-invalid={usersError ? true : undefined}>
                  <Combobox
                    multiple
                    autoHighlight
                    items={users}
                    value={selectedUsers}
                    onValueChange={(value) => {
                      setSelectedUsers(value)
                      setUsersError(null)
                    }}
                    itemToStringValue={(user) => user.id}
                    itemToStringLabel={(user) => user.name}
                    isItemEqualToValue={(item, value) => item.id === value.id}
                    filter={matchesUser}
                  >
                    <ComboboxChips ref={anchor} className="w-full">
                      <ComboboxValue>
                        {(values: AdminAgentUser[]) => (
                          <>
                            {values.map((user) => (
                              <ComboboxChip key={user.id}>{user.name}</ComboboxChip>
                            ))}
                            <ComboboxChipsInput
                              aria-label="Search users"
                              placeholder={values.length > 0 ? '' : 'Search users by name or email'}
                            />
                          </>
                        )}
                      </ComboboxValue>
                    </ComboboxChips>
                    <ComboboxContent anchor={anchor}>
                      <ComboboxEmpty>No users found.</ComboboxEmpty>
                      <ComboboxList>
                        {(user: AdminAgentUser) => (
                          <ComboboxItem key={user.id} value={user}>
                            <div className="min-w-0">
                              <p className="truncate">{user.name}</p>
                              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                            </div>
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                  {usersError ? (
                    <FieldError>{usersError}</FieldError>
                  ) : (
                    <FieldDescription>
                      Only these users see this agent.
                      {isEdit ? ` Anyone left out keeps their chats with it, moved to ${defaultAgentName}.` : ''}
                    </FieldDescription>
                  )}
                </Field>
              ) : null}
            </FieldSet>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner /> : null}
              {isEdit ? 'Save changes' : 'Create agent'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
