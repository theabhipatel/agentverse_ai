import { useState } from 'react'
import { LogOutIcon } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'

/** Shared by the chat and admin sidebars, so signing out asks in both places. */
export function LogoutButton() {
  const logout = useAuthStore((state) => state.logout)
  const [confirming, setConfirming] = useState(false)

  async function handleLogout() {
    await logout()
    toast.success('Signed out')
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Sign out"
        onClick={() => setConfirming(true)}
      >
        <LogOutIcon />
      </Button>

      <AlertDialog open={confirming} onOpenChange={(open) => setConfirming(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              You will need to sign in again to get back to your chats.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogout}>Sign out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
