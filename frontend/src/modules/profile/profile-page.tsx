import { ArrowLeftIcon } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { ChatSidebar } from '@/modules/chat/chat-sidebar'
import { useAuthStore } from '@/stores/auth-store'
import { AccountOverview } from './account-overview'
import { PasswordForm } from './password-form'
import { ProfileForm } from './profile-form'

export function ProfilePage() {
  const user = useAuthStore((state) => state.user)
  const navigate = useNavigate()
  const location = useLocation()

  function handleBack() {
    // Opened directly (typed URL or reload), there is no page in the app to return to.
    if (location.key === 'default') {
      navigate('/chat')
      return
    }
    navigate(-1)
  }

  return (
    <SidebarProvider>
      <ChatSidebar />
      <SidebarInset>
        <div className="flex h-svh flex-col">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
            <SidebarTrigger />
            <Button variant="ghost" size="icon-sm" aria-label="Go back" onClick={handleBack}>
              <ArrowLeftIcon />
            </Button>
            <h1 className="text-sm font-medium">Profile</h1>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-6 px-6 py-8 lg:px-10">
              <div className="space-y-2">
                <h2 className="font-heading text-3xl font-bold">Profile</h2>
                <p className="text-sm text-muted-foreground">Your account details and how you sign in.</p>
              </div>

              {user ? (
                <>
                  <AccountOverview user={user} />
                  <div className="grid gap-6 lg:grid-cols-2">
                    {/* Keyed on the saved name so the field resets to it after a save elsewhere. */}
                    <ProfileForm key={user.name} user={user} />
                    <PasswordForm key={user.signInMethods.join(',')} user={user} />
                  </div>
                </>
              ) : null}
            </div>
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
