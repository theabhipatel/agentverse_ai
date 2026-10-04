import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { getApiErrorMessage } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import type { User } from '@/types/api'

const MIN_PASSWORD_LENGTH = 8

export function PasswordForm({ user }: { user: User }) {
  const changePassword = useAuthStore((state) => state.changePassword)
  // An account created through Google has no password yet, so it sets one instead.
  const hasPassword = user.signInMethods.includes('password')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      return
    }
    if (newPassword !== confirmation) {
      setError('Both new passwords must match')
      return
    }

    setSaving(true)
    try {
      await changePassword(hasPassword ? { currentPassword, newPassword } : { newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmation('')
      toast.success(hasPassword ? 'Password updated. Other devices were signed out.' : 'Password set')
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, 'Could not update your password'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{hasPassword ? 'Change password' : 'Set a password'}</CardTitle>
        <CardDescription>
          {hasPassword
            ? 'Changing your password signs you out on every other device.'
            : 'You sign in with Google. Add a password to also sign in with your email.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-5">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {hasPassword ? (
            <Field>
              <FieldLabel htmlFor="current-password">Current password</FieldLabel>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </Field>
          ) : null}

          <Field>
            <FieldLabel htmlFor="new-password">New password</FieldLabel>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
            />
          </Field>

          <div className="mt-auto flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner /> : null}
              {hasPassword ? 'Update password' : 'Set password'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
