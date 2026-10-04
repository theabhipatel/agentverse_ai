import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeftIcon, BotIcon, PlugIcon, PlusIcon } from 'lucide-react'
import { toast } from 'sonner'
import { LogoutButton } from '@/components/auth/logout-button'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
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
import { getApiErrorMessage } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useChatStore } from '@/stores/chat-store'
import { ConversationList } from './conversation-list'

export function ChatSidebar() {
  const user = useAuthStore((state) => state.user)
  const startNewChat = useChatStore((state) => state.startNewChat)
  const fetchConversations = useChatStore((state) => state.fetchConversations)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // Loaded here rather than by a page, so the list is there on every page with this sidebar.
  useEffect(() => {
    void fetchConversations().catch((error: unknown) => {
      toast.error(getApiErrorMessage(error, 'Could not load your conversations'))
    })
  }, [fetchConversations])

  function handleNewChat() {
    startNewChat()
    navigate('/chat')
  }

  return (
    <Sidebar>
      <SidebarHeader className="gap-3 p-3">
        <div className="px-1">
          <p className="font-heading text-base font-semibold tracking-[0.28em]">AGENTVERSE</p>
          <p className="text-xs text-sidebar-foreground/60">Build Your AI Workforce</p>
        </div>
        <Button size="lg" className="w-full justify-start" onClick={handleNewChat}>
          <PlusIcon />
          New chat
        </Button>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton isActive={pathname === '/agents'} render={<Link to="/agents" />}>
              <BotIcon />
              <span>Agents</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton isActive={pathname === '/integrations'} render={<Link to="/integrations" />}>
              <PlugIcon />
              <span>Integrations</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Previous chats</SidebarGroupLabel>
          <SidebarGroupContent>
            <ConversationList />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-2 border-t border-sidebar-border p-3">
        {user?.role === 'admin' ? (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton render={<Link to="/admin" />}>
                <ArrowLeftIcon />
                <span>Back to admin dashboard</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        ) : null}

        <div className="flex items-center gap-2">
          <Link
            to="/profile"
            aria-label="Open your profile"
            className="-m-1 flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <Avatar className="size-8 shrink-0">
              <AvatarFallback>{user?.name?.slice(0, 1).toUpperCase() ?? 'U'}</AvatarFallback>
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
