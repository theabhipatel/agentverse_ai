import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { MailCheckIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { api, getApiErrorMessage } from '@/lib/api'
import type { ApiSuccessResponse, ForgotPasswordPayload } from '@/types/api'
import { AuthLayout } from './auth-layout'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState<{ expiresIn: string } | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { data } = await api.post<ApiSuccessResponse<ForgotPasswordPayload>>(
        '/auth/forgot-password',
        { email },
      )
      setSent({ expiresIn: data.data.expiresIn })
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, 'Could not send the reset email'))
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <AuthLayout title="Check your inbox" subtitle="We have sent you a link to choose a new password.">
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted p-4">
            <MailCheckIcon className="mt-0.5 size-5 shrink-0 text-primary" />
            <p className="text-sm text-muted-foreground">
              If <span className="font-medium text-foreground">{email}</span> has an account, a reset link
              is on its way. It expires in {sent.expiresIn}.
            </p>
          </div>

          <Button variant="outline" size="lg" className="w-full" onClick={() => setSent(null)}>
            Use a different email
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            <Link to="/login" className="font-medium text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Forgot your password?" subtitle="Enter your email and we will send you a reset link.">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoFocus
          />
        </Field>

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? <Spinner /> : null}
          Send reset link
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Remembered it?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
