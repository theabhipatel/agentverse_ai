import { KeyRoundIcon } from 'lucide-react'
import { GoogleIcon } from '@/components/auth/google-icon'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { SignInMethod, User } from '@/types/api'

const METHOD_LABEL: Record<SignInMethod, string> = {
  password: 'Email and password',
  google: 'Google',
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

export function AccountOverview({ user }: { user: User }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar className="size-14 shrink-0">
            <AvatarFallback className="text-lg">{user.name.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-heading text-lg font-semibold">{user.name}</p>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>

        <dl className="grid shrink-0 gap-4 text-sm sm:grid-cols-3 lg:gap-x-12">
          <div className="space-y-1.5">
            <dt className="text-muted-foreground">Role</dt>
            <dd>
              <Badge variant="secondary" className="capitalize">
                {user.role}
              </Badge>
            </dd>
          </div>
          <div className="space-y-1.5">
            <dt className="text-muted-foreground">Member since</dt>
            <dd className="font-medium">{formatDate(user.createdAt)}</dd>
          </div>
          <div className="space-y-1.5">
            <dt className="text-muted-foreground">Sign-in methods</dt>
            <dd className="flex flex-wrap gap-1.5">
              {user.signInMethods.map((method) => (
                <Badge key={method} variant="outline">
                  {method === 'google' ? <GoogleIcon className="size-3" /> : <KeyRoundIcon />}
                  {METHOD_LABEL[method]}
                </Badge>
              ))}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  )
}
