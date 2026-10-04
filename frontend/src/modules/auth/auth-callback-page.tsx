import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Spinner } from '@/components/ui/spinner'
import { useAuthStore } from '@/stores/auth-store'

/**
 * Where Google sends the user back to. The refresh cookie is already set by the
 * backend, so all this does is trade it for an in memory access token.
 */
export function AuthCallbackPage() {
  const bootstrap = useAuthStore((state) => state.bootstrap)
  const status = useAuthStore((state) => state.status)
  const navigate = useNavigate()

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  useEffect(() => {
    if (status === 'authenticated') {
      navigate('/', { replace: true })
    }
    if (status === 'unauthenticated') {
      navigate('/login?error=google_auth_failed', { replace: true })
    }
  }, [status, navigate])

  return (
    <div className="flex min-h-svh items-center justify-center gap-3 text-muted-foreground">
      <Spinner />
      Signing you in
    </div>
  )
}
