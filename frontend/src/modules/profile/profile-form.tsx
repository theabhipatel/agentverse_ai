import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { getApiErrorMessage } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import type { User } from '@/types/api'

export function ProfileForm({ user }: { user: User }) {
  const updateProfile = useAuthStore((state) => state.updateProfile)
  const [name, setName] = useState(user.name)
  const [saving, setSaving] = useState(false)

  const trimmed = name.trim()
  const unchanged = trimmed === user.name

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!trimmed || unchanged) {
      return
    }
    setSaving(true)
    try {
      await updateProfile({ name: trimmed })
      toast.success('Profile updated')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not update your profile'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal information</CardTitle>
        <CardDescription>This is how you appear across AgentVerse.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-5">
          <Field>
            <FieldLabel htmlFor="profile-name">Name</FieldLabel>
            <Input
              id="profile-name"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="profile-email">Email</FieldLabel>
            <Input id="profile-email" type="email" value={user.email} disabled readOnly />
            <FieldDescription>Your email is how you sign in, so it cannot be changed.</FieldDescription>
          </Field>

          <div className="mt-auto flex justify-end">
            <Button type="submit" disabled={saving || unchanged || !trimmed}>
              {saving ? <Spinner /> : null}
              Save changes
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
