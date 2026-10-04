import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquareIcon, Trash2Icon } from 'lucide-react'
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
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from '@/components/ui/sidebar'
import { getApiErrorMessage } from '@/lib/api'
import { useChatStore } from '@/stores/chat-store'

export function ConversationList() {
  const conversations = useChatStore((state) => state.conversations)
  const loading = useChatStore((state) => state.conversationsLoading)
  const activeId = useChatStore((state) => state.activeConversationId)
  const deleteConversation = useChatStore((state) => state.deleteConversation)
  const navigate = useNavigate()

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  async function handleDelete() {
    if (!pendingDeleteId) {
      return
    }
    const wasActive = pendingDeleteId === activeId
    try {
      await deleteConversation(pendingDeleteId)
      toast.success('Conversation deleted')
      if (wasActive) {
        navigate('/chat', { replace: true })
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not delete the conversation'))
    } finally {
      setPendingDeleteId(null)
    }
  }

  if (loading && conversations.length === 0) {
    return (
      <SidebarMenu>
        {[0, 1, 2].map((key) => (
          <SidebarMenuItem key={key}>
            <SidebarMenuSkeleton showIcon />
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    )
  }

  if (conversations.length === 0) {
    return <p className="px-2 py-1 text-xs text-sidebar-foreground/60">No conversations yet.</p>
  }

  return (
    <>
      <SidebarMenu>
        {conversations.map((conversation) => (
          <SidebarMenuItem key={conversation.id}>
            <SidebarMenuButton
              isActive={conversation.id === activeId}
              onClick={() => navigate(`/chat/${conversation.id}`)}
            >
              <MessageSquareIcon />
              <span className="truncate">{conversation.title}</span>
            </SidebarMenuButton>
            <SidebarMenuAction
              aria-label={`Delete ${conversation.title}`}
              onClick={() => setPendingDeleteId(conversation.id)}
            >
              <Trash2Icon />
            </SidebarMenuAction>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteId(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              The conversation and its messages are removed for good.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
