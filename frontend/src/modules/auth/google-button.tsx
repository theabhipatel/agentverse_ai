import { GoogleIcon } from '@/components/auth/google-icon'
import { Button } from '@/components/ui/button'
import { env } from '@/config/env'

/** A full page redirect, not an XHR: the backend owns the whole OAuth handshake. */
export function GoogleButton({ label }: { label: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="w-full"
      onClick={() => {
        window.location.assign(env.googleLoginUrl)
      }}
    >
      <GoogleIcon />
      {label}
    </Button>
  )
}
