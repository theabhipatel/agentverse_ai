import { Link, useLocation } from 'react-router-dom'
import {
  AudioLinesIcon,
  BotIcon,
  BrainCircuitIcon,
  CpuIcon,
  LayoutDashboardIcon,
  MessageSquareIcon,
  PlugIcon,
  UsersIcon,
} from 'lucide-react'
import { LogoutButton } from '@/components/auth/logout-button'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { useAuthStore } from '@/stores/auth-store'

const NAV_ITEMS = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboardIcon, exact: true },
  { to: '/admin/users', label: 'Users', icon: UsersIcon, exact: false },
  { to: '/admin/agents', label: 'Agents', icon: BotIcon, exact: false },
  { to: '/admin/integrations', label: 'Integrations', icon: PlugIcon, exact: false },
  { to: '/admin/intelligence-hub', label: 'Intelligence Hub', icon: BrainCircuitIcon, exact: false },
  { to: '/admin/llm', label: 'AI models', icon: CpuIcon, exact: false },
  { to: '/admin/voices', label: 'Voices', icon: AudioLinesIcon, exact: false },
]

export function AdminSidebar() {
  const user = useAuthStore((state) => state.user)
  const { pathname } = useLocation()

  return (
    <Sidebar>
      <SidebarHeader className="gap-1 p-3">
        <p className="font-heading text-base font-semibold tracking-[0.28em]">AGENTVERSE</p>
        <p className="text-xs text-sidebar-foreground/60">Administration</p>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Manage</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    isActive={item.exact ? pathname === item.to : pathname.startsWith(item.to)}
                    render={<Link to={item.to} />}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-2 border-t border-sidebar-border p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link to="/chat" />}>
              <MessageSquareIcon />
              <span>Open chat</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <div className="flex items-center gap-2">
          <Link
            to="/profile"
            aria-label="Open your profile"
            className="-m-1 flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <Avatar className="size-8 shrink-0">
              <AvatarFallback>{user?.name?.slice(0, 1).toUpperCase() ?? 'A'}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-sidebar-foreground/60">{user?.email}</p>
            </div>
          </Link>
          <ThemeToggle />
          <LogoutButton />
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
