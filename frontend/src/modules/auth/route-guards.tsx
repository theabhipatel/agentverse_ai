import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { Spinner } from '@/components/ui/spinner'
import { useAuthStore } from '@/stores/auth-store'

function BootstrapScreen() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Spinner className="size-6" />
    </div>
  )
}

/** Renders nothing until bootstrap settles, so a logged in user never sees the login screen flash. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status)

  if (status === 'unknown') {
    return <BootstrapScreen />
  }
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status)

  if (status === 'unknown') {
    return <BootstrapScreen />
  }
  if (status === 'authenticated') {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

/** Where "/", a successful login and any unmatched URL land: the dashboard for an admin, chat for everyone else. */
export function HomeRedirect() {
  const status = useAuthStore((state) => state.status)
  const user = useAuthStore((state) => state.user)

  if (status === 'unknown') {
    return <BootstrapScreen />
  }
  return <Navigate to={user?.role === 'admin' ? '/admin' : '/chat'} replace />
}

/** Admin only. The backend enforces this too, this just keeps the UI honest. */
export function AdminRoute({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status)
  const user = useAuthStore((state) => state.user)

  if (status === 'unknown') {
    return <BootstrapScreen />
  }
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />
  }
  if (user?.role !== 'admin') {
    return <Navigate to="/chat" replace />
  }
  return <>{children}</>
}
