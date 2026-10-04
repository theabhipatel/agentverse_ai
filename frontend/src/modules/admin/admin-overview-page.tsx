import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  MessageSquareIcon,
  PlugIcon,
  ShieldIcon,
  UserPlusIcon,
  UsersIcon,
  WrenchIcon,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getApiErrorMessage } from '@/lib/api'
import { useAdminStore } from '@/stores/admin-store'
import { INTEGRATION_ICONS } from '@/modules/integration/integration-icons'
import { AdminLayout } from './admin-layout'

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string
  value: number
  hint: string
  icon: LucideIcon
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardDescription>{label}</CardDescription>
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <CardTitle className="font-heading text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}

export function AdminOverviewPage() {
  const stats = useAdminStore((state) => state.stats)
  const loading = useAdminStore((state) => state.statsLoading)
  const fetchStats = useAdminStore((state) => state.fetchStats)

  useEffect(() => {
    void fetchStats().catch((error: unknown) => {
      toast.error(getApiErrorMessage(error, 'Could not load the dashboard'))
    })
  }, [fetchStats])

  return (
    <AdminLayout title="Overview">
      <div className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-heading text-2xl font-bold">Dashboard</h2>
            <p className="text-sm text-muted-foreground">
              Everything happening across the platform right now.
            </p>
          </div>
          <Button variant="outline" render={<Link to="/admin/users" />}>
            <UsersIcon />
            Manage users
          </Button>
        </div>

        {loading && !stats ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((key) => (
              <Skeleton key={key} className="h-32 w-full" />
            ))}
          </div>
        ) : stats ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                label="Registered users"
                value={stats.totalUsers}
                hint={`${stats.adminUsers} with admin access`}
                icon={UsersIcon}
              />
              <StatCard
                label="New this week"
                value={stats.newUsersLast7Days}
                hint="Accounts created in the last 7 days"
                icon={UserPlusIcon}
              />
              <StatCard
                label="Admins"
                value={stats.adminUsers}
                hint="Can reach this dashboard"
                icon={ShieldIcon}
              />
              <StatCard
                label="Conversations"
                value={stats.totalConversations}
                hint={`${stats.totalMessages} messages in total`}
                icon={MessageSquareIcon}
              />
              <StatCard
                label="Tool calls"
                value={stats.toolCalls}
                hint="Actions the agent ran in connected apps"
                icon={WrenchIcon}
              />
              <StatCard
                label="Connected apps"
                value={stats.connectedIntegrations}
                hint="Live connections across all users"
                icon={PlugIcon}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Integrations in use</CardTitle>
                <CardDescription>How many users have each app connected.</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.toolkitUsage.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nobody has connected an integration yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {stats.toolkitUsage.map((usage) => {
                      const Icon = INTEGRATION_ICONS[usage.toolkit]
                      const share =
                        stats.totalUsers > 0 ? Math.round((usage.connectedUsers / stats.totalUsers) * 100) : 0
                      return (
                        <li key={usage.toolkit} className="flex items-center gap-3">
                          <Icon className="size-4 shrink-0 text-muted-foreground" />
                          <span className="flex w-44 shrink-0 items-center gap-2 text-sm">
                            {usage.name}
                            {usage.enabled ? null : <Badge variant="outline">Off</Badge>}
                          </span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${Math.max(share, 3)}%` }}
                            />
                          </div>
                          <span className="w-16 shrink-0 text-right text-sm text-muted-foreground">
                            {usage.connectedUsers}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </AdminLayout>
  )
}
