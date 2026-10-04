import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { api, getApiErrorMessage } from '@/lib/api'
import type { ApiSuccessResponse, ResetPasswordPayload } from '@/types/api'
import { AuthLayout } from './auth-layout'

const MIN_PASSWORD_LENGTH = 8

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      return
    }
    if (password !== confirmation) {
      setError('Both passwords must match')
      return
    }

    setSubmitting(true)
    try {
      await api.post<ApiSuccessResponse<ResetPasswordPayload>>('/auth/reset-password', { token, password })
      toast.success('Password updated. Sign in with your new one.')
      navigate('/login', { replace: true })
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, 'Could not reset your password'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!token) {
    return (
      <AuthLayout title="Link is incomplete" subtitle="This reset link is missing its token.">
        <div className="space-y-5">
          <Alert variant="destructive">
            <AlertTitle>Nothing to reset</AlertTitle>
            <AlertDescription>Open the link from your email again, or ask for a new one.</AlertDescription>
          </Alert>
          <Button size="lg" className="w-full" render={<Link to="/forgot-password" />}>
            Request a new link
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="This signs you out everywhere else.">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Could not reset</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Field>
          <FieldLabel htmlFor="password">New password</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoFocus
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="confirmation">Confirm new password</FieldLabel>
          <Input
            id="confirmation"
            type="password"
            autoComplete="new-password"
            placeholder="Type it again"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            required
          />
        </Field>

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? <Spinner /> : null}
          Update password
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
