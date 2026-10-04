import { useState, type FormEvent } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import type {
  AdminIntegration,
  AdminUser,
  CreateUserInput,
  ToolkitSlug,
  UpdateUserInput,
  UserRole,
} from '@/types/api'

interface UserFormDialogProps {
  open: boolean
  user: AdminUser | null
  /** What to offer in the checklist. A toolkit an admin has switched off platform wide is still offered here: it stays off for the user either way, but this list is what the user's access is set against. */
  integrations: AdminIntegration[]
  saving: boolean
  onClose: () => void
  onCreate: (input: CreateUserInput) => Promise<void>
  onUpdate: (userId: string, input: UpdateUserInput) => Promise<void>
}

function sameToolkits(a: ToolkitSlug[], b: ToolkitSlug[]): boolean {
  return a.length === b.length && a.every((slug) => b.includes(slug))
}

/**
 * One dialog for both create and edit. On edit, an empty password means "leave
 * it alone". The parent remounts this with a key, so initial state comes
 * straight from props and there is no state syncing effect.
 */
export function UserFormDialog({
  open,
  user,
  integrations,
  saving,
  onClose,
  onCreate,
  onUpdate,
}: UserFormDialogProps) {
  const isEdit = user !== null
  const allSlugs = integrations.map((integration) => integration.slug)
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>(user?.role ?? 'user')
  // All checked by default for a new user. An existing user starts from what an admin already chose.
  const [toolkits, setToolkits] = useState<ToolkitSlug[]>(user?.allowedToolkits ?? allSlugs)

  function toggleToolkit(slug: ToolkitSlug, checked: boolean) {
    setToolkits((current) => (checked ? [...current, slug] : current.filter((item) => item !== slug)))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isEdit) {
      const changes: UpdateUserInput = {}
      if (name !== user.name) changes.name = name
      if (email !== user.email) changes.email = email
      if (role !== user.role) changes.role = role
      if (password.length > 0) changes.password = password
      if (!sameToolkits(toolkits, user.allowedToolkits)) changes.toolkits = toolkits
      if (Object.keys(changes).length === 0) {
        onClose()
        return
      }
      await onUpdate(user.id, changes)
      return
    }
    await onCreate({ name, email, password, role, toolkits })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit user' : 'New user'}</DialogTitle>
            <DialogDescription>
              {isEdit ? 'Update this account and its role.' : 'Create an account and set its role.'}
            </DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor="admin-name">Name</FieldLabel>
            <Input id="admin-name" value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>

          <Field>
            <FieldLabel htmlFor="admin-email">Email</FieldLabel>
            <Input
              id="admin-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="admin-password">Password</FieldLabel>
            <Input
              id="admin-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required={!isEdit}
              placeholder={isEdit ? 'Leave blank to keep current' : 'At least 4 characters'}
            />
            {isEdit ? <FieldDescription>Only filled in if you want to change it.</FieldDescription> : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="admin-role">Role</FieldLabel>
            <Select value={role} onValueChange={(value) => setRole(value as UserRole)}>
              <SelectTrigger id="admin-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel>Integrations</FieldLabel>
            <div className="space-y-2 rounded-md border border-input p-3">
              {integrations.map((integration) => {
                const checked = toolkits.includes(integration.slug)
                const inputId = `admin-toolkit-${integration.slug}`
                return (
                  <label key={integration.slug} htmlFor={inputId} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      id={inputId}
                      checked={checked}
                      onCheckedChange={(next) => toggleToolkit(integration.slug, next === true)}
                    />
                    {integration.name}
                  </label>
                )
              })}
            </div>
            <FieldDescription>
              Which integrations this user can see and connect. All are allowed by default.
            </FieldDescription>
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner /> : null}
              {isEdit ? 'Save changes' : 'Create user'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
