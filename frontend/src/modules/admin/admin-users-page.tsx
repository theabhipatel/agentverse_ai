import { useEffect, useState } from 'react'
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getApiErrorMessage } from '@/lib/api'
import { useAdminStore } from '@/stores/admin-store'
import { useAuthStore } from '@/stores/auth-store'
import type { AdminUser, CreateUserInput, UpdateUserInput } from '@/types/api'
import { AdminLayout } from './admin-layout'
import { UserFormDialog } from './user-form-dialog'

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

export function AdminUsersPage() {
  const users = useAdminStore((state) => state.users)
  const loading = useAdminStore((state) => state.loading)
  const saving = useAdminStore((state) => state.saving)
  const fetchUsers = useAdminStore((state) => state.fetchUsers)
  const createUser = useAdminStore((state) => state.createUser)
  const updateUser = useAdminStore((state) => state.updateUser)
  const deleteUser = useAdminStore((state) => state.deleteUser)
  // The form needs the toolkit list to offer, not just their slugs.
  const integrations = useAdminStore((state) => state.integrations)
  const fetchIntegrations = useAdminStore((state) => state.fetchIntegrations)
  const signupEnabled = useAdminStore((state) => state.signupEnabled)
  const fetchSignupSetting = useAdminStore((state) => state.fetchSignupSetting)
  const setSignupEnabled = useAdminStore((state) => state.setSignupEnabled)
  const currentUser = useAuthStore((state) => state.user)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null)
  const [togglingSignup, setTogglingSignup] = useState(false)

  useEffect(() => {
    void fetchUsers().catch((error: unknown) => {
      toast.error(getApiErrorMessage(error, 'Could not load users'))
    })
  }, [fetchUsers])

  useEffect(() => {
    void fetchIntegrations().catch((error: unknown) => {
      toast.error(getApiErrorMessage(error, 'Could not load integrations'))
    })
  }, [fetchIntegrations])

  useEffect(() => {
    void fetchSignupSetting().catch((error: unknown) => {
      toast.error(getApiErrorMessage(error, 'Could not load the sign up setting'))
    })
  }, [fetchSignupSetting])

  async function handleToggleSignup(enabled: boolean) {
    setTogglingSignup(true)
    try {
      await setSignupEnabled(enabled)
      toast.success(enabled ? 'Self sign up turned on' : 'Self sign up turned off')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not update sign up'))
    } finally {
      setTogglingSignup(false)
    }
  }

  async function handleCreate(input: CreateUserInput) {
    try {
      await createUser(input)
      toast.success('User created')
      setFormOpen(false)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not create the user'))
    }
  }

  async function handleUpdate(userId: string, input: UpdateUserInput) {
    try {
      await updateUser(userId, input)
      toast.success('User updated')
      setFormOpen(false)
      setEditing(null)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not update the user'))
    }
  }

  async function handleDelete() {
    if (!pendingDelete) {
      return
    }
    try {
      await deleteUser(pendingDelete.id)
      toast.success('User deleted')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not delete the user'))
    } finally {
      setPendingDelete(null)
    }
  }

  return (
    <AdminLayout title="Users">
      <div className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-heading text-2xl font-bold">Users</h2>
            <p className="text-sm text-muted-foreground">
              {users.length} registered {users.length === 1 ? 'account' : 'accounts'}.
            </p>
          </div>
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <PlusIcon />
            New user
          </Button>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">Allow self sign up</p>
            <p className="text-sm text-muted-foreground">
              {signupEnabled
                ? 'Anyone can create their own account on the login page.'
                : 'Sign up is closed. Only admins can create accounts.'}
            </p>
          </div>
          {togglingSignup ? (
            <Spinner className="size-4" />
          ) : (
            <Switch
              checked={signupEnabled}
              onCheckedChange={handleToggleSignup}
              disabled={togglingSignup}
              aria-label={signupEnabled ? 'Turn off self sign up' : 'Turn on self sign up'}
            />
          )}
        </div>

        {loading && users.length === 0 ? (
          <div className="space-y-3">
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Sign in</TableHead>
                  <TableHead className="text-right">Chats</TableHead>
                  <TableHead className="text-right">Apps</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.name}
                      {user.id === currentUser?.id ? (
                        <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>{user.role}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {[user.hasPassword ? 'Password' : null, user.googleLinked ? 'Google' : null]
                        .filter(Boolean)
                        .join(' + ') || 'None'}
                    </TableCell>
                    <TableCell className="text-right">{user.conversationCount}</TableCell>
                    <TableCell className="text-right">{user.integrationCount}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {dateFormatter.format(new Date(user.createdAt))}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${user.name}`}
                          onClick={() => {
                            setEditing(user)
                            setFormOpen(true)
                          }}
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${user.name}`}
                          disabled={user.id === currentUser?.id}
                          onClick={() => setPendingDelete(user)}
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <UserFormDialog
        key={`${editing?.id ?? 'new'}-${String(formOpen)}`}
        open={formOpen}
        user={editing}
        integrations={integrations}
        saving={saving}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their conversations and connected apps are removed with them. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  )
}
